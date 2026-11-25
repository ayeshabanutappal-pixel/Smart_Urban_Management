import { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  ScanSearch,
  ShieldCheck,
  User,
} from 'lucide-react';
import { WasteSmartLogo } from '../components/WasteSmartLogo';
import type { UserProfile, UserRole } from '../types/waste';
import { validateAuthForm } from '../utils/wasteLogic';
import { authenticateWithFlask } from '../services/flaskApi';

interface AuthPageProps {
  flaskApiBaseUrl: string;
  onAuthenticated: (user: UserProfile, token: string, rememberEmail: boolean) => void;
  initialRememberedEmail?: string;
}

export function AuthPage({
  flaskApiBaseUrl,
  onAuthenticated,
  initialRememberedEmail = '',
}: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [portalView, setPortalView] = useState<UserRole>('citizen');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialRememberedEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(Boolean(initialRememberedEmail));
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const validationError = validateAuthForm({
      mode,
      name,
      email,
      password,
      allowPhoneIdentifier: mode === 'login' && portalView === 'worker',
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const { user, token } = await authenticateWithFlask(flaskApiBaseUrl, {
        mode,
        name,
        email,
        password,
      });
      onAuthenticated(user, token, rememberMe);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setForgotOpen(false);
    setInfoMessage(
      'Self-service password reset emails are not enabled. Contact your municipal administrator for account recovery.'
    );
    setResetEmail('');
  };

  return (
    <div className="min-h-screen w-full bg-[#F5F8F6] lg:grid lg:grid-cols-12">
      {/* LEFT PANEL: Full-height Dark Forest-Green Environmental Hero */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-[#022C22] px-7 py-10 text-white lg:col-span-6 lg:min-h-screen lg:px-12 lg:py-12 xl:col-span-7">
        {/* Background Environmental City Skyline SVG */}
        <img
          src="/assets/images/city-skyline-hero.svg"
          alt="Sustainable eco-friendly city skyline with greenery"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-bottom opacity-95"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#022C22]/78 via-[#064E3B]/28 to-[#022C22]/85"
          aria-hidden="true"
        />

        {/* Top Logo */}
        <div className="relative z-10 flex items-center justify-between">
          <WasteSmartLogo variant="dark-surface" size="lg" />
        </div>

        {/* Center Narrative */}
        <div className="relative z-10 my-10 max-w-xl lg:my-0">
          <p className="text-xs font-semibold tracking-wider text-[#A7F3D0]">
            Municipal Sustainability Platform
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-white [text-wrap:balance] sm:text-4xl xl:text-[2.65rem]">
            Smart Urban Waste Detection and Management System
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-[#D1FAE5]/90">
            AI-Powered Waste Identification and Intelligent Municipal Coordination — connecting
            citizens, YOLO computer vision, and field sanitation crews in one unified workflow.
          </p>
        </div>

        {/* Bottom 3 Feature Pillars: Detect · Track · Manage */}
        <div className="relative z-10 grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#A7F3D0] ring-1 ring-white/15">
              <ScanSearch className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold text-white">Detect</h2>
              <p className="mt-0.5 text-xs text-[#D1FAE5]/75">
                AI waste classification via YOLO &amp; OpenCV
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#A7F3D0] ring-1 ring-white/15">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold text-white">Track</h2>
              <p className="mt-0.5 text-xs text-[#D1FAE5]/75">
                GPS-tagged reports &amp; resolution timelines
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#A7F3D0] ring-1 ring-white/15">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold text-white">Manage</h2>
              <p className="mt-0.5 text-xs text-[#D1FAE5]/75">
                Worker dispatch, analytics &amp; CSV reports
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT PANEL: Clean White Login / Register Form */}
      <main className="relative flex flex-col justify-center overflow-hidden bg-white px-6 py-10 sm:px-12 lg:col-span-6 lg:px-14 xl:col-span-5">
        {/* Decorative Botanical Leaf Corner Illustration */}
        <svg
          viewBox="0 0 220 220"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-6 -right-6 h-52 w-52 text-[#059669]/12"
        >
          <path
            d="M210 210 C130 205 68 158 46 82 C112 76 184 114 210 210 Z"
            fill="currentColor"
          />
          <path
            d="M206 206 C158 164 116 128 74 96"
            stroke="#064E3B"
            strokeOpacity="0.16"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M196 152 C148 110 132 54 152 14 C194 42 214 96 196 152 Z"
            fill="#064E3B"
            fillOpacity="0.08"
          />
        </svg>

        <div className="relative z-10 mx-auto w-full max-w-md">
          {/* Compact logo mark above form */}
          <div className="mb-7">
            <WasteSmartLogo variant="light-surface" size="sm" />
          </div>

          <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#022C22] sm:text-3xl">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="mt-1.5 text-sm text-[#4B5563]">
            {mode === 'login'
              ? 'Sign in to continue reporting, tracking, or coordinating urban sanitation.'
              : 'Create a citizen account to report roadside waste and track cleanup status.'}
          </p>

          {/* Portal Context Tabs (backend enforces authoritative user role) */}
          {mode === 'login' ? (
            <div
              role="tablist"
              aria-label="Account portal"
              className="mt-6 grid grid-cols-3 gap-1 rounded-xl bg-[#EEF4F0] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={portalView === 'citizen'}
                onClick={() => {
                  setPortalView('citizen');
                  setEmail(initialRememberedEmail);
                  setPassword('');
                  setInfoMessage(null);
                  setError(null);
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                  portalView === 'citizen'
                    ? 'bg-white text-[#064E3B] shadow-xs'
                    : 'text-[#4B5563] hover:text-[#022C22]'
                }`}
              >
                Citizen
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={portalView === 'worker'}
                onClick={() => {
                  setPortalView('worker');
                  setEmail('');
                  setPassword('');
                  setInfoMessage(
                    'Sign in with the phone number or email assigned by your municipal administrator.'
                  );
                  setError(null);
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                  portalView === 'worker'
                    ? 'bg-white text-[#064E3B] shadow-xs'
                    : 'text-[#4B5563] hover:text-[#022C22]'
                }`}
              >
                Field Worker
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={portalView === 'admin'}
                onClick={() => {
                  setPortalView('admin');
                  setEmail(
                    (import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ??
                      'admin@wastesmart.com'
                  );
                  setPassword(
                    (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) ??
                      'WasteSmart@Admin2026'
                  );
                  setInfoMessage('Administrator credentials are ready.');
                  setError(null);
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                  portalView === 'admin'
                    ? 'bg-white text-[#064E3B] shadow-xs'
                    : 'text-[#4B5563] hover:text-[#022C22]'
                }`}
              >
                Municipal Admin
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-xl bg-[#EEF4F0] px-3.5 py-2.5 text-xs font-semibold text-[#064E3B]">
              Citizen Portal Registration
            </div>
          )}

          {/* Alerts */}
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
            >
              {error}
            </div>
          )}
          {infoMessage && (
            <div
              role="status"
              className="mt-4 flex items-center gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3 text-xs font-medium text-[#064E3B]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#059669]" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Forgot Password Inline Panel */}
          {forgotOpen ? (
            <form onSubmit={handleForgotSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-semibold text-[#374151]"
                >
                  Account Email
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@wastesmart.city"
                    className="w-full rounded-xl border border-[#D4E2DA] bg-[#F9FBFA] py-3 pl-10 pr-4 text-sm text-[#1F2937] focus:border-[#059669] focus:bg-white"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#064E3B] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#022C22]"
                >
                  Send Reset Link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(false);
                    setError(null);
                  }}
                  className="rounded-xl border border-[#D4E2DA] px-4 py-3 text-sm font-semibold text-[#374151] hover:bg-[#F5F8F6]"
                >
                  Back
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-semibold text-[#374151]"
                  >
                    Full Name
                  </label>
                  <div className="relative mt-1.5">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                    <input
                      id="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Aarav Sharma"
                      className="w-full rounded-xl border border-[#D4E2DA] bg-[#F9FBFA] py-3 pl-10 pr-4 text-sm text-[#1F2937] focus:border-[#059669] focus:bg-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-semibold text-[#374151]"
                >
                  {mode === 'login' && portalView === 'worker'
                    ? 'Phone Number or Worker Email'
                    : 'Email Address'}
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    id="auth-email"
                    type={mode === 'login' && portalView === 'worker' ? 'text' : 'email'}
                    autoComplete={mode === 'login' && portalView === 'worker' ? 'username' : 'email'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      mode === 'login' && portalView === 'worker'
                        ? '+91 98450 00000 or worker@wastesmart.city'
                        : 'name@wastesmart.city'
                    }
                    className="w-full rounded-xl border border-[#D4E2DA] bg-[#F9FBFA] py-3 pl-10 pr-4 text-sm text-[#1F2937] focus:border-[#059669] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-semibold text-[#374151]"
                >
                  Password
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-[#D4E2DA] bg-[#F9FBFA] py-3 pl-10 pr-11 text-sm text-[#1F2937] focus:border-[#059669] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#6B7280] hover:text-[#064E3B]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {mode === 'login' && (
                <div className="flex items-center justify-between pt-0.5">
                  <label className="inline-flex items-center gap-2 text-xs text-[#4B5563] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-[#CBD5E1] accent-[#064E3B]"
                    />
                    <span>Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen(true);
                      setResetEmail(email);
                      setError(null);
                    }}
                    className="text-xs font-semibold text-[#059669] hover:text-[#064E3B]"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#064E3B] py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#022C22] disabled:opacity-60"
              >
                {submitting
                  ? mode === 'login'
                    ? 'Signing in...'
                    : 'Creating account...'
                  : mode === 'login'
                  ? 'Login to WasteSmart'
                  : 'Create WasteSmart Account'}
              </button>
            </form>
          )}

          {/* Toggle Login / Sign-up */}
          <p className="mt-6 text-center text-xs text-[#4B5563]">
            {mode === 'login' ? (
              <>
                New to WasteSmart?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setPortalView('citizen');
                    setError(null);
                    setInfoMessage(null);
                  }}
                  className="font-bold text-[#064E3B] underline decoration-[#059669]/50 underline-offset-4 hover:text-[#059669]"
                >
                  Sign up for free
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setInfoMessage(null);
                  }}
                  className="font-bold text-[#064E3B] underline decoration-[#059669]/50 underline-offset-4 hover:text-[#059669]"
                >
                  Sign in here
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
