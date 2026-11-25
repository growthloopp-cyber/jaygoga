import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  auditLogs,
  berthLayouts,
  berths,
  bookingBerths,
  bookings,
  busImages,
  buses,
  companySettings,
  counters,
  coupons,
  notifications,
  otpChallenges,
  passengers,
  payments,
  profiles,
  refunds,
  routeStops,
  routes,
  seatLocks,
  staff,
  tripBerths,
  tripStops,
  trips,
} from './src/db/schema.ts';
import { createTripWithBerthsAndStops, ensureSeeded } from './src/db/seed.ts';
import {
  type AuthRequest,
  hashSecret,
  optionalAuth,
  requireAdmin,
  requireAuth,
  requireStaffOrAdmin,
  signSessionToken,
  verifySecret,
} from './src/middleware/auth.ts';
import {
  calculateCancellationRefund,
  calculateFareBreakdown,
  generatePnrCode,
  validateBerthGenderSelection,
} from './src/utils/bookingRules.ts';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TEST_ORDER_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Capture raw body for Razorpay webhook verification
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

function signTestOrder(orderId: string, bookingId: number, amount: number): string {
  return crypto
    .createHmac('sha256', TEST_ORDER_SECRET)
    .update(`${orderId}|${bookingId}|${amount}`)
    .digest('hex');
}

async function logAudit(
  actorUid: string,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {}
) {
  try {
    await db.insert(auditLogs).values({
      actorUid,
      actorEmail,
      action,
      entityType,
      entityId,
      details,
    });
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}

// Lazy seed check for API routes
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  try {
    await ensureSeeded();
    next();
  } catch (err) {
    console.error('Database initialization error:', err);
    res.status(503).json({ error: 'Database is initializing. Please retry shortly.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'jay-goga-travels' });
});

// ========================
// PUBLIC BOOTSTRAP & SEARCH
// ========================
app.get('/api/bootstrap', async (_req, res) => {
  try {
    const [settings] = await db.select().from(companySettings).limit(1);
    const activeRoutes = await db
      .select()
      .from(routes)
      .where(eq(routes.isActive, true));
    const allStops = await db.select().from(routeStops);
    const activeBuses = await db
      .select()
      .from(buses)
      .where(eq(buses.status, 'active'));
    const allLayouts = await db.select().from(berthLayouts);
    const activeCoupons = await db
      .select({
        code: coupons.code,
        description: coupons.description,
        discountType: coupons.discountType,
        discountValue: coupons.discountValue,
        minAmount: coupons.minAmount,
      })
      .from(coupons)
      .where(eq(coupons.isActive, true));

    const routesWithStops = activeRoutes.map((r) => ({
      ...r,
      stops: allStops
        .filter((s) => s.routeId === r.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    const origins = Array.from(new Set(activeRoutes.map((r) => r.origin))).sort();
    const destinations = Array.from(new Set(activeRoutes.map((r) => r.destination))).sort();

    res.json({
      settings: settings || null,
      routes: routesWithStops,
      buses: activeBuses,
      layouts: allLayouts,
      coupons: activeCoupons,
      cities: Array.from(new Set([...origins, ...destinations])).sort(),
      razorpayConfigured: Boolean(
        process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
      ),
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    });
  } catch (err) {
    console.error('Bootstrap failed:', err);
    res.status(500).json({ error: 'Failed to load travel catalog' });
  }
});

app.get('/api/trips/search', async (req, res) => {
  try {
    const origin = String(req.query.origin || '').trim();
    const destination = String(req.query.destination || '').trim();
    const date = String(req.query.date || '').trim();
    const sortBy = String(req.query.sortBy || 'departure');

    // Clean expired seat locks first
    await db.delete(seatLocks).where(sql`${seatLocks.expiresAt} <= NOW()`);

    const allRoutes = await db.select().from(routes).where(eq(routes.isActive, true));
    const matchingRouteIds = allRoutes
      .filter((r) => {
        const matchOrigin =
          !origin || r.origin.toLowerCase() === origin.toLowerCase();
        const matchDest =
          !destination || r.destination.toLowerCase() === destination.toLowerCase();
        return matchOrigin && matchDest;
      })
      .map((r) => r.id);

    if (matchingRouteIds.length === 0) {
      return res.json({ trips: [] });
    }

    const tripRows = await db
      .select()
      .from(trips)
      .where(
        and(
          inArray(trips.routeId, matchingRouteIds),
          date ? eq(trips.journeyDate, date) : sql`true`
        )
      );

    const activeTrips = tripRows.filter((t) => t.status !== 'cancelled');
    if (activeTrips.length === 0) {
      return res.json({ trips: [] });
    }

    const tripIds = activeTrips.map((t) => t.id);
    const busIds = Array.from(new Set(activeTrips.map((t) => t.busId)));

    const [busRows, berthRows, lockRows, stopRows] = await Promise.all([
      db.select().from(buses).where(inArray(buses.id, busIds)),
      db.select().from(tripBerths).where(inArray(tripBerths.tripId, tripIds)),
      db
        .select()
        .from(seatLocks)
        .where(and(inArray(seatLocks.tripId, tripIds), gt(seatLocks.expiresAt, new Date()))),
      db.select().from(tripStops).where(inArray(tripStops.tripId, tripIds)),
    ]);

    const enriched = activeTrips.map((trip) => {
      const route = allRoutes.find((r) => r.id === trip.routeId)!;
      const bus = busRows.find((b) => b.id === trip.busId)!;
      const tBerths = berthRows.filter((tb) => tb.tripId === trip.id);
      const lockedSet = new Set(
        lockRows.filter((l) => l.tripId === trip.id).map((l) => l.tripBerthId)
      );
      const availableBerths = tBerths.filter(
        (tb) => tb.status === 'available' && !lockedSet.has(tb.id)
      );
      const minFare =
        tBerths.length > 0
          ? Math.min(...tBerths.filter((b) => b.status !== 'disabled').map((b) => b.fare))
          : trip.baseFare;
      const stops = stopRows
        .filter((s) => s.tripId === trip.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      return {
        ...trip,
        route,
        bus,
        availableBerthCount: availableBerths.length,
        totalBerthCount: tBerths.filter((b) => b.status !== 'disabled').length,
        startingFare: minFare,
        stops,
      };
    });

    enriched.sort((a, b) => {
      if (sortBy === 'price') return a.startingFare - b.startingFare;
      if (sortBy === 'arrival') return a.arrivalTime.localeCompare(b.arrivalTime);
      return a.departureTime.localeCompare(b.departureTime);
    });

    res.json({ trips: enriched });
  } catch (err) {
    console.error('Trip search failed:', err);
    res.status(500).json({ error: 'Failed to search trips' });
  }
});

app.get('/api/trips/:id/berths', async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    const sessionToken = String(req.query.sessionToken || '');
    if (!Number.isFinite(tripId)) {
      return res.status(400).json({ error: 'Invalid trip ID' });
    }

    await db.delete(seatLocks).where(sql`${seatLocks.expiresAt} <= NOW()`);

    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const [route] = await db.select().from(routes).where(eq(routes.id, trip.routeId)).limit(1);
    const [bus] = await db.select().from(buses).where(eq(buses.id, trip.busId)).limit(1);
    const [layout] = await db
      .select()
      .from(berthLayouts)
      .where(eq(berthLayouts.id, bus.layoutId))
      .limit(1);
    const images = await db
      .select()
      .from(busImages)
      .where(eq(busImages.busId, bus.id));
    const tBerths = await db
      .select()
      .from(tripBerths)
      .where(eq(tripBerths.tripId, tripId));
    const locks = await db
      .select()
      .from(seatLocks)
      .where(and(eq(seatLocks.tripId, tripId), gt(seatLocks.expiresAt, new Date())));
    const stops = await db
      .select()
      .from(tripStops)
      .where(eq(tripStops.tripId, tripId));

    const lockMap = new Map(locks.map((l) => [l.tripBerthId, l]));

    const berthsWithState = tBerths
      .sort((a, b) => {
        if (a.deck !== b.deck) return a.deck === 'lower' ? -1 : 1;
        if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
        return a.colIndex - b.colIndex;
      })
      .map((tb) => {
        const lock = lockMap.get(tb.id);
        let liveStatus: string = tb.status;
        let lockExpiresAt: string | null = null;
        if (tb.status === 'available' && lock) {
          liveStatus =
            sessionToken && lock.sessionToken === sessionToken
              ? 'locked_by_me'
              : 'locked_by_other';
          lockExpiresAt = lock.expiresAt.toISOString();
        }
        return {
          ...tb,
          liveStatus,
          lockExpiresAt,
        };
      });

    res.json({
      trip,
      route,
      bus: { ...bus, images, layout },
      stops: stops.sort((a, b) => a.sortOrder - b.sortOrder),
      berths: berthsWithState,
    });
  } catch (err) {
    console.error('Fetch berths failed:', err);
    res.status(500).json({ error: 'Failed to load berth layout' });
  }
});

app.post('/api/trips/:id/locks', async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    const { tripBerthIds, sessionToken } = req.body as {
      tripBerthIds: number[];
      sessionToken: string;
    };
    if (!Number.isFinite(tripId) || !sessionToken || !Array.isArray(tripBerthIds)) {
      return res.status(400).json({ error: 'Trip ID, berth IDs, and sessionToken are required' });
    }

    const uniqueIds = Array.from(new Set(tripBerthIds.map(Number))).filter(Number.isFinite);
    if (uniqueIds.length === 0) {
      await db
        .delete(seatLocks)
        .where(and(eq(seatLocks.tripId, tripId), eq(seatLocks.sessionToken, sessionToken)));
      return res.json({ lockedIds: [], expiresAt: null });
    }
    if (uniqueIds.length > 6) {
      return res.status(400).json({ error: 'Maximum 6 berths can be booked in a single transaction' });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min lock

    await db.transaction(async (tx) => {
      // Purge expired locks and previous locks held by this session on this trip
      await tx.delete(seatLocks).where(sql`${seatLocks.expiresAt} <= NOW()`);
      await tx
        .delete(seatLocks)
        .where(and(eq(seatLocks.tripId, tripId), eq(seatLocks.sessionToken, sessionToken)));

      const lockedBerths = await tx
        .select()
        .from(tripBerths)
        .where(and(eq(tripBerths.tripId, tripId), inArray(tripBerths.id, uniqueIds)))
        .for('update');

      if (lockedBerths.length !== uniqueIds.length) {
        throw new Error('One or more selected berths do not belong to this trip.');
      }

      for (const b of lockedBerths) {
        if (b.status !== 'available') {
          throw new Error(`Berth ${b.berthNumber} is no longer available.`);
        }
      }

      const existingLocks = await tx
        .select()
        .from(seatLocks)
        .where(and(eq(seatLocks.tripId, tripId), inArray(seatLocks.tripBerthId, uniqueIds)));

      if (existingLocks.length > 0) {
        throw new Error('One or more selected berths are currently locked by another passenger.');
      }

      await tx.insert(seatLocks).values(
        uniqueIds.map((tbId) => ({
          tripId,
          tripBerthId: tbId,
          sessionToken,
          expiresAt,
        }))
      );
    });

    res.json({ lockedIds: uniqueIds, expiresAt: expiresAt.toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to lock selected berths';
    res.status(409).json({ error: message });
  }
});

app.delete('/api/trips/:id/locks', async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    const sessionToken = String(req.query.sessionToken || req.body?.sessionToken || '');
    if (Number.isFinite(tripId) && sessionToken) {
      await db
        .delete(seatLocks)
        .where(and(eq(seatLocks.tripId, tripId), eq(seatLocks.sessionToken, sessionToken)));
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to release seat locks' });
  }
});

app.post('/api/coupons/validate', async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const subtotal = Number(req.body?.subtotal || 0);
    if (!code) return res.status(400).json({ error: 'Enter a coupon code' });

    const [coupon] = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.code, code), eq(coupons.isActive, true)))
      .limit(1);

    if (!coupon) return res.status(404).json({ error: 'Invalid or inactive coupon code' });

    const today = new Date().toISOString().slice(0, 10);
    if (coupon.validUntil < today) {
      return res.status(400).json({ error: 'This coupon has expired' });
    }
    if (subtotal < coupon.minAmount) {
      return res.status(400).json({
        error: `Minimum berth subtotal of Rs. ${coupon.minAmount} required for ${coupon.code}`,
      });
    }

    const breakdown = calculateFareBreakdown({
      berthFares: [subtotal],
      coupon: {
        discountType: coupon.discountType as 'percent' | 'flat',
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
        minAmount: coupon.minAmount,
      },
    });

    res.json({
      valid: true,
      coupon,
      discountAmount: breakdown.discount,
      breakdown,
    });
  } catch (err) {
    console.error('Coupon validation error:', err);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

// ========================
// ONLINE BOOKING & RAZORPAY
// ========================
app.post('/api/bookings/online/initiate', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const {
      tripId,
      sessionToken,
      pickupStop,
      dropStop,
      couponCode,
      paymentMethod,
      customerName,
      customerPhone,
      customerEmail,
      passengers: passengerInputs,
    } = req.body as {
      tripId: number;
      sessionToken: string;
      pickupStop: string;
      dropStop: string;
      couponCode?: string;
      paymentMethod: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      passengers: Array<{
        tripBerthId: number;
        fullName: string;
        mobile: string;
        age: number;
        gender: 'male' | 'female' | 'other';
      }>;
    };

    const [settings] = await db.select().from(companySettings).limit(1);
    const guestAllowed = settings?.cmsContent?.guestBookingEnabled ?? true;
    if (!guestAllowed && !req.actor) {
      return res.status(401).json({ error: 'Please sign in before booking.' });
    }

    if (
      !tripId ||
      !sessionToken ||
      !pickupStop ||
      !dropStop ||
      !customerName?.trim() ||
      !/^\d{10}$/.test(String(customerPhone || '').replace(/\D/g, '').slice(-10)) ||
      !Array.isArray(passengerInputs) ||
      passengerInputs.length === 0
    ) {
      return res.status(400).json({
        error: 'Please fill passenger details, valid 10-digit mobile, and boarding/drop points.',
      });
    }

    for (const p of passengerInputs) {
      if (!p.fullName?.trim() || !p.age || p.age < 1 || p.age > 110) {
        return res.status(400).json({ error: 'Each passenger must have a valid name and age.' });
      }
    }

    const berthIds = passengerInputs.map((p) => Number(p.tripBerthId));
    const normalizedPhone = String(customerPhone).replace(/\D/g, '').slice(-10);

    let couponRow: typeof coupons.$inferSelect | null = null;
    if (couponCode?.trim()) {
      const [found] = await db
        .select()
        .from(coupons)
        .where(and(eq(coupons.code, couponCode.trim().toUpperCase()), eq(coupons.isActive, true)))
        .limit(1);
      if (!found) return res.status(400).json({ error: 'Invalid coupon code' });
      couponRow = found;
    }

    const createdResult = await db.transaction(async (tx) => {
      await tx.delete(seatLocks).where(sql`${seatLocks.expiresAt} <= NOW()`);

      const allTripBerths = await tx
        .select()
        .from(tripBerths)
        .where(eq(tripBerths.tripId, tripId))
        .for('update');

      const selectedBerths = allTripBerths.filter((b) => berthIds.includes(b.id));
      if (selectedBerths.length !== berthIds.length) {
        throw new Error('Selected berths do not match this trip.');
      }

      const locks = await tx
        .select()
        .from(seatLocks)
        .where(and(eq(seatLocks.tripId, tripId), inArray(seatLocks.tripBerthId, berthIds)));

      for (const p of passengerInputs) {
        const tb = selectedBerths.find((b) => b.id === Number(p.tripBerthId))!;
        const lock = locks.find((l) => l.tripBerthId === tb.id);
        if (lock && lock.sessionToken !== sessionToken) {
          throw new Error(`Berth ${tb.berthNumber} is currently held by another traveler.`);
        }
        const genderCheck = validateBerthGenderSelection(tb, p.gender, allTripBerths);
        if (!genderCheck.allowed) {
          throw new Error(genderCheck.reason || `Berth ${tb.berthNumber} cannot be booked.`);
        }
      }

      // Refresh or create 10-min seat locks for this checkout
      const lockExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await tx
        .delete(seatLocks)
        .where(and(eq(seatLocks.tripId, tripId), eq(seatLocks.sessionToken, sessionToken)));
      await tx.insert(seatLocks).values(
        berthIds.map((tbId) => ({
          tripId,
          tripBerthId: tbId,
          sessionToken,
          expiresAt: lockExpiry,
        }))
      );

      const breakdown = calculateFareBreakdown({
        berthFares: selectedBerths.map((b) => b.fare),
        coupon: couponRow
          ? {
              discountType: couponRow.discountType as 'percent' | 'flat',
              discountValue: couponRow.discountValue,
              maxDiscount: couponRow.maxDiscount,
              minAmount: couponRow.minAmount,
            }
          : null,
        gstPercent: 5,
      });

      const pnr = generatePnrCode('JGT');
      const qrPayload = JSON.stringify({
        pnr,
        tripId,
        berths: selectedBerths.map((b) => b.berthNumber),
        issuer: 'Jay Goga Travels',
      });

      const [booking] = await tx
        .insert(bookings)
        .values({
          pnr,
          tripId,
          profileId: req.actor?.profileId ?? null,
          customerName: customerName.trim(),
          customerPhone: normalizedPhone,
          customerEmail: (customerEmail || '').trim(),
          bookingChannel: 'online',
          pickupStop,
          dropStop,
          subtotalAmount: breakdown.subtotal,
          discountAmount: breakdown.discount,
          taxAmount: breakdown.tax,
          totalAmount: breakdown.total,
          couponCode: couponRow?.code ?? null,
          status: 'pending',
          paymentStatus: 'pending',
          paymentMethod: paymentMethod || 'razorpay_upi',
          qrPayload,
        })
        .returning();

      await tx.insert(passengers).values(
        passengerInputs.map((p) => {
          const tb = selectedBerths.find((b) => b.id === Number(p.tripBerthId))!;
          return {
            bookingId: booking.id,
            fullName: p.fullName.trim(),
            mobile: String(p.mobile || normalizedPhone).replace(/\D/g, '').slice(-10),
            age: Number(p.age),
            gender: p.gender,
            berthNumber: tb.berthNumber,
          };
        })
      );

      await tx.insert(bookingBerths).values(
        selectedBerths.map((tb) => ({
          bookingId: booking.id,
          tripId,
          tripBerthId: tb.id,
          berthNumber: tb.berthNumber,
          fare: tb.fare,
          isConfirmed: false,
        }))
      );

      return { booking, breakdown };
    });

    // Create Razorpay order server-side if credentials exist, else issue server-signed test-mode order
    const rzpKeyId = process.env.RAZORPAY_KEY_ID || '';
    const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
    const idempotencyKey = `ord_${createdResult.booking.id}_${Date.now()}`;
    const amountPaise = createdResult.breakdown.total * 100;

    let orderId = `order_test_${crypto.randomBytes(6).toString('hex')}`;
    let mode: 'razorpay_live_or_test' | 'test_sandbox' = 'test_sandbox';

    if (rzpKeyId && rzpKeySecret) {
      const authHeader = Buffer.from(`${rzpKeyId}:${rzpKeySecret}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: createdResult.booking.pnr,
          notes: {
            bookingId: String(createdResult.booking.id),
            pnr: createdResult.booking.pnr,
          },
        }),
      });
      if (!rzpRes.ok) {
        const errText = await rzpRes.text();
        throw new Error(`Razorpay order creation failed: ${errText}`);
      }
      const rzpOrder = (await rzpRes.json()) as { id: string };
      orderId = rzpOrder.id;
      mode = 'razorpay_live_or_test';
    }

    await db.insert(payments).values({
      bookingId: createdResult.booking.id,
      gateway: 'razorpay',
      razorpayOrderId: orderId,
      idempotencyKey,
      method: paymentMethod || 'razorpay_upi',
      amount: createdResult.breakdown.total,
      currency: 'INR',
      status: 'created',
    });

    const testOrderToken =
      mode === 'test_sandbox'
        ? signTestOrder(orderId, createdResult.booking.id, createdResult.breakdown.total)
        : undefined;

    res.json({
      bookingId: createdResult.booking.id,
      pnr: createdResult.booking.pnr,
      orderId,
      amountPaise,
      totalAmount: createdResult.breakdown.total,
      currency: 'INR',
      mode,
      razorpayKeyId: rzpKeyId,
      testOrderToken,
      breakdown: createdResult.breakdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to initiate booking';
    res.status(400).json({ error: message });
  }
});

async function finalizeConfirmedBooking(params: {
  bookingId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  method: string;
}) {
  return await db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, params.bookingId))
      .for('update');
    if (!booking) throw new Error('Booking record not found');

    // Idempotent check
    if (booking.status === 'confirmed' && booking.paymentStatus === 'paid') {
      return booking;
    }

    const bBerths = await tx
      .select()
      .from(bookingBerths)
      .where(eq(bookingBerths.bookingId, booking.id));
    const bPassengers = await tx
      .select()
      .from(passengers)
      .where(eq(passengers.bookingId, booking.id));

    const tbIds = bBerths.map((bb) => bb.tripBerthId);
    const lockedTripBerths = await tx
      .select()
      .from(tripBerths)
      .where(inArray(tripBerths.id, tbIds))
      .for('update');

    for (const tb of lockedTripBerths) {
      if (tb.status !== 'available') {
        throw new Error(
          `Berth ${tb.berthNumber} was already confirmed by another transaction. Payment flagged for refund.`
        );
      }
      const pax = bPassengers.find((p) => p.berthNumber === tb.berthNumber);
      await tx
        .update(tripBerths)
        .set({
          status: 'booked',
          genderBooked: pax?.gender || 'other',
        })
        .where(eq(tripBerths.id, tb.id));
    }

    await tx
      .update(bookingBerths)
      .set({ isConfirmed: true })
      .where(eq(bookingBerths.bookingId, booking.id));

    await tx
      .delete(seatLocks)
      .where(and(eq(seatLocks.tripId, booking.tripId), inArray(seatLocks.tripBerthId, tbIds)));

    const [updatedBooking] = await tx
      .update(bookings)
      .set({
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: params.method || booking.paymentMethod,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
      .returning();

    await tx
      .update(payments)
      .set({
        razorpayPaymentId: params.razorpayPaymentId,
        razorpaySignature: params.razorpaySignature,
        status: 'captured',
        method: params.method || booking.paymentMethod,
      })
      .where(eq(payments.razorpayOrderId, params.razorpayOrderId));

    await tx.insert(notifications).values({
      bookingId: booking.id,
      channel: 'sms',
      recipient: booking.customerPhone,
      message: `Jay Goga Travels: Booking ${booking.pnr} confirmed. Berths: ${bBerths
        .map((b) => b.berthNumber)
        .join(', ')}. Pickup: ${booking.pickupStop}.`,
      status: 'not_configured',
      providerNote: 'SMS/WhatsApp gateway credentials not configured; logged in booking record.',
    });

    return updatedBooking;
  });
}

app.post('/api/payments/razorpay/verify', async (req, res) => {
  try {
    const {
      bookingId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      testOrderToken,
      method,
    } = req.body as {
      bookingId: number;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature?: string;
      testOrderToken?: string;
      method?: string;
    };

    const [paymentRow] = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayOrderId, razorpayOrderId))
      .limit(1);

    if (!paymentRow || paymentRow.bookingId !== Number(bookingId)) {
      return res.status(404).json({ error: 'Payment order not found' });
    }

    const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (rzpKeySecret && !razorpayOrderId.startsWith('order_test_')) {
      const expected = crypto
        .createHmac('sha256', rzpKeySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');
      if (!razorpaySignature || expected !== razorpaySignature) {
        await db
          .update(payments)
          .set({ status: 'failed' })
          .where(eq(payments.id, paymentRow.id));
        await db
          .update(bookings)
          .set({ status: 'payment_failed', paymentStatus: 'failed', updatedAt: new Date() })
          .where(eq(bookings.id, paymentRow.bookingId));
        return res.status(400).json({ error: 'Razorpay cryptographic signature verification failed' });
      }
    } else {
      const expectedToken = signTestOrder(razorpayOrderId, paymentRow.bookingId, paymentRow.amount);
      if (!testOrderToken || testOrderToken !== expectedToken) {
        return res.status(400).json({ error: 'Invalid test-mode order verification token' });
      }
    }

    const confirmed = await finalizeConfirmedBooking({
      bookingId: paymentRow.bookingId,
      razorpayOrderId,
      razorpayPaymentId: razorpayPaymentId || `pay_test_${crypto.randomBytes(6).toString('hex')}`,
      razorpaySignature: razorpaySignature || 'verified_test_mode',
      method: method || paymentRow.method,
    });

    const ticket = await loadFullTicket(confirmed.id);
    res.json({ ok: true, ticket });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payment confirmation failed';
    res.status(409).json({ error: message });
  }
});

app.post('/api/payments/razorpay/fail', async (req, res) => {
  try {
    const { bookingId, razorpayOrderId, reason } = req.body as {
      bookingId: number;
      razorpayOrderId: string;
      reason?: string;
    };

    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: 'failed', rawPayload: { reason: reason || 'Cancelled by user' } })
        .where(eq(payments.razorpayOrderId, razorpayOrderId));

      const [bk] = await tx
        .update(bookings)
        .set({ status: 'payment_failed', paymentStatus: 'failed', updatedAt: new Date() })
        .where(eq(bookings.id, Number(bookingId)))
        .returning();

      if (bk) {
        const bBerths = await tx
          .select()
          .from(bookingBerths)
          .where(eq(bookingBerths.bookingId, bk.id));
        const tbIds = bBerths.map((b) => b.tripBerthId);
        if (tbIds.length > 0) {
          await tx
            .delete(seatLocks)
            .where(and(eq(seatLocks.tripId, bk.tripId), inArray(seatLocks.tripBerthId, tbIds)));
        }
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Mark payment failed error:', err);
    res.status(500).json({ error: 'Failed to record payment cancellation' });
  }
});

app.post('/api/payments/razorpay/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (!webhookSecret) {
      return res.status(503).json({ error: 'Webhook secret not configured' });
    }
    const sig = String(req.headers['x-razorpay-signature'] || '');
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) return res.status(400).json({ error: 'Missing raw payload' });

    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    if (sig !== expected) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body as {
      event: string;
      payload?: { payment?: { entity?: { id: string; order_id: string; method?: string } } };
    };

    const payEntity = event.payload?.payment?.entity;
    if (event.event === 'payment.captured' && payEntity?.order_id) {
      const [payRow] = await db
        .select()
        .from(payments)
        .where(eq(payments.razorpayOrderId, payEntity.order_id))
        .limit(1);
      if (payRow) {
        await finalizeConfirmedBooking({
          bookingId: payRow.bookingId,
          razorpayOrderId: payEntity.order_id,
          razorpayPaymentId: payEntity.id,
          razorpaySignature: sig,
          method: payEntity.method || 'razorpay',
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function loadFullTicket(bookingId: number) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return null;
  const [trip] = await db.select().from(trips).where(eq(trips.id, booking.tripId)).limit(1);
  const [route] = await db.select().from(routes).where(eq(routes.id, trip.routeId)).limit(1);
  const [bus] = await db.select().from(buses).where(eq(buses.id, trip.busId)).limit(1);
  const pax = await db.select().from(passengers).where(eq(passengers.bookingId, booking.id));
  const bBerths = await db.select().from(bookingBerths).where(eq(bookingBerths.bookingId, booking.id));
  const payRows = await db.select().from(payments).where(eq(payments.bookingId, booking.id));
  const [settings] = await db.select().from(companySettings).limit(1);

  return {
    booking,
    trip,
    route,
    bus,
    passengers: pax,
    berths: bBerths,
    payments: payRows,
    company: settings || null,
  };
}

app.get('/api/bookings/lookup', async (req, res) => {
  try {
    const pnr = String(req.query.pnr || '').trim().toUpperCase();
    const phone = String(req.query.phone || '').replace(/\D/g, '').slice(-10);
    if (!pnr) return res.status(400).json({ error: 'PNR is required' });

    const [booking] = await db.select().from(bookings).where(eq(bookings.pnr, pnr)).limit(1);
    if (!booking) return res.status(404).json({ error: 'No booking found with that PNR' });

    if (phone && booking.customerPhone !== phone) {
      return res.status(403).json({ error: 'Mobile number does not match this PNR' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Enter registered 10-digit mobile number to verify' });
    }

    const ticket = await loadFullTicket(booking.id);
    res.json({ ticket });
  } catch (err) {
    console.error('PNR lookup error:', err);
    res.status(500).json({ error: 'Failed to look up PNR' });
  }
});

app.post('/api/bookings/:id/cancel', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const bookingId = Number(req.params.id);
    const { pnr, phone, reason } = req.body as {
      pnr?: string;
      phone?: string;
      reason?: string;
    };

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isStaffOrAdmin = req.actor?.role === 'admin' || req.actor?.role === 'counter_staff';
    const isOwnerProfile = req.actor?.profileId && booking.profileId === req.actor.profileId;
    const isVerifiedLookup =
      pnr?.trim().toUpperCase() === booking.pnr &&
      String(phone || '').replace(/\D/g, '').slice(-10) === booking.customerPhone;

    if (!isStaffOrAdmin && !isOwnerProfile && !isVerifiedLookup) {
      return res.status(403).json({ error: 'Unauthorized to cancel this booking' });
    }

    if (booking.status === 'cancelled' || booking.status === 'refunded') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    const [trip] = await db.select().from(trips).where(eq(trips.id, booking.tripId)).limit(1);
    const departureDt = new Date(`${trip.journeyDate}T${trip.departureTime}:00`);
    const hoursBefore = (departureDt.getTime() - Date.now()) / (1000 * 60 * 60);
    const refundCalc = calculateCancellationRefund(booking.totalAmount, hoursBefore);

    const updated = await db.transaction(async (tx) => {
      const bBerths = await tx
        .select()
        .from(bookingBerths)
        .where(eq(bookingBerths.bookingId, booking.id));
      const tbIds = bBerths.map((b) => b.tripBerthId);

      if (tbIds.length > 0) {
        await tx
          .update(tripBerths)
          .set({ status: 'available', genderBooked: null })
          .where(inArray(tripBerths.id, tbIds));
        await tx
          .update(bookingBerths)
          .set({ isConfirmed: false })
          .where(eq(bookingBerths.bookingId, booking.id));
      }

      const nextStatus =
        booking.paymentStatus === 'paid' && refundCalc.refundAmount > 0
          ? 'refund_pending'
          : 'cancelled';

      const [bk] = await tx
        .update(bookings)
        .set({
          status: nextStatus,
          paymentStatus:
            booking.paymentStatus === 'paid' && refundCalc.refundAmount > 0
              ? 'refund_pending'
              : booking.paymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id))
        .returning();

      if (booking.paymentStatus === 'paid' && refundCalc.refundAmount > 0) {
        const [payRow] = await tx
          .select()
          .from(payments)
          .where(eq(payments.bookingId, booking.id))
          .limit(1);
        await tx.insert(refunds).values({
          bookingId: booking.id,
          paymentId: payRow?.id ?? null,
          amount: refundCalc.refundAmount,
          reason: `${reason || 'Customer cancellation'} (${refundCalc.policyTier})`,
          status: 'pending',
        });
      }

      return bk;
    });

    await logAudit(
      req.actor?.uid || `customer:${booking.customerPhone}`,
      req.actor?.email || '',
      'CANCEL_BOOKING',
      'booking',
      String(booking.id),
      { pnr: booking.pnr, refundAmount: refundCalc.refundAmount, reason: reason || '' }
    );

    res.json({ ok: true, booking: updated, refund: refundCalc });
  } catch (err) {
    console.error('Cancel booking error:', err);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// ========================
// AUTHENTICATION ENDPOINTS
// ========================
app.post('/api/auth/sync', requireAuth, (req: AuthRequest, res) => {
  res.json({ actor: req.actor });
});

app.post('/api/auth/otp/request', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number' });
    }
    const code = String(crypto.randomInt(100000, 999999));
    const codeHash = hashSecret(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.insert(otpChallenges).values({
      phone,
      codeHash,
      expiresAt,
      verified: false,
    });

    // Only expose preview verification code when external SMS gateway is not configured
    const smsConfigured = Boolean(process.env.SMS_API_KEY);
    res.json({
      ok: true,
      phone,
      smsConfigured,
      previewOtp: smsConfigured ? undefined : code,
      message: smsConfigured
        ? 'OTP sent to your mobile number.'
        : 'SMS gateway not configured in environment; use the preview verification code shown below.',
    });
  } catch (err) {
    console.error('OTP request error:', err);
    res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

app.post('/api/auth/otp/verify', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
    const code = String(req.body?.code || '').trim();
    const fullName = String(req.body?.fullName || '').trim();

    if (!/^\d{10}$/.test(phone) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Valid 10-digit mobile and 6-digit OTP required' });
    }

    const [challenge] = await db
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), eq(otpChallenges.verified, false)))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP expired or not found. Request a new code.' });
    }

    if (!verifySecret(code, challenge.codeHash)) {
      return res.status(400).json({ error: 'Incorrect OTP code' });
    }

    await db
      .update(otpChallenges)
      .set({ verified: true })
      .where(eq(otpChallenges.id, challenge.id));

    const uid = `otp:${phone}`;
    const existing = await db.select().from(profiles).where(eq(profiles.uid, uid)).limit(1);
    const safeOtpRole = existing[0]?.role === 'counter_staff' ? 'counter_staff' : 'customer';
    const [profile] = await db
      .insert(profiles)
      .values({
        uid,
        phone,
        fullName: fullName || existing[0]?.fullName || `Traveler ${phone.slice(-4)}`,
        role: safeOtpRole,
      })
      .onConflictDoUpdate({
        target: profiles.uid,
        set: {
          phone,
          fullName: fullName || existing[0]?.fullName || `Traveler ${phone.slice(-4)}`,
          role: safeOtpRole,
        },
      })
      .returning();

    const actor = {
      uid: profile.uid,
      profileId: profile.id,
      staffId: null,
      counterId: null,
      email: profile.email,
      phone: profile.phone,
      fullName: profile.fullName,
      role: safeOtpRole as 'customer' | 'counter_staff',
      authProvider: 'otp' as const,
    };
    const token = signSessionToken(actor);
    res.json({ token, actor });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

app.get('/api/auth/staff-status', async (_req, res) => {
  try {
    const allStaff = await db
      .select({
        id: staff.id,
        staffCode: staff.staffCode,
        name: staff.name,
        role: staff.role,
        counterId: staff.counterId,
        hasPasscode: sql<boolean>`length(${staff.passcodeHash}) > 0`,
      })
      .from(staff)
      .where(eq(staff.isActive, true));

    const counterStaffOnly = allStaff.filter((s) => s.role !== 'admin');

    const activeCounters = await db
      .select({ id: counters.id, code: counters.code, name: counters.name, city: counters.city })
      .from(counters)
      .where(eq(counters.isActive, true));

    res.json({
      staffList: counterStaffOnly.map((s) => ({
        staffCode: s.staffCode,
        name: s.name,
        role: s.role,
        hasPasscode: s.hasPasscode,
      })),
      counters: activeCounters,
    });
  } catch (err) {
    console.error('Staff status error:', err);
    res.status(500).json({ error: 'Failed to read staff status' });
  }
});

app.post('/api/auth/staff-login', async (req, res) => {
  try {
    const staffCode = String(req.body?.staffCode || 'STF-101').trim().toUpperCase();
    const passcode = String(req.body?.passcode || '');

    if (!passcode) {
      return res.status(400).json({ error: 'Passcode is required' });
    }

    if (staffCode === 'ADM-001') {
      return res.status(403).json({
        error: 'Administrator access uses the normal Sign In option with the authorized admin email.',
      });
    }

    const [staffRow] = await db
      .select()
      .from(staff)
      .where(and(eq(staff.staffCode, staffCode), eq(staff.isActive, true)))
      .limit(1);

    if (staffRow?.role === 'admin') {
      return res.status(403).json({
        error: 'Administrator access uses the normal Sign In option with the authorized admin email.',
      });
    }

    if (!staffRow || !staffRow.passcodeHash || !verifySecret(passcode, staffRow.passcodeHash)) {
      return res.status(401).json({ error: 'Invalid counter staff code or passcode' });
    }

    const actor = {
      uid: `staff:${staffRow.staffCode}`,
      profileId: staffRow.profileId,
      staffId: staffRow.id,
      counterId: staffRow.counterId,
      email: staffRow.email,
      phone: staffRow.phone,
      fullName: staffRow.name,
      role: 'counter_staff' as const,
      authProvider: 'staff_passcode' as const,
    };
    res.json({ token: signSessionToken(actor), actor });
  } catch (err) {
    console.error('Staff login error:', err);
    res.status(500).json({ error: 'Sign in failed' });
  }
});

app.get('/api/customer/bookings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const actor = req.actor!;
    const rows = await db
      .select()
      .from(bookings)
      .where(
        actor.profileId
          ? actor.phone
            ? sql`${bookings.profileId} = ${actor.profileId} OR ${bookings.customerPhone} = ${actor.phone}`
            : eq(bookings.profileId, actor.profileId)
          : eq(bookings.customerPhone, actor.phone)
      )
      .orderBy(desc(bookings.createdAt));

    const tickets = await Promise.all(rows.map((r) => loadFullTicket(r.id)));
    res.json({ bookings: tickets.filter(Boolean) });
  } catch (err) {
    console.error('Customer bookings error:', err);
    res.status(500).json({ error: 'Failed to load your bookings' });
  }
});

// ========================
// COUNTER DESK ENDPOINTS
// ========================
app.get('/api/counter/context', requireStaffOrAdmin, async (req: AuthRequest, res) => {
  try {
    const activeCounters = await db
      .select()
      .from(counters)
      .where(eq(counters.isActive, true));
    const recentCounterBookings = await db
      .select()
      .from(bookings)
      .where(inArray(bookings.bookingChannel, ['counter', 'cash']))
      .orderBy(desc(bookings.createdAt))
      .limit(25);

    const tickets = await Promise.all(recentCounterBookings.map((b) => loadFullTicket(b.id)));

    res.json({
      actor: req.actor,
      counters: activeCounters,
      recentBookings: tickets.filter(Boolean),
    });
  } catch (err) {
    console.error('Counter context error:', err);
    res.status(500).json({ error: 'Failed to load counter desk' });
  }
});

app.post('/api/bookings/counter', requireStaffOrAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      tripId,
      counterId,
      pickupStop,
      dropStop,
      paymentMethod, // 'cash' | 'counter_upi' | 'counter_card'
      customerName,
      customerPhone,
      couponCode,
      passengers: passengerInputs,
    } = req.body as {
      tripId: number;
      counterId?: number;
      pickupStop: string;
      dropStop: string;
      paymentMethod: string;
      customerName: string;
      customerPhone: string;
      couponCode?: string;
      passengers: Array<{
        tripBerthId: number;
        fullName: string;
        mobile: string;
        age: number;
        gender: 'male' | 'female' | 'other';
      }>;
    };

    const normalizedPhone = String(customerPhone || '').replace(/\D/g, '').slice(-10);
    if (
      !tripId ||
      !pickupStop ||
      !dropStop ||
      !customerName?.trim() ||
      !/^\d{10}$/.test(normalizedPhone) ||
      !Array.isArray(passengerInputs) ||
      passengerInputs.length === 0
    ) {
      return res.status(400).json({
        error: 'Valid trip, pickup/drop, customer name, 10-digit mobile, and berths are required.',
      });
    }

    const berthIds = passengerInputs.map((p) => Number(p.tripBerthId));
    let couponRow: typeof coupons.$inferSelect | null = null;
    if (couponCode?.trim()) {
      const [found] = await db
        .select()
        .from(coupons)
        .where(and(eq(coupons.code, couponCode.trim().toUpperCase()), eq(coupons.isActive, true)))
        .limit(1);
      if (!found) return res.status(400).json({ error: 'Invalid coupon code' });
      couponRow = found;
    }

    const createdBooking = await db.transaction(async (tx) => {
      await tx.delete(seatLocks).where(sql`${seatLocks.expiresAt} <= NOW()`);

      const allTripBerths = await tx
        .select()
        .from(tripBerths)
        .where(eq(tripBerths.tripId, tripId))
        .for('update');

      const selectedBerths = allTripBerths.filter((b) => berthIds.includes(b.id));
      if (selectedBerths.length !== berthIds.length) {
        throw new Error('Selected berths do not match this trip.');
      }

      const activeLocks = await tx
        .select()
        .from(seatLocks)
        .where(and(eq(seatLocks.tripId, tripId), inArray(seatLocks.tripBerthId, berthIds)));

      for (const p of passengerInputs) {
        const tb = selectedBerths.find((b) => b.id === Number(p.tripBerthId))!;
        const lock = activeLocks.find((l) => l.tripBerthId === tb.id);
        if (lock) {
          throw new Error(`Berth ${tb.berthNumber} is currently locked by an online checkout.`);
        }
        const genderCheck = validateBerthGenderSelection(tb, p.gender, allTripBerths);
        if (!genderCheck.allowed) {
          throw new Error(genderCheck.reason || `Berth ${tb.berthNumber} cannot be booked.`);
        }
      }

      const breakdown = calculateFareBreakdown({
        berthFares: selectedBerths.map((b) => b.fare),
        coupon: couponRow
          ? {
              discountType: couponRow.discountType as 'percent' | 'flat',
              discountValue: couponRow.discountValue,
              maxDiscount: couponRow.maxDiscount,
              minAmount: couponRow.minAmount,
            }
          : null,
        gstPercent: 5,
      });

      const pnr = generatePnrCode('JGC');
      const channel = paymentMethod === 'cash' ? 'cash' : 'counter';
      const [booking] = await tx
        .insert(bookings)
        .values({
          pnr,
          tripId,
          customerName: customerName.trim(),
          customerPhone: normalizedPhone,
          bookingChannel: channel,
          counterId: counterId || req.actor?.counterId || null,
          staffId: req.actor?.staffId || null,
          pickupStop,
          dropStop,
          subtotalAmount: breakdown.subtotal,
          discountAmount: breakdown.discount,
          taxAmount: breakdown.tax,
          totalAmount: breakdown.total,
          couponCode: couponRow?.code ?? null,
          status: 'confirmed',
          paymentStatus: 'paid',
          paymentMethod: paymentMethod || 'cash',
          qrPayload: JSON.stringify({
            pnr,
            tripId,
            berths: selectedBerths.map((b) => b.berthNumber),
            channel,
          }),
        })
        .returning();

      for (const p of passengerInputs) {
        const tb = selectedBerths.find((b) => b.id === Number(p.tripBerthId))!;
        await tx
          .update(tripBerths)
          .set({ status: 'booked', genderBooked: p.gender })
          .where(eq(tripBerths.id, tb.id));
      }

      await tx.insert(passengers).values(
        passengerInputs.map((p) => {
          const tb = selectedBerths.find((b) => b.id === Number(p.tripBerthId))!;
          return {
            bookingId: booking.id,
            fullName: p.fullName.trim(),
            mobile: String(p.mobile || normalizedPhone).replace(/\D/g, '').slice(-10),
            age: Number(p.age),
            gender: p.gender,
            berthNumber: tb.berthNumber,
          };
        })
      );

      await tx.insert(bookingBerths).values(
        selectedBerths.map((tb) => ({
          bookingId: booking.id,
          tripId,
          tripBerthId: tb.id,
          berthNumber: tb.berthNumber,
          fare: tb.fare,
          isConfirmed: true,
        }))
      );

      await tx.insert(payments).values({
        bookingId: booking.id,
        gateway: paymentMethod === 'cash' ? 'cash' : 'counter',
        idempotencyKey: `cnt_${booking.id}_${Date.now()}`,
        method: paymentMethod || 'cash',
        amount: breakdown.total,
        currency: 'INR',
        status: 'captured',
      });

      return booking;
    });

    await logAudit(
      req.actor!.uid,
      req.actor!.email,
      'COUNTER_BOOKING_CREATED',
      'booking',
      String(createdBooking.id),
      { pnr: createdBooking.pnr, channel: createdBooking.bookingChannel, total: createdBooking.totalAmount }
    );

    const ticket = await loadFullTicket(createdBooking.id);
    res.json({ ok: true, ticket });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Counter booking failed';
    res.status(409).json({ error: message });
  }
});

app.get('/api/counter/bookings/search', requireStaffOrAdmin, async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const allBookings = await db
      .select()
      .from(bookings)
      .orderBy(desc(bookings.createdAt))
      .limit(100);

    const filtered = query
      ? allBookings.filter(
          (b) =>
            b.pnr.toLowerCase().includes(query.toLowerCase()) ||
            b.customerPhone.includes(query) ||
            b.customerName.toLowerCase().includes(query.toLowerCase())
        )
      : allBookings.slice(0, 25);

    const tickets = await Promise.all(filtered.map((b) => loadFullTicket(b.id)));
    res.json({ bookings: tickets.filter(Boolean) });
  } catch (err) {
    console.error('Counter search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ========================
// ADMIN PANEL ENDPOINTS
// ========================
app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
  try {
    const [allBookings, allTrips, allTripBerths, allRoutes, allBuses, allCounters, allRefunds, allPayments] =
      await Promise.all([
        db.select().from(bookings).orderBy(desc(bookings.createdAt)),
        db.select().from(trips),
        db.select().from(tripBerths),
        db.select().from(routes),
        db.select().from(buses),
        db.select().from(counters),
        db.select().from(refunds),
        db.select().from(payments),
      ]);

    const today = new Date().toISOString().slice(0, 10);
    const confirmedBookings = allBookings.filter(
      (b) => b.status === 'confirmed' || b.status === 'completed'
    );
    const todaysBookings = allBookings.filter(
      (b) => b.createdAt.toISOString().slice(0, 10) === today
    );
    const upcomingJourneys = allTrips.filter(
      (t) => t.journeyDate >= today && t.status === 'scheduled'
    );

    const totalRevenue = confirmedBookings.reduce((s, b) => s + b.totalAmount, 0);
    const onlineCollections = confirmedBookings
      .filter((b) => b.bookingChannel === 'online')
      .reduce((s, b) => s + b.totalAmount, 0);
    const cashCollections = confirmedBookings
      .filter((b) => b.bookingChannel === 'cash')
      .reduce((s, b) => s + b.totalAmount, 0);
    const counterCollections = confirmedBookings
      .filter((b) => b.bookingChannel === 'counter')
      .reduce((s, b) => s + b.totalAmount, 0);

    const activeBerths = allTripBerths.filter((tb) => tb.status !== 'disabled');
    const bookedBerths = activeBerths.filter((tb) => tb.status === 'booked');
    const occupancyRate =
      activeBerths.length > 0
        ? Math.round((bookedBerths.length / activeBerths.length) * 1000) / 10
        : 0;

    const cancelledBookings = allBookings.filter(
      (b) => b.status === 'cancelled' || b.status === 'refund_pending' || b.status === 'refunded'
    );
    const pendingPayments = allBookings.filter((b) => b.paymentStatus === 'pending');

    // Route-wise aggregation
    const routeStats = allRoutes.map((r) => {
      const rTrips = allTrips.filter((t) => t.routeId === r.id);
      const rTripIds = new Set(rTrips.map((t) => t.id));
      const rBookings = confirmedBookings.filter((b) => rTripIds.has(b.tripId));
      return {
        routeCode: r.code,
        routeName: `${r.origin} → ${r.destination}`,
        bookingsCount: rBookings.length,
        revenue: rBookings.reduce((s, b) => s + b.totalAmount, 0),
      };
    });

    // Bus-wise occupancy
    const busStats = allBuses.map((bus) => {
      const bTripIds = new Set(allTrips.filter((t) => t.busId === bus.id).map((t) => t.id));
      const bBerths = activeBerths.filter((tb) => bTripIds.has(tb.tripId));
      const bBooked = bBerths.filter((tb) => tb.status === 'booked');
      return {
        busName: bus.name,
        registrationNumber: bus.registrationNumber,
        totalBerths: bBerths.length,
        bookedBerths: bBooked.length,
        occupancyPct: bBerths.length > 0 ? Math.round((bBooked.length / bBerths.length) * 100) : 0,
      };
    });

    // Counter-wise collections
    const counterStats = allCounters.map((c) => {
      const cBookings = confirmedBookings.filter((b) => b.counterId === c.id);
      return {
        counterCode: c.code,
        counterName: c.name,
        bookingsCount: cBookings.length,
        revenue: cBookings.reduce((s, b) => s + b.totalAmount, 0),
      };
    });

    const tripById = new Map(allTrips.map((t) => [t.id, t]));
    const routeById = new Map(allRoutes.map((r) => [r.id, r]));
    const recentBookings = allBookings.slice(0, 8).map((b) => {
      const tr = tripById.get(b.tripId);
      const rt = tr ? routeById.get(tr.routeId) : undefined;
      return {
        id: b.id,
        pnr: b.pnr,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        routeName: rt ? `${rt.origin} → ${rt.destination}` : `Trip #${b.tripId}`,
        journeyDate: tr?.journeyDate || '',
        bookingChannel: b.bookingChannel,
        totalAmount: b.totalAmount,
        status: b.status,
      };
    });

    res.json({
      kpis: {
        totalBookings: allBookings.length,
        todaysBookings: todaysBookings.length,
        upcomingJourneys: upcomingJourneys.length,
        totalRevenue,
        onlineCollections,
        cashCollections,
        counterCollections,
        occupancyRate,
        cancelledBookings: cancelledBookings.length,
        pendingPayments: pendingPayments.length,
        pendingRefundsCount: allRefunds.filter((r) => r.status === 'pending').length,
      },
      recentBookings,
      reports: {
        routeStats,
        busStats,
        counterStats,
        recentPaymentsCount: allPayments.length,
      },
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Failed to load admin overview' });
  }
});

// Admin Buses
app.get('/api/admin/buses', requireAdmin, async (_req, res) => {
  const [busRows, layoutRows, imageRows] = await Promise.all([
    db.select().from(buses).orderBy(desc(buses.id)),
    db.select().from(berthLayouts),
    db.select().from(busImages),
  ]);
  res.json({
    buses: busRows.map((b) => ({
      ...b,
      layout: layoutRows.find((l) => l.id === b.layoutId),
      images: imageRows.filter((i) => i.busId === b.id),
    })),
    layouts: layoutRows,
  });
});

app.post('/api/admin/buses', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, registrationNumber, coachType, isAc, layoutId, amenities, primaryImageUrl, status } =
      req.body;
    const [layout] = await db
      .select()
      .from(berthLayouts)
      .where(eq(berthLayouts.id, Number(layoutId)))
      .limit(1);
    if (!layout) return res.status(400).json({ error: 'Valid berth layout required' });

    const [created] = await db
      .insert(buses)
      .values({
        name: String(name).trim(),
        registrationNumber: String(registrationNumber).trim().toUpperCase(),
        coachType: coachType || (isAc ? 'AC Sleeper' : 'Non-AC Sleeper'),
        isAc: Boolean(isAc),
        layoutId: layout.id,
        totalBerths: layout.totalBerths,
        amenities: Array.isArray(amenities) ? amenities : [],
        status: status || 'active',
        primaryImageUrl: primaryImageUrl || '/src/assets/images/fleet_terminal_coach_1795571776699.jpg',
      })
      .returning();

    await logAudit(req.actor!.uid, req.actor!.email, 'CREATE_BUS', 'bus', String(created.id), {
      name: created.name,
      registrationNumber: created.registrationNumber,
    });
    res.json({ bus: created });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create bus' });
  }
});

app.put('/api/admin/buses/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { name, registrationNumber, coachType, isAc, amenities, status, primaryImageUrl } = req.body;
    const [updated] = await db
      .update(buses)
      .set({
        name,
        registrationNumber: String(registrationNumber).toUpperCase(),
        coachType,
        isAc: Boolean(isAc),
        amenities: Array.isArray(amenities) ? amenities : [],
        status,
        primaryImageUrl,
      })
      .where(eq(buses.id, id))
      .returning();
    await logAudit(req.actor!.uid, req.actor!.email, 'UPDATE_BUS', 'bus', String(id), { status });
    res.json({ bus: updated });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update bus' });
  }
});

// Admin Berth Layouts & Berths
app.get('/api/admin/berth-layouts', requireAdmin, async (_req, res) => {
  const [layouts, allBerths] = await Promise.all([
    db.select().from(berthLayouts),
    db.select().from(berths),
  ]);
  res.json({
    layouts: layouts.map((l) => ({
      ...l,
      berths: allBerths
        .filter((b) => b.layoutId === l.id)
        .sort((a, b) => (a.deck === b.deck ? a.rowIndex - b.rowIndex || a.colIndex - b.colIndex : a.deck === 'lower' ? -1 : 1)),
    })),
  });
});

app.post('/api/admin/berth-layouts', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, code, lowerRows, upperRows, description } = req.body;
    const lRows = Math.max(2, Math.min(8, Number(lowerRows || 5)));
    const uRows = Math.max(2, Math.min(8, Number(upperRows || 5)));
    const totalBerths = (lRows + uRows) * 3;

    const [layout] = await db
      .insert(berthLayouts)
      .values({
        name: String(name).trim(),
        code: String(code).trim().toUpperCase(),
        totalBerths,
        lowerRows: lRows,
        upperRows: uRows,
        description: description || '',
      })
      .returning();

    const berthEntries: Array<typeof berths.$inferInsert> = [];
    let lIdx = 1;
    let uIdx = 1;
    for (let r = 0; r < lRows; r++) {
      for (let c = 0; c < 3; c++) {
        berthEntries.push({
          layoutId: layout.id,
          berthNumber: `L${lIdx++}`,
          deck: 'lower',
          berthType: c === 0 ? 'single' : 'double',
          rowIndex: r,
          colIndex: c,
          baseFareMultiplier: c === 0 ? 110 : 100,
          ladiesReserved: false,
          isDisabled: false,
        });
      }
    }
    for (let r = 0; r < uRows; r++) {
      for (let c = 0; c < 3; c++) {
        berthEntries.push({
          layoutId: layout.id,
          berthNumber: `U${uIdx++}`,
          deck: 'upper',
          berthType: c === 0 ? 'single' : 'double',
          rowIndex: r,
          colIndex: c,
          baseFareMultiplier: c === 0 ? 100 : 95,
          ladiesReserved: false,
          isDisabled: false,
        });
      }
    }

    await db.insert(berths).values(berthEntries);
    await logAudit(req.actor!.uid, req.actor!.email, 'CREATE_BERTH_LAYOUT', 'berth_layout', String(layout.id), {
      code: layout.code,
      totalBerths,
    });
    res.json({ layout });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create layout' });
  }
});

app.put('/api/admin/berths/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { berthNumber, baseFareMultiplier, specialFareOverride, ladiesReserved, isDisabled } = req.body;
    const [updated] = await db
      .update(berths)
      .set({
        berthNumber,
        baseFareMultiplier: Number(baseFareMultiplier || 100),
        specialFareOverride: specialFareOverride ? Number(specialFareOverride) : null,
        ladiesReserved: Boolean(ladiesReserved),
        isDisabled: Boolean(isDisabled),
      })
      .where(eq(berths.id, id))
      .returning();
    await logAudit(req.actor!.uid, req.actor!.email, 'UPDATE_BERTH_TEMPLATE', 'berth', String(id), {
      berthNumber,
      specialFareOverride,
      ladiesReserved,
      isDisabled,
    });
    res.json({ berth: updated });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update berth' });
  }
});

// Admin Routes & Stops
app.get('/api/admin/routes', requireAdmin, async (_req, res) => {
  const [routeRows, stopRows] = await Promise.all([
    db.select().from(routes).orderBy(desc(routes.id)),
    db.select().from(routeStops),
  ]);
  res.json({
    routes: routeRows.map((r) => ({
      ...r,
      stops: stopRows
        .filter((s) => s.routeId === r.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    })),
  });
});

app.post('/api/admin/routes', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      code,
      origin,
      destination,
      originGu,
      destinationGu,
      originHi,
      destinationHi,
      distanceKm,
      estimatedDurationMin,
      baseFare,
      isPopular,
      description,
      stops,
    } = req.body;

    const [created] = await db
      .insert(routes)
      .values({
        code: String(code).trim().toUpperCase(),
        origin: String(origin).trim(),
        destination: String(destination).trim(),
        originGu: originGu || origin,
        destinationGu: destinationGu || destination,
        originHi: originHi || origin,
        destinationHi: destinationHi || destination,
        distanceKm: Number(distanceKm || 0),
        estimatedDurationMin: Number(estimatedDurationMin || 360),
        baseFare: Number(baseFare || 800),
        isPopular: Boolean(isPopular),
        isActive: true,
        description: description || '',
      })
      .returning();

    if (Array.isArray(stops) && stops.length > 0) {
      await db.insert(routeStops).values(
        stops.map((s: Record<string, unknown>, idx: number) => ({
          routeId: created.id,
          stopName: String(s.stopName || ''),
          stopType: String(s.stopType || 'pickup'),
          city: String(s.city || origin),
          landmark: String(s.landmark || ''),
          offsetMinutes: Number(s.offsetMinutes || 0),
          sortOrder: idx + 1,
        }))
      );
    }

    await logAudit(req.actor!.uid, req.actor!.email, 'CREATE_ROUTE', 'route', String(created.id), {
      code: created.code,
    });
    res.json({ route: created });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create route' });
  }
});

app.put('/api/admin/routes/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { origin, destination, distanceKm, estimatedDurationMin, baseFare, isPopular, isActive, description, stops } =
      req.body;
    const [updated] = await db
      .update(routes)
      .set({
        origin,
        destination,
        distanceKm: Number(distanceKm || 0),
        estimatedDurationMin: Number(estimatedDurationMin || 360),
        baseFare: Number(baseFare || 800),
        isPopular: Boolean(isPopular),
        isActive: Boolean(isActive),
        description: description || '',
      })
      .where(eq(routes.id, id))
      .returning();

    if (Array.isArray(stops)) {
      await db.delete(routeStops).where(eq(routeStops.routeId, id));
      if (stops.length > 0) {
        await db.insert(routeStops).values(
          stops.map((s: Record<string, unknown>, idx: number) => ({
            routeId: id,
            stopName: String(s.stopName || ''),
            stopType: String(s.stopType || 'pickup'),
            city: String(s.city || origin),
            landmark: String(s.landmark || ''),
            offsetMinutes: Number(s.offsetMinutes || 0),
            sortOrder: idx + 1,
          }))
        );
      }
    }

    await logAudit(req.actor!.uid, req.actor!.email, 'UPDATE_ROUTE', 'route', String(id), {
      baseFare,
      isActive,
    });
    res.json({ route: updated });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update route' });
  }
});

// Admin Trips & Schedules
app.get('/api/admin/trips', requireAdmin, async (_req, res) => {
  const [tripRows, busRows, routeRows, berthRows] = await Promise.all([
    db.select().from(trips).orderBy(desc(trips.journeyDate), trips.departureTime),
    db.select().from(buses),
    db.select().from(routes),
    db.select().from(tripBerths),
  ]);

  res.json({
    trips: tripRows.map((t) => {
      const tBerths = berthRows.filter((tb) => tb.tripId === t.id);
      return {
        ...t,
        bus: busRows.find((b) => b.id === t.busId),
        route: routeRows.find((r) => r.id === t.routeId),
        bookedCount: tBerths.filter((b) => b.status === 'booked').length,
        availableCount: tBerths.filter((b) => b.status === 'available').length,
      };
    }),
  });
});

app.post('/api/admin/trips', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      tripCode,
      busId,
      routeId,
      journeyDate,
      departureTime,
      arrivalTime,
      arrivalDayOffset,
      baseFare,
    } = req.body;
    const created = await createTripWithBerthsAndStops({
      tripCode: String(tripCode).trim().toUpperCase(),
      busId: Number(busId),
      routeId: Number(routeId),
      journeyDate: String(journeyDate),
      departureTime: String(departureTime),
      arrivalTime: String(arrivalTime),
      arrivalDayOffset: Number(arrivalDayOffset ?? 1),
      baseFare: Number(baseFare),
    });

    await logAudit(req.actor!.uid, req.actor!.email, 'CREATE_TRIP', 'trip', String(created.id), {
      tripCode: created.tripCode,
      journeyDate: created.journeyDate,
    });
    res.json({ trip: created });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create schedule' });
  }
});

app.put('/api/admin/trips/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { status, baseFare, departureTime, arrivalTime } = req.body;
    const [updated] = await db
      .update(trips)
      .set({
        status,
        baseFare: Number(baseFare),
        departureTime,
        arrivalTime,
      })
      .where(eq(trips.id, id))
      .returning();
    await logAudit(req.actor!.uid, req.actor!.email, 'UPDATE_TRIP', 'trip', String(id), {
      status,
      baseFare,
    });
    res.json({ trip: updated });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update trip' });
  }
});

app.put('/api/admin/trip-berths/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { fare, status, ladiesReserved } = req.body;
    const [updated] = await db
      .update(tripBerths)
      .set({
        fare: Number(fare),
        status: status === 'disabled' ? 'disabled' : 'available',
        ladiesReserved: Boolean(ladiesReserved),
      })
      .where(eq(tripBerths.id, id))
      .returning();
    await logAudit(req.actor!.uid, req.actor!.email, 'UPDATE_TRIP_BERTH', 'trip_berth', String(id), {
      fare,
      status,
      ladiesReserved,
    });
    res.json({ berth: updated });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update trip berth' });
  }
});

// Admin Bookings, Refunds, Payments, Customers
app.get('/api/admin/bookings', requireAdmin, async (_req, res) => {
  const rows = await db.select().from(bookings).orderBy(desc(bookings.createdAt)).limit(200);
  const tickets = await Promise.all(rows.map((r) => loadFullTicket(r.id)));
  res.json({ bookings: tickets.filter(Boolean) });
});

app.get('/api/admin/refunds', requireAdmin, async (_req, res) => {
  const [refundRows, bookingRows] = await Promise.all([
    db.select().from(refunds).orderBy(desc(refunds.createdAt)),
    db.select().from(bookings),
  ]);
  res.json({
    refunds: refundRows.map((r) => ({
      ...r,
      booking: bookingRows.find((b) => b.id === r.bookingId),
    })),
  });
});

app.post('/api/admin/refunds/:id/process', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body as { status: 'processed' | 'rejected' };

    const result = await db.transaction(async (tx) => {
      const [refund] = await tx
        .update(refunds)
        .set({
          status,
          processedBy: req.actor!.email || req.actor!.uid,
          processedAt: new Date(),
        })
        .where(eq(refunds.id, id))
        .returning();

      if (refund && status === 'processed') {
        await tx
          .update(bookings)
          .set({ status: 'refunded', paymentStatus: 'refunded', updatedAt: new Date() })
          .where(eq(bookings.id, refund.bookingId));
      }
      return refund;
    });

    await logAudit(req.actor!.uid, req.actor!.email, 'PROCESS_REFUND', 'refund', String(id), {
      status,
    });
    res.json({ refund: result });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to process refund' });
  }
});

app.get('/api/admin/payments', requireAdmin, async (_req, res) => {
  const [payRows, bookingRows] = await Promise.all([
    db.select().from(payments).orderBy(desc(payments.createdAt)).limit(200),
    db.select().from(bookings),
  ]);
  res.json({
    payments: payRows.map((p) => ({
      ...p,
      pnr: bookingRows.find((b) => b.id === p.bookingId)?.pnr || '',
      customerName: bookingRows.find((b) => b.id === p.bookingId)?.customerName || '',
    })),
  });
});

app.get('/api/admin/customers', requireAdmin, async (_req, res) => {
  const [profileRows, bookingRows] = await Promise.all([
    db.select().from(profiles).orderBy(desc(profiles.createdAt)),
    db.select().from(bookings),
  ]);
  res.json({
    customers: profileRows.map((p) => {
      const custBookings = bookingRows.filter(
        (b) => b.profileId === p.id || (p.phone && b.customerPhone === p.phone)
      );
      return {
        ...p,
        bookingsCount: custBookings.length,
        totalSpent: custBookings
          .filter((b) => b.paymentStatus === 'paid')
          .reduce((s, b) => s + b.totalAmount, 0),
      };
    }),
  });
});

// Admin Coupons
app.get('/api/admin/coupons', requireAdmin, async (_req, res) => {
  const rows = await db.select().from(coupons).orderBy(desc(coupons.id));
  res.json({ coupons: rows });
});

app.post('/api/admin/coupons', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { code, description, discountType, discountValue, maxDiscount, minAmount, validUntil } =
      req.body;
    const [created] = await db
      .insert(coupons)
      .values({
        code: String(code).trim().toUpperCase(),
        description: description || '',
        discountType: discountType || 'flat',
        discountValue: Number(discountValue),
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        minAmount: Number(minAmount || 0),
        validUntil: validUntil || '2027-12-31',
        isActive: true,
      })
      .returning();
    await logAudit(req.actor!.uid, req.actor!.email, 'CREATE_COUPON', 'coupon', String(created.id), {
      code: created.code,
    });
    res.json({ coupon: created });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create coupon' });
  }
});

app.put('/api/admin/coupons/:id', requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { isActive } = req.body;
  const [updated] = await db
    .update(coupons)
    .set({ isActive: Boolean(isActive) })
    .where(eq(coupons.id, id))
    .returning();
  res.json({ coupon: updated });
});

// Admin Counters & Staff
app.get('/api/admin/counters-staff', requireAdmin, async (_req, res) => {
  const [counterRows, staffRows] = await Promise.all([
    db.select().from(counters).orderBy(counters.id),
    db
      .select({
        id: staff.id,
        counterId: staff.counterId,
        staffCode: staff.staffCode,
        name: staff.name,
        phone: staff.phone,
        email: staff.email,
        role: staff.role,
        isActive: staff.isActive,
        hasPasscode: sql<boolean>`length(${staff.passcodeHash}) > 0`,
      })
      .from(staff)
      .orderBy(staff.id),
  ]);
  res.json({ counters: counterRows, staff: staffRows });
});

app.post('/api/admin/counters', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { code, name, city, address, phone } = req.body;
    const [created] = await db
      .insert(counters)
      .values({
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        city: String(city).trim(),
        address: address || '',
        phone: phone || '',
        isActive: true,
      })
      .returning();
    await logAudit(req.actor!.uid, req.actor!.email, 'CREATE_COUNTER', 'counter', String(created.id), {
      code: created.code,
    });
    res.json({ counter: created });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create counter' });
  }
});

app.post('/api/admin/staff', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { counterId, staffCode, name, phone, email, role, passcode } = req.body;
    const [created] = await db
      .insert(staff)
      .values({
        counterId: counterId ? Number(counterId) : null,
        staffCode: String(staffCode).trim().toUpperCase(),
        name: String(name).trim(),
        phone: phone || '',
        email: (email || '').toLowerCase(),
        role: role === 'admin' ? 'admin' : 'counter_staff',
        passcodeHash: passcode ? hashSecret(String(passcode)) : '',
        isActive: true,
      })
      .returning();
    await logAudit(req.actor!.uid, req.actor!.email, 'CREATE_STAFF', 'staff', String(created.id), {
      staffCode: created.staffCode,
      role: created.role,
    });
    res.json({
      staff: {
        id: created.id,
        staffCode: created.staffCode,
        name: created.name,
        role: created.role,
      },
    });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add staff' });
  }
});

app.put('/api/admin/staff/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive, passcode, counterId, role } = req.body;
    const updateValues: Partial<typeof staff.$inferInsert> = {
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      counterId: counterId !== undefined ? (counterId ? Number(counterId) : null) : undefined,
      role: role ? (role === 'admin' ? 'admin' : 'counter_staff') : undefined,
    };
    if (passcode && String(passcode).length >= 4) {
      updateValues.passcodeHash = hashSecret(String(passcode));
    }
    const [updated] = await db
      .update(staff)
      .set(updateValues)
      .where(eq(staff.id, id))
      .returning();
    await logAudit(req.actor!.uid, req.actor!.email, 'UPDATE_STAFF', 'staff', String(id), {
      isActive,
      role,
    });
    res.json({ ok: true, id: updated?.id });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update staff' });
  }
});

// Admin Company Settings & CMS Content
app.put('/api/admin/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const [existing] = await db.select().from(companySettings).limit(1);
    const body = req.body;
    if (!existing) return res.status(404).json({ error: 'Settings row missing' });

    const [updated] = await db
      .update(companySettings)
      .set({
        companyName: body.companyName ?? existing.companyName,
        tagline: body.tagline ?? existing.tagline,
        logoUrl: body.logoUrl ?? existing.logoUrl,
        phonePrimary: body.phonePrimary ?? existing.phonePrimary,
        phoneSecondary: body.phoneSecondary ?? existing.phoneSecondary,
        whatsappNumber: body.whatsappNumber ?? existing.whatsappNumber,
        email: body.email ?? existing.email,
        supportTimings: body.supportTimings ?? existing.supportTimings,
        officeLocations: body.officeLocations ?? existing.officeLocations,
        socialLinks: body.socialLinks ?? existing.socialLinks,
        cmsContent: body.cmsContent ?? existing.cmsContent,
        updatedAt: new Date(),
      })
      .where(eq(companySettings.id, existing.id))
      .returning();

    await logAudit(req.actor!.uid, req.actor!.email, 'UPDATE_SETTINGS', 'company_settings', String(existing.id), {
      companyName: updated.companyName,
    });
    res.json({ settings: updated });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save settings' });
  }
});

app.get('/api/admin/audit-logs', requireAdmin, async (_req, res) => {
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  res.json({ logs: rows });
});

// ========================
// VITE / STATIC SERVING
// ========================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Jay Goga Travels server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
