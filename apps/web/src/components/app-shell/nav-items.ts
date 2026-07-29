import { Inbox, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * The whole application. CRM and quoting are not destinations — they live in
 * the right-hand panel of the Inbox, beside the conversation they belong to.
 */
export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Inbox', href: '/inbox', icon: Inbox },
  { label: 'Settings', href: '/settings', icon: Settings },
];
