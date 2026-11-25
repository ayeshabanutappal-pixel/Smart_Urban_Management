import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  User,
} from 'lucide-react';
import type {
  BackendStatus,
  NotificationItem,
  PageRoute,
  UserProfile,
} from '../types/waste';
import { formatDisplayTimestamp } from '../utils/wasteLogic';

const PAGE_TITLES: Record<PageRoute, string> = {
  dashboard: 'Dashboard',
  'report-garbage': 'Report Garbage',
  'detect-waste': 'Detect Waste',
  'my-complaints': 'My Complaints',
  'all-complaints': 'All Complaints',
  'track-complaints': 'Track Complaints',
  'assign-workers': 'Assign Workers',
  'manage-workers': 'Manage Workers',
  analytics: 'Analytics',
  reports: 'Reports',
  notifications: 'Notifications',
  profile: 'Profile',
  settings: 'Settings',
};

interface TopHeaderProps {
  user: UserProfile;
  activePage: PageRoute;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
  notifications: NotificationItem[];
  backendStatus: BackendStatus;
  onMarkNotificationRead: (id: string) => void;
  onNavigate: (page: PageRoute) => void;
  onLogout: () => void;
  onToggleMobileMenu: () => void;
}

export function TopHeader({
  user,
  activePage,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  notifications,
  backendStatus,
  onMarkNotificationRead,
  onNavigate,
  onLogout,
  onToggleMobileMenu,
}: TopHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-[#E2EAE5] bg-white/95 px-4 backdrop-blur-xs sm:px-6"
    >
      {/* Left: Sidebar Toggle + Context Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Toggle navigation sidebar"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2EAE5] text-[#064E3B] hover:bg-[#F5F8F6] lg:hidden shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-base font-bold text-[#022C22] truncate sm:text-lg">
            {PAGE_TITLES[activePage]}
          </h1>
          <p className="hidden text-xs text-[#6B7280] sm:block truncate">
            {backendStatus.connected
              ? 'Connected to Flask API'
              : 'Offline Mode · Configure Flask API URL in Settings'}
          </p>
        </div>
      </div>

      {/* Center: Global Complaint Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit();
        }}
        className="hidden md:flex flex-1 max-w-md items-center relative"
      >
        <Search
          className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#6B7280]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search complaint ID, location, or category..."
          aria-label="Search complaints"
          className="w-full rounded-xl border border-[#DCE6E0] bg-[#F5F8F6] py-2 pl-10 pr-4 text-sm text-[#1F2937] placeholder:text-[#6B7280] transition-colors focus:border-[#059669] focus:bg-white"
        />
      </form>

      {/* Right: Notification Bell + User Profile Dropdown */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Notifications Bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((o) => !o);
              setProfileOpen(false);
            }}
            aria-label={`Notifications (${unreadCount} unread)`}
            aria-expanded={notifOpen}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2EAE5] bg-white text-[#1F2937] transition-colors hover:border-[#059669]/40 hover:bg-[#F5F8F6]"
          >
            <Bell className="h-4.5 w-4.5 text-[#064E3B]" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#059669] px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl border border-[#DCE6E0] bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-[#E5ECE8] px-4 py-3">
                <span className="font-display text-sm font-bold text-[#022C22]">
                  Notifications
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    onNavigate('notifications');
                  }}
                  className="text-xs font-semibold text-[#059669] hover:text-[#064E3B]"
                >
                  View all
                </button>
              </div>
              <div className="max-h-72 divide-y divide-[#EEF3F0] overflow-y-auto">
                {notifications.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onMarkNotificationRead(item.id);
                      setNotifOpen(false);
                      onNavigate('track-complaints');
                    }}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-[#F5F8F6] ${
                      !item.read ? 'bg-[#ECFDF5]/50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#1F2937]">{item.title}</p>
                      <span className="text-[11px] text-[#6B7280] whitespace-nowrap">
                        {formatDisplayTimestamp(item.timestamp)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#4B5563] line-clamp-2">{item.message}</p>
                  </button>
                ))}
                {notifications.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-[#6B7280]">
                    No notifications yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((o) => !o);
              setNotifOpen(false);
            }}
            aria-label="Open account menu"
            aria-expanded={profileOpen}
            className="flex items-center gap-2.5 rounded-xl border border-[#E2EAE5] bg-white py-1.5 pl-1.5 pr-3 transition-colors hover:border-[#059669]/40 hover:bg-[#F5F8F6]"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#064E3B] font-display text-xs font-bold text-[#A7F3D0]">
              {initials}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold text-[#1F2937] leading-tight whitespace-nowrap">
                {user.name}
              </p>
              <p className="text-[11px] text-[#6B7280] leading-tight capitalize">
                {user.role === 'admin' ? 'Municipal Admin' : 'Citizen'}
              </p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[#6B7280]" aria-hidden="true" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-[#DCE6E0] bg-white p-1.5 shadow-xl">
              <div className="border-b border-[#EEF3F0] px-3 py-2.5">
                <p className="text-xs font-bold text-[#022C22]">{user.name}</p>
                <p className="text-[11px] text-[#6B7280] truncate">{user.email}</p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('profile');
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[#1F2937] hover:bg-[#F5F8F6]"
                >
                  <User className="h-3.5 w-3.5 text-[#064E3B]" />
                  <span>My Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('settings');
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[#1F2937] hover:bg-[#F5F8F6]"
                >
                  <Settings className="h-3.5 w-3.5 text-[#064E3B]" />
                  <span>Settings &amp; Flask API</span>
                </button>
              </div>
              <div className="border-t border-[#EEF3F0] pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[#DC2626] hover:bg-red-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
