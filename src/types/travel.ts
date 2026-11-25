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

export interface CompanySettings {
  id: number;
  companyName: string;
  tagline: string;
  logoUrl: string;
  phonePrimary: string;
  phoneSecondary: string;
  whatsappNumber: string;
  email: string;
  supportTimings: string;
  officeLocations: OfficeLocation[];
  socialLinks: { instagram?: string; facebook?: string; youtube?: string };
  cmsContent: CmsContent;
}

export interface RouteStop {
  id: number;
  routeId: number;
  stopName: string;
  stopType: string;
  city: string;
  landmark: string;
  offsetMinutes: number;
  sortOrder: number;
}

export interface TravelRoute {
  id: number;
  code: string;
  origin: string;
  destination: string;
  originGu: string;
  destinationGu: string;
  originHi: string;
  destinationHi: string;
  distanceKm: number;
  estimatedDurationMin: number;
  baseFare: number;
  isPopular: boolean;
  isActive: boolean;
  description: string;
  stops?: RouteStop[];
}

export interface BusSummary {
  id: number;
  name: string;
  registrationNumber: string;
  coachType: string;
  isAc: boolean;
  layoutId: number;
  totalBerths: number;
  amenities: string[];
  status: string;
  primaryImageUrl: string;
}

export interface TripStop {
  id: number;
  tripId: number;
  stopName: string;
  stopType: string;
  landmark: string;
  scheduledTime: string;
  sortOrder: number;
}

export interface TripSearchItem {
  id: number;
  tripCode: string;
  busId: number;
  routeId: number;
  journeyDate: string;
  departureTime: string;
  arrivalTime: string;
  arrivalDayOffset: number;
  baseFare: number;
  status: string;
  route: TravelRoute;
  bus: BusSummary;
  availableBerthCount: number;
  totalBerthCount: number;
  startingFare: number;
  stops: TripStop[];
}

export interface TripBerthItem {
  id: number;
  tripId: number;
  berthId: number;
  berthNumber: string;
  deck: 'lower' | 'upper';
  berthType: 'single' | 'double';
  rowIndex: number;
  colIndex: number;
  fare: number;
  ladiesReserved: boolean;
  status: 'available' | 'booked' | 'disabled';
  genderBooked: string | null;
  liveStatus: 'available' | 'booked' | 'disabled' | 'locked_by_me' | 'locked_by_other';
  lockExpiresAt: string | null;
}

export interface TicketBundle {
  booking: {
    id: number;
    pnr: string;
    tripId: number;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    bookingChannel: string;
    counterId: number | null;
    staffId: number | null;
    pickupStop: string;
    dropStop: string;
    subtotalAmount: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    couponCode: string | null;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    qrPayload: string;
    createdAt: string;
  };
  trip: {
    id: number;
    tripCode: string;
    journeyDate: string;
    departureTime: string;
    arrivalTime: string;
  };
  route: TravelRoute;
  bus: BusSummary;
  passengers: Array<{
    id: number;
    fullName: string;
    mobile: string;
    age: number;
    gender: string;
    berthNumber: string;
  }>;
  berths: Array<{
    id: number;
    berthNumber: string;
    fare: number;
    isConfirmed: boolean;
  }>;
  payments: Array<{
    id: number;
    gateway: string;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    method: string;
    amount: number;
    status: string;
  }>;
  company: CompanySettings | null;
}

export interface SessionActor {
  uid: string;
  profileId: number | null;
  staffId: number | null;
  counterId: number | null;
  email: string;
  phone: string;
  fullName: string;
  role: 'customer' | 'counter_staff' | 'admin';
  authProvider: 'firebase' | 'otp' | 'staff_passcode';
}
