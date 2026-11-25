import { useEffect, useState } from 'react';
import { Calendar, Download, Navigation, Search, Ticket, XCircle } from 'lucide-react';
import type { SessionActor, TicketBundle, TripStop } from '../types/travel';
import { downloadTicketPdf } from '../utils/ticketPdf';
import { LiveBusTracker } from './LiveBusTracker';

interface CustomerAccountViewProps {
  authToken: string | null;
  actor: SessionActor | null;
  onOpenAuth: () => void;
  onViewTicket: (ticket: TicketBundle) => void;
}

export function CustomerAccountView({
  authToken,
  actor,
  onOpenAuth,
  onViewTicket,
}: CustomerAccountViewProps) {
  const [bookings, setBookings] = useState<TicketBundle[]>([]);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [loading, setLoading] = useState(false);

  // Public PNR Lookup state
  const [pnrInput, setPnrInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [lookupResult, setLookupResult] = useState<TicketBundle | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [trackingTicket, setTrackingTicket] = useState<TicketBundle | null>(null);
  const [trackingStops, setTrackingStops] = useState<TripStop[]>([]);

  const handleToggleTracking = async (ticket: TicketBundle) => {
    if (trackingTicket?.booking.id === ticket.booking.id) {
      setTrackingTicket(null);
      return;
    }
    setTrackingTicket(ticket);
    try {
      const res = await fetch(`/api/trips/${ticket.trip.id}/berths`);
      if (res.ok) {
        const data = await res.json();
        setTrackingStops(data.stops || []);
      } else {
        setTrackingStops([]);
      }
    } catch {
      setTrackingStops([]);
    }
  };

  const loadMyBookings = async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/customer/bookings', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyBookings();
  }, [authToken]);

  const handlePnrLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError('');
    setLookupResult(null);
    try {
      const res = await fetch(
        `/api/bookings/lookup?pnr=${encodeURIComponent(pnrInput.trim())}&phone=${encodeURIComponent(
          phoneInput.trim()
        )}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking not found');
      setLookupResult(data.ticket);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to find PNR');
    }
  };

  const handleRequestCancel = async (t: TicketBundle) => {
    setActionMsg('');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    const res = await fetch(`/api/bookings/${t.booking.id}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pnr: t.booking.pnr,
        phone: t.booking.customerPhone,
        reason: 'Customer requested cancellation',
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setActionMsg(
        `PNR ${t.booking.pnr} cancelled (${data.refund?.policyTier || 'Cancelled'}). Refund amount: Rs. ${
          data.refund?.refundAmount ?? 0
        }`
      );
      if (lookupResult?.booking.id === t.booking.id) {
        setLookupResult(null);
      }
      await loadMyBookings();
    } else {
      setActionMsg(data.error || 'Unable to cancel booking');
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const filteredBookings = bookings.filter((t) => {
    if (filter === 'upcoming') {
      return t.booking.status === 'confirmed' && t.trip.journeyDate >= today;
    }
    if (filter === 'completed') {
      return t.booking.status === 'completed' || (t.booking.status === 'confirmed' && t.trip.journeyDate < today);
    }
    if (filter === 'cancelled') {
      return (
        t.booking.status === 'cancelled' ||
        t.booking.status === 'refund_pending' ||
        t.booking.status === 'refunded'
      );
    }
    return true;
  });

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-8">
      {/* PNR Lookup Card */}
      <div className="rounded-xl border border-[#D4AF37]/30 bg-[#141418] p-6 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Instant Verification</p>
          <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
            Track PNR & Download Ticket
          </h2>
        </div>

        <form onSubmit={handlePnrLookup} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            required
            aria-label="PNR Number"
            placeholder="PNR (e.g. JGT4A8K2)"
            value={pnrInput}
            onChange={(e) => setPnrInput(e.target.value.toUpperCase())}
            className="rounded-lg border border-white/15 bg-[#09090B] px-3.5 py-2.5 text-sm font-mono-tabular text-[#FAF7F0]"
          />
          <input
            type="tel"
            required
            aria-label="Registered Mobile Number"
            placeholder="10-Digit Mobile Number"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="rounded-lg border border-white/15 bg-[#09090B] px-3.5 py-2.5 text-sm font-mono-tabular text-[#FAF7F0]"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] text-[#09090B] px-5 py-2.5 text-sm font-semibold hover:bg-[#E8C86B] cursor-pointer"
          >
            <Search className="w-4 h-4" />
            Find Booking
          </button>
        </form>

        {lookupError && <p className="text-xs text-red-300">{lookupError}</p>}
        {actionMsg && <p className="text-xs text-[#E8C86B]">{actionMsg}</p>}

        {lookupResult && (
          <div className="rounded-lg border border-[#D4AF37]/40 bg-[#09090B] p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono-tabular text-sm font-bold text-[#D4AF37]">
                {lookupResult.booking.pnr} · {lookupResult.booking.status.toUpperCase()}
              </p>
              <p className="text-base font-semibold text-[#FAF7F0]">
                {lookupResult.route.origin} → {lookupResult.route.destination}
              </p>
              <p className="text-xs text-[#FAF7F0]/65 font-mono-tabular">
                {lookupResult.trip.journeyDate} · {lookupResult.trip.departureTime} · Berths:{' '}
                {lookupResult.berths.map((b) => b.berthNumber).join(', ')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleTracking(lookupResult)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#D4AF37]/50 text-xs font-semibold text-[#E8C86B] cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5" />
                {trackingTicket?.booking.id === lookupResult.booking.id ? 'Hide GPS Map' : 'Live Bus Tracking'}
              </button>
              <button
                type="button"
                onClick={() => onViewTicket(lookupResult)}
                className="px-3.5 py-2 rounded-lg border border-[#D4AF37] text-xs font-semibold text-[#D4AF37] cursor-pointer"
              >
                View QR Pass
              </button>
              <button
                type="button"
                onClick={() => downloadTicketPdf(lookupResult)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
              {lookupResult.booking.status === 'confirmed' && (
                <button
                  type="button"
                  onClick={() => handleRequestCancel(lookupResult)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-500/40 text-xs text-red-300 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {trackingTicket && (
          <div className="pt-2">
            <LiveBusTracker
              trip={trackingTicket.trip}
              route={trackingTicket.route}
              bus={trackingTicket.bus}
              stops={trackingStops}
            />
          </div>
        )}
      </div>

      {/* Signed-in Customer Dashboard */}
      <div className="rounded-xl border border-white/10 bg-[#141418] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="font-display text-2xl font-bold text-[#FAF7F0]">
              {actor ? `${actor.fullName || 'Traveler'} — My Journeys` : 'Customer Account'}
            </h3>
            {actor && (
              <p className="text-xs text-[#FAF7F0]/60 font-mono-tabular">
                {actor.phone || actor.email} · {actor.authProvider.toUpperCase()}
              </p>
            )}
          </div>

          {actor ? (
            <div className="flex gap-1 p-1 rounded-lg bg-[#09090B] border border-white/10">
              {(['all', 'upcoming', 'completed', 'cancelled'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded capitalize cursor-pointer ${
                    filter === tab ? 'bg-[#D4AF37] text-[#09090B]' : 'text-[#FAF7F0]/70'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-semibold cursor-pointer"
            >
              Sign In with Mobile OTP / Google
            </button>
          )}
        </div>

        {!actor ? (
          <div className="py-10 text-center text-sm text-[#FAF7F0]/60">
            Sign in with your mobile OTP or Google account to view your complete reservation history, upcoming journeys, and refund status.
          </div>
        ) : loading ? (
          <div className="py-8 text-center text-sm text-[#FAF7F0]/60">Loading your journeys...</div>
        ) : filteredBookings.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#FAF7F0]/60">
            <Ticket className="w-5 h-5 mx-auto mb-2 opacity-50" />
            No bookings found in this category.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((t) => (
              <div
                key={t.booking.id}
                className="rounded-lg border border-white/10 bg-[#09090B] p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#D4AF37]">
                    <span>{t.booking.pnr}</span>
                    <span aria-hidden="true">·</span>
                    <span className="uppercase">{t.booking.status}</span>
                    <span aria-hidden="true">·</span>
                    <span>Rs. {t.booking.totalAmount}</span>
                  </div>
                  <div className="text-base font-semibold text-[#FAF7F0]">
                    {t.route.origin} → {t.route.destination}
                  </div>
                  <div className="text-xs text-[#FAF7F0]/65 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="font-mono-tabular">
                      {t.trip.journeyDate} {t.trip.departureTime}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Berths: {t.berths.map((b) => b.berthNumber).join(', ')}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleTracking(t)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#D4AF37]/40 text-xs font-semibold text-[#E8C86B] cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    {trackingTicket?.booking.id === t.booking.id ? 'Hide GPS' : 'Track Bus'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewTicket(t)}
                    className="px-3.5 py-2 rounded-lg border border-white/20 text-xs font-semibold hover:border-[#D4AF37] cursor-pointer"
                  >
                    Ticket & QR
                  </button>
                  {t.booking.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={() => handleRequestCancel(t)}
                      className="px-3.5 py-2 rounded-lg border border-red-500/40 text-xs text-red-300 hover:bg-red-950/50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
