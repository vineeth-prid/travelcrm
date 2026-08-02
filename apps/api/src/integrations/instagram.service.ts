import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { Env } from '../config/env';
import { PrismaService } from '../shared/prisma.service';
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

interface ProfileResponse {
  name?: string;
  username?: string;
  profile_pic?: string;
}

interface RefreshResponse {
  access_token?: string;
  expires_in?: number;
}

interface SubscribedAppsResponse {
  data?: { subscribed_fields?: string[] }[];
}

/** A lead form submission, flattened into something displayable. */
export interface LeadDetails {
  leadgenId: string;
  name: string;
  phone: string | null;
  /** Every answered field, in form order. */
  fields: { label: string; value: string }[];
}

/** What we can learn about an IGSID beyond the id itself. */
export interface InstagramProfile {
  name: string | null;
  username: string | null;
  profilePicture: string | null;
}

export interface InstagramHealth {
  healthy: boolean;
  subscribedFields: string[];
  detail: string;
}

export type AttachmentType = 'image' | 'video' | 'audio';

const NAME_FIELDS = ['full_name', 'name', 'first_name'];
const PHONE_FIELDS = ['phone_number', 'phone', 'mobile_number'];

/** Row key in `integration_tokens`. */
const TOKEN_PROVIDER = 'instagram';

/**
 * How long Instagram allows a free-form reply after the customer's last
 * message. Past this, a send needs the HUMAN_AGENT tag instead.
 */
export const INSTAGRAM_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Instagram Direct, over "Instagram API with Instagram Login".
 *
 * Everything here talks to graph.instagram.com with an Instagram *user* access
 * token. There is no Facebook Page and no Page Access Token in this flow, and
 * nothing here may call graph.facebook.com for messaging — the two APIs look
 * similar and mixing them is what breaks this integration.
 */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  /**
   * The live token. Loaded from the database on first use, because a refresh
   * that happened days ago outranks whatever the environment was booted with.
   */
  private cachedToken: string | null = null;

  constructor(
    private readonly graph: MetaGraphClient,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.cachedToken ?? this.config.get('INSTAGRAM_ACCESS_TOKEN', { infer: true }));
  }

  /** `https://graph.instagram.com/v23.0` — the only host Instagram DMs use. */
  private get baseUrl(): string {
    const host = this.config.get('INSTAGRAM_GRAPH_URL', { infer: true });
    return `${host}/${this.config.get('INSTAGRAM_GRAPH_VERSION', { infer: true })}`;
  }

  /**
   * The current access token: the refreshed one if we have ever refreshed,
   * otherwise the environment's. Cached, so this is one query per process.
   */
  private async token(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;

    const stored = await this.prisma.integrationToken
      .findUnique({ where: { provider: TOKEN_PROVIDER } })
      .catch(() => null);

    this.cachedToken =
      stored?.accessToken || this.config.get('INSTAGRAM_ACCESS_TOKEN', { infer: true });

    if (!this.cachedToken) {
      throw ProviderError.notConfigured('Instagram');
    }

    return this.cachedToken;
  }

  /** Sends a direct message and returns the provider message id. */
  async sendText(
    recipientId: string,
    content: string,
    lastInboundAt?: Date | null,
  ): Promise<string | null> {
    return this.send(recipientId, { text: content }, lastInboundAt);
  }

  /**
   * Sends an image, video or audio file by link — Instagram fetches the URL
   * itself, so it must be reachable from Meta's servers.
   */
  async sendAttachment(
    recipientId: string,
    type: AttachmentType,
    url: string,
    lastInboundAt?: Date | null,
  ): Promise<string | null> {
    return this.send(recipientId, { attachment: { type, payload: { url } } }, lastInboundAt);
  }

  private async send(
    recipientId: string,
    message: Record<string, unknown>,
    lastInboundAt?: Date | null,
  ): Promise<string | null> {
    const accessToken = await this.token();

    const response = await this.graph.post<SendResponse>(
      'Instagram',
      '/me/messages',
      {
        recipient: { id: recipientId },
        message,
        // Outside the 24-hour window only a tagged reply is allowed. HUMAN_AGENT
        // extends it to 7 days and is exactly what this CRM does: a person
        // answering a customer. Meta rejects it until the feature is approved.
        ...(isWithinReplyWindow(lastInboundAt)
          ? {}
          : { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }),
      },
      accessToken,
      this.baseUrl,
    );

    return response.message_id ?? null;
  }

  /**
   * Name, username and avatar for an IGSID. Returns null on any failure: a
   * profile lookup must never stop a message from being stored.
   */
  async fetchProfile(igsid: string): Promise<InstagramProfile | null> {
    try {
      const response = await this.graph.get<ProfileResponse>(
        'Instagram',
        `/${igsid}?fields=name,username,profile_pic`,
        await this.token(),
        this.baseUrl,
      );

      return {
        name: response.name ?? null,
        username: response.username ?? null,
        profilePicture: response.profile_pic ?? null,
      };
    } catch (error) {
      this.logger.warn(`Could not fetch Instagram profile ${igsid}: ${describe(error)}`);
      return null;
    }
  }

  /**
   * Confirms the app is still subscribed to the `messages` field. An empty
   * `data` array means the subscription was dropped and no DM will ever arrive
   * — indistinguishable, from the inbox, from "nobody messaged us today".
   */
  async checkHealth(): Promise<InstagramHealth> {
    if (!this.isConfigured) {
      return { healthy: false, subscribedFields: [], detail: 'No Instagram access token is set.' };
    }

    try {
      const response = await this.graph.get<SubscribedAppsResponse>(
        'Instagram',
        '/me/subscribed_apps',
        await this.token(),
        this.baseUrl,
      );

      const subscribedFields = response.data?.flatMap((app) => app.subscribed_fields ?? []) ?? [];
      const healthy = subscribedFields.includes('messages');

      return {
        healthy,
        subscribedFields,
        detail: healthy
          ? 'Subscribed to the messages field.'
          : 'Not subscribed to the messages field — inbound DMs will not arrive.',
      };
    } catch (error) {
      return { healthy: false, subscribedFields: [], detail: describe(error) };
    }
  }

  /**
   * Instagram long-lived tokens last 60 days. Weekly, not monthly, so a run of
   * failures still leaves several attempts before the token actually dies.
   * The response carries a *new* token; persisting it is the whole point.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async refreshAccessToken(): Promise<void> {
    if (!this.isConfigured) return;

    try {
      const current = await this.token();
      const response = await this.graph.get<RefreshResponse>(
        'Instagram',
        '/refresh_access_token?grant_type=ig_refresh_token',
        current,
        // Unversioned endpoint — it sits at the host root, not under /v23.0.
        this.config.get('INSTAGRAM_GRAPH_URL', { infer: true }),
      );

      if (!response.access_token) {
        throw new Error('the refresh response contained no access_token');
      }

      const expiresAt = response.expires_in
        ? new Date(Date.now() + response.expires_in * 1000)
        : null;

      await this.prisma.integrationToken.upsert({
        where: { provider: TOKEN_PROVIDER },
        update: { accessToken: response.access_token, expiresAt },
        create: { provider: TOKEN_PROVIDER, accessToken: response.access_token, expiresAt },
      });
      this.cachedToken = response.access_token;

      this.logger.log(
        `Instagram access token refreshed; expires ${expiresAt?.toISOString() ?? 'unknown'}`,
      );
    } catch (error) {
      // Loud on purpose: a silently expired token looks exactly like a broken
      // webhook, and both end with an inbox that has quietly stopped working.
      this.logger.error(
        `INSTAGRAM TOKEN REFRESH FAILED — messaging will stop when the current token expires: ${describe(error)}`,
      );
    }
  }

  /**
   * Lead Ads webhooks carry only an id; the answers need a second call. Returns
   * null when the lookup fails so the lead is still recorded with what we know.
   *
   * Lead Ads are a Facebook Graph feature and stay on graph.facebook.com — the
   * one Instagram-branded thing here that is not an Instagram Login API call.
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
        await this.token(),
      );
    } catch (error) {
      this.logger.error(`Could not fetch lead ${leadgenId}: ${describe(error)}`);
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

function isWithinReplyWindow(lastInboundAt?: Date | null): boolean {
  return Boolean(
    lastInboundAt && Date.now() - lastInboundAt.getTime() <= INSTAGRAM_REPLY_WINDOW_MS,
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
