import { useMemo, useState } from 'react';
import { Compass, Gauge, MapPin, Navigation, RefreshCw, Route } from 'lucide-react';
import type { TravelRoute, TripStop } from '../types/travel';
import { formatDurationMinutes } from '../utils/bookingRules';
import { computeTripTrackingState, projectGeoToMap } from '../utils/liveTracking';
import { LiveBus3DPreview } from './LiveBus3DPreview';

interface LiveBusTrackerProps {
  trip: {
    id: number;
    tripCode: string;
    journeyDate: string;
    departureTime: string;
    arrivalTime: string;
  };
  route: Pick<TravelRoute, 'origin' | 'destination' | 'distanceKm' | 'estimatedDurationMin'>;
  bus: {
    name: string;
    registrationNumber: string;
    coachType: string;
  };
  stops: TripStop[];
}

const REFERENCE_HUBS = [
  { name: 'Bhuj', lat: 23.242, lng: 69.6669 },
  { name: 'Rajkot', lat: 22.3039, lng: 70.8022 },
  { name: 'Bhavnagar', lat: 21.7645, lng: 72.1519 },
  { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Vadodara', lat: 22.3072, lng: 73.1812 },
  { name: 'Surat', lat: 21.1702, lng: 72.8311 },
].map((h) => ({ ...h, pt: projectGeoToMap({ lat: h.lat, lng: h.lng }) }));

export function LiveBusTracker({ trip, route, bus, stops }: LiveBusTrackerProps) {
  const [overridePct, setOverridePct] = useState<number | null>(null);
  const [clockTick, setClockTick] = useState(() => Date.now());

  const snapshot = useMemo(
    () =>
      computeTripTrackingState({
        trip,
        route,
        stops,
        nowMs: clockTick,
        overrideProgressPct: overridePct,
      }),
    [trip, route, stops, clockTick, overridePct]
  );

  const polylinePoints = snapshot.waypoints.map((wp) => `${wp.point.x},${wp.point.y}`).join(' ');

  return (
    <div
      data-testid="live-bus-tracker"
      className="gold-bevel-panel rounded-xl border border-[#D4AF37]/35 p-4 sm:p-5 space-y-5"
    >
      {/* Top Status & Coach Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/40 px-2.5 py-0.5 font-mono-tabular font-semibold text-[#E8C86B]">
              <Navigation className="w-3 h-3" />
              SIMULATED GPS TELEMETRY
            </span>
            <span className="font-mono-tabular text-[#FAF7F0]/60">
              {trip.tripCode} · {bus.registrationNumber}
            </span>
          </div>
          <h3 className="font-display text-2xl font-bold text-[#FAF7F0]">
            Live Bus Tracking · {route.origin} → {route.destination}
          </h3>
          <p className="text-xs text-[#FAF7F0]/65">
            {bus.name} ({bus.coachType}) · Scheduled {trip.journeyDate} {trip.departureTime} –{' '}
            {trip.arrivalTime}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid="gps-status-badge"
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
              snapshot.status === 'En Route' || snapshot.status === 'Approaching Terminal'
                ? 'border-emerald-400/40 bg-emerald-950/40 text-emerald-300'
                : 'border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#E8C86B]'
            }`}
          >
            {snapshot.status}
          </span>
          <button
            type="button"
            onClick={() => setClockTick(Date.now())}
            className="min-h-[44px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-[#09090B] text-xs font-medium text-[#FAF7F0] hover:border-[#D4AF37] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37]" />
            Refresh GPS
          </button>
        </div>
      </div>

      {/* 3D Interactive Corridor & Coach Stage (Mobile + Desktop) */}
      <LiveBus3DPreview
        snapshot={snapshot}
        busName={bus.name}
        registrationNumber={bus.registrationNumber}
      />

      {/* Static GPS Corridor Map Placeholder (Zero CSS animations) */}
      <div className="rounded-xl border border-white/10 bg-[#09090B] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 text-xs">
          <span className="font-mono-tabular text-[#D4AF37]">
            GPS FIX: {snapshot.busPoint.lat.toFixed(4)}° N, {snapshot.busPoint.lng.toFixed(4)}° E
          </span>
          <span className="font-mono-tabular text-[#FAF7F0]/60">
            HEADING {snapshot.headingDeg}° · PROGRESS {snapshot.progressPct}%
          </span>
        </div>

        <div className="relative w-full bg-[#08090D]">
          <svg
            viewBox="0 0 720 440"
            role="img"
            aria-label={`Static simulated GPS route map from ${route.origin} to ${route.destination}`}
            className="w-full h-auto block bg-[#08090D]"
          >
            <defs>
              <pattern id="gps-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="rgba(212,175,55,0.08)"
                  strokeWidth="1"
                />
              </pattern>
              <radialGradient id="bus-halo-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(245,225,153,0.45)" />
                <stop offset="55%" stopColor="rgba(212,175,55,0.14)" />
                <stop offset="100%" stopColor="rgba(212,175,55,0)" />
              </radialGradient>
              <radialGradient id="corridor-vignette" cx="50%" cy="50%" r="70%">
                <stop offset="0%" stopColor="rgba(212,175,55,0.06)" />
                <stop offset="100%" stopColor="rgba(8,9,13,0)" />
              </radialGradient>
            </defs>

            {/* Coordinate Grid & Static Atmospheric Depth Layer */}
            <rect width="720" height="440" fill="url(#gps-grid)" />
            <rect width="720" height="440" fill="url(#corridor-vignette)" />

            {/* Stylized Gujarat Regional Highway Backdrop Ring & Elevation Contours */}
            <path
              d="M 70 110 L 210 75 L 360 85 L 530 95 L 625 185 L 605 315 L 495 290 L 420 230 L 315 265 L 185 250 L 90 195 Z"
              fill="rgba(212,175,55,0.035)"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1.2"
            />
            <path
              d="M 110 130 L 240 100 L 390 108 L 515 120 L 585 190 L 560 280 L 465 258 L 370 212 L 265 235 L 145 215 Z"
              fill="none"
              stroke="rgba(212,175,55,0.06)"
              strokeWidth="1"
              strokeDasharray="3 6"
            />

            {/* Static Compass Rose HUD (Top Left) */}
            <g transform="translate(46, 46)">
              <circle cx="0" cy="0" r="22" fill="rgba(9,9,11,0.85)" stroke="rgba(212,175,55,0.35)" strokeWidth="1" />
              <line x1="0" y1="-16" x2="0" y2="16" stroke="rgba(212,175,55,0.3)" strokeWidth="1" />
              <line x1="-16" y1="0" x2="16" y2="0" stroke="rgba(212,175,55,0.3)" strokeWidth="1" />
              <polygon points="0,-15 -3,-5 3,-5" fill="#D4AF37" />
              <text x="0" y="-18" textAnchor="middle" fontSize="8" fontWeight="700" fill="#F5E199" fontFamily="JetBrains Mono, monospace">
                N
              </text>
            </g>

            {/* Compact Pin Key (Top Right safe margin above route bounds) */}
            <g transform="translate(412, 12)">
              <rect
                width="292"
                height="26"
                rx="6"
                fill="rgba(9,9,11,0.9)"
                stroke="rgba(212,175,55,0.28)"
              />
              <circle cx="16" cy="13" r="4.5" fill="#D4AF37" />
              <text x="27" y="16.5" fontSize="9.5" fill="#FAF7F0">
                Live Coach GPS
              </text>
              <circle cx="126" cy="13" r="5.5" fill="#18181D" stroke="#D4AF37" strokeWidth="1.5" />
              <text x="126" y="16" textAnchor="middle" fontSize="7.5" fill="#FAF7F0">
                1
              </text>
              <text x="138" y="16.5" fontSize="9.5" fill="#FAF7F0">
                Numbered Stop Waypoint
              </text>
            </g>

            {/* Reference Gujarat Hub Cities */}
            {REFERENCE_HUBS.map((hub) => (
              <g key={hub.name}>
                <circle cx={hub.pt.x} cy={hub.pt.y} r="2.5" fill="rgba(250,247,240,0.28)" />
                <text
                  x={hub.pt.x + 6}
                  y={hub.pt.y + 3}
                  fontSize="9"
                  fill="rgba(250,247,240,0.34)"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {hub.name.toUpperCase()}
                </text>
              </g>
            ))}

            {/* Planned Route Corridor Line */}
            {snapshot.waypoints.length >= 2 && (
              <>
                <polyline
                  points={polylinePoints}
                  fill="none"
                  stroke="rgba(212,175,55,0.28)"
                  strokeWidth="4"
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Active line from origin to current bus coordinates */}
                <line
                  x1={snapshot.originPoint.x}
                  y1={snapshot.originPoint.y}
                  x2={snapshot.busPoint.x}
                  y2={snapshot.busPoint.y}
                  stroke="#D4AF37"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </>
            )}

            {/* Route Stop Waypoints (Numbered pins + collision-free labels) */}
            {snapshot.waypoints.map((wp, idx) => {
              const isOrigin = idx === 0;
              const isDest = idx === snapshot.waypoints.length - 1;
              const isEndpoint = isOrigin || isDest;
              const labelY = isOrigin ? wp.point.y + 4 : wp.point.y + 22;
              const labelAnchor = isOrigin
                ? 'end'
                : wp.point.x > 520
                  ? 'end'
                  : wp.point.x < 200
                    ? 'start'
                    : 'middle';
              const labelX = isOrigin
                ? wp.point.x - 14
                : labelAnchor === 'end'
                  ? wp.point.x - 10
                  : labelAnchor === 'start'
                    ? wp.point.x + 10
                    : wp.point.x;

              return (
                <g key={String(wp.id)}>
                  <circle
                    cx={wp.point.x}
                    cy={wp.point.y}
                    r={isEndpoint ? 9 : 7.5}
                    fill={wp.passed ? '#D4AF37' : '#18181D'}
                    stroke={wp.passed ? '#FAF7F0' : '#D4AF37'}
                    strokeWidth="1.8"
                  />
                  <text
                    x={wp.point.x}
                    y={wp.point.y + 3.5}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill={wp.passed ? '#09090B' : '#FAF7F0'}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {idx + 1}
                  </text>
                  {isEndpoint && (
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor={labelAnchor}
                      fontSize="10.5"
                      fontWeight="700"
                      fill="#F5E199"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      {isOrigin ? `${route.origin} · ${wp.scheduledTime}` : `${route.destination} · ${wp.scheduledTime}`}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Current Simulated Coach GPS Marker (Static radial aura + directional beacon) */}
            <g data-testid="gps-bus-marker">
              <circle cx={snapshot.busPoint.x} cy={snapshot.busPoint.y} r="34" fill="url(#bus-halo-grad)" />
              <circle
                cx={snapshot.busPoint.x}
                cy={snapshot.busPoint.y}
                r="16"
                fill="rgba(212,175,55,0.18)"
                stroke="rgba(212,175,55,0.6)"
                strokeWidth="1.2"
              />
              <circle
                cx={snapshot.busPoint.x}
                cy={snapshot.busPoint.y}
                r="8"
                fill="#D4AF37"
                stroke="#09090B"
                strokeWidth="2.5"
              />
              <rect
                x={Math.min(540, Math.max(12, snapshot.busPoint.x - 80))}
                y={snapshot.busPoint.y > 90 ? snapshot.busPoint.y - 44 : snapshot.busPoint.y + 22}
                width="160"
                height="22"
                rx="4"
                fill="#09090B"
                stroke="#D4AF37"
                strokeWidth="1.2"
              />
              <text
                x={Math.min(620, Math.max(92, snapshot.busPoint.x))}
                y={snapshot.busPoint.y > 90 ? snapshot.busPoint.y - 30 : snapshot.busPoint.y + 36}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#F5E199"
                fontFamily="JetBrains Mono, monospace"
              >
                {bus.registrationNumber} · {snapshot.speedKmh} km/h
              </text>
            </g>
          </svg>

          {/* Static 3D-Perspective Legend Overlay (Zero CSS animations/transitions) */}
          <div
            data-testid="live-tracking-3d-legend"
            className="relative mx-2.5 -mt-7 mb-2.5 sm:mx-0 sm:mt-0 sm:mb-0 sm:absolute sm:bottom-3 sm:left-3 sm:w-[352px] z-10 [perspective:900px]"
          >
            <div className="gold-bevel-panel rounded-xl border border-[#D4AF37]/45 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-[0_18px_36px_-14px_rgba(0,0,0,0.95)] [transform:perspective(820px)_rotateX(6deg)] sm:[transform:perspective(900px)_rotateX(8deg)_rotateY(6deg)]">
              <div className="flex items-center justify-between gap-2 border-b border-[#D4AF37]/20 pb-1.5 mb-2">
                <span className="font-display text-xs sm:text-sm font-bold gold-gradient-text">
                  Corridor Telemetry Legend
                </span>
                <div className="flex items-center gap-2.5 text-[10px] text-[#FAF7F0]/70 font-mono-tabular">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#D4AF37] inline-block" aria-hidden="true" />
                    GPS
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full border border-[#D4AF37] bg-[#18181D] inline-block" aria-hidden="true" />
                    Stop
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-start">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-[#FAF7F0]/60">
                    Next Stop Distance
                  </p>
                  <p
                    data-testid="legend-next-stop-distance"
                    className="font-display text-lg sm:text-xl font-bold leading-tight gold-gradient-text"
                  >
                    {snapshot.nextStop ? `${snapshot.distanceToNextStopKm} km` : '0 km'}
                  </p>
                  <p className="text-[11px] text-[#FAF7F0]/75 truncate">
                    {snapshot.nextStop ? snapshot.nextStop.label : 'Destination Reached'}
                  </p>
                </div>

                <div className="space-y-0.5 min-w-0 border-l border-white/10 pl-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#FAF7F0]/60">
                    Estimated Arrival
                  </p>
                  <p
                    data-testid="legend-estimated-arrival"
                    className="font-display text-lg sm:text-xl font-bold leading-tight gold-gradient-text"
                  >
                    {snapshot.nextStop ? snapshot.nextStop.scheduledTime : trip.arrivalTime}
                  </p>
                  <p className="text-[11px] text-[#FAF7F0]/75 font-mono-tabular truncate">
                    {snapshot.etaMinutesRemaining === 0
                      ? 'Arrived'
                      : snapshot.nextStop
                        ? `${formatDurationMinutes(snapshot.nextStopEtaMinutes)} to stop`
                        : formatDurationMinutes(snapshot.etaMinutesRemaining)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="luxury-surface-3d rounded-lg border border-white/10 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-[#FAF7F0]/60">
            <Gauge className="w-3.5 h-3.5 text-[#D4AF37]" />
            Coach Speed
          </div>
          <p className="font-mono-tabular text-sm font-bold text-[#FAF7F0] whitespace-nowrap">
            {snapshot.speedKmh} km/h
          </p>
        </div>

        <div className="luxury-surface-3d rounded-lg border border-white/10 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-[#FAF7F0]/60">
            <Route className="w-3.5 h-3.5 text-[#D4AF37]" />
            Distance Covered
          </div>
          <p className="font-mono-tabular text-sm font-bold text-[#FAF7F0] whitespace-nowrap">
            {snapshot.distanceCoveredKm} / {route.distanceKm} km
          </p>
        </div>

        <div className="luxury-surface-3d rounded-lg border border-white/10 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-[#FAF7F0]/60">
            <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
            Next Stop
          </div>
          <p className="text-xs font-semibold text-[#E8C86B] leading-snug">
            {snapshot.nextStop ? `${snapshot.nextStop.label} (${snapshot.nextStop.scheduledTime})` : 'Final Terminal'}
          </p>
        </div>

        <div className="luxury-surface-3d rounded-lg border border-white/10 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-[#FAF7F0]/60">
            <Compass className="w-3.5 h-3.5 text-[#D4AF37]" />
            Remaining ETA
          </div>
          <p className="font-mono-tabular text-sm font-bold text-[#FAF7F0] whitespace-nowrap">
            {snapshot.etaMinutesRemaining === 0
              ? 'Arrived'
              : formatDurationMinutes(snapshot.etaMinutesRemaining)}
          </p>
        </div>
      </div>

      {/* Route Segment & Mobile-Friendly Simulation Controls */}
      <div className="rounded-lg border border-white/10 bg-[#09090B] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="text-[#FAF7F0]/55">Active Corridor Segment: </span>
            <span className="font-semibold text-[#FAF7F0]">{snapshot.currentSegment}</span>
          </div>
          <span className="font-mono-tabular text-[#D4AF37]">
            Source:{' '}
            {snapshot.simulatedSource === 'schedule_clock'
              ? 'Live Schedule Clock'
              : `Simulated Route (${snapshot.progressPct}%)`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOverridePct(null)}
            className={`min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded text-xs font-semibold cursor-pointer ${
              overridePct === null
                ? 'bg-[#D4AF37] text-[#09090B]'
                : 'border border-white/15 text-[#FAF7F0]/75 hover:border-[#D4AF37]'
            }`}
          >
            Schedule Clock
          </button>
          {[0, 25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setOverridePct(pct)}
              className={`min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded text-xs font-mono-tabular font-semibold cursor-pointer ${
                overridePct === pct
                  ? 'bg-[#D4AF37] text-[#09090B]'
                  : 'border border-white/15 text-[#FAF7F0]/75 hover:border-[#D4AF37]'
              }`}
            >
              {pct === 0 ? 'Depot 0%' : pct === 100 ? 'Arrived 100%' : `${pct}% En Route`}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pt-1">
          <label htmlFor="gps-sim-slider" className="text-xs text-[#FAF7F0]/60 whitespace-nowrap">
            Simulate Corridor Position
          </label>
          <input
            id="gps-sim-slider"
            type="range"
            min={0}
            max={100}
            value={snapshot.progressPct}
            onChange={(e) => setOverridePct(Number(e.target.value))}
            className="w-full sm:flex-1 h-7 accent-[#D4AF37] cursor-pointer"
          />
        </div>
      </div>

      {/* Ordered Waypoint Timeline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {snapshot.waypoints.map((wp, idx) => (
          <div
            key={String(wp.id)}
            className={`rounded-lg border p-3 text-xs space-y-1 ${
              wp.passed
                ? 'border-[#D4AF37]/45 bg-[#D4AF37]/10 text-[#FAF7F0]'
                : 'border-white/10 bg-[#09090B] text-[#FAF7F0]/65'
            }`}
          >
            <div className="flex items-center justify-between font-mono-tabular">
              <span className="text-[#D4AF37]">
                0{idx + 1} · {wp.stopType.toUpperCase()}
              </span>
              <span>{wp.scheduledTime}</span>
            </div>
            <p className="font-semibold text-sm text-[#FAF7F0]">{wp.label}</p>
            <p className="text-[11px] opacity-75">{wp.landmark}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
