import { FileText, Inbox, LayoutDashboard, Settings, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Placeholders for later phases render as disabled entries. */
  enabled: boolean;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, enabled: true },
  { label: 'Inbox', href: '/inbox', icon: Inbox, enabled: true },
  { label: 'CRM', href: '/crm', icon: Users, enabled: false },
  { label: 'Quotes', href: '/quotes', icon: FileText, enabled: false },
  { label: 'Settings', href: '/settings', icon: Settings, enabled: true },
];
