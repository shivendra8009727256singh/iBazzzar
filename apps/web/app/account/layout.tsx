'use client';
import { LayoutDashboard, Package, MapPin, RotateCcw, Heart, Bell, LifeBuoy, UserCog } from 'lucide-react';
import { WorkspaceShell } from '@/components/workspace';

const NAV = [
  { href: '/account', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/account/orders', label: 'Orders', icon: Package },
  { href: '/account/returns', label: 'Returns & refunds', icon: RotateCcw },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/account/notifications', label: 'Notifications', icon: Bell },
  { href: '/account/support', label: 'Support', icon: LifeBuoy },
  { href: '/account/profile', label: 'Profile & security', icon: UserCog },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell title="My account" nav={NAV}>{children}</WorkspaceShell>;
}
