import type { TravelRoute, TripStop } from '../types/travel';

export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface MapPoint {
  x: number;
  y: number;
  lat: number;
  lng: number;
}

export interface TrackingWaypoint {
  id: number | string;
  label: string;
  stopType: string;
  scheduledTime: string;
  landmark: string;
  point: MapPoint;
  progressAtStop: number;
  passed: boolean;
}

export interface LiveTrackingSnapshot {
  status: 'Pre-Departure Staging' | 'En Route' | 'Approaching Terminal' | 'Arrived at Destination';
  progressPct: number;
  speedKmh: number;
  headingDeg: number;
  busPoint: MapPoint;
  originPoint: MapPoint;
  destinationPoint: MapPoint;
  distanceCoveredKm: number;
  distanceRemainingKm: number;
  distanceToNextStopKm: number;
  currentSegment: string;
  nextStop: TrackingWaypoint | null;
  nextStopEtaMinutes: number;
  etaMinutesRemaining: number;
  waypoints: TrackingWaypoint[];
  simulatedSource: 'schedule_clock' | 'manual_override';
}

const CITY_GEO: Record<string, GeoCoord> = {
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  paldi: { lat: 23.0126, lng: 72.5624 },
  'gita mandir': { lat: 23.0136, lng: 72.5912 },
  ctm: { lat: 22.9922, lng: 72.6311 },
  vadodara: { lat: 22.3072, lng: 73.1812 },
  bharuch: { lat: 21.7051, lng: 72.9959 },
  ankleshwar: { lat: 21.6264, lng: 73.0152 },
  kamrej: { lat: 21.2665, lng: 72.9571 },
  surat: { lat: 21.1702, lng: 72.8311 },
  adajan: { lat: 21.1959, lng: 72.7933 },
  vapi: { lat: 20.3893, lng: 72.9106 },
  rajkot: { lat: 22.3039, lng: 70.8022 },
  chotila: { lat: 22.4234, lng: 71.1965 },
  limbdi: { lat: 22.5646, lng: 71.8101 },
  bhavnagar: { lat: 21.7645, lng: 72.1519 },
  dholera: { lat: 22.2489, lng: 72.1929 },
  bhuj: { lat: 23.242, lng: 69.6669 },
  gandhidham: { lat: 23.0753, lng: 70.1337 },
  samakhiali: { lat: 23.3016, lng: 70.5067 },
  morbi: { lat: 22.812, lng: 70.8236 },
  jamnagar: { lat: 22.4707, lng: 70.0577 },
  junagadh: { lat: 21.5222, lng: 70.4579 },
};

// Gujarat bounding box projected onto 720x380 GPS map canvas
const MAP_BOUNDS = {
  minLat: 20.6,
  maxLat: 23.65,
  minLng: 69.1,
  maxLng: 73.5,
  width: 720,
  height: 380,
  padX: 64,
  padY: 48,
};

export function projectGeoToMap(coord: GeoCoord): MapPoint {
  const usableW = MAP_BOUNDS.width - MAP_BOUNDS.padX * 2;
  const usableH = MAP_BOUNDS.height - MAP_BOUNDS.padY * 2;
  const xRatio = (coord.lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng);
  const yRatio = (MAP_BOUNDS.maxLat - coord.lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);
  const x = Number((MAP_BOUNDS.padX + Math.max(0, Math.min(1, xRatio)) * usableW).toFixed(1));
  const y = Number((MAP_BOUNDS.padY + Math.max(0, Math.min(1, yRatio)) * usableH).toFixed(1));
  return {
    x,
    y,
    lat: Number(coord.lat.toFixed(4)),
    lng: Number(coord.lng.toFixed(4)),
  };
}

export function resolvePlaceCoord(name: string, fallback?: GeoCoord): GeoCoord {
  const normalized = name.toLowerCase().trim();
  for (const [key, coord] of Object.entries(CITY_GEO)) {
    if (normalized.includes(key)) {
      return coord;
    }
  }
  if (fallback) return fallback;
  // Deterministic hash fallback within Gujarat corridor
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 1000;
  }
  return {
    lat: 21.4 + (hash % 180) / 100,
    lng: 70.2 + ((hash >> 2) % 240) / 100,
  };
}

function parseTripScheduleWindow(
  journeyDate: string,
  departureTime: string,
  estimatedDurationMin: number
): { startMs: number; endMs: number } {
  const [y, m, d] = journeyDate.split('-').map((n) => Number(n));
  const [hh, mm] = departureTime.split(':').map((n) => Number(n));
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
    const now = Date.now();
    return { startMs: now - 30 * 60000, endMs: now + 300 * 60000 };
  }
  // Treat schedule timestamps in IST (+05:30) or consistent local epoch
  const start = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  const durationMs = Math.max(60, estimatedDurationMin || 300) * 60 * 1000;
  return { startMs: start, endMs: start + durationMs };
}

export function computeTripTrackingState(params: {
  trip: {
    journeyDate: string;
    departureTime: string;
    arrivalTime: string;
    tripCode?: string;
  };
  route: Pick<TravelRoute, 'origin' | 'destination' | 'distanceKm' | 'estimatedDurationMin'>;
  stops: TripStop[];
  nowMs?: number;
  overrideProgressPct?: number | null;
}): LiveTrackingSnapshot {
  const { trip, route, stops, nowMs = Date.now(), overrideProgressPct } = params;

  const originCoord = resolvePlaceCoord(route.origin);
  const destCoord = resolvePlaceCoord(route.destination);

  let rawRatio = 0;
  let simulatedSource: 'schedule_clock' | 'manual_override' = 'schedule_clock';

  if (typeof overrideProgressPct === 'number' && !Number.isNaN(overrideProgressPct)) {
    rawRatio = Math.max(0, Math.min(1, overrideProgressPct / 100));
    simulatedSource = 'manual_override';
  } else {
    const window = parseTripScheduleWindow(
      trip.journeyDate,
      trip.departureTime,
      route.estimatedDurationMin
    );
    if (nowMs <= window.startMs) {
      rawRatio = 0;
    } else if (nowMs >= window.endMs) {
      rawRatio = 1;
    } else {
      rawRatio = (nowMs - window.startMs) / (window.endMs - window.startMs);
    }
  }

  const progressPct = Math.round(rawRatio * 100);
  const sortedStops = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);

  // Build ordered corridor points from stops, or fall back to origin -> midpoint -> destination
  const waypoints: TrackingWaypoint[] = [];
  if (sortedStops.length >= 2) {
    const denom = Math.max(1, sortedStops.length - 1);
    sortedStops.forEach((s, idx) => {
      const stopRatio = idx / denom;
      const fallbackCoord: GeoCoord = {
        lat: originCoord.lat + (destCoord.lat - originCoord.lat) * stopRatio,
        lng: originCoord.lng + (destCoord.lng - originCoord.lng) * stopRatio,
      };
      // Use known stop coordinates if matched, otherwise interpolate subtly along corridor
      const matched = resolvePlaceCoord(s.stopName, fallbackCoord);
      // Slight lateral offset for consecutive stops in same city so pins remain distinct
      const jitterLat = matched === fallbackCoord ? 0 : (idx % 2 === 0 ? 0.012 : -0.012);
      const point = projectGeoToMap({
        lat: matched.lat + jitterLat,
        lng: matched.lng,
      });
      waypoints.push({
        id: s.id,
        label: s.stopName,
        stopType: s.stopType,
        scheduledTime: s.scheduledTime,
        landmark: s.landmark,
        point,
        progressAtStop: Math.round(stopRatio * 100),
        passed: progressPct >= Math.round(stopRatio * 100),
      });
    });
  } else {
    const origPt = projectGeoToMap(originCoord);
    const destPt = projectGeoToMap(destCoord);
    waypoints.push(
      {
        id: 'origin',
        label: route.origin,
        stopType: 'pickup',
        scheduledTime: trip.departureTime,
        landmark: 'Primary Departure Terminal',
        point: origPt,
        progressAtStop: 0,
        passed: progressPct >= 0,
      },
      {
        id: 'destination',
        label: route.destination,
        stopType: 'drop',
        scheduledTime: trip.arrivalTime,
        landmark: 'Primary Arrival Terminal',
        point: destPt,
        progressAtStop: 100,
        passed: progressPct >= 100,
      }
    );
  }

  // Interpolate bus position across waypoint segments
  let busLat = originCoord.lat;
  let busLng = originCoord.lng;
  let currentSegment = `${route.origin} Departure Bay`;
  let headingDeg = Math.round(
    (Math.atan2(destCoord.lng - originCoord.lng, destCoord.lat - originCoord.lat) * 180) / Math.PI
  );

  if (waypoints.length >= 2) {
    const scaled = rawRatio * (waypoints.length - 1);
    const segIdx = Math.min(waypoints.length - 2, Math.floor(scaled));
    const localT = scaled - segIdx;
    const fromWp = waypoints[segIdx];
    const toWp = waypoints[segIdx + 1];
    busLat = fromWp.point.lat + (toWp.point.lat - fromWp.point.lat) * localT;
    busLng = fromWp.point.lng + (toWp.point.lng - fromWp.point.lng) * localT;
    currentSegment = `${fromWp.label} → ${toWp.label}`;
    headingDeg = Math.round(
      (Math.atan2(toWp.point.lng - fromWp.point.lng, toWp.point.lat - fromWp.point.lat) * 180) /
        Math.PI
    );
  }

  const busPoint = projectGeoToMap({ lat: busLat, lng: busLng });
  const totalKm = Math.max(10, route.distanceKm || 260);
  const distanceCoveredKm = Math.round(totalKm * rawRatio);
  const distanceRemainingKm = Math.max(0, totalKm - distanceCoveredKm);
  const etaMinutesRemaining = Math.max(
    0,
    Math.round((route.estimatedDurationMin || 300) * (1 - rawRatio))
  );

  const nextStop = waypoints.find((wp) => wp.progressAtStop > progressPct) || null;
  const nextStopDeltaRatio = nextStop
    ? Math.max(0, nextStop.progressAtStop / 100 - rawRatio)
    : 0;
  const distanceToNextStopKm = nextStop ? Math.max(0, Math.round(totalKm * nextStopDeltaRatio)) : 0;
  const nextStopEtaMinutes = nextStop
    ? Math.max(0, Math.round((route.estimatedDurationMin || 300) * nextStopDeltaRatio))
    : 0;

  let status: LiveTrackingSnapshot['status'] = 'En Route';
  let speedKmh = 68;
  if (progressPct <= 0) {
    status = 'Pre-Departure Staging';
    speedKmh = 0;
  } else if (progressPct >= 100) {
    status = 'Arrived at Destination';
    speedKmh = 0;
  } else if (progressPct >= 88) {
    status = 'Approaching Terminal';
    speedKmh = 46;
  } else {
    speedKmh = 66 + ((progressPct * 7) % 13);
  }

  return {
    status,
    progressPct,
    speedKmh,
    headingDeg: (headingDeg + 360) % 360,
    busPoint,
    originPoint: projectGeoToMap(originCoord),
    destinationPoint: projectGeoToMap(destCoord),
    distanceCoveredKm,
    distanceRemainingKm,
    distanceToNextStopKm,
    currentSegment,
    nextStop,
    nextStopEtaMinutes,
    etaMinutesRemaining,
    waypoints,
    simulatedSource,
  };
}
