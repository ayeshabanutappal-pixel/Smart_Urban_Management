import { useState } from 'react';
import { Bell, CheckCheck, CheckCircle2, MapPin, ScanSearch, UserCheck } from 'lucide-react';
import type { NotificationItem } from '../types/waste';
import { formatDisplayTimestamp } from '../utils/wasteLogic';

interface NotificationsPageProps {
  notifications: NotificationItem[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onTrackComplaint: (complaintId: string) => void;
}

export function NotificationsPage({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onTrackComplaint,
}: NotificationsPageProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const visible =
    filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;
  const unreadCount = notifications.filter((n) => !n.read).length;

  const iconForType = (type: NotificationItem['type']) => {
    switch (type) {
      case 'resolved':
        return <CheckCircle2 className="h-4.5 w-4.5 text-[#059669]" />;
      case 'assignment':
        return <UserCheck className="h-4.5 w-4.5 text-[#064E3B]" />;
      case 'ai':
        return <ScanSearch className="h-4.5 w-4.5 text-[#0284C7]" />;
      default:
        return <Bell className="h-4.5 w-4.5 text-[#D97706]" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#022C22]">
            Notifications
          </h2>
          <p className="mt-1 text-sm text-[#4B5563]">
            Stay updated on waste detection results, worker assignments, and cleared complaints.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start">
          <div className="inline-flex rounded-xl border border-[#DCE6E0] bg-white p-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === 'all'
                  ? 'bg-[#064E3B] text-white'
                  : 'text-[#4B5563] hover:text-[#022C22]'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === 'unread'
                  ? 'bg-[#064E3B] text-white'
                  : 'text-[#4B5563] hover:text-[#022C22]'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#DCE6E0] bg-white px-3.5 py-2 text-xs font-semibold text-[#064E3B] hover:bg-[#ECFDF5] disabled:opacity-50 whitespace-nowrap"
          >
            <CheckCheck className="h-4 w-4" />
            <span>Mark all read</span>
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E2EAE5] bg-white divide-y divide-[#EEF3F0]">
        {visible.map((item) => (
          <div
            key={item.id}
            className={`flex flex-col justify-between gap-4 px-6 py-4 transition-colors sm:flex-row sm:items-center ${
              !item.read ? 'bg-[#ECFDF5]/45' : 'bg-white'
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5F8F6] border border-[#E2EAE5]">
                {iconForType(item.type)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-[#022C22]">{item.title}</p>
                  {!item.read && (
                    <span className="text-[11px] font-semibold text-[#059669]">New</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-[#4B5563]">
                  {item.message}
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#6B7280]">
                  {formatDisplayTimestamp(item.timestamp)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {item.complaintId && (
                <button
                  type="button"
                  onClick={() => {
                    onMarkRead(item.id);
                    onTrackComplaint(item.complaintId!);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E0] bg-white px-3 py-1.5 text-xs font-semibold text-[#064E3B] hover:bg-[#F5F8F6] whitespace-nowrap"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Inspect</span>
                </button>
              )}
              {!item.read && (
                <button
                  type="button"
                  onClick={() => onMarkRead(item.id)}
                  className="rounded-lg bg-[#064E3B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#022C22] whitespace-nowrap"
                >
                  Mark read
                </button>
              )}
            </div>
          </div>
        ))}

        {visible.length === 0 && (
          <div className="px-6 py-14 text-center">
            <Bell className="mx-auto h-9 w-9 text-[#9CA3AF]" />
            <p className="mt-3 font-display text-sm font-bold text-[#022C22]">
              You&apos;re all caught up
            </p>
            <p className="mt-1 text-xs text-[#6B7280]">
              {filter === 'unread'
                ? 'No unread notifications remaining.'
                : 'Notifications about complaints and assignments will appear here.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
