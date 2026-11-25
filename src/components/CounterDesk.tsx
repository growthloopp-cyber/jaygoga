import { useEffect, useState } from 'react';
import { Banknote, Printer, Search, Ticket, XCircle } from 'lucide-react';
import type {
  SessionActor,
  TicketBundle,
  TravelRoute,
  TripBerthItem,
  TripSearchItem,
  TripStop,
} from '../types/travel';
import { TRANSLATIONS } from '../i18n/translations';
import { calculateFareBreakdown } from '../utils/bookingRules';
import { BerthSelector } from './BerthSelector';

interface CounterDeskProps {
  authToken: string | null;
  actor: SessionActor | null;
  routes: TravelRoute[];
  onOpenAuth: () => void;
  onViewTicket: (ticket: TicketBundle) => void;
}

export function CounterDesk({
  authToken,
  actor,
  routes,
  onOpenAuth,
  onViewTicket,
}: CounterDeskProps) {
  const [countersList, setCountersList] = useState<Array<{ id: number; code: string; name: string; city: string }>>([]);
  const [recentBookings, setRecentBookings] = useState<TicketBundle[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'new' | 'search'>('new');

  // Search trips
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trips, setTrips] = useState<TripSearchItem[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripSearchItem | null>(null);

  // Berths & Passenger form
  const [berths, setBerths] = useState<TripBerthItem[]>([]);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pickupStop, setPickupStop] = useState('');
  const [dropStop, setDropStop] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [passengerAge, setPassengerAge] = useState('30');
  const [passengerGender, setPassengerGender] = useState<'male' | 'female' | 'other'>('male');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'counter_upi' | 'counter_card'>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Ticket Search tab
  const [ticketQuery, setTicketQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TicketBundle[]>([]);

  const isAuthorized = Boolean(
    authToken && actor && (actor.role === 'counter_staff' || actor.role === 'admin')
  );

  const cities = Array.from(new Set(routes.flatMap((r) => [r.origin, r.destination]))).sort();

  const loadContext = async () => {
    if (!authToken || !isAuthorized) return;
    try {
      const res = await fetch('/api/counter/context', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCountersList(data.counters || []);
      setRecentBookings(data.recentBookings || []);
      setSearchResults(data.recentBookings || []);
      if (data.counters?.length > 0 && !selectedCounterId) {
        setSelectedCounterId(String(actor?.counterId || data.counters[0].id));
      }
    } catch {
      // handled gracefully
    }
  };

  useEffect(() => {
    loadContext();
    handleSearchTrips();
  }, [authToken, actor?.role]);

  const handleSearchTrips = async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (origin) params.set('origin', origin);
      if (destination) params.set('destination', destination);
      if (date) params.set('date', date);
      const res = await fetch(`/api/trips/search?${params.toString()}`);
      const data = await res.json();
      setTrips(data.trips || []);
    } catch {
      setError('Failed to search trips');
    }
  };

  const handleSelectTrip = async (trip: TripSearchItem) => {
    setSelectedTrip(trip);
    setSelectedIds([]);
    setError('');
    try {
      const res = await fetch(`/api/trips/${trip.id}/berths`);
      const data = await res.json();
      setBerths(data.berths || []);
      const tripStops: TripStop[] = data.stops || [];
      setStops(tripStops);
      const p = tripStops.filter((s) => s.stopType === 'pickup');
      const d = tripStops.filter((s) => s.stopType === 'drop');
      setPickupStop(p[0] ? `${p[0].stopName} (${p[0].scheduledTime})` : trip.route.origin);
      setDropStop(d[0] ? `${d[0].stopName} (${d[0].scheduledTime})` : trip.route.destination);
    } catch {
      setError('Could not load trip berth map');
    }
  };

  const handleToggleBerth = (b: TripBerthItem) => {
    setSelectedIds((prev) =>
      prev.includes(b.id) ? prev.filter((id) => id !== b.id) : [...prev, b.id]
    );
  };

  const selectedBerths = berths.filter((b) => selectedIds.includes(b.id));
  const breakdown = calculateFareBreakdown({
    berthFares: selectedBerths.map((b) => b.fare),
    gstPercent: 5,
  });

  const handleCreateCounterBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !selectedTrip) return;
    if (selectedBerths.length === 0) {
      setError('Select at least one available sleeper berth');
      return;
    }

    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/bookings/counter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          tripId: selectedTrip.id,
          counterId: selectedCounterId ? Number(selectedCounterId) : undefined,
          pickupStop,
          dropStop,
          paymentMethod,
          customerName,
          customerPhone,
          passengers: selectedBerths.map((b) => ({
            tripBerthId: b.id,
            fullName: customerName,
            mobile: customerPhone,
            age: Number(passengerAge || 30),
            gender: passengerGender,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Counter booking failed');

      setSuccessMsg(`Counter booking ${data.ticket.booking.pnr} confirmed (${paymentMethod}).`);
      setSelectedIds([]);
      setCustomerName('');
      setCustomerPhone('');
      await handleSelectTrip(selectedTrip);
      await loadContext();
      onViewTicket(data.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Counter booking failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSearchTickets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    const res = await fetch(
      `/api/counter/bookings/search?q=${encodeURIComponent(ticketQuery)}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const data = await res.json();
    setSearchResults(data.bookings || []);
  };

  const handleCancelBooking = async (bookingId: number, pnr: string) => {
    if (!authToken) return;
    const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ reason: 'Cancelled at counter desk' }),
    });
    if (res.ok) {
      setSuccessMsg(`Booking ${pnr} cancelled and berths released back to inventory.`);
      await loadContext();
      if (selectedTrip) await handleSelectTrip(selectedTrip);
    }
  };

  if (!isAuthorized) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center space-y-5">
        <div className="rounded-xl border border-[#D4AF37]/35 bg-[#141418] p-8 space-y-4">
          <p className="text-xs uppercase tracking-widest text-[#D4AF37]">
            Protected Counter Operations
          </p>
          <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
            Counter Staff Sign-In Required
          </h2>
          <p className="text-sm text-[#FAF7F0]/70">
            Physical counter reservations, cash collections, and ticket cancellations update the live central sleeper inventory and require counter staff or administrator credentials.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] text-[#09090B] px-6 py-3 text-sm font-semibold hover:bg-[#E8C86B] cursor-pointer"
          >
            Sign In as Counter Staff
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-xs text-[#D4AF37]">
            {actor?.fullName} · {actor?.role.toUpperCase()}
          </p>
          <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
            Counter & Cash Reservation Desk
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Active Booking Counter"
            value={selectedCounterId}
            onChange={(e) => setSelectedCounterId(e.target.value)}
            className="rounded-lg border border-white/15 bg-[#141418] px-3 py-2 text-xs text-[#FAF7F0]"
          >
            {countersList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name} ({c.city})
              </option>
            ))}
          </select>

          <div className="flex gap-1 p-1 rounded-lg bg-[#141418] border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('new')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                activeTab === 'new' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-[#FAF7F0]/75'
              }`}
            >
              New Cash / Counter Booking
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                activeTab === 'search' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-[#FAF7F0]/75'
              }`}
            >
              Search & Cancel Tickets
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">
          {successMsg}
        </div>
      )}

      {activeTab === 'new' ? (
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-xl border border-white/10 bg-[#141418] p-4">
            <select
              aria-label="Counter search origin"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2.5 text-sm text-[#FAF7F0]"
            >
              <option value="">All Origins</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Counter search destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2.5 text-sm text-[#FAF7F0]"
            >
              <option value="">All Destinations</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label="Counter journey date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2.5 text-sm text-[#FAF7F0]"
            />
            <button
              type="button"
              onClick={handleSearchTrips}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] text-[#09090B] px-4 py-2.5 text-sm font-semibold hover:bg-[#E8C86B] cursor-pointer"
            >
              <Search className="w-4 h-4" />
              Find Departures
            </button>
          </div>

          {/* Matching Trips Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {trips.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTrip(t)}
                className={`text-left rounded-xl border p-4 cursor-pointer ${
                  selectedTrip?.id === t.id
                    ? 'border-[#D4AF37] bg-[#1C1A12]'
                    : 'border-white/10 bg-[#141418] hover:border-white/30'
                }`}
              >
                <div className="flex justify-between text-xs text-[#D4AF37] font-mono-tabular">
                  <span>{t.tripCode}</span>
                  <span>{t.availableBerthCount} berths left</span>
                </div>
                <div className="mt-1 font-semibold text-[#FAF7F0]">
                  {t.route.origin} → {t.route.destination}
                </div>
                <div className="mt-1 text-xs text-[#FAF7F0]/65 font-mono-tabular">
                  {t.departureTime} – {t.arrivalTime} · {t.bus.coachType} · Rs.{t.startingFare}+
                </div>
              </button>
            ))}
          </div>

          {selectedTrip && (
            <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6 items-start">
              <BerthSelector
                berths={berths}
                selectedIds={selectedIds}
                onToggleBerth={handleToggleBerth}
                t={TRANSLATIONS.en}
                lockExpiresAt={null}
              />

              <form
                onSubmit={handleCreateCounterBooking}
                className="rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] text-[#09090B] p-5 space-y-4"
              >
                <h3 className="font-display text-2xl font-bold border-b border-[#09090B]/10 pb-2">
                  Issue Counter Ticket
                </h3>
                <div className="text-xs text-[#09090B]/70">
                  Selected Berths:{' '}
                  <strong className="font-mono-tabular">
                    {selectedBerths.map((b) => b.berthNumber).join(', ') || 'None'}
                  </strong>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cnt-name" className="block text-xs font-medium mb-1">
                      Passenger Name
                    </label>
                    <input
                      id="cnt-name"
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="cnt-phone" className="block text-xs font-medium mb-1">
                      Mobile (10 digits)
                    </label>
                    <input
                      id="cnt-phone"
                      type="tel"
                      required
                      pattern="[0-9]{10}"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cnt-age" className="block text-xs font-medium mb-1">
                      Age
                    </label>
                    <input
                      id="cnt-age"
                      type="number"
                      min={1}
                      max={110}
                      value={passengerAge}
                      onChange={(e) => setPassengerAge(e.target.value)}
                      className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label htmlFor="cnt-gender" className="block text-xs font-medium mb-1">
                      Gender
                    </label>
                    <select
                      id="cnt-gender"
                      value={passengerGender}
                      onChange={(e) =>
                        setPassengerGender(e.target.value as 'male' | 'female' | 'other')
                      }
                      className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-sm"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cnt-pickup" className="block text-xs font-medium mb-1">
                      Pickup
                    </label>
                    <select
                      id="cnt-pickup"
                      value={pickupStop}
                      onChange={(e) => setPickupStop(e.target.value)}
                      className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-xs"
                    >
                      {stops
                        .filter((s) => s.stopType === 'pickup')
                        .map((s) => (
                          <option key={s.id} value={`${s.stopName} (${s.scheduledTime})`}>
                            {s.stopName} · {s.scheduledTime}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cnt-drop" className="block text-xs font-medium mb-1">
                      Drop
                    </label>
                    <select
                      id="cnt-drop"
                      value={dropStop}
                      onChange={(e) => setDropStop(e.target.value)}
                      className="w-full rounded-lg border border-[#09090B]/20 bg-white px-3 py-2 text-xs"
                    >
                      {stops
                        .filter((s) => s.stopType === 'drop')
                        .map((s) => (
                          <option key={s.id} value={`${s.stopName} (${s.scheduledTime})`}>
                            {s.stopName} · {s.scheduledTime}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium mb-1">Counter Payment Mode</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'cash', label: 'Cash Collected' },
                      { id: 'counter_upi', label: 'Counter UPI' },
                      { id: 'counter_card', label: 'POS Card' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setPaymentMethod(m.id as 'cash' | 'counter_upi' | 'counter_card')
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

                <div className="rounded-lg bg-[#F3EDE0] p-3 text-sm space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Subtotal + 5% GST</span>
                    <span className="font-mono-tabular">
                      Rs.{breakdown.subtotal} + Rs.{breakdown.tax}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-base">
                    <span>Amount Collected</span>
                    <span className="font-mono-tabular">Rs. {breakdown.total}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || selectedBerths.length === 0}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#09090B] text-[#D4AF37] py-3 text-sm font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <Banknote className="w-4 h-4" />
                  {busy ? 'Issuing Ticket...' : `Confirm & Collect Rs. ${breakdown.total}`}
                </button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={handleSearchTickets} className="flex gap-3">
            <input
              type="text"
              value={ticketQuery}
              onChange={(e) => setTicketQuery(e.target.value)}
              placeholder="Search by PNR, mobile number, or passenger name"
              className="flex-1 rounded-lg border border-white/15 bg-[#141418] px-4 py-2.5 text-sm text-[#FAF7F0]"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-sm font-semibold cursor-pointer"
            >
              Search Tickets
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141418]">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-xs text-[#FAF7F0]/65">
                <tr>
                  <th className="py-3 px-4">PNR</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Route & Date</th>
                  <th className="py-3 px-4">Berths</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(searchResults.length > 0 ? searchResults : recentBookings).map((t) => (
                  <tr key={t.booking.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-[#D4AF37]">
                      {t.booking.pnr}
                    </td>
                    <td className="py-3 px-4">
                      <div>{t.booking.customerName}</div>
                      <div className="text-xs text-[#FAF7F0]/55 font-mono-tabular">
                        {t.booking.customerPhone}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div>
                        {t.route.origin} → {t.route.destination}
                      </div>
                      <div className="text-[#FAF7F0]/55 font-mono-tabular">
                        {t.trip.journeyDate} · {t.trip.departureTime}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-xs">
                      {t.berths.map((b) => b.berthNumber).join(', ')}
                    </td>
                    <td className="py-3 px-4 uppercase text-xs">{t.booking.bookingChannel}</td>
                    <td className="py-3 px-4 font-mono-tabular">Rs.{t.booking.totalAmount}</td>
                    <td className="py-3 px-4 text-xs uppercase">{t.booking.status}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => onViewTicket(t)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-white/15 text-xs hover:border-[#D4AF37] cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Ticket
                      </button>
                      {t.booking.status === 'confirmed' && (
                        <button
                          type="button"
                          onClick={() => handleCancelBooking(t.booking.id, t.booking.pnr)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-red-500/40 text-xs text-red-300 hover:bg-red-950/60 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {searchResults.length === 0 && recentBookings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm text-[#FAF7F0]/50">
                      <Ticket className="w-5 h-5 mx-auto mb-2 opacity-50" />
                      No counter bookings recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
