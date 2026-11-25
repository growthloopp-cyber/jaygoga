import { useEffect, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { KeyRound, Phone, X } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { SessionActor } from '../types/travel';

interface AuthModalProps {
  open: boolean;
  initialTab?: 'customer' | 'staff';
  onClose: () => void;
  onAuthenticated: (token: string, actor: SessionActor) => void;
}

export function AuthModal({
  open,
  initialTab = 'customer',
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [tab, setTab] = useState<'customer' | 'staff'>(initialTab);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Mobile OTP state
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [previewOtp, setPreviewOtp] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // Counter Staff Passcode state (Counter Desk only; Admin uses Google Sign-In with admin email)
  const [staffCode, setStaffCode] = useState('STF-101');
  const [passcode, setPasscode] = useState('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError('');
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Account sync failed');
      onAuthenticated(idToken, data.actor);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send OTP');
      setOtpSent(true);
      setPreviewOtp(data.previewOtp || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP request failed');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otpCode, fullName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OTP verification failed');
      onAuthenticated(data.token, data.actor);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffCode, passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid credentials');
      onAuthenticated(data.token, data.actor);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Account Sign In"
    >
      <div className="w-full max-w-md rounded-xl border border-[#D4AF37]/40 bg-[#FAF7F0] text-[#09090B] overflow-hidden">
        <div className="bg-[#09090B] text-[#FAF7F0] px-6 py-4 flex items-center justify-between border-b border-[#D4AF37]/30">
          <div>
            <p className="text-xs text-[#D4AF37]">Jay Goga Travels</p>
            <h3 className="font-display text-2xl font-bold">Sign In</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="p-2 rounded-lg text-[#FAF7F0]/70 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#EAE2D0]">
            <button
              type="button"
              onClick={() => {
                setTab('customer');
                setError('');
              }}
              className={`py-2 text-xs font-semibold rounded-md cursor-pointer ${
                tab === 'customer' ? 'bg-[#09090B] text-[#D4AF37]' : 'text-[#09090B]/70'
              }`}
            >
              Customer / Admin Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('staff');
                setError('');
              }}
              className={`py-2 text-xs font-semibold rounded-md cursor-pointer ${
                tab === 'staff' ? 'bg-[#09090B] text-[#D4AF37]' : 'text-[#09090B]/70'
              }`}
            >
              Counter Staff
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {tab === 'customer' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#D4AF37]/40 bg-[#F3EDE0] p-3 text-xs text-[#09090B]/80">
                Sign in with Google for passenger history or sign in with the authorized administrator email to unlock the Admin Console.
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleSignIn}
                className="w-full rounded-lg bg-[#09090B] text-[#D4AF37] py-2.5 px-4 text-sm font-semibold hover:bg-[#1A1A22] cursor-pointer"
              >
                Continue with Google
              </button>

              <div className="relative py-1 text-center text-xs text-[#09090B]/50">
                <span className="bg-[#FAF7F0] px-2 relative z-10">or passenger mobile otp</span>
                <div className="absolute inset-x-0 top-1/2 h-px bg-[#09090B]/15" />
              </div>

              {!otpSent ? (
                <form onSubmit={handleRequestOtp} className="space-y-3">
                  <div>
                    <label htmlFor="otp-name" className="block text-xs font-medium mb-1">
                      Full Name (Optional)
                    </label>
                    <input
                      id="otp-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your Name"
                      className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="otp-phone" className="block text-xs font-medium mb-1">
                      10-Digit Mobile Number
                    </label>
                    <input
                      id="otp-phone"
                      type="tel"
                      required
                      pattern="[0-9]{10}"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210"
                      className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm font-mono-tabular"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-[#09090B]/25 bg-white text-[#09090B] py-2.5 text-sm font-semibold hover:bg-neutral-50 cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    {busy ? 'Sending OTP...' : 'Send Mobile OTP'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  {previewOtp && (
                    <div className="rounded-lg border border-[#D4AF37]/50 bg-[#F3EDE0] p-3 text-xs">
                      SMS provider is not configured yet. Preview verification code:{' '}
                      <strong className="font-mono-tabular text-sm">{previewOtp}</strong>
                    </div>
                  )}
                  <div>
                    <label htmlFor="otp-code" className="block text-xs font-medium mb-1">
                      Enter 6-Digit OTP for {phone}
                    </label>
                    <input
                      id="otp-code"
                      type="text"
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm font-mono-tabular"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="px-4 py-2.5 rounded-lg border border-[#09090B]/20 text-xs font-semibold cursor-pointer"
                    >
                      Change Number
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex-1 rounded-lg bg-[#09090B] text-[#D4AF37] py-2.5 text-sm font-semibold cursor-pointer"
                    >
                      Verify & Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#D4AF37]/40 bg-[#F3EDE0] p-3 text-xs text-[#09090B]/80">
                Counter desk operator login only. Administrators must sign in via the main Sign In tab using their authorized Google email.
              </div>
              <form onSubmit={handleStaffLogin} className="space-y-3">
                <div>
                  <label htmlFor="staff-code" className="block text-xs font-medium mb-1">
                    Counter Staff Code
                  </label>
                  <input
                    id="staff-code"
                    type="text"
                    required
                    value={staffCode}
                    onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
                    placeholder="STF-101"
                    className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label htmlFor="staff-pass" className="block text-xs font-medium mb-1">
                    Passcode
                  </label>
                  <input
                    id="staff-pass"
                    type="password"
                    required
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#09090B] text-[#D4AF37] py-2.5 text-sm font-semibold cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  Sign In to Counter Desk
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
