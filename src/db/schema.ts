import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().default(''),
  fullName: text('full_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  role: text('role').notNull().default('customer'), // 'customer' | 'counter_staff' | 'admin'
  preferredLanguage: text('preferred_language').notNull().default('en'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').notNull(), // 'customer' | 'counter_staff' | 'admin'
  assignedBy: text('assigned_by').notNull().default('system'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const counters = pgTable('counters', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  address: text('address').notNull().default(''),
  phone: text('phone').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const staff = pgTable('staff', {
  id: serial('id').primaryKey(),
  profileId: integer('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  counterId: integer('counter_id').references(() => counters.id, { onDelete: 'set null' }),
  staffCode: text('staff_code').notNull().unique(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  role: text('role').notNull().default('counter_staff'), // 'counter_staff' | 'manager' | 'admin'
  passcodeHash: text('passcode_hash').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const berthLayouts = pgTable('berth_layouts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  totalBerths: integer('total_berths').notNull(),
  lowerRows: integer('lower_rows').notNull().default(5),
  upperRows: integer('upper_rows').notNull().default(5),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const berths = pgTable(
  'berths',
  {
    id: serial('id').primaryKey(),
    layoutId: integer('layout_id')
      .references(() => berthLayouts.id, { onDelete: 'cascade' })
      .notNull(),
    berthNumber: text('berth_number').notNull(),
    deck: text('deck').notNull(), // 'lower' | 'upper'
    berthType: text('berth_type').notNull(), // 'single' | 'double'
    rowIndex: integer('row_index').notNull(),
    colIndex: integer('col_index').notNull(), // 0 = left single, 1 = right inner, 2 = right outer
    baseFareMultiplier: integer('base_fare_multiplier').notNull().default(100), // percentage
    specialFareOverride: integer('special_fare_override'),
    ladiesReserved: boolean('ladies_reserved').notNull().default(false),
    isDisabled: boolean('is_disabled').notNull().default(false),
  },
  (table) => [uniqueIndex('berths_layout_number_idx').on(table.layoutId, table.berthNumber)]
);

export const buses = pgTable('buses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  registrationNumber: text('registration_number').notNull().unique(),
  coachType: text('coach_type').notNull().default('AC Sleeper'), // 'AC Sleeper' | 'Non-AC Sleeper'
  isAc: boolean('is_ac').notNull().default(true),
  layoutId: integer('layout_id')
    .references(() => berthLayouts.id)
    .notNull(),
  totalBerths: integer('total_berths').notNull(),
  amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('active'), // 'active' | 'maintenance' | 'inactive'
  primaryImageUrl: text('primary_image_url').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const busImages = pgTable('bus_images', {
  id: serial('id').primaryKey(),
  busId: integer('bus_id')
    .references(() => buses.id, { onDelete: 'cascade' })
    .notNull(),
  imageUrl: text('image_url').notNull(),
  caption: text('caption').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const routes = pgTable('routes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  origin: text('origin').notNull(),
  destination: text('destination').notNull(),
  originGu: text('origin_gu').notNull().default(''),
  destinationGu: text('destination_gu').notNull().default(''),
  originHi: text('origin_hi').notNull().default(''),
  destinationHi: text('destination_hi').notNull().default(''),
  distanceKm: integer('distance_km').notNull().default(0),
  estimatedDurationMin: integer('estimated_duration_min').notNull().default(360),
  baseFare: integer('base_fare').notNull().default(800),
  isPopular: boolean('is_popular').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const routeStops = pgTable('route_stops', {
  id: serial('id').primaryKey(),
  routeId: integer('route_id')
    .references(() => routes.id, { onDelete: 'cascade' })
    .notNull(),
  stopName: text('stop_name').notNull(),
  stopType: text('stop_type').notNull().default('pickup'), // 'pickup' | 'drop' | 'both'
  city: text('city').notNull(),
  landmark: text('landmark').notNull().default(''),
  offsetMinutes: integer('offset_minutes').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const trips = pgTable('trips', {
  id: serial('id').primaryKey(),
  tripCode: text('trip_code').notNull().unique(),
  busId: integer('bus_id')
    .references(() => buses.id)
    .notNull(),
  routeId: integer('route_id')
    .references(() => routes.id)
    .notNull(),
  journeyDate: text('journey_date').notNull(), // YYYY-MM-DD
  departureTime: text('departure_time').notNull(), // HH:MM
  arrivalTime: text('arrival_time').notNull(), // HH:MM
  arrivalDayOffset: integer('arrival_day_offset').notNull().default(1),
  baseFare: integer('base_fare').notNull(),
  status: text('status').notNull().default('scheduled'), // 'scheduled' | 'boarding' | 'departed' | 'completed' | 'cancelled'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tripStops = pgTable('trip_stops', {
  id: serial('id').primaryKey(),
  tripId: integer('trip_id')
    .references(() => trips.id, { onDelete: 'cascade' })
    .notNull(),
  stopName: text('stop_name').notNull(),
  stopType: text('stop_type').notNull(), // 'pickup' | 'drop'
  landmark: text('landmark').notNull().default(''),
  scheduledTime: text('scheduled_time').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const tripBerths = pgTable(
  'trip_berths',
  {
    id: serial('id').primaryKey(),
    tripId: integer('trip_id')
      .references(() => trips.id, { onDelete: 'cascade' })
      .notNull(),
    berthId: integer('berth_id')
      .references(() => berths.id)
      .notNull(),
    berthNumber: text('berth_number').notNull(),
    deck: text('deck').notNull(),
    berthType: text('berth_type').notNull(),
    rowIndex: integer('row_index').notNull(),
    colIndex: integer('col_index').notNull(),
    fare: integer('fare').notNull(),
    ladiesReserved: boolean('ladies_reserved').notNull().default(false),
    status: text('status').notNull().default('available'), // 'available' | 'booked' | 'disabled'
    genderBooked: text('gender_booked'), // 'male' | 'female' | 'other' | null
  },
  (table) => [uniqueIndex('trip_berths_trip_number_idx').on(table.tripId, table.berthNumber)]
);

export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  description: text('description').notNull().default(''),
  discountType: text('discount_type').notNull().default('flat'), // 'percent' | 'flat'
  discountValue: integer('discount_value').notNull(),
  maxDiscount: integer('max_discount'),
  minAmount: integer('min_amount').notNull().default(0),
  validUntil: text('valid_until').notNull().default('2027-12-31'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  pnr: text('pnr').notNull().unique(),
  tripId: integer('trip_id')
    .references(() => trips.id)
    .notNull(),
  profileId: integer('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerEmail: text('customer_email').notNull().default(''),
  bookingChannel: text('booking_channel').notNull().default('online'), // 'online' | 'counter' | 'cash'
  counterId: integer('counter_id').references(() => counters.id, { onDelete: 'set null' }),
  staffId: integer('staff_id').references(() => staff.id, { onDelete: 'set null' }),
  pickupStop: text('pickup_stop').notNull(),
  dropStop: text('drop_stop').notNull(),
  subtotalAmount: integer('subtotal_amount').notNull(),
  discountAmount: integer('discount_amount').notNull().default(0),
  taxAmount: integer('tax_amount').notNull().default(0),
  totalAmount: integer('total_amount').notNull(),
  couponCode: text('coupon_code'),
  status: text('status').notNull().default('pending'), // 'pending' | 'confirmed' | 'payment_failed' | 'cancelled' | 'refund_pending' | 'refunded' | 'completed'
  paymentStatus: text('payment_status').notNull().default('pending'), // 'pending' | 'paid' | 'failed' | 'refund_pending' | 'refunded'
  paymentMethod: text('payment_method').notNull().default('razorpay_upi'),
  qrPayload: text('qr_payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const passengers = pgTable('passengers', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .references(() => bookings.id, { onDelete: 'cascade' })
    .notNull(),
  fullName: text('full_name').notNull(),
  mobile: text('mobile').notNull(),
  age: integer('age').notNull(),
  gender: text('gender').notNull(), // 'male' | 'female' | 'other'
  berthNumber: text('berth_number').notNull(),
});

export const bookingBerths = pgTable('booking_berths', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .references(() => bookings.id, { onDelete: 'cascade' })
    .notNull(),
  tripId: integer('trip_id')
    .references(() => trips.id)
    .notNull(),
  tripBerthId: integer('trip_berth_id')
    .references(() => tripBerths.id)
    .notNull(),
  berthNumber: text('berth_number').notNull(),
  fare: integer('fare').notNull(),
  isConfirmed: boolean('is_confirmed').notNull().default(false),
});

export const seatLocks = pgTable(
  'seat_locks',
  {
    id: serial('id').primaryKey(),
    tripId: integer('trip_id')
      .references(() => trips.id, { onDelete: 'cascade' })
      .notNull(),
    tripBerthId: integer('trip_berth_id')
      .references(() => tripBerths.id, { onDelete: 'cascade' })
      .notNull(),
    sessionToken: text('session_token').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('seat_locks_trip_berth_idx').on(table.tripId, table.tripBerthId)]
);

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .references(() => bookings.id, { onDelete: 'cascade' })
    .notNull(),
  gateway: text('gateway').notNull().default('razorpay'), // 'razorpay' | 'cash' | 'counter'
  razorpayOrderId: text('razorpay_order_id').unique(),
  razorpayPaymentId: text('razorpay_payment_id').unique(),
  razorpaySignature: text('razorpay_signature'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  method: text('method').notNull().default('upi'),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('INR'),
  status: text('status').notNull().default('created'), // 'created' | 'captured' | 'failed' | 'refunded'
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const refunds = pgTable('refunds', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .references(() => bookings.id, { onDelete: 'cascade' })
    .notNull(),
  paymentId: integer('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull().default(''),
  status: text('status').notNull().default('pending'), // 'pending' | 'processed' | 'rejected'
  processedBy: text('processed_by'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  channel: text('channel').notNull(), // 'sms' | 'whatsapp' | 'email'
  recipient: text('recipient').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('not_configured'), // 'queued' | 'sent' | 'not_configured'
  providerNote: text('provider_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export interface OfficeLocation {
  id: string;
  city: string;
  title: string;
  address: string;
  phone: string;
  mapsUrl: string;
  timings: string;
}

export interface CmsContent {
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  facilities: Array<{ id: string; title: string; description: string; icon: string }>;
  whyChoose: Array<{ id: string; title: string; metric: string; description: string }>;
  reviews: Array<{ id: string; author: string; route: string; quote: string; rating: number }>;
  gallery: Array<{ id: string; imageUrl: string; title: string; caption: string }>;
  cancellationPolicy: string;
  luggagePolicy: string;
  termsText: string;
  guestBookingEnabled: boolean;
}

export const companySettings = pgTable('company_settings', {
  id: serial('id').primaryKey(),
  companyName: text('company_name').notNull().default('Jay Goga Travels'),
  tagline: text('tagline').notNull().default('Luxury Sleeper Coach Reservations Across Gujarat'),
  logoUrl: text('logo_url').notNull().default(''),
  phonePrimary: text('phone_primary').notNull().default(''),
  phoneSecondary: text('phone_secondary').notNull().default(''),
  whatsappNumber: text('whatsapp_number').notNull().default(''),
  email: text('email').notNull().default(''),
  supportTimings: text('support_timings').notNull().default(''),
  officeLocations: jsonb('office_locations').$type<OfficeLocation[]>().notNull().default([]),
  socialLinks: jsonb('social_links')
    .$type<{ instagram?: string; facebook?: string; youtube?: string }>()
    .notNull()
    .default({}),
  cmsContent: jsonb('cms_content').$type<CmsContent>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUid: text('actor_uid').notNull(),
  actorEmail: text('actor_email').notNull().default(''),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const otpChallenges = pgTable('otp_challenges', {
  id: serial('id').primaryKey(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Drizzle Relations
export const busesRelations = relations(buses, ({ one, many }) => ({
  layout: one(berthLayouts, { fields: [buses.layoutId], references: [berthLayouts.id] }),
  images: many(busImages),
  trips: many(trips),
}));

export const routesRelations = relations(routes, ({ many }) => ({
  stops: many(routeStops),
  trips: many(trips),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  bus: one(buses, { fields: [trips.busId], references: [buses.id] }),
  route: one(routes, { fields: [trips.routeId], references: [routes.id] }),
  stops: many(tripStops),
  berths: many(tripBerths),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  trip: one(trips, { fields: [bookings.tripId], references: [trips.id] }),
  passengers: many(passengers),
  bookingBerths: many(bookingBerths),
  payments: many(payments),
  refunds: many(refunds),
}));
