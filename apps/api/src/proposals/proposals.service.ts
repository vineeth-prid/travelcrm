import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  LOCKED_PROPOSAL_STATUSES,
  type Proposal,
  type ProposalRequest,
  type ProposalStatusRequest,
  type ProposalWithHistory,
  type ProposalWithPdf,
} from '@travel-crm/sdk';

import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { LeadActivityService } from '../leads/lead-activity.service';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { LeadsRepository } from '../leads/leads.repository';
import { StorageService } from '../storage/storage.service';
import { ProposalPdfService, type CustomerProposalPdfData } from './proposal-pdf.service';
import {
  canSeeFinancials,
  currentVersionOf,
  toProposal,
  toProposalVersion,
  type ProposalVersionWithAuthor,
  type ProposalWithRelations,
} from './proposals.mappers';
import { ProposalsRepository } from './proposals.repository';

function objectKey(proposalId: string, version: number): string {
  return `proposals/${proposalId}/v${version}.pdf`;
}

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(
    private readonly repository: ProposalsRepository,
    private readonly leads: LeadsRepository,
    private readonly followUps: FollowUpsService,
    private readonly activities: LeadActivityService,
    private readonly pdf: ProposalPdfService,
    private readonly storage: StorageService,
  ) {}

  async listForLead(leadId: string, actor: AuthenticatedUser): Promise<Proposal[]> {
    const lead = await this.visibleLead(leadId, actor);
    const rows = await this.repository.findForLead(leadId);
    const withFinancials = canSeeFinancials(actor, lead);
    return rows.map((row) => toProposal(row, withFinancials));
  }

  async get(id: string, actor: AuthenticatedUser): Promise<ProposalWithHistory> {
    const record = await this.findVisible(id, actor);
    const withFinancials = canSeeFinancials(actor, record.lead);

    return {
      proposal: toProposal(record, withFinancials),
      versions: record.versions.map((version) => toProposalVersion(version, withFinancials)),
    };
  }

  async create(
    leadId: string,
    input: ProposalRequest,
    actor: AuthenticatedUser,
  ): Promise<Proposal> {
    const lead = await this.visibleLead(leadId, actor);
    const record = await this.repository.create(leadId, input, actor.id);

    await this.activities.record({
      leadId,
      type: 'PROPOSAL_GENERATED',
      summary: `Proposal ${record.reference} created — ${input.currency} ${input.sellingPrice.toLocaleString('en-IN')}`,
      actorId: actor.id,
    });

    return toProposal(record, canSeeFinancials(actor, lead));
  }

  /** Edits the current version in place. Only ever allowed on a draft. */
  async update(id: string, input: ProposalRequest, actor: AuthenticatedUser): Promise<Proposal> {
    const record = await this.findVisible(id, actor);
    this.assertEditable(record);

    const current = currentVersionOf(record);
    const updated = await this.repository.updateVersion(current.id, id, input);

    return toProposal(updated, canSeeFinancials(actor, updated.lead));
  }

  /**
   * Adds a new version. This is how a sent proposal is "changed": version 1
   * stays exactly as the customer saw it, and the new figures become version 2.
   */
  async revise(id: string, input: ProposalRequest, actor: AuthenticatedUser): Promise<Proposal> {
    const record = await this.findVisible(id, actor);
    const nextVersion = currentVersionOf(record).version + 1;
    const updated = await this.repository.addVersion(id, nextVersion, input, actor.id);

    await this.activities.record({
      leadId: record.leadId,
      type: 'PROPOSAL_GENERATED',
      summary: `Proposal ${record.reference} revised to version ${nextVersion} — ${input.currency} ${input.sellingPrice.toLocaleString('en-IN')}`,
      actorId: actor.id,
    });

    return toProposal(updated, canSeeFinancials(actor, updated.lead));
  }

  /**
   * Renders the current version's PDF and stores it. A version that already
   * has one gets it back untouched: a document the customer has is history,
   * not something to rebuild from whatever the record says today.
   */
  async generatePdf(id: string, actor: AuthenticatedUser): Promise<ProposalWithPdf> {
    const record = await this.findVisible(id, actor);
    const current = currentVersionOf(record);

    if (current.pdfPath) {
      return this.withPdfUrl(record, current, actor);
    }

    const document = await this.pdf.render(this.toPdfData(record, current));
    const key = objectKey(record.id, current.version);
    await this.storage.put(key, document, 'application/pdf');
    this.logger.log(`Stored proposal PDF ${key} (${document.length} bytes)`);

    const updated = await this.repository.setPdfPath(current.id, id, key);

    // GENERATED only moves a proposal forward from DRAFT; a sent proposal that
    // is regenerated must not be dragged backwards.
    const withStatus =
      updated.status === 'DRAFT'
        ? await this.repository.setStatus(id, { status: 'GENERATED' })
        : updated;

    return this.withPdfUrl(withStatus, currentVersionOf(withStatus), actor);
  }

  /** A link to a specific historical version's stored PDF. */
  async versionPdf(
    id: string,
    version: number,
    actor: AuthenticatedUser,
  ): Promise<ProposalWithPdf> {
    const record = await this.findVisible(id, actor);
    const wanted = record.versions.find((item) => item.version === version);

    if (!wanted) {
      throw new NotFoundException('That version does not exist.');
    }

    return this.withPdfUrl(record, wanted, actor);
  }

  /**
   * Records that the proposal went to the customer.
   *
   * Deliberately does not send anything: delivery is the consultant's, over
   * whichever channel they are already using. What this captures is the fact,
   * the time and the person — which is what the follow-up engine keys off.
   */
  async submit(id: string, actor: AuthenticatedUser): Promise<Proposal> {
    const record = await this.findVisible(id, actor);
    const current = currentVersionOf(record);

    if (!current.pdfPath) {
      throw new BadRequestException('Generate the PDF before submitting this proposal.');
    }
    if (record.submittedAt && record.status !== 'DRAFT' && record.status !== 'GENERATED') {
      throw new BadRequestException('This proposal has already been submitted.');
    }

    const submittedAt = new Date();
    const updated = await this.repository.setStatus(id, {
      status: 'SENT',
      submittedAt,
      submittedById: actor.id,
    });

    await this.activities.record({
      leadId: record.leadId,
      type: 'PROPOSAL_SENT',
      summary: `Proposal ${record.reference} v${current.version} submitted — ${current.currency} ${current.sellingPrice.toLocaleString('en-IN')}`,
      actorId: actor.id,
    });

    // The lead follows the proposal: a customer holding a quotation is past
    // "qualified", and leaving the stage behind makes the pipeline lie.
    await this.leads.setStageIfOpen(record.leadId, 'PROPOSAL_SENT');

    // Submitting is what starts the follow-up workflow (§14 → §15). Safe on a
    // resubmission: the schedule's unique constraint refuses duplicates.
    await this.followUps.scheduleForProposal({
      proposalId: id,
      leadId: record.leadId,
      assignedToId: record.lead.assignedToId,
      submittedAt,
    });

    return toProposal(updated, canSeeFinancials(actor, updated.lead));
  }

  async setStatus(
    id: string,
    input: ProposalStatusRequest,
    actor: AuthenticatedUser,
  ): Promise<Proposal> {
    const record = await this.findVisible(id, actor);

    if (!record.submittedAt) {
      throw new BadRequestException(
        'Submit the proposal before recording the customer’s response.',
      );
    }

    const decided = input.status === 'ACCEPTED' || input.status === 'REJECTED';
    const updated = await this.repository.setStatus(id, {
      status: input.status,
      decidedAt: decided ? new Date() : null,
    });

    await this.activities.record({
      leadId: record.leadId,
      type: 'STAGE_CHANGED',
      summary: `Proposal ${record.reference} — ${input.status.toLowerCase().replace('_', ' ')}`,
      actorId: actor.id,
    });

    if (input.status === 'ACCEPTED') await this.leads.setStageIfOpen(record.leadId, 'WON');
    if (input.status === 'NEGOTIATION') {
      await this.leads.setStageIfOpen(record.leadId, 'NEGOTIATION');
    }

    // Once a proposal is decided there is nothing left to chase, and chasing
    // anyway is how a CRM trains people to ignore it.
    if (decided) {
      await this.followUps.cancelRemaining(
        id,
        `Proposal ${input.status.toLowerCase()} by the customer`,
      );
    }

    return toProposal(updated, canSeeFinancials(actor, updated.lead));
  }

  /**
   * Builds the customer-facing document data, field by field.
   *
   * Never `{...record}`: the whole point of CustomerProposalPdfData is that a
   * column added to the database later cannot appear on a customer's PDF
   * without somebody deciding it should. `actualCost` is right there on the
   * record and is simply not read.
   */
  private toPdfData(
    record: ProposalWithRelations,
    version: ProposalVersionWithAuthor,
  ): CustomerProposalPdfData {
    return {
      reference: record.reference,
      version: version.version,
      generatedAt: new Date(),

      customerName: record.lead.customer.name,
      title: version.title,
      destination: version.destination,
      travelStart: version.travelStart,
      travelEnd: version.travelEnd,
      adults: version.adults,
      children: version.children,

      executiveSummary: version.executiveSummary,
      itinerary: version.itinerary,
      hotelInfo: version.hotelInfo,
      transportInfo: version.transportInfo,
      activities: version.activities,
      inclusions: version.inclusions,
      exclusions: version.exclusions,
      terms: version.terms,

      currency: version.currency,
      sellingPrice: version.sellingPrice,
      validUntil: version.validUntil,
    };
  }

  private async withPdfUrl(
    record: ProposalWithRelations,
    version: ProposalVersionWithAuthor,
    actor: AuthenticatedUser,
  ): Promise<ProposalWithPdf> {
    return {
      proposal: toProposal(record, canSeeFinancials(actor, record.lead)),
      pdfUrl: version.pdfPath ? await this.storage.presignedUrl(version.pdfPath) : null,
    };
  }

  private assertEditable(record: ProposalWithRelations): void {
    if (LOCKED_PROPOSAL_STATUSES.includes(record.status)) {
      throw new BadRequestException(
        'This proposal has already gone to the customer and cannot be changed. Create a new version instead.',
      );
    }
  }

  /**
   * A proposal is visible exactly when its lead is. Refusing with 404 rather
   * than 403 keeps the response from confirming that it exists.
   */
  private async findVisible(id: string, actor: AuthenticatedUser): Promise<ProposalWithRelations> {
    const record = await this.repository.findById(id);
    const visible = record && this.maySeeLead(record.lead, actor);

    if (!record || !visible) {
      throw new NotFoundException('That proposal no longer exists.');
    }

    return record;
  }

  private async visibleLead(leadId: string, actor: AuthenticatedUser) {
    const lead = await this.leads.findById(leadId);
    if (!lead || !this.maySeeLead(lead, actor)) {
      throw new NotFoundException('That lead no longer exists.');
    }
    return lead;
  }

  private maySeeLead(
    lead: { assignedToId: string | null; createdById: string | null },
    actor: AuthenticatedUser,
  ): boolean {
    return (
      actor.role === 'ADMIN' || lead.assignedToId === actor.id || lead.createdById === actor.id
    );
  }
}
