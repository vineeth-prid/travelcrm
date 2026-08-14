import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  DuplicateCheck,
  DuplicateMatch,
  Lead,
  LeadActivity,
  LeadAssignRequest,
  LeadNoteRequest,
  LeadPage,
  LeadQuery,
  LeadRequest,
  LeadStageRequest,
} from '@travel-crm/sdk';

import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { dedupeKeyFor, NotificationService } from '../notifications/notification.service';
import { leadAssigned } from '../notifications/templates';
import { UsersService } from '../users/users.service';
import { LeadActivityService } from './lead-activity.service';
import { toLead, type LeadWithRelations } from './leads.mappers';
import { DEFAULT_PAGE_SIZE, LeadsRepository, normalisePhone, scopeFor } from './leads.repository';

/** Reads better on a timeline than the raw enum. */
const STAGE_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL_PREPARING: 'Preparing proposal',
  PROPOSAL_SENT: 'Proposal sent',
  FOLLOW_UP: 'Follow-up',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On hold',
};

const LOST_REASON_LABELS: Record<string, string> = {
  BUDGET: 'Budget',
  CHOSE_COMPETITOR: 'Chose a competitor',
  DATES_CHANGED: 'Dates changed',
  TRIP_CANCELLED: 'Trip cancelled',
  NO_RESPONSE: 'No response',
  NOT_INTERESTED: 'Not interested',
  OTHER: 'Other',
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly repository: LeadsRepository,
    private readonly activities: LeadActivityService,
    private readonly users: UsersService,
    private readonly notifications: NotificationService,
  ) {}

  async list(query: LeadQuery, actor: AuthenticatedUser): Promise<LeadPage> {
    const { rows, total } = await this.repository.search(query, scopeFor(actor));
    return {
      leads: rows.map(toLead),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    };
  }

  async get(id: string, actor: AuthenticatedUser): Promise<Lead> {
    return toLead(await this.findVisible(id, actor));
  }

  async duplicates(input: {
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
  }): Promise<DuplicateCheck> {
    const customers = await this.repository.findDuplicateCustomers(input);
    const phone = normalisePhone(input.phone);
    const whatsapp = normalisePhone(input.whatsapp);
    const email = input.email?.trim().toLowerCase() || null;

    const matches: DuplicateMatch[] = customers.map((customer) => {
      const customerPhone = normalisePhone(customer.phone);
      const customerWhatsapp = normalisePhone(customer.whatsapp);
      const matchedOn: DuplicateMatch['matchedOn'] = [];

      // Compared on the last 10 digits, the same way the query found them.
      const sameNumber = (a: string | null, b: string | null) =>
        a !== null && b !== null && a.slice(-10) === b.slice(-10);

      if (sameNumber(phone, customerPhone) || sameNumber(phone, customerWhatsapp)) {
        matchedOn.push('phone');
      }
      if (sameNumber(whatsapp, customerWhatsapp) || sameNumber(whatsapp, customerPhone)) {
        matchedOn.push('whatsapp');
      }
      if (email && customer.email?.toLowerCase() === email) matchedOn.push('email');

      return {
        customerId: customer.id,
        customerName: customer.name,
        matchedOn,
        leadCount: customer.leads.length,
        latestLeadReference: customer.leads[0]?.reference ?? null,
        latestLeadStage: (customer.leads[0]?.stage as DuplicateMatch['latestLeadStage']) ?? null,
      };
    });

    // A customer the query caught on a partial number but nothing actually
    // matched is not a duplicate; drop it rather than crying wolf.
    return { matches: matches.filter((match) => match.matchedOn.length > 0) };
  }

  /**
   * Creates a lead. Refuses with 409 when the customer looks like somebody
   * already on file, unless the consultant has said to go ahead — the check is
   * enforced here rather than in the form, so no client can skip it silently.
   */
  async create(
    input: LeadRequest,
    actor: AuthenticatedUser,
    allowDuplicate: boolean,
  ): Promise<Lead> {
    if (!allowDuplicate && !input.customerId) {
      const { matches } = await this.duplicates({
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
      });

      if (matches.length > 0) {
        // Only the refusal travels; the form already has the matching customers
        // from GET /leads/duplicates, which it calls as the consultant types.
        throw new ConflictException(
          `An existing customer with these contact details already exists (${matches
            .map((match) => match.customerName)
            .join(', ')}).`,
        );
      }
    }

    const assignedToId = this.resolveAssignee(input.assignedToId, actor);
    const lead = await this.repository.create(input, actor.id, assignedToId);

    await this.activities.record({
      leadId: lead.id,
      type: 'LEAD_CREATED',
      summary: `Lead created for ${lead.customer.name}`,
      detail: lead.destination ? `Destination: ${lead.destination}` : null,
      actorId: actor.id,
    });

    if (assignedToId) {
      await this.activities.record({
        leadId: lead.id,
        type: 'ASSIGNED',
        summary: `Assigned to ${lead.assignedTo?.name ?? 'a colleague'}`,
        actorId: actor.id,
      });
    }

    return toLead(lead);
  }

  async update(id: string, input: LeadRequest, actor: AuthenticatedUser): Promise<Lead> {
    await this.findVisible(id, actor);
    const lead = await this.repository.update(id, input);

    await this.activities.record({
      leadId: id,
      type: 'REQUIREMENT_UPDATED',
      summary: 'Lead details updated',
      actorId: actor.id,
    });

    return toLead(lead);
  }

  /**
   * The only path the stage moves along. A LOST lead must carry a reason —
   * the schema demands one, and this refuses to record a loss without it.
   */
  async changeStage(id: string, input: LeadStageRequest, actor: AuthenticatedUser): Promise<Lead> {
    const existing = await this.findVisible(id, actor);

    if (existing.stage === input.stage) {
      return toLead(existing);
    }

    const isLost = input.stage === 'LOST';
    const lead = await this.repository.setStage(id, {
      stage: input.stage,
      // Leaving LOST clears the reason: it no longer describes the lead.
      lostReason: isLost ? (input.lostReason ?? null) : null,
      lostNotes: isLost ? (input.lostNotes ?? null) : null,
    });

    const reason =
      isLost && input.lostReason ? ` — ${LOST_REASON_LABELS[input.lostReason] ?? ''}` : '';

    await this.activities.record({
      leadId: id,
      type: 'STAGE_CHANGED',
      summary: `${STAGE_LABELS[existing.stage] ?? existing.stage} → ${STAGE_LABELS[input.stage] ?? input.stage}${reason}`,
      detail: isLost ? (input.lostNotes ?? null) : null,
      actorId: actor.id,
    });

    return toLead(lead);
  }

  async assign(id: string, input: LeadAssignRequest, actor: AuthenticatedUser): Promise<Lead> {
    await this.findVisible(id, actor);

    const assignedToId = this.resolveAssignee(input.assignedToId, actor);
    const lead = await this.repository.setAssignee(id, assignedToId);

    await this.activities.record({
      leadId: id,
      type: 'ASSIGNED',
      summary: lead.assignedTo ? `Assigned to ${lead.assignedTo.name}` : 'Assignment cleared',
      actorId: actor.id,
    });

    // Tell them, unless they did it to themselves — nobody needs an email
    // about a lead they just picked up.
    if (lead.assignedTo && lead.assignedTo.id !== actor.id) {
      await this.notifyAssignee(lead);
    }

    return toLead(lead);
  }

  async activityFeed(id: string, actor: AuthenticatedUser): Promise<LeadActivity[]> {
    await this.findVisible(id, actor);
    return this.activities.listFor(id);
  }

  async addNote(
    id: string,
    input: LeadNoteRequest,
    actor: AuthenticatedUser,
  ): Promise<LeadActivity> {
    await this.findVisible(id, actor);
    return this.activities.record({
      leadId: id,
      type: 'NOTE',
      summary: 'Note added',
      detail: input.note,
      actorId: actor.id,
    });
  }

  /**
   * Emails the new owner that a lead has landed on them.
   *
   * Deliberately not awaited into the caller's failure path: a mail server
   * being down must not stop a lead being reassigned. The notification row
   * records the failure for an administrator to see.
   */
  private async notifyAssignee(lead: LeadWithRelations): Promise<void> {
    const assignee = lead.assignedTo;
    if (!assignee?.active) return;

    const email = leadAssigned({
      companyName: this.notifications.companyName,
      employeeName: assignee.name,
      customerName: lead.customer.name,
      destination: lead.destination,
      travelDate: lead.travelStart ? lead.travelStart.toISOString().slice(0, 10) : 'Not stated',
      priority: lead.priority,
      leadReference: lead.reference,
      leadUrl: `${this.notifications.appUrl}/leads/${lead.id}`,
    });

    await this.notifications.send({
      type: 'LEAD_ASSIGNED',
      recipient: { id: assignee.id, email: assignee.email, name: assignee.name },
      // Keyed on lead *and* assignee, so handing the same lead back and forth
      // notifies each new owner but never the same one twice.
      dedupeKey: dedupeKeyFor('LEAD_ASSIGNED', lead.id, assignee.id),
      email,
    });
  }

  /**
   * Loads a lead, or refuses. A lead an employee may not see returns 404 and
   * not 403 — otherwise the response confirms that the lead exists.
   */
  private async findVisible(id: string, actor: AuthenticatedUser): Promise<LeadWithRelations> {
    const lead = await this.repository.findById(id);
    const visible =
      lead &&
      (actor.role === 'ADMIN' || lead.assignedToId === actor.id || lead.createdById === actor.id);

    if (!lead || !visible) {
      throw new NotFoundException('That lead no longer exists.');
    }

    return lead;
  }

  /** An employee may only hold leads themselves; an admin may assign anyone. */
  private resolveAssignee(
    requested: string | null | undefined,
    actor: AuthenticatedUser,
  ): string | null {
    if (requested === undefined) {
      // Unstated on create means "mine"; an admin creating for the pool can
      // pass null explicitly.
      return actor.role === 'ADMIN' ? null : actor.id;
    }

    if (!this.users.canAssignTo(actor, requested)) {
      throw new ForbiddenException('You can only assign leads to yourself.');
    }

    return requested;
  }
}
