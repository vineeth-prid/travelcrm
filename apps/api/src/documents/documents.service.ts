import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TemplateKind } from '@prisma/client';
import type {
  CompanyProfile,
  CompanyProfileRequest,
  DocumentTemplate,
  DocumentTemplateRequest,
} from '@travel-crm/sdk';

import type { Env } from '../config/env';
import { PrismaService } from '../shared/prisma.service';

/**
 * The company's own details and the boilerplate on its documents.
 *
 * Both used to be constants: company identity in environment variables, terms
 * and inclusions typed fresh into every proposal. Neither belonged there —
 * they are things the agency changes, not things the deployment decides.
 *
 * The environment variables are still read as the *initial* value, so an
 * existing deployment keeps the details it already had until somebody edits
 * them here.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async profile(): Promise<CompanyProfile> {
    const record = await this.prisma.companyProfile.findUnique({ where: { id: 'default' } });

    if (record) {
      return {
        name: record.name,
        tagline: record.tagline,
        address: record.address,
        phone: record.phone,
        email: record.email,
        website: record.website,
        taxId: record.taxId,
        bankDetails: record.bankDetails,
        updatedAt: record.updatedAt.toISOString(),
      };
    }

    // Nothing saved yet: fall back to what the deployment was configured with,
    // so documents do not suddenly lose the company's name.
    return {
      name: this.config.get('COMPANY_NAME', { infer: true }),
      tagline: null,
      address: null,
      phone: this.config.get('COMPANY_CONTACT', { infer: true }) || null,
      email: null,
      website: null,
      taxId: this.config.get('COMPANY_TAX_ID', { infer: true }) || null,
      bankDetails: this.config.get('COMPANY_BANK_DETAILS', { infer: true }) || null,
      updatedAt: null,
    };
  }

  async saveProfile(input: CompanyProfileRequest): Promise<CompanyProfile> {
    const data = {
      name: input.name,
      tagline: input.tagline ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      website: input.website ?? null,
      taxId: input.taxId ?? null,
      bankDetails: input.bankDetails ?? null,
    };

    await this.prisma.companyProfile.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });

    return this.profile();
  }

  async template(kind: TemplateKind): Promise<DocumentTemplate> {
    const record = await this.prisma.documentTemplate.findUnique({ where: { kind } });

    if (record) {
      return {
        kind: record.kind,
        terms: record.terms,
        inclusions: record.inclusions,
        exclusions: record.exclusions,
        paymentTerms: record.paymentTerms,
        footerNote: record.footerNote,
        validityDays: record.validityDays,
        updatedAt: record.updatedAt.toISOString(),
      };
    }

    return {
      kind,
      terms: null,
      inclusions: null,
      exclusions: null,
      paymentTerms:
        kind === 'INVOICE' ? this.config.get('INVOICE_PAYMENT_TERMS', { infer: true }) : null,
      footerNote: null,
      // A fortnight either way: long enough to decide, short enough that a
      // price does not outlive the season it was quoted for.
      validityDays: kind === 'INVOICE' ? this.config.get('INVOICE_DUE_DAYS', { infer: true }) : 14,
      updatedAt: null,
    };
  }

  async saveTemplate(
    kind: TemplateKind,
    input: DocumentTemplateRequest,
  ): Promise<DocumentTemplate> {
    const data = {
      terms: input.terms ?? null,
      inclusions: input.inclusions ?? null,
      exclusions: input.exclusions ?? null,
      paymentTerms: input.paymentTerms ?? null,
      footerNote: input.footerNote ?? null,
      validityDays: input.validityDays,
    };

    await this.prisma.documentTemplate.upsert({
      where: { kind },
      create: { kind, ...data },
      update: data,
    });

    return this.template(kind);
  }
}
