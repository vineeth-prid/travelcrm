import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { MetaGraphClient } from './meta-graph.client';
import { ProviderError } from './provider.error';

interface SendResponse {
  message_id?: string;
}

interface LeadResponse {
  id?: string;
  created_time?: string;
  field_data?: { name?: string; values?: string[] }[];
}

/** A lead form submission, flattened into something displayable. */
export interface LeadDetails {
  leadgenId: string;
  name: string;
  phone: string | null;
  /** Every answered field, in form order. */
  fields: { label: string; value: string }[];
}

const NAME_FIELDS = ['full_name', 'name', 'first_name'];
const PHONE_FIELDS = ['phone_number', 'phone', 'mobile_number'];

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly graph: MetaGraphClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.accountId && this.accessToken);
  }

  private get accountId(): string {
    return this.config.get('INSTAGRAM_ACCOUNT_ID', { infer: true });
  }

  private get accessToken(): string {
    return this.config.get('INSTAGRAM_ACCESS_TOKEN', { infer: true });
  }

  /** Sends a direct message and returns the provider message id. */
  async sendText(recipientId: string, content: string): Promise<string | null> {
    if (!this.isConfigured) {
      throw ProviderError.notConfigured('Instagram');
    }

    const response = await this.graph.post<SendResponse>(
      'Instagram',
      `/${this.accountId}/messages`,
      { recipient: { id: recipientId }, message: { text: content } },
      this.accessToken,
    );

    return response.message_id ?? null;
  }

  /**
   * Lead Ads webhooks carry only an id; the answers need a second call. Returns
   * null when the lookup fails so the lead is still recorded with what we know.
   */
  async fetchLead(leadgenId: string): Promise<LeadDetails | null> {
    if (!this.isConfigured) {
      this.logger.warn(`Instagram not configured; storing lead ${leadgenId} without its answers`);
      return null;
    }

    let response: LeadResponse;
    try {
      response = await this.graph.get<LeadResponse>(
        'Instagram',
        `/${leadgenId}?fields=id,created_time,field_data`,
        this.accessToken,
      );
    } catch (error) {
      this.logger.error(
        `Could not fetch lead ${leadgenId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }

    const fields = (response.field_data ?? [])
      .map((field) => ({ label: field.name ?? '', value: field.values?.[0] ?? '' }))
      .filter((field) => field.label && field.value);

    const pick = (candidates: string[]): string | null =>
      fields.find((field) => candidates.includes(field.label))?.value ?? null;

    return {
      leadgenId,
      name: pick(NAME_FIELDS) ?? 'Instagram lead',
      phone: pick(PHONE_FIELDS),
      fields,
    };
  }
}
