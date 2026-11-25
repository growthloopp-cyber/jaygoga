import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTripTrackingState, projectGeoToMap } from './liveTracking.ts';

const sampleRoute = {
  origin: 'Ahmedabad',
  destination: 'Surat',
  distanceKm: 268,
  estimatedDurationMin: 360,
};

const sampleTrip = {
  journeyDate: '2026-12-01',
  departureTime: '22:00',
  arrivalTime: '04:00',
  tripCode: 'JGT-AHD-SUR-01',
};

const sampleStops = [
  { id: 1, tripId: 1, stopName: 'Paldi Head Office', stopType: 'pickup', landmark: 'Paldi Char Rasta', scheduledTime: '22:00', sortOrder: 1 },
  { id: 2, tripId: 1, stopName: 'CTM Cross Road', stopType: 'pickup', landmark: 'Expressway Toll', scheduledTime: '22:35', sortOrder: 2 },
  { id: 3, tripId: 1, stopName: 'Kamrej Char Rasta', stopType: 'drop', landmark: 'NH-48 Highway', scheduledTime: '03:15', sortOrder: 3 },
  { id: 4, tripId: 1, stopName: 'Adajan Patiya', stopType: 'drop', landmark: 'Adajan Circle', scheduledTime: '04:00', sortOrder: 4 },
];

test('projectGeoToMap maps Gujarat coordinates within viewport bounds', () => {
  const p = projectGeoToMap({ lat: 23.0225, lng: 72.5714 });
  assert.ok(p.x >= 60 && p.x <= 660);
  assert.ok(p.y >= 40 && p.y <= 340);
});

test('computeTripTrackingState reports Pre-Departure Staging before departure time', () => {
  const beforeDeparture = new Date(2026, 11, 1, 20, 0, 0).getTime();
  const snap = computeTripTrackingState({
    trip: sampleTrip,
    route: sampleRoute,
    stops: sampleStops,
    nowMs: beforeDeparture,
  });

  assert.equal(snap.status, 'Pre-Departure Staging');
  assert.equal(snap.progressPct, 0);
  assert.equal(snap.speedKmh, 0);
  assert.equal(snap.distanceCoveredKm, 0);
  assert.equal(snap.distanceRemainingKm, 268);
});

test('computeTripTrackingState tracks midway progress from schedule clock accurately', () => {
  const midway = new Date(2026, 11, 2, 1, 0, 0).getTime(); // 3h into 6h trip
  const snap = computeTripTrackingState({
    trip: sampleTrip,
    route: sampleRoute,
    stops: sampleStops,
    nowMs: midway,
  });

  assert.equal(snap.status, 'En Route');
  assert.equal(snap.progressPct, 50);
  assert.ok(snap.speedKmh >= 60);
  assert.equal(snap.distanceCoveredKm, 134);
  assert.equal(snap.distanceRemainingKm, 134);
  assert.equal(snap.etaMinutesRemaining, 180);
  assert.ok(snap.nextStop !== null);
  assert.ok(snap.distanceToNextStopKm > 0 && snap.distanceToNextStopKm <= snap.distanceRemainingKm);
  assert.ok(snap.nextStopEtaMinutes > 0 && snap.nextStopEtaMinutes <= snap.etaMinutesRemaining);
});

test('computeTripTrackingState supports manual simulation override without fallback mismatch', () => {
  const snap = computeTripTrackingState({
    trip: sampleTrip,
    route: sampleRoute,
    stops: sampleStops,
    overrideProgressPct: 92,
  });

  assert.equal(snap.simulatedSource, 'manual_override');
  assert.equal(snap.status, 'Approaching Terminal');
  assert.equal(snap.progressPct, 92);
  assert.equal(snap.nextStop?.label, 'Adajan Patiya');
  assert.equal(snap.distanceToNextStopKm, 21);
  assert.equal(snap.nextStopEtaMinutes, 29);
});

test('computeTripTrackingState clears next-stop distance and ETA upon arrival at 100%', () => {
  const snap = computeTripTrackingState({
    trip: sampleTrip,
    route: sampleRoute,
    stops: sampleStops,
    overrideProgressPct: 100,
  });

  assert.equal(snap.status, 'Arrived at Destination');
  assert.equal(snap.nextStop, null);
  assert.equal(snap.distanceToNextStopKm, 0);
  assert.equal(snap.nextStopEtaMinutes, 0);
});
