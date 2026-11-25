export type Language = 'en' | 'gu' | 'hi';

export interface TranslationDictionary {
  navBookBus: string;
  navRoutes: string;
  navTrackPnr: string;
  navCounter: string;
  navAdmin: string;
  signIn: string;
  myAccount: string;
  heroEyebrow: string;
  heroBookCta: string;
  fromLabel: string;
  toLabel: string;
  dateLabel: string;
  searchBuses: string;
  swapCities: string;
  popularRoutesTitle: string;
  availableFleetTitle: string;
  facilitiesTitle: string;
  whyChooseTitle: string;
  routeInfoTitle: string;
  reviewsTitle: string;
  galleryTitle: string;
  contactTitle: string;
  officesTitle: string;
  selectBerths: string;
  berthsAvailable: string;
  lowerDeck: string;
  upperDeck: string;
  available: string;
  booked: string;
  locked: string;
  selected: string;
  ladiesOnly: string;
  passengerDetails: string;
  boardingDrop: string;
  fareSummary: string;
  payOnline: string;
  downloadTicket: string;
  sortBy: string;
  sortDeparture: string;
  sortArrival: string;
  sortPrice: string;
  noBusesFound: string;
  pnrLookupTitle: string;
  pnrNumber: string;
  mobileNumber: string;
  findTicket: string;
}

export const TRANSLATIONS: Record<Language, TranslationDictionary> = {
  en: {
    navBookBus: 'Book Bus',
    navRoutes: 'Routes',
    navTrackPnr: 'Track PNR',
    navCounter: 'Counter',
    navAdmin: 'Admin',
    signIn: 'Sign In',
    myAccount: 'My Account',
    heroEyebrow: 'Luxury Sleeper Coaches · Gujarat',
    heroBookCta: 'Search Sleeper Buses',
    fromLabel: 'From',
    toLabel: 'To',
    dateLabel: 'Journey Date',
    searchBuses: 'Search Buses',
    swapCities: 'Swap cities',
    popularRoutesTitle: 'Popular Sleeper Corridors',
    availableFleetTitle: 'Our Sleeper Fleet',
    facilitiesTitle: 'Onboard Coach Facilities',
    whyChooseTitle: 'Why Travel with Jay Goga Travels',
    routeInfoTitle: 'Route & Destination Guide',
    reviewsTitle: 'Passenger Experiences',
    galleryTitle: 'Fleet & Journey Gallery',
    contactTitle: 'Contact & Reservation Desk',
    officesTitle: 'Booking Offices & Terminals',
    selectBerths: 'Select Berths',
    berthsAvailable: 'Berths Available',
    lowerDeck: 'Lower Deck',
    upperDeck: 'Upper Deck',
    available: 'Available',
    booked: 'Booked',
    locked: 'Locked',
    selected: 'Selected',
    ladiesOnly: 'Ladies Only',
    passengerDetails: 'Passenger Details',
    boardingDrop: 'Boarding & Drop Points',
    fareSummary: 'Fare Breakdown',
    payOnline: 'Proceed to Pay',
    downloadTicket: 'Download PDF Ticket',
    sortBy: 'Sort by',
    sortDeparture: 'Earliest Departure',
    sortArrival: 'Earliest Arrival',
    sortPrice: 'Lowest Fare',
    noBusesFound: 'No sleeper buses found for this route and date.',
    pnrLookupTitle: 'Track PNR & Download Ticket',
    pnrNumber: 'PNR Number',
    mobileNumber: 'Registered Mobile',
    findTicket: 'Find Booking',
  },
  gu: {
    navBookBus: 'બસ બુકિંગ',
    navRoutes: 'રૂટ્સ',
    navTrackPnr: 'ટિકિટ ટ્રેક',
    navCounter: 'કાઉન્ટર',
    navAdmin: 'એડમિન',
    signIn: 'લૉગ ઇન',
    myAccount: 'મારું ખાતું',
    heroEyebrow: 'લક્ઝરી સ્લીપર કોચ · ગુજરાત',
    heroBookCta: 'સ્લીપર બસ શોધો',
    fromLabel: 'ક્યાંથી',
    toLabel: 'ક્યાં સુધી',
    dateLabel: 'મુસાફરીની તારીખ',
    searchBuses: 'બસ શોધો',
    swapCities: 'શહેર બદલો',
    popularRoutesTitle: 'લોકપ્રિય સ્લીપર રૂટ્સ',
    availableFleetTitle: 'અમારી સ્લીપર બસ સેવા',
    facilitiesTitle: 'બસની આધુનિક સુવિધાઓ',
    whyChooseTitle: 'જય ગોગા ટ્રાવેલ્સ શા માટે પસંદ કરશો',
    routeInfoTitle: 'રૂટ અને ગંતવ્ય માહિતી',
    reviewsTitle: 'મુસાફરોના પ્રતિભાવ',
    galleryTitle: 'કોચ અને મુસાફરી ગેલેરી',
    contactTitle: 'સંપર્ક અને બુકિંગ ડેસ્ક',
    officesTitle: 'ઓફિસ અને બુકિંગ કાઉન્ટર',
    selectBerths: 'બર્થ પસંદ કરો',
    berthsAvailable: 'ખાલી બર્થ',
    lowerDeck: 'લોઅર ડેક (નીચે)',
    upperDeck: 'અપર ડેક (ઉપર)',
    available: 'ખાલી',
    booked: 'બુક થયેલ',
    locked: 'લોક',
    selected: 'પસંદ કરેલ',
    ladiesOnly: 'માત્ર મહિલાઓ માટે',
    passengerDetails: 'મુસાફરની વિગતો',
    boardingDrop: 'પિકઅપ અને ડ્રોપ પોઈન્ટ',
    fareSummary: 'ભાડાની વિગત',
    payOnline: 'ચુકવણી કરો',
    downloadTicket: 'PDF ટિકિટ ડાઉનલોડ કરો',
    sortBy: 'ક્રમ',
    sortDeparture: 'સૌથી વહેલી ઉપડતી',
    sortArrival: 'વહેલી પહોંચતી',
    sortPrice: 'ઓછું ભાડું',
    noBusesFound: 'આ રૂટ અને તારીખ માટે કોઈ સ્લીપર બસ ઉપલબ્ધ નથી.',
    pnrLookupTitle: 'PNR ટ્રેક અને ટિકિટ ડાઉનલોડ',
    pnrNumber: 'PNR નંબર',
    mobileNumber: 'મોબાઈલ નંબર',
    findTicket: 'ટિકિટ શોધો',
  },
  hi: {
    navBookBus: 'बस बुकिंग',
    navRoutes: 'रूट्स',
    navTrackPnr: 'PNR ट्रैक',
    navCounter: 'काउंटर',
    navAdmin: 'एडमिन',
    signIn: 'साइन इन',
    myAccount: 'मेरा खाता',
    heroEyebrow: 'लक्ज़री स्लीपर कोच · गुजरात',
    heroBookCta: 'स्लीपर बसें खोजें',
    fromLabel: 'कहाँ से',
    toLabel: 'कहाँ तक',
    dateLabel: 'यात्रा तिथि',
    searchBuses: 'बसें खोजें',
    swapCities: 'शहर बदलें',
    popularRoutesTitle: 'लोकप्रिय स्लीपर मार्ग',
    availableFleetTitle: 'हमारी स्लीपर बसें',
    facilitiesTitle: 'कोच की आधुनिक सुविधाएँ',
    whyChooseTitle: 'जय गोगा ट्रैवल्स क्यों चुनें',
    routeInfoTitle: 'मार्ग और गंतव्य जानकारी',
    reviewsTitle: 'यात्री अनुभव',
    galleryTitle: 'फ्लीट और यात्रा गैलरी',
    contactTitle: 'संपर्क और बुकिंग सहायता',
    officesTitle: 'कार्यालय और बुकिंग काउंटर',
    selectBerths: 'बर्थ चुनें',
    berthsAvailable: 'उपलब्ध बर्थ',
    lowerDeck: 'लोअर डेक',
    upperDeck: 'अपर डेक',
    available: 'उपलब्ध',
    booked: 'बुक',
    locked: 'लॉक',
    selected: 'चयनित',
    ladiesOnly: 'केवल महिलाओं के लिए',
    passengerDetails: 'यात्री विवरण',
    boardingDrop: 'बोर्डिंग और ड्रॉप पॉइंट',
    fareSummary: 'किराया विवरण',
    payOnline: 'भुगतान करें',
    downloadTicket: 'PDF टिकट डाउनलोड करें',
    sortBy: 'क्रमबद्ध करें',
    sortDeparture: 'सबसे पहले प्रस्थान',
    sortArrival: 'सबसे पहले आगमन',
    sortPrice: 'सबसे कम किराया',
    noBusesFound: 'इस मार्ग और तिथि के लिए कोई स्लीपर बस उपलब्ध नहीं है।',
    pnrLookupTitle: 'PNR ट्रैक और टिकट डाउनलोड',
    pnrNumber: 'PNR नंबर',
    mobileNumber: 'मोबाइल नंबर',
    findTicket: 'बुकिंग खोजें',
  },
};
