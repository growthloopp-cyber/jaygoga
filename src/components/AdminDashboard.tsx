import { useEffect, useState } from 'react';
import {
  BarChart3,
  Building2,
  Bus,
  CalendarClock,
  CreditCard,
  Download,
  FileSpreadsheet,
  Globe,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  ScrollText,
  Settings,
  Tag,
  Ticket,
  Users,
} from 'lucide-react';
import type { CompanySettings, SessionActor, TicketBundle } from '../types/travel';
import { buildCsvDocument } from '../utils/bookingRules';
import { downloadAdminReportPdf } from '../utils/ticketPdf';

type AdminTab =
  | 'overview'
  | 'buses'
  | 'berths'
  | 'routes'
  | 'trips'
  | 'bookings'
  | 'payments'
  | 'refunds'
  | 'coupons'
  | 'counters'
  | 'customers'
  | 'reports'
  | 'cms'
  | 'audit';

interface AdminDashboardProps {
  authToken: string | null;
  actor: SessionActor | null;
  settings: CompanySettings | null;
  onOpenAuth: () => void;
  onViewTicket: (ticket: TicketBundle) => void;
  onSettingsUpdated: () => void;
}

export function AdminDashboard({
  authToken,
  actor,
  settings,
  onOpenAuth,
  onViewTicket,
  onSettingsUpdated,
}: AdminDashboardProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Data slices
  const [overview, setOverview] = useState<{
    kpis: Record<string, number>;
    recentBookings?: Array<{
      id: number;
      pnr: string;
      customerName: string;
      customerPhone: string;
      routeName: string;
      journeyDate: string;
      bookingChannel: string;
      totalAmount: number;
      status: string;
    }>;
    reports: {
      routeStats: Array<{ routeCode: string; routeName: string; bookingsCount: number; revenue: number }>;
      busStats: Array<{ busName: string; registrationNumber: string; totalBerths: number; bookedBerths: number; occupancyPct: number }>;
      counterStats: Array<{ counterCode: string; counterName: string; bookingsCount: number; revenue: number }>;
    };
  } | null>(null);
  const [buses, setBuses] = useState<Array<Record<string, unknown>>>([]);
  const [layouts, setLayouts] = useState<Array<Record<string, unknown>>>([]);
  const [routesList, setRoutesList] = useState<Array<Record<string, unknown>>>([]);
  const [tripsList, setTripsList] = useState<Array<Record<string, unknown>>>([]);
  const [bookingsList, setBookingsList] = useState<TicketBundle[]>([]);
  const [paymentsList, setPaymentsList] = useState<Array<Record<string, unknown>>>([]);
  const [refundsList, setRefundsList] = useState<Array<Record<string, unknown>>>([]);
  const [couponsList, setCouponsList] = useState<Array<Record<string, unknown>>>([]);
  const [countersList, setCountersList] = useState<Array<Record<string, unknown>>>([]);
  const [staffList, setStaffList] = useState<Array<Record<string, unknown>>>([]);
  const [customersList, setCustomersList] = useState<Array<Record<string, unknown>>>([]);
  const [auditList, setAuditList] = useState<Array<Record<string, unknown>>>([]);

  // Quick creation form states
  const [busForm, setBusForm] = useState({
    name: '',
    registrationNumber: '',
    isAc: true,
    layoutId: '',
    amenities: 'AC, Charging Point, Reading Lamp, Blanket',
  });
  const [layoutForm, setLayoutForm] = useState({
    name: '',
    code: '',
    lowerRows: '5',
    upperRows: '5',
    description: '',
  });
  const [routeForm, setRouteForm] = useState({
    code: '',
    origin: '',
    destination: '',
    distanceKm: '250',
    estimatedDurationMin: '330',
    baseFare: '850',
    pickupStop: '',
    dropStop: '',
  });
  const [tripForm, setTripForm] = useState({
    tripCode: '',
    busId: '',
    routeId: '',
    journeyDate: new Date().toISOString().slice(0, 10),
    departureTime: '22:00',
    arrivalTime: '04:30',
    baseFare: '850',
  });
  const [couponForm, setCouponForm] = useState({
    code: '',
    description: '',
    discountType: 'flat',
    discountValue: '100',
    minAmount: '700',
  });
  const [counterForm, setCounterForm] = useState({
    code: '',
    name: '',
    city: '',
    address: '',
    phone: '',
  });
  const [staffForm, setStaffForm] = useState({
    staffCode: '',
    name: '',
    counterId: '',
    email: '',
    phone: '',
    role: 'counter_staff',
    passcode: '',
  });
  const [bookingSearch, setBookingSearch] = useState('');

  // Editable Settings & CMS Form
  const [cmsDraft, setCmsDraft] = useState<CompanySettings | null>(settings);

  useEffect(() => {
    setCmsDraft(settings);
  }, [settings]);

  const isAdmin = Boolean(authToken && actor?.role === 'admin');

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        ...(options.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const loadTab = async (targetTab: AdminTab) => {
    if (!isAdmin) return;
    setError('');
    try {
      if (targetTab === 'overview' || targetTab === 'reports') {
        const d = await apiFetch('/api/admin/overview');
        setOverview(d);
      }
      if (targetTab === 'buses' || targetTab === 'trips') {
        const d = await apiFetch('/api/admin/buses');
        setBuses(d.buses || []);
        setLayouts(d.layouts || []);
        if (d.layouts?.[0] && !busForm.layoutId) {
          setBusForm((p) => ({ ...p, layoutId: String(d.layouts[0].id) }));
        }
        if (d.buses?.[0] && !tripForm.busId) {
          setTripForm((p) => ({ ...p, busId: String(d.buses[0].id) }));
        }
      }
      if (targetTab === 'berths') {
        const d = await apiFetch('/api/admin/berth-layouts');
        setLayouts(d.layouts || []);
      }
      if (targetTab === 'routes' || targetTab === 'trips') {
        const d = await apiFetch('/api/admin/routes');
        setRoutesList(d.routes || []);
        if (d.routes?.[0] && !tripForm.routeId) {
          setTripForm((p) => ({ ...p, routeId: String(d.routes[0].id) }));
        }
      }
      if (targetTab === 'trips') {
        const d = await apiFetch('/api/admin/trips');
        setTripsList(d.trips || []);
      }
      if (targetTab === 'bookings') {
        const d = await apiFetch('/api/admin/bookings');
        setBookingsList(d.bookings || []);
      }
      if (targetTab === 'payments') {
        const d = await apiFetch('/api/admin/payments');
        setPaymentsList(d.payments || []);
      }
      if (targetTab === 'refunds') {
        const d = await apiFetch('/api/admin/refunds');
        setRefundsList(d.refunds || []);
      }
      if (targetTab === 'coupons') {
        const d = await apiFetch('/api/admin/coupons');
        setCouponsList(d.coupons || []);
      }
      if (targetTab === 'counters') {
        const d = await apiFetch('/api/admin/counters-staff');
        setCountersList(d.counters || []);
        setStaffList(d.staff || []);
      }
      if (targetTab === 'customers') {
        const d = await apiFetch('/api/admin/customers');
        setCustomersList(d.customers || []);
      }
      if (targetTab === 'audit') {
        const d = await apiFetch('/api/admin/audit-logs');
        setAuditList(d.logs || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin module');
    }
  };

  useEffect(() => {
    loadTab(tab);
  }, [tab, isAdmin]);

  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-xl border border-[#D4AF37]/35 bg-[#141418] p-8 space-y-4">
          <p className="text-xs uppercase tracking-widest text-[#D4AF37]">
            Protected Control Plane
          </p>
          <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
            Administrator Sign-In Required
          </h2>
          <p className="text-sm text-[#FAF7F0]/70">
            {actor
              ? `Signed in as ${actor.email || actor.phone || actor.fullName} (${actor.role}). Admin Panel access is unlocked automatically when signed in via the standard Sign In option with the authorized administrator email.`
              : 'Sign in using the normal Sign In button with the authorized administrator email to manage fleet, sleeper berth layouts, routes, refunds, and company CMS.'}
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="rounded-lg bg-[#D4AF37] text-[#09090B] px-6 py-3 text-sm font-semibold hover:bg-[#E8C86B] cursor-pointer"
          >
            Sign In
          </button>
        </div>
      </section>
    );
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'buses', label: 'Sleeper Fleet', icon: Bus },
    { id: 'berths', label: 'Berth Layouts', icon: Layers },
    { id: 'routes', label: 'Routes & Stops', icon: MapPin },
    { id: 'trips', label: 'Schedules & Fares', icon: CalendarClock },
    { id: 'bookings', label: 'Bookings', icon: Ticket },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'refunds', label: 'Refunds', icon: RefreshCw },
    { id: 'coupons', label: 'Coupons', icon: Tag },
    { id: 'counters', label: 'Counters & Staff', icon: Building2 },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet },
    { id: 'cms', label: 'Website & Settings', icon: Globe },
    { id: 'audit', label: 'Audit Logs', icon: ScrollText },
  ];

  const triggerCsvDownload = (filename: string, headers: string[], rows: unknown[][]) => {
    const csv = buildCsvDocument(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateBus = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    setError('');
    try {
      await apiFetch('/api/admin/buses', {
        method: 'POST',
        body: JSON.stringify({
          ...busForm,
          coachType: busForm.isAc ? 'AC Sleeper' : 'Non-AC Sleeper',
          amenities: busForm.amenities.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      setNotice('Sleeper coach added to fleet.');
      setBusForm((p) => ({ ...p, name: '', registrationNumber: '' }));
      await loadTab('buses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bus');
    }
  };

  const handleCreateLayout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/berth-layouts', {
        method: 'POST',
        body: JSON.stringify(layoutForm),
      });
      setNotice('Berth layout created.');
      setLayoutForm({ name: '', code: '', lowerRows: '5', upperRows: '5', description: '' });
      await loadTab('berths');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create layout');
    }
  };

  const handleUpdateBerthTemplate = async (b: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/admin/berths/${b.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          berthNumber: b.berthNumber,
          baseFareMultiplier: b.baseFareMultiplier,
          specialFareOverride: b.specialFareOverride,
          ladiesReserved: !b.ladiesReserved,
          isDisabled: b.isDisabled,
        }),
      });
      setNotice(`Updated berth ${String(b.berthNumber)} configuration.`);
      await loadTab('berths');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update berth');
    }
  };

  const handleToggleBerthDisabled = async (b: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/admin/berths/${b.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          berthNumber: b.berthNumber,
          baseFareMultiplier: b.baseFareMultiplier,
          specialFareOverride: b.specialFareOverride,
          ladiesReserved: b.ladiesReserved,
          isDisabled: !b.isDisabled,
        }),
      });
      await loadTab('berths');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle berth status');
    }
  };

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const stops = [];
      if (routeForm.pickupStop) {
        stops.push({
          stopName: routeForm.pickupStop,
          stopType: 'pickup',
          city: routeForm.origin,
          offsetMinutes: 0,
        });
      }
      if (routeForm.dropStop) {
        stops.push({
          stopName: routeForm.dropStop,
          stopType: 'drop',
          city: routeForm.destination,
          offsetMinutes: Number(routeForm.estimatedDurationMin),
        });
      }
      await apiFetch('/api/admin/routes', {
        method: 'POST',
        body: JSON.stringify({ ...routeForm, isPopular: true, stops }),
      });
      setNotice('New sleeper route and stops saved.');
      setRouteForm({
        code: '',
        origin: '',
        destination: '',
        distanceKm: '250',
        estimatedDurationMin: '330',
        baseFare: '850',
        pickupStop: '',
        dropStop: '',
      });
      await loadTab('routes');
      onSettingsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create route');
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/trips', {
        method: 'POST',
        body: JSON.stringify(tripForm),
      });
      setNotice('Scheduled new departure with real-time berth inventory.');
      setTripForm((p) => ({ ...p, tripCode: '' }));
      await loadTab('trips');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule trip');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmsDraft) return;
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(cmsDraft),
      });
      setNotice('Company settings and website content saved to PostgreSQL.');
      onSettingsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const filteredBookings = bookingsList.filter((b) => {
    if (!bookingSearch.trim()) return true;
    const q = bookingSearch.toLowerCase();
    return (
      b.booking.pnr.toLowerCase().includes(q) ||
      b.booking.customerPhone.includes(q) ||
      b.booking.customerName.toLowerCase().includes(q)
    );
  });

  return (
    <section className="mx-auto max-w-[1400px] px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 items-start">
        {/* Sidebar */}
        <aside className="rounded-xl border border-white/10 bg-[#141418] p-3 space-y-1">
          <div className="px-3 py-2 border-b border-white/10 mb-2">
            <p className="text-[11px] uppercase tracking-wider text-[#D4AF37]">Admin Console</p>
            <p className="text-xs text-[#FAF7F0]/65 truncate">{actor?.email || actor?.fullName}</p>
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setNotice('');
                  setError('');
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                    : 'text-[#FAF7F0]/75 hover:bg-white/5 hover:text-[#FAF7F0]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main Panel */}
        <div className="space-y-6 min-w-0">
          {notice && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/60 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {/* OVERVIEW */}
          {tab === 'overview' && overview && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
                  Operations Overview
                </h2>
                <button
                  type="button"
                  onClick={() => loadTab('overview')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-xs text-[#FAF7F0] hover:border-[#D4AF37] cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Total Bookings', val: overview.kpis.totalBookings },
                  { label: "Today's Bookings", val: overview.kpis.todaysBookings },
                  { label: 'Upcoming Trips', val: overview.kpis.upcomingJourneys },
                  { label: 'Total Revenue', val: `Rs. ${overview.kpis.totalRevenue}` },
                  { label: 'Online Collections', val: `Rs. ${overview.kpis.onlineCollections}` },
                  { label: 'Cash Collections', val: `Rs. ${overview.kpis.cashCollections}` },
                  { label: 'Counter Collections', val: `Rs. ${overview.kpis.counterCollections}` },
                  { label: 'Occupancy Rate', val: `${overview.kpis.occupancyRate}%` },
                  { label: 'Cancelled Bookings', val: overview.kpis.cancelledBookings },
                  { label: 'Pending Payments', val: overview.kpis.pendingPayments },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="rounded-xl border border-white/10 bg-[#141418] p-4 space-y-1"
                  >
                    <p className="text-xs text-[#FAF7F0]/60">{k.label}</p>
                    <p className="font-mono-tabular text-xl font-bold text-[#D4AF37]">{k.val}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 rounded-xl border border-white/10 bg-[#141418] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-semibold text-[#FAF7F0]">
                      Recent Reservations
                    </h3>
                    <button
                      type="button"
                      onClick={() => setTab('bookings')}
                      className="text-xs text-[#D4AF37] hover:underline cursor-pointer"
                    >
                      View All Bookings
                    </button>
                  </div>
                  {overview.recentBookings && overview.recentBookings.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="border-b border-white/10 text-[#FAF7F0]/60">
                          <tr>
                            <th className="py-2 pr-3">PNR</th>
                            <th className="py-2 pr-3">Passenger</th>
                            <th className="py-2 pr-3">Route</th>
                            <th className="py-2 pr-3">Channel</th>
                            <th className="py-2 pr-3 text-right">Total</th>
                            <th className="py-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {overview.recentBookings.map((rb) => (
                            <tr key={rb.id}>
                              <td className="py-2.5 pr-3 font-mono-tabular font-semibold text-[#D4AF37]">
                                {rb.pnr}
                              </td>
                              <td className="py-2.5 pr-3">
                                {rb.customerName} · {rb.customerPhone}
                              </td>
                              <td className="py-2.5 pr-3 text-[#FAF7F0]/75">
                                {rb.routeName} ({rb.journeyDate})
                              </td>
                              <td className="py-2.5 pr-3 uppercase">{rb.bookingChannel}</td>
                              <td className="py-2.5 pr-3 text-right font-mono-tabular">
                                Rs. {rb.totalAmount}
                              </td>
                              <td className="py-2.5 text-right uppercase text-emerald-300">
                                {rb.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-[#FAF7F0]/60">No reservations recorded yet.</p>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-[#141418] p-5 space-y-3">
                  <h3 className="font-display text-xl font-semibold text-[#FAF7F0]">
                    Corridor Revenue
                  </h3>
                  <div className="space-y-2.5">
                    {overview.reports.routeStats.map((r) => (
                      <div
                        key={r.routeCode}
                        className="flex items-center justify-between border-b border-white/10 pb-2 text-xs"
                      >
                        <div>
                          <p className="font-medium text-[#FAF7F0]">{r.routeName}</p>
                          <p className="text-[#FAF7F0]/55">{r.bookingsCount} confirmed bookings</p>
                        </div>
                        <span className="font-mono-tabular font-semibold text-[#D4AF37]">
                          Rs. {r.revenue}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLEEPER FLEET */}
          {tab === 'buses' && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">Sleeper Fleet Management</h2>
              <form
                onSubmit={handleCreateBus}
                className="rounded-xl border border-white/10 bg-[#141418] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Coach Name</label>
                  <input
                    required
                    value={busForm.name}
                    onChange={(e) => setBusForm({ ...busForm, name: e.target.value })}
                    placeholder="Jay Goga Emerald Sleeper"
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Registration No.</label>
                  <input
                    required
                    value={busForm.registrationNumber}
                    onChange={(e) => setBusForm({ ...busForm, registrationNumber: e.target.value })}
                    placeholder="GJ-01-JG-8080"
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Berth Layout</label>
                  <select
                    value={busForm.layoutId}
                    onChange={(e) => setBusForm({ ...busForm, layoutId: e.target.value })}
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  >
                    {layouts.map((l) => (
                      <option key={String(l.id)} value={String(l.id)}>
                        {String(l.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Climate Class</label>
                  <select
                    value={busForm.isAc ? 'ac' : 'nonac'}
                    onChange={(e) => setBusForm({ ...busForm, isAc: e.target.value === 'ac' })}
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  >
                    <option value="ac">AC Sleeper</option>
                    <option value="nonac">Non-AC Sleeper</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] px-4 py-2.5 text-sm font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Coach
                </button>
              </form>

              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141418]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-xs text-[#FAF7F0]/65">
                    <tr>
                      <th className="py-3 px-4">Coach</th>
                      <th className="py-3 px-4">Reg. Number</th>
                      <th className="py-3 px-4">Class</th>
                      <th className="py-3 px-4">Berths</th>
                      <th className="py-3 px-4">Amenities</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {buses.map((b) => (
                      <tr key={String(b.id)}>
                        <td className="py-3 px-4 font-medium">{String(b.name)}</td>
                        <td className="py-3 px-4 font-mono-tabular text-xs text-[#D4AF37]">
                          {String(b.registrationNumber)}
                        </td>
                        <td className="py-3 px-4 text-xs">{String(b.coachType)}</td>
                        <td className="py-3 px-4 font-mono-tabular">{String(b.totalBerths)}</td>
                        <td className="py-3 px-4 text-xs text-[#FAF7F0]/70">
                          {Array.isArray(b.amenities) ? b.amenities.join(' · ') : ''}
                        </td>
                        <td className="py-3 px-4 text-xs uppercase">{String(b.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BERTH LAYOUT CONFIGURATOR */}
          {tab === 'berths' && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
                Configurable Sleeper Berth Layouts
              </h2>
              <form
                onSubmit={handleCreateLayout}
                className="rounded-xl border border-white/10 bg-[#141418] p-5 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Layout Name</label>
                  <input
                    required
                    value={layoutForm.name}
                    onChange={(e) => setLayoutForm({ ...layoutForm, name: e.target.value })}
                    placeholder="2+1 Compact 24"
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Code</label>
                  <input
                    required
                    value={layoutForm.code}
                    onChange={(e) => setLayoutForm({ ...layoutForm, code: e.target.value })}
                    placeholder="SLP-24"
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Lower Rows</label>
                  <input
                    type="number"
                    min={2}
                    max={8}
                    value={layoutForm.lowerRows}
                    onChange={(e) => setLayoutForm({ ...layoutForm, lowerRows: e.target.value })}
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Upper Rows</label>
                  <input
                    type="number"
                    min={2}
                    max={8}
                    value={layoutForm.upperRows}
                    onChange={(e) => setLayoutForm({ ...layoutForm, upperRows: e.target.value })}
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-[#D4AF37] text-[#09090B] px-4 py-2.5 text-sm font-semibold cursor-pointer"
                >
                  Create Layout
                </button>
              </form>

              {layouts.map((l) => (
                <div key={String(l.id)} className="rounded-xl border border-white/10 bg-[#141418] p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div>
                      <h3 className="font-semibold text-[#FAF7F0]">
                        {String(l.name)} ({String(l.code)})
                      </h3>
                      <p className="text-xs text-[#FAF7F0]/60">{String(l.description || '')}</p>
                    </div>
                    <span className="font-mono-tabular text-xs text-[#D4AF37]">
                      {String(l.totalBerths)} Berths
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    {Array.isArray(l.berths) &&
                      l.berths.map((b: Record<string, unknown>) => (
                        <div
                          key={String(b.id)}
                          className="rounded-lg border border-white/10 bg-[#09090B] p-2.5 text-xs space-y-1.5"
                        >
                          <div className="flex justify-between font-mono-tabular font-semibold">
                            <span className="text-[#D4AF37]">{String(b.berthNumber)}</span>
                            <span className="text-[#FAF7F0]/55">{String(b.baseFareMultiplier)}%</span>
                          </div>
                          <div className="text-[11px] text-[#FAF7F0]/60 capitalize">
                            {String(b.deck)} · {String(b.berthType)}
                          </div>
                          <div className="flex gap-1 pt-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateBerthTemplate(b)}
                              className={`flex-1 py-1 rounded text-[10px] font-semibold cursor-pointer ${
                                b.ladiesReserved
                                  ? 'bg-pink-900/60 text-pink-200 border border-pink-500/40'
                                  : 'bg-white/5 text-[#FAF7F0]/70'
                              }`}
                            >
                              {b.ladiesReserved ? 'Ladies' : 'Open'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleBerthDisabled(b)}
                              className={`flex-1 py-1 rounded text-[10px] font-semibold cursor-pointer ${
                                b.isDisabled
                                  ? 'bg-red-950 text-red-200 border border-red-500/40'
                                  : 'bg-white/5 text-[#FAF7F0]/70'
                              }`}
                            >
                              {b.isDisabled ? 'Disabled' : 'Active'}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ROUTES & STOPS */}
          {tab === 'routes' && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
                Routes & Pickup/Drop Points
              </h2>
              <form
                onSubmit={handleCreateRoute}
                className="rounded-xl border border-white/10 bg-[#141418] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
              >
                <input
                  required
                  placeholder="Code (e.g. AMD-VAD)"
                  value={routeForm.code}
                  onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <input
                  required
                  placeholder="Origin City"
                  value={routeForm.origin}
                  onChange={(e) => setRouteForm({ ...routeForm, origin: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <input
                  required
                  placeholder="Destination City"
                  value={routeForm.destination}
                  onChange={(e) => setRouteForm({ ...routeForm, destination: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <input
                  required
                  type="number"
                  placeholder="Base Fare (Rs.)"
                  value={routeForm.baseFare}
                  onChange={(e) => setRouteForm({ ...routeForm, baseFare: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <input
                  placeholder="Primary Pickup Stop"
                  value={routeForm.pickupStop}
                  onChange={(e) => setRouteForm({ ...routeForm, pickupStop: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <input
                  placeholder="Primary Drop Stop"
                  value={routeForm.dropStop}
                  onChange={(e) => setRouteForm({ ...routeForm, dropStop: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="Duration (Minutes)"
                  value={routeForm.estimatedDurationMin}
                  onChange={(e) =>
                    setRouteForm({ ...routeForm, estimatedDurationMin: e.target.value })
                  }
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#D4AF37] text-[#09090B] px-4 py-2 text-sm font-semibold cursor-pointer"
                >
                  Save Route
                </button>
              </form>

              <div className="space-y-3">
                {routesList.map((r) => (
                  <div key={String(r.id)} className="rounded-xl border border-white/10 bg-[#141418] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono-tabular text-xs text-[#D4AF37] mr-2">
                          {String(r.code)}
                        </span>
                        <span className="font-semibold text-[#FAF7F0]">
                          {String(r.origin)} → {String(r.destination)}
                        </span>
                      </div>
                      <span className="font-mono-tabular text-xs text-[#FAF7F0]/70">
                        Base Fare Rs. {String(r.baseFare)} · {String(r.distanceKm)} km
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#FAF7F0]/60">
                      Stops:{' '}
                      {Array.isArray(r.stops)
                        ? r.stops.map((s: Record<string, unknown>) => `${s.stopName} (${s.stopType})`).join(' · ')
                        : 'None'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCHEDULES & TRIPS */}
          {tab === 'trips' && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
                Schedules & Trip Fares
              </h2>
              <form
                onSubmit={handleCreateTrip}
                className="rounded-xl border border-white/10 bg-[#141418] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
              >
                <input
                  required
                  placeholder="Trip Code (e.g. JGT-NEW-01)"
                  value={tripForm.tripCode}
                  onChange={(e) => setTripForm({ ...tripForm, tripCode: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <select
                  value={tripForm.routeId}
                  onChange={(e) => setTripForm({ ...tripForm, routeId: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                >
                  {routesList.map((r) => (
                    <option key={String(r.id)} value={String(r.id)}>
                      {String(r.origin)} → {String(r.destination)}
                    </option>
                  ))}
                </select>
                <select
                  value={tripForm.busId}
                  onChange={(e) => setTripForm({ ...tripForm, busId: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                >
                  {buses.map((b) => (
                    <option key={String(b.id)} value={String(b.id)}>
                      {String(b.name)}
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="date"
                  value={tripForm.journeyDate}
                  onChange={(e) => setTripForm({ ...tripForm, journeyDate: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <input
                  required
                  type="time"
                  value={tripForm.departureTime}
                  onChange={(e) => setTripForm({ ...tripForm, departureTime: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <input
                  required
                  type="time"
                  value={tripForm.arrivalTime}
                  onChange={(e) => setTripForm({ ...tripForm, arrivalTime: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <input
                  required
                  type="number"
                  placeholder="Base Fare"
                  value={tripForm.baseFare}
                  onChange={(e) => setTripForm({ ...tripForm, baseFare: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#D4AF37] text-[#09090B] px-4 py-2 text-sm font-semibold cursor-pointer"
                >
                  Publish Schedule
                </button>
              </form>

              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141418]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-xs text-[#FAF7F0]/65">
                    <tr>
                      <th className="py-3 px-4">Code</th>
                      <th className="py-3 px-4">Route</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Coach</th>
                      <th className="py-3 px-4">Fare</th>
                      <th className="py-3 px-4">Inventory</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {tripsList.map((t) => {
                      const r = t.route as Record<string, unknown> | undefined;
                      const b = t.bus as Record<string, unknown> | undefined;
                      return (
                        <tr key={String(t.id)}>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-[#D4AF37]">
                            {String(t.tripCode)}
                          </td>
                          <td className="py-3 px-4">
                            {String(r?.origin || '')} → {String(r?.destination || '')}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs">
                            {String(t.journeyDate)} · {String(t.departureTime)}–{String(t.arrivalTime)}
                          </td>
                          <td className="py-3 px-4 text-xs">{String(b?.name || '')}</td>
                          <td className="py-3 px-4 font-mono-tabular">Rs. {String(t.baseFare)}</td>
                          <td className="py-3 px-4 font-mono-tabular text-xs">
                            {String(t.availableCount)} avail / {String(t.bookedCount)} booked
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BOOKINGS MANAGEMENT */}
          {tab === 'bookings' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
                  Bookings Management
                </h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Filter by PNR, mobile, name"
                    value={bookingSearch}
                    onChange={(e) => setBookingSearch(e.target.value)}
                    className="rounded-lg border border-white/15 bg-[#141418] px-3 py-2 text-xs text-[#FAF7F0]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      triggerCsvDownload(
                        'jay-goga-bookings.csv',
                        ['PNR', 'Customer', 'Phone', 'Route', 'Date', 'Channel', 'Total', 'Status'],
                        filteredBookings.map((b) => [
                          b.booking.pnr,
                          b.booking.customerName,
                          b.booking.customerPhone,
                          `${b.route.origin} -> ${b.route.destination}`,
                          b.trip.journeyDate,
                          b.booking.bookingChannel,
                          b.booking.totalAmount,
                          b.booking.status,
                        ])
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-3 py-2 text-xs text-[#D4AF37] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141418]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-xs text-[#FAF7F0]/65">
                    <tr>
                      <th className="py-3 px-4">PNR</th>
                      <th className="py-3 px-4">Passenger</th>
                      <th className="py-3 px-4">Route</th>
                      <th className="py-3 px-4">Berths</th>
                      <th className="py-3 px-4">Channel</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredBookings.map((b) => (
                      <tr key={b.booking.id}>
                        <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-[#D4AF37]">
                          {b.booking.pnr}
                        </td>
                        <td className="py-3 px-4">
                          <div>{b.booking.customerName}</div>
                          <div className="text-xs text-[#FAF7F0]/55 font-mono-tabular">
                            {b.booking.customerPhone}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {b.route.origin} → {b.route.destination} ({b.trip.journeyDate})
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs">
                          {b.berths.map((x) => x.berthNumber).join(', ')}
                        </td>
                        <td className="py-3 px-4 text-xs uppercase">{b.booking.bookingChannel}</td>
                        <td className="py-3 px-4 font-mono-tabular">Rs. {b.booking.totalAmount}</td>
                        <td className="py-3 px-4 text-xs uppercase">{b.booking.status}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onViewTicket(b)}
                            className="px-2.5 py-1 rounded border border-white/15 text-xs hover:border-[#D4AF37] cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredBookings.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-sm text-[#FAF7F0]/50">
                          No bookings found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAYMENTS */}
          {tab === 'payments' && (
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">Payment Ledger</h2>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141418]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-xs text-[#FAF7F0]/65">
                    <tr>
                      <th className="py-3 px-4">PNR</th>
                      <th className="py-3 px-4">Gateway / Method</th>
                      <th className="py-3 px-4">Order / Ref</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {paymentsList.map((p) => (
                      <tr key={String(p.id)}>
                        <td className="py-3 px-4 font-mono-tabular text-[#D4AF37]">{String(p.pnr)}</td>
                        <td className="py-3 px-4 text-xs uppercase">
                          {String(p.gateway)} · {String(p.method)}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs">
                          {String(p.razorpayPaymentId || p.razorpayOrderId || p.idempotencyKey)}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular">Rs. {String(p.amount)}</td>
                        <td className="py-3 px-4 text-xs uppercase">{String(p.status)}</td>
                      </tr>
                    ))}
                    {paymentsList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-sm text-[#FAF7F0]/50">
                          No payment records yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REFUNDS */}
          {tab === 'refunds' && (
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">Refund Queue</h2>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141418]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-xs text-[#FAF7F0]/65">
                    <tr>
                      <th className="py-3 px-4">Booking PNR</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {refundsList.map((r) => {
                      const bk = r.booking as Record<string, unknown> | undefined;
                      return (
                        <tr key={String(r.id)}>
                          <td className="py-3 px-4 font-mono-tabular text-[#D4AF37]">
                            {String(bk?.pnr || r.bookingId)}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular">Rs. {String(r.amount)}</td>
                          <td className="py-3 px-4 text-xs">{String(r.reason)}</td>
                          <td className="py-3 px-4 text-xs uppercase">{String(r.status)}</td>
                          <td className="py-3 px-4 text-right space-x-2">
                            {r.status === 'pending' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/admin/refunds/${r.id}/process`, {
                                    method: 'POST',
                                    body: JSON.stringify({ status: 'processed' }),
                                  });
                                  setNotice('Refund marked as processed.');
                                  await loadTab('refunds');
                                }}
                                className="px-3 py-1 rounded bg-[#D4AF37] text-[#09090B] text-xs font-semibold cursor-pointer"
                              >
                                Approve Refund
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {refundsList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-sm text-[#FAF7F0]/50">
                          No refund requests in queue.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* COUPONS */}
          {tab === 'coupons' && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">Coupons & Offers</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiFetch('/api/admin/coupons', {
                    method: 'POST',
                    body: JSON.stringify(couponForm),
                  });
                  setNotice('Coupon created.');
                  setCouponForm({
                    code: '',
                    description: '',
                    discountType: 'flat',
                    discountValue: '100',
                    minAmount: '700',
                  });
                  await loadTab('coupons');
                }}
                className="rounded-xl border border-white/10 bg-[#141418] p-5 grid grid-cols-1 sm:grid-cols-5 gap-3"
              >
                <input
                  required
                  placeholder="Code (e.g. DIWALI15)"
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <input
                  placeholder="Description"
                  value={couponForm.description}
                  onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <select
                  value={couponForm.discountType}
                  onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                >
                  <option value="flat">Flat (Rs.)</option>
                  <option value="percent">Percent (%)</option>
                </select>
                <input
                  required
                  type="number"
                  placeholder="Value"
                  value={couponForm.discountValue}
                  onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#D4AF37] text-[#09090B] px-4 py-2 text-sm font-semibold cursor-pointer"
                >
                  Create Coupon
                </button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {couponsList.map((c) => (
                  <div
                    key={String(c.id)}
                    className="rounded-xl border border-white/10 bg-[#141418] p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-mono-tabular font-bold text-[#D4AF37]">{String(c.code)}</p>
                      <p className="text-xs text-[#FAF7F0]/70">{String(c.description)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/coupons/${c.id}`, {
                          method: 'PUT',
                          body: JSON.stringify({ isActive: !c.isActive }),
                        });
                        await loadTab('coupons');
                      }}
                      className="px-3 py-1.5 rounded border border-white/20 text-xs cursor-pointer"
                    >
                      {c.isActive ? 'Disable' : 'Activate'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* COUNTERS & STAFF */}
          {tab === 'counters' && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">Counters & Staff</h2>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiFetch('/api/admin/counters', {
                    method: 'POST',
                    body: JSON.stringify(counterForm),
                  });
                  setNotice('Counter created.');
                  setCounterForm({ code: '', name: '', city: '', address: '', phone: '' });
                  await loadTab('counters');
                }}
                className="rounded-xl border border-white/10 bg-[#141418] p-5 grid grid-cols-1 sm:grid-cols-4 gap-3"
              >
                <input
                  required
                  placeholder="Counter Code (CNT-RJK-01)"
                  value={counterForm.code}
                  onChange={(e) => setCounterForm({ ...counterForm, code: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <input
                  required
                  placeholder="Counter Name"
                  value={counterForm.name}
                  onChange={(e) => setCounterForm({ ...counterForm, name: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <input
                  required
                  placeholder="City"
                  value={counterForm.city}
                  onChange={(e) => setCounterForm({ ...counterForm, city: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#D4AF37] text-[#09090B] px-4 py-2 text-sm font-semibold cursor-pointer"
                >
                  Add Counter
                </button>
              </form>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiFetch('/api/admin/staff', {
                    method: 'POST',
                    body: JSON.stringify(staffForm),
                  });
                  setNotice('Staff operator created with passcode.');
                  setStaffForm({
                    staffCode: '',
                    name: '',
                    counterId: '',
                    email: '',
                    phone: '',
                    role: 'counter_staff',
                    passcode: '',
                  });
                  await loadTab('counters');
                }}
                className="rounded-xl border border-white/10 bg-[#141418] p-5 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3"
              >
                <input
                  required
                  placeholder="Staff Code (STF-103)"
                  value={staffForm.staffCode}
                  onChange={(e) => setStaffForm({ ...staffForm, staffCode: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm font-mono-tabular"
                />
                <input
                  required
                  placeholder="Staff Name"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <select
                  value={staffForm.counterId}
                  onChange={(e) => setStaffForm({ ...staffForm, counterId: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                >
                  <option value="">All Counters</option>
                  {countersList.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {String(c.code)}
                    </option>
                  ))}
                </select>
                <select
                  value={staffForm.role}
                  onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                >
                  <option value="counter_staff">Counter Staff</option>
                  <option value="admin">Administrator</option>
                </select>
                <input
                  required
                  type="password"
                  placeholder="Login Passcode"
                  value={staffForm.passcode}
                  onChange={(e) => setStaffForm({ ...staffForm, passcode: e.target.value })}
                  className="rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#D4AF37] text-[#09090B] px-4 py-2 text-sm font-semibold cursor-pointer"
                >
                  Add Staff
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-[#141418] p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-[#D4AF37]">Active Counters</h3>
                  {countersList.map((c) => (
                    <div key={String(c.id)} className="text-xs border-b border-white/10 pb-2">
                      <span className="font-mono-tabular font-semibold">{String(c.code)}</span> ·{' '}
                      {String(c.name)} ({String(c.city)})
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-white/10 bg-[#141418] p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-[#D4AF37]">Staff Roster</h3>
                  {staffList.map((s) => (
                    <div key={String(s.id)} className="text-xs border-b border-white/10 pb-2 flex justify-between">
                      <span>
                        <strong className="font-mono-tabular">{String(s.staffCode)}</strong> ·{' '}
                        {String(s.name)} ({String(s.role)})
                      </span>
                      <span className="text-[#FAF7F0]/55">
                        {s.hasPasscode ? 'Passcode Ready' : 'No Passcode'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CUSTOMERS */}
          {tab === 'customers' && (
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">Registered Customers</h2>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141418]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-xs text-[#FAF7F0]/65">
                    <tr>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Phone / Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Bookings</th>
                      <th className="py-3 px-4">Total Spent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {customersList.map((c) => (
                      <tr key={String(c.id)}>
                        <td className="py-3 px-4">{String(c.fullName || 'Traveler')}</td>
                        <td className="py-3 px-4 font-mono-tabular text-xs">
                          {String(c.phone || c.email)}
                        </td>
                        <td className="py-3 px-4 text-xs uppercase">{String(c.role)}</td>
                        <td className="py-3 px-4 font-mono-tabular">{String(c.bookingsCount)}</td>
                        <td className="py-3 px-4 font-mono-tabular">Rs. {String(c.totalSpent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REPORTS & EXPORTS */}
          {tab === 'reports' && overview && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
                  Analytics & Financial Reports
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      triggerCsvDownload(
                        'jay-goga-route-revenue.csv',
                        ['Route Code', 'Route', 'Bookings', 'Revenue (INR)'],
                        overview.reports.routeStats.map((r) => [
                          r.routeCode,
                          r.routeName,
                          r.bookingsCount,
                          r.revenue,
                        ])
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-3.5 py-2 text-xs text-[#D4AF37] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadAdminReportPdf(
                        'Route & Bus Occupancy Summary',
                        ['Route', 'Bookings', 'Revenue (INR)'],
                        overview.reports.routeStats.map((r) => [
                          r.routeName,
                          r.bookingsCount,
                          r.revenue,
                        ])
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] px-3.5 py-2 text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-xl border border-white/10 bg-[#141418] p-5 space-y-3">
                  <h3 className="font-semibold text-[#D4AF37] text-sm">Route-Wise Bookings & Revenue</h3>
                  {overview.reports.routeStats.map((r) => (
                    <div
                      key={r.routeCode}
                      className="flex justify-between text-xs border-b border-white/10 pb-2"
                    >
                      <span>{r.routeName}</span>
                      <span className="font-mono-tabular">
                        {r.bookingsCount} bookings · Rs. {r.revenue}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/10 bg-[#141418] p-5 space-y-3">
                  <h3 className="font-semibold text-[#D4AF37] text-sm">Bus-Wise Occupancy</h3>
                  {overview.reports.busStats.map((b) => (
                    <div
                      key={b.registrationNumber}
                      className="flex justify-between text-xs border-b border-white/10 pb-2"
                    >
                      <span>
                        {b.busName} ({b.registrationNumber})
                      </span>
                      <span className="font-mono-tabular">
                        {b.bookedBerths}/{b.totalBerths} ({b.occupancyPct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* WEBSITE CONTENT & COMPANY SETTINGS */}
          {tab === 'cms' && cmsDraft && (
            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
                  Company Information & Website CMS
                </h2>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] text-[#09090B] px-5 py-2.5 text-sm font-semibold cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                  Save Settings
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#141418] p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Company Name</label>
                  <input
                    value={cmsDraft.companyName}
                    onChange={(e) => setCmsDraft({ ...cmsDraft, companyName: e.target.value })}
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Tagline</label>
                  <input
                    value={cmsDraft.tagline}
                    onChange={(e) => setCmsDraft({ ...cmsDraft, tagline: e.target.value })}
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Primary Contact Phone</label>
                  <input
                    value={cmsDraft.phonePrimary}
                    onChange={(e) => setCmsDraft({ ...cmsDraft, phonePrimary: e.target.value })}
                    placeholder="Enter official contact number"
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">WhatsApp Support Number</label>
                  <input
                    value={cmsDraft.whatsappNumber}
                    onChange={(e) => setCmsDraft({ ...cmsDraft, whatsappNumber: e.target.value })}
                    placeholder="Enter official WhatsApp number"
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Support Email</label>
                  <input
                    value={cmsDraft.email}
                    onChange={(e) => setCmsDraft({ ...cmsDraft, email: e.target.value })}
                    placeholder="Enter official email"
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Support Timings</label>
                  <input
                    value={cmsDraft.supportTimings}
                    onChange={(e) => setCmsDraft({ ...cmsDraft, supportTimings: e.target.value })}
                    placeholder="e.g. 07:00 AM - 11:30 PM Daily"
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Hero Headline</label>
                  <input
                    value={cmsDraft.cmsContent.heroTitle}
                    onChange={(e) =>
                      setCmsDraft({
                        ...cmsDraft,
                        cmsContent: { ...cmsDraft.cmsContent, heroTitle: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[#FAF7F0]/70 mb-1">Hero Subtitle</label>
                  <textarea
                    rows={2}
                    value={cmsDraft.cmsContent.heroSubtitle}
                    onChange={(e) =>
                      setCmsDraft({
                        ...cmsDraft,
                        cmsContent: { ...cmsDraft.cmsContent, heroSubtitle: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-white/15 bg-[#09090B] px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center gap-3">
                  <input
                    id="cms-guest"
                    type="checkbox"
                    checked={cmsDraft.cmsContent.guestBookingEnabled}
                    onChange={(e) =>
                      setCmsDraft({
                        ...cmsDraft,
                        cmsContent: {
                          ...cmsDraft.cmsContent,
                          guestBookingEnabled: e.target.checked,
                        },
                      })
                    }
                  />
                  <label htmlFor="cms-guest" className="text-sm">
                    Allow Guest Checkout without Mandatory Customer Sign-In
                  </label>
                </div>
              </div>
            </form>
          )}

          {/* AUDIT LOGS */}
          {tab === 'audit' && (
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">System Audit Logs</h2>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141418]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-white/5 text-[#FAF7F0]/65">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Entity</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {auditList.map((a) => (
                      <tr key={String(a.id)}>
                        <td className="py-2.5 px-4 font-mono-tabular">
                          {new Date(String(a.createdAt)).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4">{String(a.actorEmail || a.actorUid)}</td>
                        <td className="py-2.5 px-4 font-mono-tabular text-[#D4AF37]">
                          {String(a.action)}
                        </td>
                        <td className="py-2.5 px-4">
                          {String(a.entityType)} #{String(a.entityId)}
                        </td>
                        <td className="py-2.5 px-4 font-mono-tabular text-[#FAF7F0]/60">
                          {JSON.stringify(a.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
