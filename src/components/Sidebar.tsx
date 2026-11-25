import {
  BarChart3,
  Bell,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  MapPin,
  PlusCircle,
  ScanSearch,
  Settings,
  User,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import type { PageRoute, UserRole } from '../types/waste';
import { WasteSmartLogo } from './WasteSmartLogo';

interface NavItem {
  id: PageRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CITIZEN_MENU: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'report-garbage', label: 'Report Garbage', icon: PlusCircle },
  { id: 'detect-waste', label: 'Detect Waste', icon: ScanSearch },
  { id: 'my-complaints', label: 'My Complaints', icon: ClipboardList },
  { id: 'track-complaints', label: 'Track Complaints', icon: MapPin },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const ADMIN_MENU: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'all-complaints', label: 'All Complaints', icon: ClipboardList },
  { id: 'detect-waste', label: 'Detect Waste', icon: ScanSearch },
  { id: 'track-complaints', label: 'Track Complaints', icon: MapPin },
  { id: 'assign-workers', label: 'Assign Workers', icon: Users },
  { id: 'manage-workers', label: 'Manage Workers', icon: UserCog },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  role: UserRole;
  activePage: PageRoute;
  unreadNotifications: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNavigate: (page: PageRoute) => void;
  onLogout: () => void;
}

export function Sidebar({
  role,
  activePage,
  unreadNotifications,
  mobileOpen,
  onCloseMobile,
  onNavigate,
  onLogout,
}: SidebarProps) {
  const menu = role === 'admin' ? ADMIN_MENU : CITIZEN_MENU;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#022C22] via-[#043A2C] to-[#064E3B] text-white">
      {/* Brand Lockup */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
        <button
          type="button"
          onClick={() => {
            onNavigate('dashboard');
            onCloseMobile();
          }}
          className="flex items-center text-left focus-visible:outline-[#A7F3D0]"
          aria-label="Go to WasteSmart Dashboard"
        >
          <WasteSmartLogo variant="dark-surface" size="md" />
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Role Context Line */}
      <div className="px-5 pt-4 pb-2">
        <p className="text-[11px] font-medium tracking-wider text-[#A7F3D0]/80">
          {role === 'admin' ? 'Municipal Admin Console' : 'Citizen Portal'}
        </p>
      </div>

      {/* Navigation Links */}
      <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {menu.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-[#059669] text-white shadow-sm'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <Icon
                  className={`h-4.5 w-4.5 shrink-0 transition-transform duration-150 ${
                    isActive ? 'text-white' : 'text-[#A7F3D0] group-hover:scale-105'
                  }`}
                />
                <span>{item.label}</span>
              </span>
              {item.id === 'notifications' && unreadNotifications > 0 && (
                <span className="font-mono text-[11px] font-semibold tabular-nums text-[#A7F3D0]">
                  {unreadNotifications}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Logout Button */}
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4.5 w-4.5 text-[#A7F3D0] shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#022C22]/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-68 max-w-[82vw] shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
