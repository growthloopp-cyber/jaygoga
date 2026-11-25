import { useEffect, useState } from 'react';
import { Bus, LogOut, Navigation, Shield, Ticket, User } from 'lucide-react';
import type {
  BusSummary,
  CompanySettings,
  SessionActor,
  TicketBundle,
  TravelRoute,
  TripSearchItem,
} from './types/travel';
import { TRANSLATIONS, type Language } from './i18n/translations';
import { PublicHome } from './components/PublicHome';
import { BookingWorkspace } from './components/BookingWorkspace';
import { TicketModal } from './components/TicketModal';
import { AuthModal } from './components/AuthModal';
import { CounterDesk } from './components/CounterDesk';
import { AdminDashboard } from './components/AdminDashboard';
import { CustomerAccountView } from './components/CustomerAccountView';

type AppView = 'home' | 'booking' | 'track' | 'counter' | 'admin';

export default function App() {
  const [view, setView] = useState<AppView>('home');
  const [language, setLanguage] = useState<Language>('en');

  // Bootstrap data
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [routes, setRoutes] = useState<TravelRoute[]>([]);
  const [buses, setBuses] = useState<BusSummary[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [razorpayConfigured, setRazorpayConfigured] = useState(false);
  const [razorpayKeyId, setRazorpayKeyId] = useState('');

  // Search state
  const [searchParams, setSearchParams] = useState({
    origin: 'Ahmedabad',
    destination: 'Surat',
    date: new Date().toISOString().slice(0, 10),
    sortBy: 'departure',
  });
  const [searchResults, setSearchResults] = useState<TripSearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeTrip, setActiveTrip] = useState<TripSearchItem | null>(null);

  // Session token kept strictly in React memory (never localStorage)
  const [sessionToken] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [actor, setActor] = useState<SessionActor | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState<'customer' | 'staff'>('customer');
  const [activeTicket, setActiveTicket] = useState<TicketBundle | null>(null);

  const t = TRANSLATIONS[language];

  const loadBootstrap = async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data.settings || null);
      setRoutes(data.routes || []);
      setBuses(data.buses || []);
      setCities(data.cities || []);
      setRazorpayConfigured(Boolean(data.razorpayConfigured));
      setRazorpayKeyId(data.razorpayKeyId || '');
    } catch {
      // ignore transient startup
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, []);

  const executeSearch = async (override?: {
    origin?: string;
    destination?: string;
    date?: string;
    sortBy?: string;
  }) => {
    const merged = { ...searchParams, ...(override || {}) };
    setSearching(true);
    setView('home');
    try {
      const params = new URLSearchParams();
      if (merged.origin) params.set('origin', merged.origin);
      if (merged.destination) params.set('destination', merged.destination);
      if (merged.date) params.set('date', merged.date);
      params.set('sortBy', merged.sortBy);
      const res = await fetch(`/api/trips/search?${params.toString()}`);
      const data = await res.json();
      setSearchResults(data.trips || []);
      setTimeout(() => {
        document.getElementById('search-results')?.scrollIntoView({ behavior: 'auto' });
      }, 60);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectTrip = (trip: TripSearchItem) => {
    setActiveTrip(trip);
    setView('booking');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleOpenAuth = (tab: 'customer' | 'staff' = 'customer') => {
    setAuthInitialTab(tab);
    setAuthModalOpen(true);
  };

  const handleLogout = () => {
    setAuthToken(null);
    setActor(null);
    if (view === 'admin' || view === 'counter') {
      setView('home');
    }
  };

  const navigateView = (nextView: AppView) => {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#09090B] text-[#FAF7F0] overflow-x-hidden">
      {/* 1. TOP NAVIGATION BAR (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-40 border-b border-[#D4AF37]/20 bg-[#09090B]/95">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigateView('home')}
            className="font-display text-lg sm:text-2xl font-bold tracking-tight gold-gradient-text whitespace-nowrap shrink-0 cursor-pointer"
          >
            {settings?.companyName || 'Jay Goga Travels'}
          </button>

          {/* Zone 2: 5 concise single-line text links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#FAF7F0]/80">
            <button
              type="button"
              onClick={() => navigateView('home')}
              className={`hover:text-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'home' || view === 'booking' ? 'text-[#D4AF37]' : ''
              }`}
            >
              {t.navBookBus}
            </button>
            <a
              href="#routes-section"
              onClick={() => setView('home')}
              className="hover:text-[#D4AF37] whitespace-nowrap shrink-0"
            >
              {t.navRoutes}
            </a>
            <button
              type="button"
              onClick={() => navigateView('track')}
              className={`hover:text-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'track' ? 'text-[#D4AF37]' : ''
              }`}
            >
              {t.navTrackPnr}
            </button>
            <button
              type="button"
              onClick={() => navigateView('counter')}
              className={`hover:text-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'counter' ? 'text-[#D4AF37]' : ''
              }`}
            >
              {t.navCounter}
            </button>
            <button
              type="button"
              onClick={() => navigateView('admin')}
              className={`hover:text-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'admin' ? 'text-[#D4AF37]' : ''
              }`}
            >
              {t.navAdmin}
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
            {actor ? (
              <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => navigateView('track')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/10 whitespace-nowrap shrink-0 cursor-pointer max-w-[140px] sm:max-w-none"
                >
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{actor.fullName || t.myAccount}</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Sign out"
                  className="p-1.5 sm:p-2 rounded-lg text-[#FAF7F0]/60 hover:text-[#FAF7F0] shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenAuth('customer')}
                className="rounded-lg bg-[#D4AF37] text-[#09090B] px-3.5 sm:px-4 py-2 text-xs font-bold hover:bg-[#E8C86B] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.signIn}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <main className="flex-1">
        {view === 'home' && (
          <PublicHome
            settings={settings}
            routes={routes}
            buses={buses}
            cities={cities}
            language={language}
            onChangeLanguage={setLanguage}
            t={t}
            searchResults={searchResults}
            searching={searching}
            searchParams={searchParams}
            onSearchParamsChange={setSearchParams}
            onExecuteSearch={executeSearch}
            onSelectTrip={handleSelectTrip}
          />
        )}

        {view === 'booking' && activeTrip && (
          <BookingWorkspace
            trip={activeTrip}
            sessionToken={sessionToken}
            authToken={authToken}
            actor={actor}
            razorpayConfigured={razorpayConfigured}
            razorpayKeyId={razorpayKeyId}
            t={t}
            onBack={() => setView('home')}
            onBookingConfirmed={(ticket) => {
              setActiveTicket(ticket);
              setView('track');
            }}
          />
        )}

        {view === 'track' && (
          <CustomerAccountView
            authToken={authToken}
            actor={actor}
            onOpenAuth={() => handleOpenAuth('customer')}
            onViewTicket={(ticket) => setActiveTicket(ticket)}
          />
        )}

        {view === 'counter' && (
          <CounterDesk
            authToken={authToken}
            actor={actor}
            routes={routes}
            onOpenAuth={() => handleOpenAuth('staff')}
            onViewTicket={(ticket) => setActiveTicket(ticket)}
          />
        )}

        {view === 'admin' && (
          <AdminDashboard
            authToken={authToken}
            actor={actor}
            settings={settings}
            onOpenAuth={() => handleOpenAuth('customer')}
            onViewTicket={(ticket) => setActiveTicket(ticket)}
            onSettingsUpdated={loadBootstrap}
          />
        )}
      </main>

      {/* 13. QUIET FOOTER WITH POLICIES & SOCIAL LINKS */}
      <footer className="border-t border-white/10 bg-[#070709] text-xs text-[#FAF7F0]/65 pb-20 md:pb-0">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <p className="font-display text-xl font-bold text-[#D4AF37]">
              {settings?.companyName || 'Jay Goga Travels'}
            </p>
            <p className="leading-relaxed">
              {settings?.tagline || 'Luxury Sleeper Coach Reservations Across Gujarat'}
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-[#FAF7F0]">Policies & Boarding</p>
            <p className="leading-relaxed">
              {settings?.cmsContent?.cancellationPolicy}
            </p>
            <p className="leading-relaxed">{settings?.cmsContent?.luggagePolicy}</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-[#FAF7F0]">Navigation & Links</p>
            <div className="flex flex-wrap gap-4">
              <button type="button" onClick={() => setView('home')} className="hover:text-[#D4AF37] cursor-pointer">
                Book Sleeper Bus
              </button>
              <button type="button" onClick={() => setView('track')} className="hover:text-[#D4AF37] cursor-pointer">
                Track PNR
              </button>
              <button type="button" onClick={() => setView('counter')} className="hover:text-[#D4AF37] cursor-pointer">
                Counter Portal
              </button>
              <button type="button" onClick={() => setView('admin')} className="hover:text-[#D4AF37] cursor-pointer">
                Admin Dashboard
              </button>
            </div>
            <p className="pt-2 text-[11px] text-[#FAF7F0]/45">
              © {new Date().getFullYear()} {settings?.companyName || 'Jay Goga Travels'}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* MOBILE THUMB-ZONE BOTTOM DOCK (<=15% combined viewport sticky cap) */}
      <nav
        aria-label="Mobile navigation"
        data-testid="mobile-thumb-dock"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 mobile-thumb-dock border-t border-[#D4AF37]/25 grid grid-cols-4 items-center px-1"
      >
        <button
          type="button"
          onClick={() => navigateView('home')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium cursor-pointer ${
            view === 'home' || view === 'booking' ? 'text-[#D4AF37]' : 'text-[#FAF7F0]/70'
          }`}
        >
          <Bus className="w-4 h-4" />
          <span>Book</span>
        </button>
        <button
          type="button"
          onClick={() => navigateView('track')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium cursor-pointer ${
            view === 'track' ? 'text-[#D4AF37]' : 'text-[#FAF7F0]/70'
          }`}
        >
          <Navigation className="w-4 h-4" />
          <span>Track</span>
        </button>
        <button
          type="button"
          onClick={() => navigateView('counter')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium cursor-pointer ${
            view === 'counter' ? 'text-[#D4AF37]' : 'text-[#FAF7F0]/70'
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>Counter</span>
        </button>
        <button
          type="button"
          onClick={() => navigateView('admin')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium cursor-pointer ${
            view === 'admin' ? 'text-[#D4AF37]' : 'text-[#FAF7F0]/70'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Admin</span>
        </button>
      </nav>

      <TicketModal ticket={activeTicket} onClose={() => setActiveTicket(null)} />

      <AuthModal
        open={authModalOpen}
        initialTab={authInitialTab}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(token, nextActor) => {
          setAuthToken(token);
          setActor(nextActor);
        }}
      />
    </div>
  );
}
