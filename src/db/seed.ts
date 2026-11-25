import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  berthLayouts,
  berths,
  buses,
  busImages,
  companySettings,
  counters,
  coupons,
  routes,
  routeStops,
  staff,
  tripBerths,
  trips,
  tripStops,
} from './schema.ts';

let seedPromise: Promise<void> | null = null;

function formatDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addMinutesToTime(hhmm: string, offsetMin: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + offsetMin + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export async function createTripWithBerthsAndStops(params: {
  tripCode: string;
  busId: number;
  routeId: number;
  journeyDate: string;
  departureTime: string;
  arrivalTime: string;
  arrivalDayOffset: number;
  baseFare: number;
}) {
  const [bus] = await db.select().from(buses).where(eq(buses.id, params.busId)).limit(1);
  if (!bus) throw new Error('Bus not found for trip creation');

  const layoutBerths = await db
    .select()
    .from(berths)
    .where(eq(berths.layoutId, bus.layoutId));

  const stops = await db
    .select()
    .from(routeStops)
    .where(eq(routeStops.routeId, params.routeId));

  const [createdTrip] = await db
    .insert(trips)
    .values({
      tripCode: params.tripCode,
      busId: params.busId,
      routeId: params.routeId,
      journeyDate: params.journeyDate,
      departureTime: params.departureTime,
      arrivalTime: params.arrivalTime,
      arrivalDayOffset: params.arrivalDayOffset,
      baseFare: params.baseFare,
      status: 'scheduled',
    })
    .returning();

  if (layoutBerths.length > 0) {
    await db.insert(tripBerths).values(
      layoutBerths.map((b) => ({
        tripId: createdTrip.id,
        berthId: b.id,
        berthNumber: b.berthNumber,
        deck: b.deck,
        berthType: b.berthType,
        rowIndex: b.rowIndex,
        colIndex: b.colIndex,
        fare:
          b.specialFareOverride ??
          Math.round((params.baseFare * b.baseFareMultiplier) / 100),
        ladiesReserved: b.ladiesReserved,
        status: b.isDisabled ? 'disabled' : 'available',
        genderBooked: null,
      }))
    );
  }

  if (stops.length > 0) {
    await db.insert(tripStops).values(
      stops.map((s) => ({
        tripId: createdTrip.id,
        stopName: s.stopName,
        stopType: s.stopType === 'both' ? 'pickup' : s.stopType,
        landmark: s.landmark,
        scheduledTime: addMinutesToTime(params.departureTime, s.offsetMinutes),
        sortOrder: s.sortOrder,
      }))
    );
  }

  return createdTrip;
}

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const existingSettings = await db.select().from(companySettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(companySettings).values({
      companyName: 'Jay Goga Travels',
      tagline: 'Luxury Sleeper Coach Reservations Across Gujarat',
      logoUrl: '',
      phonePrimary: '',
      phoneSecondary: '',
      whatsappNumber: '',
      email: '',
      supportTimings: '',
      officeLocations: [],
      socialLinks: {},
      cmsContent: {
        heroTitle: 'Sovereign Sleeper Journeys Across Gujarat',
        heroSubtitle:
          'Dedicated 2+1 luxury AC and Non-AC sleeper coaches crafted for overnight comfort, punctual departures, and instant verified boarding.',
        heroImageUrl: '/src/assets/images/hero_luxury_sleeper_bus_1795571775133.jpg',
        facilities: [
          {
            id: 'fac-1',
            title: '2+1 Plush Sleeper Berths',
            description:
              'Extra-wide contoured mattresses, privacy curtains, and dedicated reading lamps on both upper and lower decks.',
            icon: 'bed',
          },
          {
            id: 'fac-2',
            title: 'Dual-Zone Climate Control',
            description:
              'Precision air conditioning vents with individual louver controls inside every sleeper cabin.',
            icon: 'wind',
          },
          {
            id: 'fac-3',
            title: 'USB-C & Power Outlets',
            description:
              'Fast-charging sockets and mobile holder pouches positioned neatly beside every berth pillow.',
            icon: 'zap',
          },
          {
            id: 'fac-4',
            title: 'Sanitized Linen & Blankets',
            description:
              'Freshly laundered pillow covers and warm travel blankets prepared prior to every night departure.',
            icon: 'shield',
          },
          {
            id: 'fac-5',
            title: 'Dedicated Ladies Berths',
            description:
              'Smart gender-aware berth allocation for solo female travelers on double sleeper cabins.',
            icon: 'user-check',
          },
          {
            id: 'fac-6',
            title: 'Live Counter & QR Boarding',
            description:
              'Unified central inventory across online booking and physical boarding counters with instant QR PNR passes.',
            icon: 'qr-code',
          },
        ],
        whyChoose: [
          {
            id: 'why-1',
            title: 'Sleeper-Only Specialist',
            metric: '100% Sleeper Fleet',
            description:
              'Every coach in the Jay Goga Travels fleet is engineered exclusively for overnight sleeper comfort rather than cramped seating.',
          },
          {
            id: 'why-2',
            title: 'Atomic Seat Integrity',
            metric: 'Zero Double-Bookings',
            description:
              'Real-time PostgreSQL berth locks synchronize online Razorpay checkouts and counter cash desks simultaneously.',
          },
          {
            id: 'why-3',
            title: 'Transparent Tariffs',
            metric: 'Clear Berth Pricing',
            description:
              'Inspect lower deck, upper deck, single, and double berth fares upfront before confirming your reservation.',
          },
        ],
        reviews: [
          {
            id: 'rev-1',
            author: 'Harshvardhan Jadeja',
            route: 'Ahmedabad to Rajkot',
            quote:
              'Clean cabin curtains, punctual Paldi pickup, and effortless berth selection on mobile.',
            rating: 5,
          },
          {
            id: 'rev-2',
            author: 'Meera Patel',
            route: 'Surat to Ahmedabad',
            quote:
              'The ladies-reserved single berth made my overnight journey peaceful and secure.',
            rating: 5,
          },
          {
            id: 'rev-3',
            author: 'Krunal Desai',
            route: 'Ahmedabad to Bhuj',
            quote:
              'Instant QR boarding pass and spacious lower double berth for our family trip to Kutch.',
            rating: 5,
          },
        ],
        gallery: [
          {
            id: 'gal-1',
            imageUrl: '/src/assets/images/hero_luxury_sleeper_bus_1795571775133.jpg',
            title: 'Flagship Obsidian & Gold Coach',
            caption: 'Overnight highway flagship equipped with full air suspension.',
          },
          {
            id: 'gal-2',
            imageUrl: '/src/assets/images/sleeper_cabin_interior_1795571775727.jpg',
            title: 'Ivory Leather Sleeper Cabin',
            caption: 'Tailored privacy drapes, brass reading lamps, and warm walnut trim.',
          },
          {
            id: 'gal-3',
            imageUrl: '/src/assets/images/fleet_terminal_coach_1795571776699.jpg',
            title: 'Evening Terminal Boarding',
            caption: 'Organized boarding points with counter staff assistance.',
          },
          {
            id: 'gal-4',
            imageUrl: '/src/assets/images/gujarat_highway_dusk_1795571796272.jpg',
            title: 'Gujarat Highway Express',
            caption: 'Direct overnight connections linking Saurashtra, Kutch, and South Gujarat.',
          },
        ],
        cancellationPolicy:
          '24+ hours before departure: 90% refund. 6 to 24 hours: 75% refund. 2 to 6 hours: 50% refund. Under 2 hours: non-refundable.',
        luggagePolicy:
          'Up to 20 kg of personal baggage per berth in the under-chassis luggage hold plus one small cabin bag.',
        termsText:
          'Passengers must arrive at the selected pickup point 15 minutes prior to departure with valid government ID and PNR QR ticket.',
        guestBookingEnabled: true,
      },
    });
  }

  const existingLayouts = await db.select().from(berthLayouts).limit(1);
  if (existingLayouts.length > 0) {
    return; // Already seeded operational catalog
  }

  // 1. Berth Layouts (2+1 Sleeper configurations)
  const [layout30] = await db
    .insert(berthLayouts)
    .values({
      name: '2+1 Luxury Sleeper (30 Berths)',
      code: 'SLP-30',
      totalBerths: 30,
      lowerRows: 5,
      upperRows: 5,
      description: '5 rows per deck: 1 single berth left + 1 double berth right.',
    })
    .returning();

  const [layout36] = await db
    .insert(berthLayouts)
    .values({
      name: '2+1 Royal Executive Sleeper (36 Berths)',
      code: 'SLP-36',
      totalBerths: 36,
      lowerRows: 6,
      upperRows: 6,
      description: '6 rows per deck: spacious 2+1 luxury sleeper layout.',
    })
    .returning();

  const buildBerthsForLayout = (layoutId: number, rows: number) => {
    const items: Array<typeof berths.$inferInsert> = [];
    let lowerIdx = 1;
    let upperIdx = 1;
    for (const deck of ['lower', 'upper'] as const) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 3; c++) {
          const num = deck === 'lower' ? `L${lowerIdx++}` : `U${upperIdx++}`;
          const berthType = c === 0 ? 'single' : 'double';
          const baseFareMultiplier =
            deck === 'lower'
              ? c === 0
                ? 110
                : 100
              : c === 0
              ? 100
              : 95;
          items.push({
            layoutId,
            berthNumber: num,
            deck,
            berthType,
            rowIndex: r,
            colIndex: c,
            baseFareMultiplier,
            specialFareOverride: null,
            ladiesReserved: (deck === 'lower' && r === 0 && c === 0),
            isDisabled: false,
          });
        }
      }
    }
    return items;
  };

  await db.insert(berths).values([
    ...buildBerthsForLayout(layout30.id, 5),
    ...buildBerthsForLayout(layout36.id, 6),
  ]);

  // 2. Buses (Sleeper-Only Fleet)
  const [bus1, bus2, bus3] = await db
    .insert(buses)
    .values([
      {
        name: 'Jay Goga Gold Sovereign AC Sleeper',
        registrationNumber: 'GJ-01-JG-9001',
        coachType: 'AC Sleeper',
        isAc: true,
        layoutId: layout30.id,
        totalBerths: 30,
        amenities: ['AC', 'Charging Point', 'Reading Lamp', 'Blanket', 'Pillow', 'Privacy Curtain', 'CCTV'],
        status: 'active',
        primaryImageUrl: '/src/assets/images/hero_luxury_sleeper_bus_1795571775133.jpg',
      },
      {
        name: 'Jay Goga Royal Executive AC Sleeper',
        registrationNumber: 'GJ-05-JG-7707',
        coachType: 'AC Sleeper',
        isAc: true,
        layoutId: layout36.id,
        totalBerths: 36,
        amenities: ['AC', 'Charging Point', 'Reading Lamp', 'Blanket', 'Water Bottle', 'Emergency Exit'],
        status: 'active',
        primaryImageUrl: '/src/assets/images/fleet_terminal_coach_1795571776699.jpg',
      },
      {
        name: 'Jay Goga Heritage Non-AC Sleeper',
        registrationNumber: 'GJ-03-JG-5505',
        coachType: 'Non-AC Sleeper',
        isAc: false,
        layoutId: layout30.id,
        totalBerths: 30,
        amenities: ['Charging Point', 'Reading Lamp', 'Sliding Window', 'Privacy Curtain', 'Luggage Hold'],
        status: 'active',
        primaryImageUrl: '/src/assets/images/sleeper_cabin_interior_1795571775727.jpg',
      },
    ])
    .returning();

  await db.insert(busImages).values([
    {
      busId: bus1.id,
      imageUrl: '/src/assets/images/hero_luxury_sleeper_bus_1795571775133.jpg',
      caption: 'Exterior Coach Profile',
      sortOrder: 1,
    },
    {
      busId: bus1.id,
      imageUrl: '/src/assets/images/sleeper_cabin_interior_1795571775727.jpg',
      caption: '2+1 Luxury Sleeper Cabin',
      sortOrder: 2,
    },
  ]);

  // 3. Configurable Gujarat Routes (Editable in Admin without touching source code)
  const [routeAmdSrt, routeAmdRjk, routeSrtBhv, routeAmdBhj] = await db
    .insert(routes)
    .values([
      {
        code: 'AMD-SRT',
        origin: 'Ahmedabad',
        destination: 'Surat',
        originGu: 'અમદાવાદ',
        destinationGu: 'સુરત',
        originHi: 'अहमदाबाद',
        destinationHi: 'सूरत',
        distanceKm: 268,
        estimatedDurationMin: 345,
        baseFare: 850,
        isPopular: true,
        isActive: true,
        description: 'Direct overnight sleeper corridor via Vadodara & Bharuch expressway.',
      },
      {
        code: 'AMD-RJK',
        origin: 'Ahmedabad',
        destination: 'Rajkot',
        originGu: 'અમદાવાદ',
        destinationGu: 'રાજકોટ',
        originHi: 'अहमदाबाद',
        destinationHi: 'राजकोट',
        distanceKm: 218,
        estimatedDurationMin: 270,
        baseFare: 750,
        isPopular: true,
        isActive: true,
        description: 'Saurashtra luxury overnight express via Limbdi and Chotila.',
      },
      {
        code: 'SRT-BHV',
        origin: 'Surat',
        destination: 'Bhavnagar',
        originGu: 'સુરત',
        destinationGu: 'ભાવનગર',
        originHi: 'सूरत',
        destinationHi: 'भावनगर',
        distanceKm: 365,
        estimatedDurationMin: 460,
        baseFare: 950,
        isPopular: true,
        isActive: true,
        description: 'Popular diamond-city to Saurashtra overnight sleeper service.',
      },
      {
        code: 'AMD-BHJ',
        origin: 'Ahmedabad',
        destination: 'Bhuj',
        originGu: 'અમદાવાદ',
        destinationGu: 'ભુજ',
        originHi: 'अहमदाबाद',
        destinationHi: 'भुज',
        distanceKm: 335,
        estimatedDurationMin: 420,
        baseFare: 920,
        isPopular: true,
        isActive: true,
        description: 'Kutch royal sleeper express via Samakhiali and Gandhidham.',
      },
    ])
    .returning();

  await db.insert(routeStops).values([
    // AMD-SRT
    { routeId: routeAmdSrt.id, stopName: 'Paldi Head Office', stopType: 'pickup', city: 'Ahmedabad', landmark: 'Near Tagore Hall', offsetMinutes: 0, sortOrder: 1 },
    { routeId: routeAmdSrt.id, stopName: 'Gita Mandir', stopType: 'pickup', city: 'Ahmedabad', landmark: 'Central Bus Stand Gate 2', offsetMinutes: 20, sortOrder: 2 },
    { routeId: routeAmdSrt.id, stopName: 'CTM Cross Road', stopType: 'pickup', city: 'Ahmedabad', landmark: 'Expressway Flyover', offsetMinutes: 40, sortOrder: 3 },
    { routeId: routeAmdSrt.id, stopName: 'Kamrej Char Rasta', stopType: 'drop', city: 'Surat', landmark: 'Highway Toll Plaza Side', offsetMinutes: 315, sortOrder: 4 },
    { routeId: routeAmdSrt.id, stopName: 'Adajan Patiya', stopType: 'drop', city: 'Surat', landmark: 'Main Circle', offsetMinutes: 345, sortOrder: 5 },
    // AMD-RJK
    { routeId: routeAmdRjk.id, stopName: 'Paldi Head Office', stopType: 'pickup', city: 'Ahmedabad', landmark: 'Near Tagore Hall', offsetMinutes: 0, sortOrder: 1 },
    { routeId: routeAmdRjk.id, stopName: 'Iskon Cross Road', stopType: 'pickup', city: 'Ahmedabad', landmark: 'SG Highway', offsetMinutes: 25, sortOrder: 2 },
    { routeId: routeAmdRjk.id, stopName: 'Greenland Chowkdi', stopType: 'drop', city: 'Rajkot', landmark: 'Ahmedabad Highway Entry', offsetMinutes: 245, sortOrder: 3 },
    { routeId: routeAmdRjk.id, stopName: 'Limda Chowk', stopType: 'drop', city: 'Rajkot', landmark: 'City Center', offsetMinutes: 270, sortOrder: 4 },
    // SRT-BHV
    { routeId: routeSrtBhv.id, stopName: 'Adajan Patiya', stopType: 'pickup', city: 'Surat', landmark: 'Main Circle', offsetMinutes: 0, sortOrder: 1 },
    { routeId: routeSrtBhv.id, stopName: 'Hirabaug Circle', stopType: 'pickup', city: 'Surat', landmark: 'Varachha Road', offsetMinutes: 25, sortOrder: 2 },
    { routeId: routeSrtBhv.id, stopName: 'Nari Chowkdi', stopType: 'drop', city: 'Bhavnagar', landmark: 'Ring Road Junction', offsetMinutes: 435, sortOrder: 3 },
    { routeId: routeSrtBhv.id, stopName: 'Nilambaug Circle', stopType: 'drop', city: 'Bhavnagar', landmark: 'Main Terminal', offsetMinutes: 460, sortOrder: 4 },
    // AMD-BHJ
    { routeId: routeAmdBhj.id, stopName: 'Paldi Head Office', stopType: 'pickup', city: 'Ahmedabad', landmark: 'Near Tagore Hall', offsetMinutes: 0, sortOrder: 1 },
    { routeId: routeAmdBhj.id, stopName: 'Sola Bhagwat', stopType: 'pickup', city: 'Ahmedabad', landmark: 'SG Highway', offsetMinutes: 30, sortOrder: 2 },
    { routeId: routeAmdBhj.id, stopName: 'IFFCO Circle', stopType: 'drop', city: 'Gandhidham', landmark: 'Highway Bypass', offsetMinutes: 345, sortOrder: 3 },
    { routeId: routeAmdBhj.id, stopName: 'Jubilee Circle', stopType: 'drop', city: 'Bhuj', landmark: 'Central City Hub', offsetMinutes: 420, sortOrder: 4 },
  ]);

  // 4. Coupons
  await db.insert(coupons).values([
    {
      code: 'GOGA10',
      description: '10% off up to Rs. 200 on sleeper bookings',
      discountType: 'percent',
      discountValue: 10,
      maxDiscount: 200,
      minAmount: 700,
      validUntil: '2027-12-31',
      isActive: true,
    },
    {
      code: 'SLEEPER100',
      description: 'Flat Rs. 100 discount on bookings above Rs. 1,200',
      discountType: 'flat',
      discountValue: 100,
      maxDiscount: 100,
      minAmount: 1200,
      validUntil: '2027-12-31',
      isActive: true,
    },
  ]);

  // 5. Counters & Staff
  const [cntAmd, cntSrt] = await db
    .insert(counters)
    .values([
      {
        code: 'CNT-AMD-01',
        name: 'Ahmedabad Main Counter',
        city: 'Ahmedabad',
        address: 'Configure exact street address in Admin → Counters',
        phone: '',
        isActive: true,
      },
      {
        code: 'CNT-SRT-01',
        name: 'Surat Booking Desk',
        city: 'Surat',
        address: 'Configure exact street address in Admin → Counters',
        phone: '',
        isActive: true,
      },
    ])
    .returning();

  await db.insert(staff).values([
    {
      counterId: cntAmd.id,
      staffCode: 'STF-101',
      name: 'Ahmedabad Desk Operator',
      phone: '',
      email: '',
      role: 'counter_staff',
      isActive: true,
    },
    {
      counterId: cntSrt.id,
      staffCode: 'STF-102',
      name: 'Surat Desk Operator',
      phone: '',
      email: '',
      role: 'counter_staff',
      isActive: true,
    },
  ]);

  // 6. Seed Trips for next 5 days so customer search works out of the box
  for (let d = 0; d < 5; d++) {
    const jDate = formatDateOffset(d);
    await createTripWithBerthsAndStops({
      tripCode: `JGT-AS1-${jDate}`,
      busId: bus1.id,
      routeId: routeAmdSrt.id,
      journeyDate: jDate,
      departureTime: '22:15',
      arrivalTime: '04:00',
      arrivalDayOffset: 1,
      baseFare: 850,
    });
    await createTripWithBerthsAndStops({
      tripCode: `JGT-AS2-${jDate}`,
      busId: bus2.id,
      routeId: routeAmdSrt.id,
      journeyDate: jDate,
      departureTime: '23:30',
      arrivalTime: '05:15',
      arrivalDayOffset: 1,
      baseFare: 900,
    });
    await createTripWithBerthsAndStops({
      tripCode: `JGT-AR1-${jDate}`,
      busId: bus1.id,
      routeId: routeAmdRjk.id,
      journeyDate: jDate,
      departureTime: '22:45',
      arrivalTime: '03:15',
      arrivalDayOffset: 1,
      baseFare: 750,
    });
    await createTripWithBerthsAndStops({
      tripCode: `JGT-AR2-${jDate}`,
      busId: bus3.id,
      routeId: routeAmdRjk.id,
      journeyDate: jDate,
      departureTime: '21:30',
      arrivalTime: '02:00',
      arrivalDayOffset: 1,
      baseFare: 620,
    });
    await createTripWithBerthsAndStops({
      tripCode: `JGT-SB1-${jDate}`,
      busId: bus2.id,
      routeId: routeSrtBhv.id,
      journeyDate: jDate,
      departureTime: '21:00',
      arrivalTime: '04:40',
      arrivalDayOffset: 1,
      baseFare: 950,
    });
    await createTripWithBerthsAndStops({
      tripCode: `JGT-AB1-${jDate}`,
      busId: bus1.id,
      routeId: routeAmdBhj.id,
      journeyDate: jDate,
      departureTime: '22:00',
      arrivalTime: '05:00',
      arrivalDayOffset: 1,
      baseFare: 920,
    });
  }
}
