import { Injectable } from '@nestjs/common';
import type { Prisma, ProposalStatus } from '@prisma/client';
import type { ProposalQuery, ProposalRequest } from '@travel-crm/sdk';

import { fromDateOnly } from '../leads/leads.mappers';
import { PrismaService } from '../shared/prisma.service';
import { proposalInclude, type ProposalWithRelations } from './proposals.mappers';

/** The body of a version, shared by create, update and revise. */
function versionData(input: ProposalRequest) {
  return {
    title: input.title,
    destination: input.destination ?? null,
    travelStart: fromDateOnly(input.travelStart),
    travelEnd: fromDateOnly(input.travelEnd),
    adults: input.adults ?? null,
    children: input.children ?? null,
    childAges: input.childAges ?? [],
    executiveSummary: input.executiveSummary ?? null,
    itinerary: input.itinerary ?? null,
    inclusions: input.inclusions ?? null,
    exclusions: input.exclusions ?? null,
    hotelInfo: input.hotelInfo ?? null,
    transportInfo: input.transportInfo ?? null,
    activities: input.activities ?? null,
    terms: input.terms ?? null,
    validUntil: fromDateOnly(input.validUntil)!,
    currency: input.currency,
    sellingPrice: input.sellingPrice,
    actualCost: input.actualCost,
  };
}

@Injectable()
export class ProposalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every proposal an actor may see, newest first. */
  search(query: ProposalQuery, scope: Prisma.ProposalWhereInput): Promise<ProposalWithRelations[]> {
    const and: Prisma.ProposalWhereInput[] = [scope];

    if (query.status) and.push({ status: query.status });
    if (query.leadId) and.push({ leadId: query.leadId });
    if (query.search) {
      and.push({
        OR: [
          { reference: { contains: query.search, mode: 'insensitive' } },
          { lead: { reference: { contains: query.search, mode: 'insensitive' } } },
          { lead: { customer: { name: { contains: query.search, mode: 'insensitive' } } } },
          { versions: { some: { title: { contains: query.search, mode: 'insensitive' } } } },
        ],
      });
    }

    return this.prisma.proposal.findMany({
      where: { AND: and },
      include: proposalInclude,
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 200,
    });
  }

  findForLead(leadId: string): Promise<ProposalWithRelations[]> {
    return this.prisma.proposal.findMany({
      where: { leadId },
      include: proposalInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<ProposalWithRelations | null> {
    return this.prisma.proposal.findUnique({ where: { id }, include: proposalInclude });
  }

  /** A proposal and its opening version, together or not at all. */
  create(leadId: string, input: ProposalRequest, actorId: string): Promise<ProposalWithRelations> {
    return this.prisma.proposal.create({
      data: {
        leadId,
        createdById: actorId,
        versions: { create: { version: 1, createdById: actorId, ...versionData(input) } },
      },
      include: proposalInclude,
    });
  }

  /**
   * Rewrites the current version in place. Only ever called on a draft — once a
   * proposal has been sent, `addVersion` is the only way to change it.
   */
  async updateVersion(
    versionId: string,
    proposalId: string,
    input: ProposalRequest,
  ): Promise<ProposalWithRelations> {
    await this.prisma.proposalVersion.update({
      where: { id: versionId },
      // A change invalidates any PDF generated from the previous body.
      data: { ...versionData(input), pdfPath: null },
    });

    return this.prisma.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: proposalInclude,
    });
  }

  /**
   * Adds the next version, leaving every earlier one untouched. The proposal
   * goes back to DRAFT because the new figures have not been sent to anybody.
   */
  async addVersion(
    proposalId: string,
    nextVersion: number,
    input: ProposalRequest,
    actorId: string,
  ): Promise<ProposalWithRelations> {
    return this.prisma.proposal.update({
      where: { id: proposalId },
      data: {
        status: 'DRAFT',
        versions: {
          create: { version: nextVersion, createdById: actorId, ...versionData(input) },
        },
      },
      include: proposalInclude,
    });
  }

  async setPdfPath(versionId: string, proposalId: string, pdfPath: string) {
    await this.prisma.proposalVersion.update({ where: { id: versionId }, data: { pdfPath } });
    return this.prisma.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: proposalInclude,
    });
  }

  setStatus(
    id: string,
    data: {
      status: ProposalStatus;
      submittedAt?: Date;
      submittedById?: string;
      decidedAt?: Date | null;
    },
  ): Promise<ProposalWithRelations> {
    return this.prisma.proposal.update({ where: { id }, data, include: proposalInclude });
  }
}
