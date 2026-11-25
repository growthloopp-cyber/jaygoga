import { useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Bus,
  Clock,
  Compass,
  MapPin,
  QrCode,
  Search,
  Shield,
  Sparkles,
  Star,
  UserCheck,
  Wind,
  Zap,
} from 'lucide-react';
import type { BusSummary, CompanySettings, TravelRoute, TripSearchItem } from '../types/travel';
import type { Language, TranslationDictionary } from '../i18n/translations';
import { formatDurationMinutes } from '../utils/bookingRules';
import { HeroBusVideo } from './HeroBusVideo';

interface PublicHomeProps {
  settings: CompanySettings | null;
  routes: TravelRoute[];
  buses: BusSummary[];
  cities: string[];
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  t: TranslationDictionary;
  searchResults: TripSearchItem[] | null;
  searching: boolean;
  searchParams: { origin: string; destination: string; date: string; sortBy: string };
  onSearchParamsChange: (next: { origin: string; destination: string; date: string; sortBy: string }) => void;
  onExecuteSearch: (override?: { origin?: string; destination?: string; date?: string; sortBy?: string }) => void;
  onSelectTrip: (trip: TripSearchItem) => void;
}

export function PublicHome({
  settings,
  routes,
  buses,
  cities,
  language,
  onChangeLanguage,
  t,
  searchResults,
  searching,
  searchParams,
  onSearchParamsChange,
  onExecuteSearch,
  onSelectTrip,
}: PublicHomeProps) {
  const [selectedRouteGuide, setSelectedRouteGuide] = useState<TravelRoute | null>(
    routes[0] || null
  );
  const [activeGalleryIdx, setActiveGalleryIdx] = useState(0);

  const cms = settings?.cmsContent;
  const activeRouteGuide = selectedRouteGuide || routes[0] || null;
  const galleryItems = cms?.gallery || [];
  const featuredGalleryItem = galleryItems[activeGalleryIdx] || galleryItems[0] || null;
  const leadBus = buses[0] || null;
  const secondaryBuses = buses.slice(1);
  const reviews = cms?.reviews || [];
  const leadReview = reviews[0] || null;
  const otherReviews = reviews.slice(1);

  const getCityLabel = (route: TravelRoute, field: 'origin' | 'destination') => {
    if (language === 'gu') return field === 'origin' ? route.originGu || route.origin : route.destinationGu || route.destination;
    if (language === 'hi') return field === 'origin' ? route.originHi || route.origin : route.destinationHi || route.destination;
    return field === 'origin' ? route.origin : route.destination;
  };

  const renderFacilityIcon = (icon: string) => {
    switch (icon) {
      case 'wind':
        return <Wind className="w-5 h-5 text-[#D4AF37]" />;
      case 'zap':
        return <Zap className="w-5 h-5 text-[#D4AF37]" />;
      case 'shield':
        return <Shield className="w-5 h-5 text-[#D4AF37]" />;
      case 'user-check':
        return <UserCheck className="w-5 h-5 text-[#D4AF37]" />;
      case 'qr-code':
        return <QrCode className="w-5 h-5 text-[#D4AF37]" />;
      default:
        return <Sparkles className="w-5 h-5 text-[#D4AF37]" />;
    }
  };

  const triggerCorridorSearch = (origin: string, destination: string) => {
    onSearchParamsChange({ ...searchParams, origin, destination });
    onExecuteSearch({ origin, destination });
  };

  return (
    <div className="space-y-20 sm:space-y-24 pb-20">
      {/* 1. UNPREDICTABLE ASYMMETRIC SLEEPER STAGE + DISPATCH CONSOLE */}
      <section className="relative border-b border-[#D4AF37]/25 bg-[#09090B]">
        {/* Mobile/Tablet: Dedicated unobstructed video stage; Desktop: Full-bleed atmospheric backdrop */}
        <div className="relative h-[240px] sm:h-[340px] lg:absolute lg:inset-0 lg:h-full border-b border-[#D4AF37]/15 lg:border-b-0">
          <HeroBusVideo />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 py-7 lg:py-16 lg:min-h-[720px] flex flex-col justify-between">
          {/* Top Editorial Bar: Corridor Eyebrow + Language Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-[#E8C86B]">
              <span>{t.heroEyebrow}</span>
              <span aria-hidden="true" className="text-[#D4AF37]/40">
                /
              </span>
              <span className="font-mono-tabular text-[#FAF7F0]/65">
                {routes.length} Active Corridors · {buses.length} Sleeper Coaches
              </span>
            </div>

            <div
              className="inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/30 bg-[#09090B]/92 p-1"
              role="group"
              aria-label="Website language selector"
            >
              {(
                [
                  { code: 'en', label: 'EN' },
                  { code: 'gu', label: 'ગુજરાતી' },
                  { code: 'hi', label: 'हिन्दी' },
                ] as const
              ).map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => onChangeLanguage(l.code)}
                  className={`min-h-[36px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded cursor-pointer whitespace-nowrap ${
                    language === l.code
                      ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                      : 'text-[#FAF7F0]/75 hover:text-[#FAF7F0]'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Left-Anchored Editorial Headline + 3D-Tilted Boarding Planner (Leaves right 3D coach open on desktop) */}
          <div className="mt-5 lg:mt-10 grid grid-cols-1 lg:grid-cols-[540px_1fr] gap-8 items-end">
            <div className="space-y-5">
              <div className="space-y-3">
                {(() => {
                  const fullTitle = (cms?.heroTitle || 'Sovereign Sleeper Journeys Across Gujarat').trim();
                  const words = fullTitle.split(/\s+/);
                  const splitAt = words.length > 2 ? words.length - 2 : words.length;
                  const leadLine = words.slice(0, splitAt).join(' ');
                  const accentLine = words.slice(splitAt).join(' ');
                  return (
                    <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.65rem] font-bold tracking-tight text-[#FAF7F0] text-balance leading-[1.03]">
                      <span className="block">{leadLine}</span>
                      {accentLine && (
                        <span className="block gold-gradient-text mt-1">{accentLine}</span>
                      )}
                    </h1>
                  );
                })()}
                <p className="max-w-lg text-sm text-[#FAF7F0]/80 leading-relaxed">
                  {cms?.heroSubtitle ||
                    'Dedicated 2+1 luxury AC and Non-AC sleeper coaches crafted for overnight comfort, punctual departures, and instant verified boarding.'}
                </p>
              </div>

              {/* Instant One-Tap Corridor Jumpers */}
              {routes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-[#FAF7F0]/55 mr-1">Express Jump:</span>
                  {routes.slice(0, 3).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => triggerCorridorSearch(r.origin, r.destination)}
                      className="min-h-[36px] sm:min-h-0 px-3 py-1 rounded border border-[#D4AF37]/30 bg-[#09090B]/85 text-xs text-[#E8C86B] hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 cursor-pointer whitespace-nowrap"
                    >
                      {getCityLabel(r, 'origin')} → {getCityLabel(r, 'destination')}
                    </button>
                  ))}
                </div>
              )}

              {/* Sculpted 3D-Bevel Departure Planner */}
              <div className="[perspective:1100px]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onExecuteSearch();
                  }}
                  className="rounded-xl border border-[#D4AF37]/40 gold-bevel-panel p-4 sm:p-5 space-y-3.5 lg:[transform:perspective(1100px)_rotateY(3deg)]"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 text-xs">
                    <span className="font-display font-semibold text-[#F5E199]">
                      Overnight Coach Dispatch
                    </span>
                    <span className="font-mono-tabular text-[#FAF7F0]/55">
                      Instant QR Boarding
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2.5 items-end">
                    <div>
                      <label htmlFor="search-origin" className="block text-xs text-[#E8C86B] mb-1">
                        {t.fromLabel}
                      </label>
                      <select
                        id="search-origin"
                        value={searchParams.origin}
                        onChange={(e) =>
                          onSearchParamsChange({ ...searchParams, origin: e.target.value })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-white/15 bg-[#141418] px-3 py-2 text-sm text-[#FAF7F0] focus:border-[#D4AF37] focus:outline-none"
                      >
                        <option value="">All Origins</option>
                        {cities.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      aria-label={t.swapCities}
                      onClick={() =>
                        onSearchParamsChange({
                          ...searchParams,
                          origin: searchParams.destination,
                          destination: searchParams.origin,
                        })
                      }
                      className="inline-flex items-center justify-center min-h-[44px] w-full sm:w-11 rounded-lg border border-white/15 bg-[#141418] text-[#D4AF37] hover:border-[#D4AF37] cursor-pointer"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>

                    <div>
                      <label htmlFor="search-dest" className="block text-xs text-[#E8C86B] mb-1">
                        {t.toLabel}
                      </label>
                      <select
                        id="search-dest"
                        value={searchParams.destination}
                        onChange={(e) =>
                          onSearchParamsChange({ ...searchParams, destination: e.target.value })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-white/15 bg-[#141418] px-3 py-2 text-sm text-[#FAF7F0] focus:border-[#D4AF37] focus:outline-none"
                      >
                        <option value="">All Destinations</option>
                        {cities.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 items-end">
                    <div>
                      <label htmlFor="search-date" className="block text-xs text-[#E8C86B] mb-1">
                        {t.dateLabel}
                      </label>
                      <input
                        id="search-date"
                        type="date"
                        value={searchParams.date}
                        onChange={(e) =>
                          onSearchParamsChange({ ...searchParams, date: e.target.value })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-white/15 bg-[#141418] px-3 py-2 text-sm text-[#FAF7F0] font-mono-tabular focus:border-[#D4AF37] focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 rounded-lg gold-gradient-bg berth-pod-3d text-[#09090B] px-6 py-2.5 text-sm font-bold hover:brightness-110 cursor-pointer whitespace-nowrap shrink-0 min-h-[44px]"
                    >
                      <Search className="w-4 h-4" />
                      {t.searchBuses}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEARCH RESULTS SECTION */}
      {searchResults !== null && (
        <section id="search-results" className="scroll-mt-24 mx-auto max-w-7xl px-4 sm:px-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-xs text-[#D4AF37] font-mono-tabular">
                {searchParams.date} · {searchResults.length} Sleeper Departures Found
              </p>
              <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">
                {searchParams.origin || 'All Cities'} → {searchParams.destination || 'All Cities'}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#FAF7F0]/60">{t.sortBy}:</span>
              {(
                [
                  { id: 'departure', label: t.sortDeparture },
                  { id: 'arrival', label: t.sortArrival },
                  { id: 'price', label: t.sortPrice },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSearchParamsChange({ ...searchParams, sortBy: s.id });
                    onExecuteSearch({ sortBy: s.id });
                  }}
                  className={`min-h-[40px] sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                    searchParams.sortBy === s.id
                      ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                      : 'border border-white/15 text-[#FAF7F0]/75 hover:border-[#D4AF37]/50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {searching ? (
            <div className="py-12 text-center text-sm text-[#FAF7F0]/65">
              Checking live sleeper berth inventory...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="rounded-xl border border-white/10 luxury-surface-3d p-10 text-center space-y-3">
              <p className="text-base text-[#FAF7F0]/80">{t.noBusesFound}</p>
              <button
                type="button"
                onClick={() => {
                  onSearchParamsChange({ ...searchParams, origin: '', destination: '', date: '' });
                  onExecuteSearch({ origin: '', destination: '', date: '' });
                }}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-[#D4AF37]/40 text-xs font-semibold text-[#D4AF37] cursor-pointer"
              >
                Show All Scheduled Departures
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {searchResults.map((trip) => (
                <div
                  key={trip.id}
                  className="rounded-xl border border-white/10 luxury-surface-3d p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5 hover:border-[#D4AF37]/45"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#FAF7F0]/60">
                      <span className="font-mono-tabular text-[#D4AF37] font-semibold">
                        {trip.tripCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{trip.bus.coachType}</span>
                      <span aria-hidden="true">·</span>
                      <span>{trip.bus.registrationNumber}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#E8C86B]">GPS Live Tracking</span>
                    </div>
                    <h3 className="text-lg font-semibold text-[#FAF7F0]">{trip.bus.name}</h3>
                    <div className="flex flex-wrap items-center gap-6 pt-1">
                      <div>
                        <p className="font-mono-tabular text-2xl font-bold text-[#FAF7F0]">
                          {trip.departureTime}
                        </p>
                        <p className="text-xs text-[#FAF7F0]/60">{trip.route.origin}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] font-mono-tabular text-[#D4AF37]">
                          {formatDurationMinutes(trip.route.estimatedDurationMin)}
                        </p>
                        <div className="w-24 h-px bg-[#D4AF37]/40 my-1" />
                        <p className="text-[11px] text-[#FAF7F0]/50">
                          {trip.route.distanceKm} km
                        </p>
                      </div>
                      <div>
                        <p className="font-mono-tabular text-2xl font-bold text-[#FAF7F0]">
                          {trip.arrivalTime}
                        </p>
                        <p className="text-xs text-[#FAF7F0]/60">{trip.route.destination}</p>
                      </div>
                    </div>
                    <p className="text-xs text-[#FAF7F0]/55 pt-1">
                      {trip.bus.amenities.join(' · ')}
                    </p>
                  </div>

                  <div className="flex sm:flex-row lg:flex-col items-center lg:items-end justify-between gap-3 border-t lg:border-t-0 lg:border-l border-white/10 pt-4 lg:pt-0 lg:pl-6 shrink-0">
                    <div className="text-left lg:text-right">
                      <p className="text-xs text-[#FAF7F0]/60">Starting from</p>
                      <p className="font-mono-tabular text-2xl font-bold text-[#D4AF37]">
                        Rs. {trip.startingFare}
                      </p>
                      <p className="font-mono-tabular text-xs text-emerald-300">
                        {trip.availableBerthCount} / {trip.totalBerthCount} {t.berthsAvailable}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectTrip(trip)}
                      className="min-h-[44px] inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] text-[#09090B] px-5 py-2.5 text-sm font-bold hover:bg-[#E8C86B] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {t.selectBerths}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 2. INTERACTIVE NIGHT-CORRIDOR DEPARTURE BOARD & 3D ROUTE DOSSIER (Unifies Routes + Stop Landmarks) */}
      <section id="routes-section" className="mx-auto max-w-7xl px-4 sm:px-6 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-xs text-[#D4AF37]">Overnight Corridor Ledger</p>
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-[#FAF7F0] text-balance">
              {t.popularRoutesTitle}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#FAF7F0]/65 max-w-md">
            Select any corridor row to inspect verified pickup landmarks on the 3D dossier or check live sleeper berths immediately.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8 items-start">
          {/* Left: Typographic Departure Board Rows (Replaces generic 4-box grid) */}
          <div className="divide-y divide-white/10 border-t border-b border-white/10">
            {routes.map((route, idx) => {
              const isActive = activeRouteGuide?.id === route.id;
              return (
                <div
                  key={route.id}
                  className={`py-4 sm:py-5 px-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isActive ? 'bg-[#141418]' : 'hover:bg-[#111116]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRouteGuide(route)}
                    className="text-left flex-1 space-y-1 cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono-tabular text-[#D4AF37]">
                      <span>0{idx + 1}.</span>
                      <span>{route.code}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#FAF7F0]/60">{route.distanceKm} km</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#FAF7F0]/60">
                        {formatDurationMinutes(route.estimatedDurationMin)}
                      </span>
                    </div>
                    <div className="font-display text-2xl sm:text-3xl font-bold text-[#FAF7F0]">
                      {getCityLabel(route, 'origin')} → {getCityLabel(route, 'destination')}
                    </div>
                    <p className="text-xs text-[#FAF7F0]/60 line-clamp-1">{route.description}</p>
                  </button>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="text-left sm:text-right">
                      <span className="block text-[10px] text-[#FAF7F0]/50">Starting Fare</span>
                      <span className="font-mono-tabular text-lg font-bold gold-gradient-text">
                        Rs. {route.baseFare}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => triggerCorridorSearch(route.origin, route.destination)}
                      className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/45 bg-[#09090B] px-4 py-2 text-xs font-semibold text-[#F5E199] hover:bg-[#D4AF37] hover:text-[#09090B] cursor-pointer whitespace-nowrap"
                    >
                      Check Coaches
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: 3D-Perspective Boarding & Landmark Dossier */}
          {activeRouteGuide && (
            <div className="[perspective:1000px]">
              <div className="gold-bevel-panel rounded-2xl border border-[#D4AF37]/35 p-5 sm:p-6 space-y-5 lg:[transform:perspective(1000px)_rotateY(-4deg)_rotateX(2deg)]">
                <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="font-mono-tabular text-xs text-[#D4AF37]">
                      {activeRouteGuide.code} · {t.routeInfoTitle}
                    </p>
                    <h3 className="font-display text-3xl font-bold gold-gradient-text mt-0.5">
                      {activeRouteGuide.origin} → {activeRouteGuide.destination}
                    </h3>
                  </div>
                  <Compass className="w-5 h-5 text-[#D4AF37] shrink-0" />
                </div>

                <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                  {(activeRouteGuide.stops || []).map((s, sIdx) => (
                    <div
                      key={s.id}
                      className="flex items-start justify-between gap-3 border-b border-white/10 pb-2.5 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-sm text-[#FAF7F0]">
                          0{sIdx + 1}. {s.stopName}
                        </div>
                        <div className="text-[#FAF7F0]/60">{s.landmark}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono-tabular text-[#D4AF37] uppercase block">
                          {s.stopType}
                        </span>
                        <span className="text-[#FAF7F0]/55">{s.city}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    triggerCorridorSearch(activeRouteGuide.origin, activeRouteGuide.destination)
                  }
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg gold-gradient-bg berth-pod-3d text-[#09090B] px-5 py-2.5 text-xs font-bold hover:brightness-110 cursor-pointer"
                >
                  Book This Sleeper Corridor
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. ASYMMETRIC MAGAZINE FLEET SPREAD (1 Hero Coach + Stacked Horizontal Coach Rows) */}
      {buses.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-[#D4AF37]">100% Dedicated Sleeper Fleet</p>
              <h2 className="font-display text-3xl sm:text-5xl font-bold text-[#FAF7F0]">
                {t.availableFleetTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onExecuteSearch({ origin: '', destination: '', date: '' })}
              className="min-h-[40px] inline-flex items-center gap-1.5 text-xs font-semibold text-[#E8C86B] hover:text-[#FAF7F0] cursor-pointer"
            >
              Inspect All Scheduled Coaches <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 items-stretch">
            {/* Lead Flagship Coach */}
            {leadBus && (
              <div className="luxury-surface-3d rounded-2xl border border-[#D4AF37]/30 overflow-hidden flex flex-col justify-between">
                <div className="relative aspect-[16/10] bg-[#09090B]">
                  {leadBus.primaryImageUrl ? (
                    <img
                      src={leadBus.primaryImageUrl}
                      alt={leadBus.name}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#141418] to-[#09090B]">
                      <Bus className="w-12 h-12 text-[#D4AF37]/50" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090B]/85 via-transparent to-transparent" />
                </div>
                <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="font-mono-tabular text-xs text-[#D4AF37]">
                      Flagship Coach · {leadBus.coachType} · {leadBus.totalBerths} Berths ·{' '}
                      {leadBus.registrationNumber}
                    </div>
                    <h3 className="font-display text-3xl font-bold text-[#FAF7F0]">
                      {leadBus.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#FAF7F0]/70 leading-relaxed">
                      {leadBus.amenities.join(' · ')}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-[#FAF7F0]/55">
                      Double & Single Luxury Berths
                    </span>
                    <button
                      type="button"
                      onClick={() => onExecuteSearch({ origin: '', destination: '', date: '' })}
                      className="min-h-[40px] inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#F5E199] cursor-pointer"
                    >
                      Check Availability <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Stacked Horizontal Fleet Cards */}
            <div className="flex flex-col justify-between gap-4">
              {secondaryBuses.map((bus) => (
                <div
                  key={bus.id}
                  className="luxury-surface-3d rounded-xl border border-white/10 overflow-hidden grid grid-cols-1 sm:grid-cols-[150px_1fr] flex-1"
                >
                  <div className="relative aspect-[4/3] sm:aspect-auto bg-[#09090B]">
                    {bus.primaryImageUrl ? (
                      <img
                        src={bus.primaryImageUrl}
                        alt={bus.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#141418]">
                        <Bus className="w-8 h-8 text-[#D4AF37]/50" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 sm:p-5 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <p className="font-mono-tabular text-[11px] text-[#D4AF37]">
                        {bus.coachType} · {bus.totalBerths} Berths · {bus.registrationNumber}
                      </p>
                      <h3 className="font-display text-xl font-bold text-[#FAF7F0]">
                        {bus.name}
                      </h3>
                    </div>
                    <p className="text-xs text-[#FAF7F0]/65 line-clamp-2">
                      {bus.amenities.join(' · ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 4. CONTRAST INVERSION BROADSHEET: WHY JAY GOGA × ASYMMETRIC FACILITIES BENTO */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-2xl border border-[#D4AF37]/35 bg-[#FAF7F0] text-[#09090B] p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] gap-10 items-start">
          {/* Left: Architectural Broadsheet Metrics */}
          <div className="space-y-6">
            <div>
              <p className="text-xs text-[#9A6B0C] font-semibold">Operational Precision</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold mt-1 text-balance">
                {t.whyChooseTitle}
              </h2>
            </div>

            <div className="divide-y divide-[#09090B]/15 border-t border-b border-[#09090B]/15">
              {(cms?.whyChoose || []).map((w, idx) => (
                <div key={w.id} className="py-4 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tabular text-xs text-[#9A6B0C] font-semibold">
                      0{idx + 1}. {w.metric}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold">{w.title}</h3>
                  <p className="text-sm text-[#09090B]/75 leading-relaxed">{w.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Asymmetric Dark-Obsidian Facilities Bento */}
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[#9A6B0C] font-semibold">Sleeper Cabin Standards</p>
              <h3 className="font-display text-2xl sm:text-3xl font-bold mt-0.5">
                {t.facilitiesTitle}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {(cms?.facilities || []).map((f, idx) => (
                <div
                  key={f.id}
                  className={`rounded-xl p-5 space-y-2 ${
                    idx === 0
                      ? 'sm:col-span-2 gold-bevel-panel text-[#FAF7F0] border border-[#D4AF37]/40'
                      : 'bg-[#111116] text-[#FAF7F0] border border-[#09090B]/15'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {renderFacilityIcon(f.icon)}
                    <h4 className="font-display text-lg font-bold text-[#FAF7F0]">{f.title}</h4>
                  </div>
                  <p className="text-xs sm:text-sm text-[#FAF7F0]/75 leading-relaxed">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. INTERACTIVE GALLERY SPOTLIGHT × PASSENGER CHRONICLES */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1.25fr_0.9fr] gap-8 items-start">
        {/* Interactive Gallery Spotlight + Tile Switcher */}
        <div className="space-y-4">
          <div>
            <p className="text-xs text-[#D4AF37]">Coach & Cabin Showcase</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#FAF7F0]">
              {t.galleryTitle}
            </h2>
          </div>

          {featuredGalleryItem && (
            <figure className="luxury-surface-3d rounded-2xl border border-[#D4AF37]/30 overflow-hidden">
              <div className="relative aspect-[16/10] bg-[#09090B]">
                <img
                  src={featuredGalleryItem.imageUrl}
                  alt={featuredGalleryItem.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090B]/90 via-transparent to-transparent" />
                <figcaption className="absolute bottom-4 left-4 right-4 space-y-0.5">
                  <div className="font-display text-xl sm:text-2xl font-bold text-[#FAF7F0]">
                    {featuredGalleryItem.title}
                  </div>
                  <div className="text-xs text-[#FAF7F0]/75">{featuredGalleryItem.caption}</div>
                </figcaption>
              </div>
            </figure>
          )}

          {galleryItems.length > 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {galleryItems.map((g, idx) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGalleryIdx(idx)}
                  className={`text-left rounded-lg overflow-hidden border cursor-pointer ${
                    activeGalleryIdx === idx
                      ? 'border-[#D4AF37] bg-[#17171D]'
                      : 'border-white/10 bg-[#101015] opacity-75 hover:opacity-100'
                  }`}
                >
                  <div className="aspect-[4/3] bg-[#09090B]">
                    <img
                      src={g.imageUrl}
                      alt={g.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="px-2.5 py-2 text-[11px] font-medium text-[#FAF7F0] truncate">
                    {g.title}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Editorial Passenger Chronicles */}
        <div className="space-y-5">
          <div>
            <p className="text-xs text-[#D4AF37]">Verified Journeys</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#FAF7F0]">
              {t.reviewsTitle}
            </h2>
          </div>

          {leadReview && (
            <div className="gold-bevel-panel rounded-2xl border border-[#D4AF37]/30 p-6 space-y-4">
              <div className="flex items-center gap-1 text-[#D4AF37]">
                {Array.from({ length: leadReview.rating }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <p className="font-display text-2xl sm:text-[1.65rem] leading-snug text-[#FAF7F0]">
                "{leadReview.quote}"
              </p>
              <div className="border-t border-white/10 pt-3 flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F5E199]">{leadReview.author}</span>
                <span className="font-mono-tabular text-[#FAF7F0]/55">{leadReview.route}</span>
              </div>
            </div>
          )}

          <div className="divide-y divide-white/10 border-t border-b border-white/10">
            {otherReviews.map((rev) => (
              <div key={rev.id} className="py-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-[#D4AF37]">
                    {Array.from({ length: rev.rating }).map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                  <span className="font-mono-tabular text-[#FAF7F0]/55">{rev.route}</span>
                </div>
                <p className="text-sm text-[#FAF7F0]/80 leading-relaxed">"{rev.quote}"</p>
                <p className="text-xs font-semibold text-[#FAF7F0]">{rev.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. ARCHITECTURAL CONCIERGE & TERMINAL LEDGER */}
      <section id="contact-section" className="mx-auto max-w-7xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-white/10 luxury-surface-3d p-6 space-y-4">
          <p className="text-xs text-[#D4AF37]">Customer Support</p>
          <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">{t.contactTitle}</h2>
          <div className="space-y-2.5 text-sm text-[#FAF7F0]/80">
            <p>
              <span className="text-[#FAF7F0]/55">Reservation Desk:</span>{' '}
              <span className="font-mono-tabular">
                {settings?.phonePrimary || 'Configure in Admin → Website & Settings'}
              </span>
            </p>
            <p>
              <span className="text-[#FAF7F0]/55">WhatsApp Helpline:</span>{' '}
              <span className="font-mono-tabular">
                {settings?.whatsappNumber || 'Configure in Admin → Website & Settings'}
              </span>
            </p>
            <p>
              <span className="text-[#FAF7F0]/55">Email:</span>{' '}
              {settings?.email || 'Configure in Admin → Website & Settings'}
            </p>
            <p className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#D4AF37]" />
              <span>
                {settings?.supportTimings || 'Configure support hours in Admin → Website & Settings'}
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 luxury-surface-3d p-6 space-y-4">
          <p className="text-xs text-[#D4AF37]">Terminals</p>
          <h2 className="font-display text-3xl font-bold text-[#FAF7F0]">{t.officesTitle}</h2>
          {settings?.officeLocations && settings.officeLocations.length > 0 ? (
            <div className="divide-y divide-white/10">
              {settings.officeLocations.map((loc) => (
                <div key={loc.id} className="py-3 first:pt-0 last:pb-0 text-sm">
                  <div className="font-semibold text-[#FAF7F0] flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#D4AF37]" />
                    {loc.title} ({loc.city})
                  </div>
                  <p className="text-xs text-[#FAF7F0]/65 mt-0.5">{loc.address}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#FAF7F0]/65">
              Office addresses and counter map links can be added and updated anytime in Admin → Website & Settings.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
