import type { Channel, LeadStatus } from '@travel-crm/sdk';
import type { BadgeProps } from '@travel-crm/ui';
import { Instagram, MessageCircle, Megaphone } from 'lucide-react';

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  QUALIFIED: 'Qualified',
  QUOTE_SENT: 'Quote sent',
  WON: 'Won',
  LOST: 'Lost',
};

/** Grey, blue, amber, green, red — one badge tone per lifecycle stage. */
export const STATUS_TONES: Record<LeadStatus, NonNullable<BadgeProps['variant']>> = {
  NEW: 'neutral',
  QUALIFIED: 'info',
  QUOTE_SENT: 'warning',
  WON: 'success',
  LOST: 'danger',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  INSTAGRAM: 'Instagram',
  INSTAGRAM_LEAD: 'Instagram lead',
  WHATSAPP: 'WhatsApp',
};

const ICONS: Record<Channel, typeof Instagram> = {
  INSTAGRAM: Instagram,
  INSTAGRAM_LEAD: Megaphone,
  WHATSAPP: MessageCircle,
};

const TONES: Record<Channel, string> = {
  INSTAGRAM: 'text-pink-600',
  INSTAGRAM_LEAD: 'text-amber-600',
  WHATSAPP: 'text-emerald-600',
};

export function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  const Icon = ICONS[channel];
  return (
    <Icon
      className={className ?? `size-3.5 shrink-0 ${TONES[channel]}`}
      aria-label={CHANNEL_LABELS[channel]}
    />
  );
}

/** "3m", "4h", "Tue", "12 Mar" — WhatsApp-style relative timestamps. */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
