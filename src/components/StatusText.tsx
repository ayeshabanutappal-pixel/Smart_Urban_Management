import { CheckCircle2, Clock, ShieldCheck, Truck, UserCheck } from 'lucide-react';
import type { ComplaintStatus, WasteCategory } from '../types/waste';
import { CATEGORY_COLORS } from '../utils/wasteLogic';

export function ComplaintStatusLabel({ status }: { status: ComplaintStatus }) {
  switch (status) {
    case 'Resolved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#059669] whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Resolved
        </span>
      );
    case 'Pending Verification':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] whitespace-nowrap">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Pending Verification
        </span>
      );
    case 'In Progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0284C7] whitespace-nowrap">
          <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          In Progress
        </span>
      );
    case 'Assigned':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#064E3B] whitespace-nowrap">
          <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Assigned
        </span>
      );
    case 'Pending':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D97706] whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Pending
        </span>
      );
  }
}

export function WasteCategoryText({ category }: { category: WasteCategory }) {
  const color = CATEGORY_COLORS[category];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1F2937] whitespace-nowrap">
      <span
        className="h-2 w-2 rounded-xs shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {category}
    </span>
  );
}
