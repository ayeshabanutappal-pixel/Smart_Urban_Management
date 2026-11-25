import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  PowerOff,
  Truck,
  UserCog,
  X,
} from 'lucide-react';
import type { Worker } from '../types/waste';
import type { CreateWorkerDraft } from '../services/flaskApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManageWorkersPageProps {
  workers: Worker[];
  flaskApiBaseUrl: string;
  onCreateWorker: (draft: CreateWorkerDraft) => Promise<Worker>;
  onUpdateWorker: (id: string, patch: Partial<CreateWorkerDraft>) => Promise<Worker>;
  onToggleActive: (id: string, isActive: boolean) => Promise<Worker>;
  onWorkerListChanged: () => void;
}

type FormMode = 'create' | 'edit';

interface WorkerFormState {
  name: string;
  phone: string;
  roleTitle: string;
  ward: string;
  vehicleCode: string;
  availability: 'Available' | 'On Duty' | 'Off Shift';
  email: string;
  password: string;
}

const EMPTY_FORM: WorkerFormState = {
  name: '',
  phone: '',
  roleTitle: '',
  ward: '',
  vehicleCode: '',
  availability: 'Available',
  email: '',
  password: '',
};

const AVAILABILITY_OPTIONS: Array<'Available' | 'On Duty' | 'Off Shift'> = [
  'Available',
  'On Duty',
  'Off Shift',
];

function availabilityColor(av: string) {
  if (av === 'Available') return 'text-[#059669] bg-[#ECFDF5] border-[#A7F3D0]';
  if (av === 'On Duty') return 'text-[#0284C7] bg-[#E0F2FE] border-[#BAE6FD]';
  return 'text-[#6B7280] bg-[#F3F4F6] border-[#E5E7EB]';
}

// ---------------------------------------------------------------------------
// Worker Form Modal
// ---------------------------------------------------------------------------

interface WorkerFormModalProps {
  mode: FormMode;
  initial: WorkerFormState;
  submitting: boolean;
  error: string | null;
  onSubmit: (form: WorkerFormState) => void;
  onClose: () => void;
}

function WorkerFormModal({
  mode,
  initial,
  submitting,
  error,
  onSubmit,
  onClose,
}: WorkerFormModalProps) {
  const [form, setForm] = useState<WorkerFormState>(initial);

  const set = (key: keyof WorkerFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#022C22]/60 backdrop-blur-xs px-4"
      aria-modal="true"
      role="dialog"
      aria-label={mode === 'create' ? 'Add New Worker' : 'Edit Worker'}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[#E2EAE5] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EEF3F0] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <UserCog className="h-5 w-5 text-[#059669]" />
            <h2 className="font-display text-base font-bold text-[#022C22]">
              {mode === 'create' ? 'Add New Worker' : 'Edit Worker'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F5F8F6] hover:text-[#022C22]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mx-6 mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Full Name */}
            <div className="sm:col-span-2">
              <label htmlFor="wf-name" className="block text-xs font-semibold text-[#374151]">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="wf-name"
                type="text"
                required
                minLength={2}
                value={form.name}
                onChange={set('name')}
                placeholder="e.g. Rajan Kumar"
                className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm text-[#1F2937] focus:border-[#059669] focus:outline-none"
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="wf-phone" className="block text-xs font-semibold text-[#374151]">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                id="wf-phone"
                type="tel"
                required
                value={form.phone}
                onChange={set('phone')}
                placeholder="+91 98450 00000"
                className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm text-[#1F2937] focus:border-[#059669] focus:outline-none"
              />
            </div>

            {/* Role / Designation */}
            <div>
              <label htmlFor="wf-role" className="block text-xs font-semibold text-[#374151]">
                Role / Designation <span className="text-red-500">*</span>
              </label>
              <input
                id="wf-role"
                type="text"
                required
                minLength={2}
                value={form.roleTitle}
                onChange={set('roleTitle')}
                placeholder="e.g. Sanitation Officer"
                className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm text-[#1F2937] focus:border-[#059669] focus:outline-none"
              />
            </div>

            {/* Ward */}
            <div>
              <label htmlFor="wf-ward" className="block text-xs font-semibold text-[#374151]">
                Ward / Zone <span className="text-red-500">*</span>
              </label>
              <input
                id="wf-ward"
                type="text"
                required
                minLength={2}
                value={form.ward}
                onChange={set('ward')}
                placeholder="e.g. Ward 3 - Lakeview"
                className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm text-[#1F2937] focus:border-[#059669] focus:outline-none"
              />
            </div>

            {/* Vehicle Code */}
            <div>
              <label htmlFor="wf-vehicle" className="block text-xs font-semibold text-[#374151]">
                Vehicle Number <span className="text-[#9CA3AF]">(optional)</span>
              </label>
              <input
                id="wf-vehicle"
                type="text"
                value={form.vehicleCode}
                onChange={set('vehicleCode')}
                placeholder="e.g. KA-01-WS-001"
                className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm font-mono text-[#1F2937] focus:border-[#059669] focus:outline-none"
              />
            </div>

            {/* Availability */}
            <div>
              <label htmlFor="wf-avail" className="block text-xs font-semibold text-[#374151]">
                Availability
              </label>
              <select
                id="wf-avail"
                value={form.availability}
                onChange={set('availability')}
                className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm text-[#1F2937] focus:border-[#059669] focus:outline-none"
              >
                {AVAILABILITY_OPTIONS.map((av) => (
                  <option key={av} value={av}>
                    {av}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional Worker Portal Login Account */}
            <div className="sm:col-span-2 mt-1 rounded-xl border border-[#DCE6E0] bg-[#F8FAF9] p-3.5">
              <p className="text-xs font-bold text-[#064E3B]">
                Worker Portal Login Access (Optional)
              </p>
              <p className="mt-0.5 text-[11px] text-[#6B7280]">
                Allows this worker to sign in using their email or phone number to view assigned tasks.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="wf-email" className="block text-xs font-semibold text-[#374151]">
                    Login Email
                  </label>
                  <input
                    id="wf-email"
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="worker@wastesmart.com"
                    className="mt-1 w-full rounded-xl border border-[#DCE6E0] bg-white px-3.5 py-2 text-sm text-[#1F2937] focus:border-[#059669] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="wf-pwd" className="block text-xs font-semibold text-[#374151]">
                    {mode === 'edit' ? 'New Password (blank keeps existing)' : 'Initial Password'}
                  </label>
                  <input
                    id="wf-pwd"
                    type="password"
                    minLength={6}
                    value={form.password}
                    onChange={set('password')}
                    placeholder="Min 6 characters"
                    className="mt-1 w-full rounded-xl border border-[#DCE6E0] bg-white px-3.5 py-2 text-sm text-[#1F2937] focus:border-[#059669] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 border-t border-[#EEF3F0] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#DCE6E0] px-4 py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#F5F8F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#064E3B] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#022C22] disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Add Worker' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ManageWorkersPage({
  workers,
  onCreateWorker,
  onUpdateWorker,
  onToggleActive,
  onWorkerListChanged,
}: ManageWorkersPageProps) {
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editTarget, setEditTarget] = useState<Worker | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Worker | null>(null);

  // Filter to show all workers (active + inactive) on this page
  const totalWorkers = workers.length;
  const availableCount = workers.filter((w) => w.isActive && w.availability === 'Available').length;
  const onDutyCount = workers.filter((w) => w.isActive && w.availability === 'On Duty').length;
  const offShiftCount = workers.filter((w) => w.isActive && w.availability === 'Off Shift').length;
  const inactiveCount = workers.filter((w) => !w.isActive).length;

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    window.setTimeout(() => setSuccessMessage(null), 3500);
  };

  const openCreate = () => {
    setEditTarget(null);
    setFormError(null);
    setFormMode('create');
  };

  const openEdit = (w: Worker) => {
    setEditTarget(w);
    setFormError(null);
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditTarget(null);
    setFormError(null);
  };

  const handleFormSubmit = async (form: WorkerFormState) => {
    setFormSubmitting(true);
    setFormError(null);
    try {
      const draft: CreateWorkerDraft = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        roleTitle: form.roleTitle.trim(),
        ward: form.ward.trim(),
        vehicleCode: form.vehicleCode.trim() || undefined,
        availability: form.availability,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.password ? { password: form.password } : {}),
      };
      if (formMode === 'create') {
        await onCreateWorker(draft);
        flash(`Worker "${form.name}" added successfully.`);
      } else if (editTarget) {
        await onUpdateWorker(editTarget.id, draft);
        flash(`Worker "${form.name}" updated successfully.`);
      }
      onWorkerListChanged();
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleActive = async (worker: Worker, forceActive?: boolean) => {
    const nextActive = forceActive !== undefined ? forceActive : !worker.isActive;
    if (!nextActive && forceActive === undefined) {
      setConfirmDeactivate(worker);
      return;
    }
    setTogglingId(worker.id);
    try {
      await onToggleActive(worker.id, nextActive);
      flash(`Worker "${worker.name}" ${nextActive ? 'activated' : 'deactivated'}.`);
      onWorkerListChanged();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to update worker status.');
    } finally {
      setTogglingId(null);
      setConfirmDeactivate(null);
    }
  };

  const initials = (name: string) =>
    name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#022C22]">Manage Workers</h2>
          <p className="mt-1 text-sm text-[#4B5563]">
            Add, edit, and manage the status of municipal sanitation workers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {successMessage && (
            <div
              role="status"
              className="inline-flex items-center gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-2 text-xs font-semibold text-[#064E3B]"
            >
              <CheckCircle2 className="h-4 w-4 text-[#059669]" />
              <span>{successMessage}</span>
            </div>
          )}
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-[#064E3B] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#022C22]"
          >
            <Plus className="h-4 w-4" />
            Add New Worker
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Workers', value: totalWorkers, color: 'text-[#022C22]' },
          { label: 'Available', value: availableCount, color: 'text-[#059669]' },
          { label: 'On Duty', value: onDutyCount, color: 'text-[#0284C7]' },
          { label: 'Off Shift / Inactive', value: offShiftCount + inactiveCount, color: 'text-[#6B7280]' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-[#E2EAE5] bg-white p-4 text-center"
          >
            <p className={`font-display text-2xl font-extrabold tabular-nums ${stat.color}`}>
              {stat.value}
            </p>
            <p className="mt-0.5 text-xs text-[#6B7280]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Workers Table */}
      <div className="rounded-2xl border border-[#E2EAE5] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EEF3F0] text-left text-xs font-semibold text-[#6B7280]">
                <th className="px-5 py-3.5">Worker</th>
                <th className="px-4 py-3.5">Phone</th>
                <th className="px-4 py-3.5">Ward</th>
                <th className="px-4 py-3.5">Vehicle</th>
                <th className="px-4 py-3.5">Availability</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Tasks</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF3F0]">
              {workers.map((w) => (
                <tr
                  key={w.id}
                  className={`transition-colors hover:bg-[#F9FBFA] ${!w.isActive ? 'opacity-60' : ''}`}
                >
                  {/* Worker identity */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-xs font-bold ${
                          w.isActive
                            ? 'bg-[#064E3B] text-[#A7F3D0]'
                            : 'bg-[#E5E7EB] text-[#9CA3AF]'
                        }`}
                      >
                        {initials(w.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-[#1F2937]">{w.name}</p>
                        <p className="text-[11px] text-[#9CA3AF]">{w.roleTitle}</p>
                      </div>
                    </div>
                  </td>

                  {/* Phone */}
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-[#4B5563]">
                      <Phone className="h-3 w-3 text-[#059669]" />
                      {w.phone}
                    </span>
                  </td>

                  {/* Ward */}
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#4B5563]">
                      <MapPin className="h-3 w-3 text-[#059669]" />
                      {w.ward}
                    </span>
                  </td>

                  {/* Vehicle */}
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-[#4B5563]">
                      <Truck className="h-3 w-3 text-[#059669]" />
                      {w.vehicleCode || '—'}
                    </span>
                  </td>

                  {/* Availability */}
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${availabilityColor(
                        w.availability
                      )}`}
                    >
                      {w.availability}
                    </span>
                  </td>

                  {/* Active / Inactive */}
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        w.isActive
                          ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]'
                          : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]'
                      }`}
                    >
                      {w.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Task counts */}
                  <td className="px-4 py-3.5">
                    <div className="text-xs">
                      <span className="font-semibold text-[#064E3B]">{w.activeTasks}</span>
                      <span className="text-[#9CA3AF]"> active</span>
                      {' · '}
                      <span className="font-semibold text-[#059669]">{w.completedCount}</span>
                      <span className="text-[#9CA3AF]"> done</span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(w)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E0] bg-white px-3 py-1.5 text-xs font-semibold text-[#064E3B] hover:bg-[#ECFDF5]"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={togglingId === w.id}
                        onClick={() => handleToggleActive(w)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                          w.isActive
                            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                            : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5]'
                        }`}
                      >
                        {togglingId === w.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <PowerOff className="h-3 w-3" />
                        )}
                        {w.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {workers.length === 0 && (
            <div className="px-6 py-14 text-center">
              <UserCog className="mx-auto h-10 w-10 text-[#C7DBD0]" />
              <p className="mt-3 font-display text-sm font-bold text-[#022C22]">
                No workers registered yet
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Click <strong>+ Add New Worker</strong> to register the first sanitation worker.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Deactivation Confirmation Dialog */}
      {confirmDeactivate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#022C22]/60 backdrop-blur-xs px-4"
          aria-modal="true"
          role="alertdialog"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#E2EAE5] bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                <PowerOff className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-display text-sm font-bold text-[#022C22]">
                  Deactivate Worker?
                </h3>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  {confirmDeactivate.name} will be hidden from assignment dropdowns. Existing
                  complaint history remains intact.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeactivate(null)}
                className="flex-1 rounded-xl border border-[#DCE6E0] py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#F5F8F6]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={togglingId === confirmDeactivate.id}
                onClick={() => void handleToggleActive(confirmDeactivate, false)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {togglingId === confirmDeactivate.id && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {formMode && (
        <WorkerFormModal
          mode={formMode}
          initial={
            editTarget
              ? {
                  name: editTarget.name,
                  phone: editTarget.phone,
                  roleTitle: editTarget.roleTitle,
                  ward: editTarget.ward,
                  vehicleCode: editTarget.vehicleCode ?? '',
                  availability: editTarget.availability,
                  email: editTarget.email ?? '',
                  password: '',
                }
              : EMPTY_FORM
          }
          submitting={formSubmitting}
          error={formError}
          onSubmit={(form) => void handleFormSubmit(form)}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
