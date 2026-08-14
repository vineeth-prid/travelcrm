import {
  BarChart3,
  CalendarClock,
  CreditCard,
  FileText,
  Inbox,
  Instagram,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Settings,
  Sparkles,
  Users,
  UserSquare2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden from employees entirely — the API enforces the same rule. */
  adminOnly?: boolean;
  /**
   * Shown, disabled, badged "Soon". Nothing sits behind these routes: a nav
   * entry that 404s is worse than one that says it is not built yet.
   */
  soon?: boolean;
}

export interface NavSection {
  /** Omitted for the first group, which needs no heading. */
  label?: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'CRM',
    items: [
      { label: 'Leads', href: '/leads', icon: Users },
      { label: 'Customers', href: '/customers', icon: UserSquare2 },
      { label: 'Follow-ups', href: '/follow-ups', icon: CalendarClock },
      { label: 'Inbox', href: '/inbox', icon: Inbox },
    ],
  },
  {
    label: 'Sales',
    items: [
      // Proposals are created on a lead, but they are listed here across every
      // lead — "what is out with a customer right now" is its own question.
      { label: 'Proposals', href: '/proposals', icon: FileText },
      { label: 'Invoices', href: '/invoices', icon: Receipt },
      { label: 'Payments', href: '/payments', icon: CreditCard },
    ],
  },
  {
    label: 'Finance',
    items: [{ label: 'Expenses', href: '/expenses', icon: Wallet, adminOnly: true }],
  },
  {
    label: 'Reports',
    items: [
      // Sales and profitability are the Dashboard rather than two more pages
      // rendering slices of the same payload. Performance is genuinely its own
      // view, and is open to employees — the API gives them only their own row.
      { label: 'Performance', href: '/reports/performance', icon: BarChart3 },
    ],
  },
  {
    label: 'Coming soon',
    items: [
      { label: 'Instagram', href: '/channels/instagram', icon: Instagram, soon: true },
      { label: 'WhatsApp', href: '/channels/whatsapp', icon: MessageCircle, soon: true },
      { label: 'AI automation', href: '/automation', icon: Sparkles, soon: true },
    ],
  },
  {
    items: [{ label: 'Settings', href: '/settings', icon: Settings }],
  },
];

/** Drops the sections an employee may not see, and any section left empty. */
export function visibleSections(isAdmin: boolean): NavSection[] {
  if (isAdmin) return navSections;

  return navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.adminOnly) }))
    .filter((section) => section.items.length > 0);
}
