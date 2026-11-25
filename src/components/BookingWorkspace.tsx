import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Layers,
  Navigation,
  ShieldCheck,
  Tag,
  XCircle,
} from 'lucide-react';
import type {
  SessionActor,
  TicketBundle,
  TripBerthItem,
  TripSearchItem,
  TripStop,
} from '../types/travel';
import type { TranslationDictionary } from '../i18n/translations';
import { calculateFareBreakdown, validateBerthGenderSelection } from '../utils/bookingRules';
import { BerthSelector } from './BerthSelector';
import { LiveBusTracker } from './LiveBusTracker';

interface BookingWorkspaceProps {
  trip: TripSearchItem;
  sessionToken: string;
  authToken: string | null;
  actor: SessionActor | null;
  razorpayConfigured: boolean;
  razorpayKeyId: string;
  t: TranslationDictionary;
  onBack: () => void;
  onBookingConfirmed: (ticket: TicketBundle) => void;
}

interface PassengerFormState {
  tripBerthId: number;
  berthNumber: string;
  fare: number;
  fullName: string;
  mobile: string;
  age: string;
  gender: 'male' | 'female' | 'other';
}

export function BookingWorkspace({
  trip,
  sessionToken,
  authToken,
  actor,
  razorpayConfigured,
  razorpayKeyId,
  t,
  onBack,
  onBookingConfirmed,
}: BookingWorkspaceProps) {
  const [berths, setBerths] = useState<TripBerthItem[]>([]);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [lockExpiresAt, setLockExpiresAt] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<'berths' | 'tracking'>('berths');

  const [passengers, setPassengers] = useState<PassengerFormState[]>([]);
  const [customerName, setCustomerName] = useState(actor?.fullName || '');
  const [customerPhone, setCustomerPhone] = useState(actor?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(actor?.email || '');
  const [pickupStop, setPickupStop] = useState('');
  const [dropStop, setDropStop] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountType: 'percent' | 'flat';
    discountValue: number;
    maxDiscount?: number | null;
    minAmount?: number;
  } | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'razorpay_upi' | 'razorpay_card' | 'razorpay_netbanking'>('razorpay_upi');
  const [submitting, setSubmitting] = useState(false);

  // Test-mode checkout modal state (when Razorpay live/test keys aren't set in env)
  const [pendingGatewayOrder, setPendingGatewayOrder] = useState<{
    bookingId: number;
    pnr: string;
    orderId: string;
    totalAmount: number;
    testOrderToken?: string;
  } | null>(null);

  const loadBerths = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/trips/${trip.id}/berths?sessionToken=${encodeURIComponent(sessionToken)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load berths');
      setBerths(data.berths || []);
      const tripStops: TripStop[] = data.stops || [];
      setStops(tripStops);
      const pickups = tripStops.filter((s) => s.stopType === 'pickup');
      const drops = tripStops.filter((s) => s.stopType === 'drop');
      if (pickups.length > 0 && !pickupStop) {
        setPickupStop(`${pickups[0].stopName} (${pickups[0].scheduledTime})`);
      }
      if (drops.length > 0 && !dropStop) {
        setDropStop(`${drops[0].stopName} (${drops[0].scheduledTime})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load berths');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBerths();
    return () => {
      fetch(`/api/trips/${trip.id}/locks?sessionToken=${encodeURIComponent(sessionToken)}`, {
        method: 'DELETE',
      }).catch(() => {});
    };
  }, [trip.id]);

  const handleToggleBerth = async (berth: TripBerthItem) => {
    setError('');
    const exists = selectedIds.includes(berth.id);
    const nextIds = exists
      ? selectedIds.filter((id) => id !== berth.id)
      : [...selectedIds, berth.id];

    if (nextIds.length > 6) {
      setError('Maximum 6 berths can be selected per booking.');
      return;
    }

    try {
      const res = await fetch(`/api/trips/${trip.id}/locks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripBerthIds: nextIds, sessionToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to hold berth');

      setSelectedIds(nextIds);
      setLockExpiresAt(data.expiresAt);

      // Sync passenger rows
      setPassengers((prev) => {
        if (exists) {
          return prev.filter((p) => p.tripBerthId !== berth.id);
        }
        return [
          ...prev,
          {
            tripBerthId: berth.id,
            berthNumber: berth.berthNumber,
            fare: berth.fare,
            fullName: prev.length === 0 ? customerName : '',
            mobile: customerPhone,
            age: '28',
            gender: berth.ladiesReserved ? 'female' : 'male',
          },
        ];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to lock berth');
      await loadBerths();
    }
  };

  const breakdown = useMemo(
    () =>
      calculateFareBreakdown({
        berthFares: passengers.map((p) => p.fare),
        coupon: appliedCoupon,
        gstPercent: 5,
      }),
    [passengers, appliedCoupon]
  );

  const handleApplyCoupon = async () => {
    setCouponMsg('');
    if (!couponCode.trim()) return;
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode.trim(), subtotal: breakdown.subtotal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid coupon');
      setAppliedCoupon(data.coupon);
      setCouponMsg(`Applied ${data.coupon.code}: Saved Rs. ${data.discountAmount}`);
    } catch (err) {
      setAppliedCoupon(null);
      setCouponMsg(err instanceof Error ? err.message : 'Invalid coupon');
    }
  };

  const handleInitiateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (passengers.length === 0) {
      setError('Select at least one sleeper berth first.');
      return;
    }

    // Client-side gender rule check before submitting
    for (const p of passengers) {
      const target = berths.find((b) => b.id === p.tripBerthId);
      if (target) {
        const check = validateBerthGenderSelection(target, p.gender, berths);
        if (!check.allowed) {
          setError(check.reason || 'Berth gender restriction violated.');
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const res = await fetch('/api/bookings/online/initiate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tripId: trip.id,
          sessionToken,
          pickupStop,
          dropStop,
          couponCode: appliedCoupon?.code || '',
          paymentMethod,
          customerName,
          customerPhone,
          customerEmail,
          passengers: passengers.map((p) => ({
            tripBerthId: p.tripBerthId,
            fullName: p.fullName,
            mobile: p.mobile || customerPhone,
            age: Number(p.age),
            gender: p.gender,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start checkout');

      if (data.mode === 'razorpay_live_or_test' && razorpayKeyId && (window as unknown as Record<string, unknown>).Razorpay) {
        const RazorpayCtor = (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { open: () => void } }).Razorpay;
        const rzp = new RazorpayCtor({
          key: razorpayKeyId,
          amount: data.amountPaise,
          currency: 'INR',
          name: 'Jay Goga Travels',
          description: `${trip.route.origin} to ${trip.route.destination} (${data.pnr})`,
          order_id: data.orderId,
          prefill: { name: customerName, contact: customerPhone, email: customerEmail },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            await verifyPaymentOnServer({
              bookingId: data.bookingId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
          },
          modal: {
            ondismiss: async () => {
              await handleCancelPendingOrder(data.bookingId, data.orderId);
            },
          },
        });
        rzp.open();
      } else {
        // Server-verified Test Mode Gateway checkout dialog
        setPendingGatewayOrder({
          bookingId: data.bookingId,
          pnr: data.pnr,
          orderId: data.orderId,
          totalAmount: data.totalAmount,
          testOrderToken: data.testOrderToken,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout initiation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyPaymentOnServer = async (payload: {
    bookingId: number;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature?: string;
    testOrderToken?: string;
  }) => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/payments/razorpay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, method: paymentMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment verification failed');
      setPendingGatewayOrder(null);
      onBookingConfirmed(data.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment verification failed');
      await loadBerths();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPendingOrder = async (bookingId: number, orderId: string) => {
    try {
      await fetch('/api/payments/razorpay/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, razorpayOrderId: orderId, reason: 'User cancelled payment' }),
      });
    } finally {
      setPendingGatewayOrder(null);
      setError('Payment was cancelled and locked berths have been released.');
      await loadBerths();
    }
  };

  const pickupStops = stops.filter((s) => s.stopType === 'pickup');
  const dropStops = stops.filter((s) => s.stopType === 'drop');

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onBack}
            className="self-start inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-lg border border-white/15 text-sm text-[#FAF7F0] hover:border-[#D4AF37] cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            Back to Buses
          </button>
          <div>
            <p className="text-xs text-[#D4AF37] font-mono-tabular">
              {trip.tripCode} · {trip.journeyDate} · {trip.departureTime} – {trip.arrivalTime}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#FAF7F0]">
              {trip.route.origin} to {trip.route.destination}
            </h2>
            <p className="text-xs text-[#FAF7F0]/65">
              {trip.bus.name} · {trip.bus.coachType} · {trip.bus.amenities.join(' · ')}
            </p>
          </div>
        </div>

        {/* Switch between Sleeper Berths & Live Bus Tracking */}
        <div className="w-full sm:w-auto inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/30 gold-bevel-panel p-1">
          <button
            type="button"
            onClick={() => setWorkspaceView('berths')}
            data-testid="tab-sleeper-berths"
            className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
              workspaceView === 'berths'
                ? 'bg-[#D4AF37] text-[#09090B]'
                : 'text-[#FAF7F0]/75 hover:text-[#FAF7F0]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Sleeper Berth Layout
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceView('tracking')}
            data-testid="tab-live-tracking"
            className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
              workspaceView === 'tracking'
                ? 'bg-[#D4AF37] text-[#09090B]'
                : 'text-[#FAF7F0]/75 hover:text-[#FAF7F0]'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            Live Bus Tracking
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6 items-start">
        {/* Left: Berth Map or Live GPS Tracker */}
        <div className="space-y-4">
          {loading ? (
            <div className="h-96 rounded-xl border border-white/10 bg-[#141418] flex items-center justify-center text-sm text-[#FAF7F0]/60">
              Loading live sleeper berth availability...
            </div>
          ) : workspaceView === 'tracking' ? (
            <LiveBusTracker
              trip={trip}
              route={trip.route}
              bus={trip.bus}
              stops={stops}
            />
          ) : (
            <BerthSelector
              berths={berths}
              selectedIds={selectedIds}
              onToggleBerth={handleToggleBerth}
              t={t}
              lockExpiresAt={lockExpiresAt}
            />
          )}
        </div>

        {/* Right: Passenger & Checkout Form */}
        <form
          onSubmit={handleInitiateBooking}
          className="rounded-xl border border-[#D4AF37]/30 bg-[#FAF7F0] text-[#09090B] p-5 sm:p-6 space-y-5"
        >
          <div className="border-b border-[#09090B]/10 pb-3">
            <h3 className="font-display text-2xl font-bold">{t.passengerDetails}</h3>
            <p className="text-xs text-[#09090B]/65">
              {passengers.length === 0
                ? 'Click any available berth on the deck layout to begin.'
                : `${passengers.length} berth(s) selected: ${passengers.map((p) => p.berthNumber).join(', ')}`}
            </p>
          </div>

          {/* Primary Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bk-cname" className="block text-xs font-medium text-[#09090B]/75 mb-1">
                Primary Contact Name
              </label>
              <input
                id="bk-cname"
                type="text"
                required
                value={customerName}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerName(val);
                  if (passengers.length > 0 && !passengers[0].fullName) {
                    setPassengers((prev) =>
                      prev.map((p, idx) => (idx === 0 ? { ...p, fullName: val } : p))
                    );
                  }
                }}
                placeholder="e.g. Aarav Patel"
                className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm focus:border-[#B4861C] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="bk-cphone" className="block text-xs font-medium text-[#09090B]/75 mb-1">
                Mobile Number (10 digits)
              </label>
              <input
                id="bk-cphone"
                type="tel"
                required
                pattern="[0-9]{10}"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm font-mono-tabular focus:border-[#B4861C] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="bk-cemail" className="block text-xs font-medium text-[#09090B]/75 mb-1">
              Email Address (Optional for ticket receipt)
            </label>
            <input
              id="bk-cemail"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="traveler@example.com"
              className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm focus:border-[#B4861C] focus:outline-none"
            />
          </div>

          {/* Pickup & Drop Points */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bk-pickup" className="block text-xs font-medium text-[#09090B]/75 mb-1">
                Pickup Point
              </label>
              <select
                id="bk-pickup"
                required
                value={pickupStop}
                onChange={(e) => setPickupStop(e.target.value)}
                className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm focus:border-[#B4861C] focus:outline-none"
              >
                {pickupStops.map((s) => (
                  <option key={s.id} value={`${s.stopName} (${s.scheduledTime})`}>
                    {s.stopName} · {s.scheduledTime}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bk-drop" className="block text-xs font-medium text-[#09090B]/75 mb-1">
                Drop Point
              </label>
              <select
                id="bk-drop"
                required
                value={dropStop}
                onChange={(e) => setDropStop(e.target.value)}
                className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm focus:border-[#B4861C] focus:outline-none"
              >
                {dropStops.map((s) => (
                  <option key={s.id} value={`${s.stopName} (${s.scheduledTime})`}>
                    {s.stopName} · {s.scheduledTime}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Per-Berth Passenger Rows */}
          {passengers.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#09090B]/65">
                Passenger Manifest
              </h4>
              {passengers.map((p, idx) => (
                <div
                  key={p.tripBerthId}
                  className="rounded-lg border border-[#09090B]/15 bg-white p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="font-mono-tabular text-[#B4861C]">
                      Berth {p.berthNumber}
                    </span>
                    <span className="font-mono-tabular">Rs. {p.fare}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_0.7fr_1fr] gap-2">
                    <input
                      type="text"
                      required
                      aria-label={`Passenger full name for berth ${p.berthNumber}`}
                      placeholder="Full Name"
                      value={p.fullName}
                      onChange={(e) =>
                        setPassengers((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, fullName: e.target.value } : row))
                        )
                      }
                      className="rounded border border-[#09090B]/20 px-2.5 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      required
                      min={1}
                      max={110}
                      aria-label={`Age for berth ${p.berthNumber}`}
                      placeholder="Age"
                      value={p.age}
                      onChange={(e) =>
                        setPassengers((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, age: e.target.value } : row))
                        )
                      }
                      className="rounded border border-[#09090B]/20 px-2.5 py-1.5 text-sm font-mono-tabular"
                    />
                    <select
                      aria-label={`Gender for berth ${p.berthNumber}`}
                      value={p.gender}
                      onChange={(e) =>
                        setPassengers((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, gender: e.target.value as 'male' | 'female' | 'other' }
                              : row
                          )
                        )
                      }
                      className="rounded border border-[#09090B]/20 px-2.5 py-1.5 text-sm"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Coupon Code */}
          <div className="space-y-1.5">
            <label htmlFor="bk-coupon" className="block text-xs font-medium text-[#09090B]/75">
              Promo / Coupon Code (Try GOGA10)
            </label>
            <div className="flex gap-2">
              <input
                id="bk-coupon"
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="GOGA10"
                className="flex-1 rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm font-mono-tabular"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#09090B]/25 text-xs font-semibold hover:bg-[#09090B]/5 cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5" />
                Apply
              </button>
            </div>
            {couponMsg && <p className="text-xs text-[#9A6B0C]">{couponMsg}</p>}
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-[#09090B]/75">
              Razorpay Payment Method {razorpayConfigured ? '' : '(Test Mode Active)'}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'razorpay_upi', label: 'UPI / QR' },
                { id: 'razorpay_card', label: 'Card' },
                { id: 'razorpay_netbanking', label: 'NetBanking' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setPaymentMethod(m.id as 'razorpay_upi' | 'razorpay_card' | 'razorpay_netbanking')
                  }
                  className={`py-2 px-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                    paymentMethod === m.id
                      ? 'bg-[#09090B] text-[#D4AF37] border-[#09090B]'
                      : 'bg-white text-[#09090B]/80 border-[#09090B]/20'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fare Summary */}
          <div className="rounded-lg bg-[#F3EDE0] p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-[#09090B]/75">
              <span>Berth Subtotal</span>
              <span className="font-mono-tabular">Rs. {breakdown.subtotal}</span>
            </div>
            {breakdown.discount > 0 && (
              <div className="flex justify-between text-emerald-800">
                <span>Coupon Discount</span>
                <span className="font-mono-tabular">-Rs. {breakdown.discount}</span>
              </div>
            )}
            <div className="flex justify-between text-[#09090B]/75">
              <span>GST (5%)</span>
              <span className="font-mono-tabular">Rs. {breakdown.tax}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-[#09090B]/15 pt-2 mt-1">
              <span>Total Payable</span>
              <span className="font-mono-tabular">Rs. {breakdown.total}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || passengers.length === 0}
            className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#09090B] berth-pod-3d text-[#D4AF37] py-3.5 px-6 text-sm font-semibold hover:bg-[#1A1A22] disabled:opacity-50 cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            {submitting ? 'Processing Reservation...' : `${t.payOnline} · Rs. ${breakdown.total}`}
          </button>
        </form>
      </div>

      {/* Server-Verified Test Mode Gateway Modal */}
      {pendingGatewayOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Razorpay Test Gateway Verification"
        >
          <div className="w-full max-w-md rounded-xl border border-[#D4AF37]/40 bg-[#FAF7F0] text-[#09090B] p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#09090B]/10 pb-3">
              <div>
                <p className="text-xs font-mono-tabular uppercase text-[#B4861C]">
                  Razorpay Test Mode Gateway
                </p>
                <h4 className="font-display text-xl font-bold">Authorize Online Payment</h4>
              </div>
              <ShieldCheck className="w-6 h-6 text-[#B4861C]" />
            </div>

            <div className="rounded-lg bg-white border border-[#09090B]/15 p-3.5 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[#09090B]/60">Order ID</span>
                <span className="font-mono-tabular text-xs">{pendingGatewayOrder.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#09090B]/60">Booking PNR</span>
                <span className="font-mono-tabular font-semibold">{pendingGatewayOrder.pnr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#09090B]/60">Method</span>
                <span className="uppercase text-xs font-semibold">{paymentMethod}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-[#09090B]/10">
                <span>Amount</span>
                <span className="font-mono-tabular">Rs. {pendingGatewayOrder.totalAmount}</span>
              </div>
            </div>

            <p className="text-xs text-[#09090B]/65">
              Live Razorpay credentials are not set in server environment variables; this test-mode checkout verifies the server-signed order token and commits atomic berth reservation in PostgreSQL.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  handleCancelPendingOrder(
                    pendingGatewayOrder.bookingId,
                    pendingGatewayOrder.orderId
                  )
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-600/40 text-red-700 py-2.5 px-4 text-xs font-semibold hover:bg-red-50 cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                Simulate Failed Payment
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  verifyPaymentOnServer({
                    bookingId: pendingGatewayOrder.bookingId,
                    razorpayOrderId: pendingGatewayOrder.orderId,
                    razorpayPaymentId: `pay_test_${Date.now()}`,
                    testOrderToken: pendingGatewayOrder.testOrderToken,
                  })
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#09090B] text-[#D4AF37] py-2.5 px-4 text-xs font-semibold hover:bg-[#1C1C22] cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Complete Test Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
