/**
 * Email templates.
/**
 * Email templates.
 *
 * One function per message, in one file, rather than bodies inlined at the
 * call sites — so wording can be changed without touching the follow-up engine,
 * and every message shares the same frame. The brand colours are inlined
 * because email clients do not load stylesheets.
 */

const TEAL = '#00B48F';
const SLATE = '#2F3B47';
const MUTED = '#6B7A86';
const BORDER = '#E4EBEE';
const CANVAS = '#FCFCFB';

export interface RenderedEmail {
  subject: string;
  /** HTML. Mail clients that refuse it still get readable text. */
  body: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The shell every message sits in. */
function frame(options: {
  companyName: string;
  heading: string;
  intro: string;
  rows: [string, string][];
  action?: { label: string; url: string };
  footer?: string;
}): string {
  const rows = options.rows
    .filter(([, value]) => value.trim().length > 0)
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 0;color:${MUTED};font-size:13px;width:170px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;color:${SLATE};font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');

  const action = options.action
    ? `<p style="margin:28px 0 0;">
         <a href="${escapeHtml(options.action.url)}"
            style="background:${TEAL};color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">
           ${escapeHtml(options.action.label)}
         </a>
       </p>`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:${CANVAS};font-family:'Inter',-apple-system,Segoe UI,sans-serif;">
    <table role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 4px;color:${MUTED};font-size:12px;letter-spacing:1px;text-transform:uppercase;">
            ${escapeHtml(options.companyName)}
          </p>
          <h1 style="margin:0 0 12px;color:${SLATE};font-size:19px;font-weight:600;">
            ${escapeHtml(options.heading)}
          </h1>
          <p style="margin:0 0 18px;color:${SLATE};font-size:14px;line-height:1.55;">
            ${escapeHtml(options.intro)}
          </p>
          <table role="presentation" style="width:100%;border-collapse:collapse;">${rows}</table>
          ${action}
          ${
            options.footer
              ? `<p style="margin:24px 0 0;color:${MUTED};font-size:12px;line-height:1.5;">${escapeHtml(options.footer)}</p>`
              : ''
          }
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export interface MissedFollowUpData {
  companyName: string;
  employeeName: string;
  customerName: string;
  destination: string | null;
  proposalReference: string;
  proposalValue: string;
  dueOn: string;
  daysOverdue: number;
  leadUrl: string;
}

export function missedFollowUp(data: MissedFollowUpData): RenderedEmail {
  const days = data.daysOverdue === 1 ? '1 day' : `${data.daysOverdue} days`;

  return {
    subject: `Missed follow-up — ${data.customerName} (${data.proposalReference})`,
    body: frame({
      companyName: data.companyName,
      heading: 'A follow-up was missed',
      intro: `${data.employeeName}, a scheduled follow-up on this proposal passed ${days} ago with nothing recorded against it.`,
      rows: [
        ['Customer', data.customerName],
        ['Destination', data.destination ?? '—'],
        ['Proposal', data.proposalReference],
        ['Proposal value', data.proposalValue],
        ['Follow-up was due', data.dueOn],
        ['Days overdue', String(data.daysOverdue)],
      ],
      action: { label: 'Open the lead', url: data.leadUrl },
      footer: 'You are seeing this because the lead is assigned to you.',
    }),
  };
}

export interface FollowUpDueData {
  companyName: string;
  employeeName: string;
  customerName: string;
  destination: string | null;
  proposalReference: string;
  proposalValue: string;
  dueOn: string;
  sequence: number;
  leadUrl: string;
}

export function followUpDue(data: FollowUpDueData): RenderedEmail {
  return {
    subject: `Follow-up due — ${data.customerName} (${data.proposalReference})`,
    body: frame({
      companyName: data.companyName,
      heading: `Follow-up ${data.sequence} is due today`,
      intro: `${data.employeeName}, this proposal is due a follow-up. Record what happens against the lead so the trail stays complete.`,
      rows: [
        ['Customer', data.customerName],
        ['Destination', data.destination ?? '—'],
        ['Proposal', data.proposalReference],
        ['Proposal value', data.proposalValue],
        ['Due', data.dueOn],
      ],
      action: { label: 'Open the lead', url: data.leadUrl },
    }),
  };
}

export interface LeadAssignedData {
  companyName: string;
  employeeName: string;
  customerName: string;
  destination: string | null;
  travelDate: string;
  priority: string;
  leadReference: string;
  leadUrl: string;
}

export function leadAssigned(data: LeadAssignedData): RenderedEmail {
  return {
    subject: `New lead assigned — ${data.customerName} (${data.leadReference})`,
    body: frame({
      companyName: data.companyName,
      heading: 'A lead has been assigned to you',
      intro: `${data.employeeName}, this enquiry is now yours.`,
      rows: [
        ['Customer', data.customerName],
        ['Destination', data.destination ?? '—'],
        ['Travel date', data.travelDate],
        ['Priority', data.priority],
        ['Reference', data.leadReference],
      ],
      action: { label: 'Open the lead', url: data.leadUrl },
    }),
  };
}

export interface EscalationData {
  companyName: string;
  customerName: string;
  employeeName: string;
  proposalReference: string;
  missedCount: number;
  leadUrl: string;
}

export function followUpEscalated(data: EscalationData): RenderedEmail {
  return {
    subject: `Escalation — ${data.missedCount} missed follow-ups on ${data.proposalReference}`,
    body: frame({
      companyName: data.companyName,
      heading: 'Repeated missed follow-ups',
      intro: `${data.missedCount} follow-ups on this proposal have now been missed. It may need reassigning.`,
      rows: [
        ['Customer', data.customerName],
        ['Assigned to', data.employeeName],
        ['Proposal', data.proposalReference],
        ['Missed follow-ups', String(data.missedCount)],
      ],
      action: { label: 'Open the lead', url: data.leadUrl },
      footer: 'You are seeing this because you are an administrator.',
    }),
  };
}

/** A plain-text summary, for the "send a test email" button. */
export function smtpTest(companyName: string): RenderedEmail {
  return {
    subject: `${companyName} — SMTP test`,
    body: frame({
      companyName,
      heading: 'SMTP is working',
      intro:
        'This message was sent from your CRM to confirm the mail settings. Nothing else was changed.',
      rows: [],
    }),
  };
}
