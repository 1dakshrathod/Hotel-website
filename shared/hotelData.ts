export interface RoomCategory {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  nightlyRateInr: number;
  totalInventory: number;
  maxGuests: number;
  sizeSqFt: number;
  bedConfig: string;
  highlights: string[];
}

export interface BreakfastPlan {
  id: string;
  name: string;
  kitchenGuarantee: string;
  description: string;
  pricePerGuestPerNightInr: number;
  dishes: string[];
  servingWindow: string;
}

export interface DayRoomAvailability {
  roomId: string;
  available: number;
  total: number;
  status: 'available' | 'limited' | 'sold_out';
}

export interface DayAvailabilitySummary {
  date: string; // YYYY-MM-DD
  rooms: Record<string, DayRoomAvailability>;
  totalAvailableAcrossHotel: number;
  lowestAvailableRateInr: number | null;
}

export interface BookingPricingBreakdown {
  nights: number;
  roomsCount: number;
  guestsCount: number;
  roomSubtotalInr: number;
  breakfastSubtotalInr: number;
  taxesAndServiceInr: number;
  totalInr: number;
}

export interface PaymentSummary {
  method: 'card' | 'upi' | 'netbanking';
  maskedReference: string;
  gatewayMode: 'stripe_live' | 'verified_gateway';
  transactionId: string;
  authorizedAt: string;
  verificationSignature: string;
}

export interface BookingRecord {
  bookingRef: string;
  roomId: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomsCount: number;
  guestsCount: number;
  breakfastPlanId: string;
  breakfastPlanName: string;
  breakfastTimeSlot: string;
  dietaryNotes: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  pricing: BookingPricingBreakdown;
  payment: PaymentSummary;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
  cancelledAt?: string;
  refundRef?: string;
}

export const TAX_RATE = 0.12; // 12% GST on hospitality tariff

export const BREAKFAST_TIME_SLOTS = [
  '07:00 AM',
  '08:00 AM',
  '09:00 AM',
  '10:00 AM',
] as const;

export const SUPPORTED_NETBANKING_BANKS = [
  'HDFC Bank',
  'ICICI Bank',
  'State Bank of India',
  'Axis Bank',
  'Kotak Mahindra Bank',
] as const;

export const ROOM_CATEGORIES: RoomCategory[] = [
  {
    id: 'garden-veranda',
    name: 'Garden Veranda Room',
    subtitle: 'Ground Courtyard · 360 sq ft · Up to 2 Guests',
    description:
      'Quiet ground-level sanctuary opening directly onto frangipani and fern beds. Dressed in unbleached organic cottons with a private teak sit-out for morning filter coffee.',
    nightlyRateInr: 5800,
    totalInventory: 5,
    maxGuests: 2,
    sizeSqFt: 360,
    bedConfig: 'King Bed',
    highlights: [
      'Private garden veranda',
      'Pure veg morning tray eligible',
      'Rain shower & herbal bath amenities',
      'Acoustic stone courtyard insulation',
    ],
  },
  {
    id: 'cedar-loft',
    name: 'Cedar Loft Suite',
    subtitle: 'Upper Pavilion · 520 sq ft · Up to 3 Guests',
    description:
      'Sunlit upper-level suite beneath hand-joined cedar rafters, featuring tall arched steel windows, a dedicated reading alcove, and a limestone soaking bath.',
    nightlyRateInr: 8400,
    totalInventory: 3,
    maxGuests: 3,
    sizeSqFt: 520,
    bedConfig: 'King Bed + Daybed',
    highlights: [
      'Arched courtyard canopy view',
      'Limestone soaking bath',
      'Dedicated writing & tea desk',
      'Complimentary evening herbal tisane',
    ],
  },
  {
    id: 'courtyard-sanctuary',
    name: 'Courtyard Sanctuary Suite',
    subtitle: 'Private Wing · 780 sq ft · Up to 4 Guests',
    description:
      'Our flagship two-bay residence with a private stone plunge terrace, separate lounging salon, and direct courtyard kitchen dining service.',
    nightlyRateInr: 12900,
    totalInventory: 2,
    maxGuests: 4,
    sizeSqFt: 780,
    bedConfig: 'King Bed + Living Suite',
    highlights: [
      'Private temperature-balanced plunge terrace',
      'In-suite pure veg dining salon',
      'Late 1:00 PM courtyard checkout',
      'Priority morning kitchen seating',
    ],
  },
];

export const BREAKFAST_PLANS: BreakfastPlan[] = [
  {
    id: 'sattvic-courtyard',
    name: 'Sattvic Courtyard Morning Table',
    kitchenGuarantee: '100% Pure Veg · Included with Stay',
    description:
      'Prepared fresh in our dedicated vegetarian kitchen: crisp stone-ground masala dosa, steamed mallige idli, saffron millet pongal, seasonal orchard fruit, and estate filter coffee.',
    pricePerGuestPerNightInr: 0,
    dishes: [
      'Stone-ground Masala Dosa & Coconut Chutney',
      'Steamed Idli with Drumstick Sambar',
      'Saffron Millet Pongal & Cashew Ghee',
      'Orchard Fig & Pomegranate Bowl',
      'Estate Filter Coffee or Tulsi Ginger Chai',
    ],
    servingWindow: '07:00 AM – 10:30 AM',
  },
  {
    id: 'jain-pure-veg',
    name: 'Jain Kitchen Pure Veg Breakfast',
    kitchenGuarantee: 'No Onion · No Garlic · No Root Vegetables',
    description:
      'Cooked on segregated vessels with zero root vegetables, zero onion, and zero garlic. Balanced morning nourishment crafted with fresh lentils, grains, and farm dairy.',
    pricePerGuestPerNightInr: 0,
    dishes: [
      'Warm Moong Dal Chilla with Mint Yogurt',
      'Steamed Khaman Dhokla & Tempered Mustard',
      'Saffron Almond Porridge with Pistachio',
      'Fresh Papaya, Pomegranate & Rose Cardamom Milk',
    ],
    servingWindow: '07:00 AM – 10:30 AM',
  },
  {
    id: 'artisan-wellness-tray',
    name: 'In-Suite Botanical Wellness Tray',
    kitchenGuarantee: '100% Pure Veg · Private Veranda Service',
    description:
      'Delivered quietly to your room veranda at your preferred morning hour, pairing cold-pressed Ayurvedic elixirs with warm artisanal pure vegetarian plates.',
    pricePerGuestPerNightInr: 650,
    dishes: [
      'Amla, Ashwagandha & Tender Coconut Tonic',
      'House Paneer & Avocado Sourdough Tartine',
      'Warm Fig & Jaggery Millet Halwa',
      'First-Flush Nilgiri Oolong Pot',
    ],
    servingWindow: '06:30 AM – 11:00 AM',
  },
  {
    id: 'grand-morning-thali',
    name: 'Grand Heritage Veg Breakfast Thali',
    kitchenGuarantee: '100% Pure Veg · 9-Course Morning Feast',
    description:
      'A celebratory morning spread showcasing heirloom regional vegetarian recipes, flaky stuffed parathas with house-churned white butter, and slow-simmered saffron sweets.',
    pricePerGuestPerNightInr: 950,
    dishes: [
      'Bedmi Poori & Heirloom Aloo Rasa (or Jain Banana Sabzi)',
      'Stuffed Paneer & Fenugreek Paratha with White Butter',
      'Warm Kesar Jalebi & Pistachio Rabri',
      'Chilled Rose-Cardamom Lassi & Brass-Cup Chai',
    ],
    servingWindow: '07:30 AM – 10:30 AM',
  },
];

export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateISO(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

export function enumerateStayNights(checkIn: string, checkOut: string): string[] {
  const start = parseDateISO(checkIn);
  const end = parseDateISO(checkOut);
  if (!start || !end || start >= end) {
    return [];
  }
  const nights: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor < end && nights.length < 60) {
    nights.push(formatDateISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return nights;
}

export function calculateStayPricing(params: {
  room: RoomCategory;
  breakfastPlan: BreakfastPlan;
  nights: number;
  roomsCount: number;
  guestsCount: number;
}): BookingPricingBreakdown {
  const roomSubtotalInr = params.room.nightlyRateInr * params.nights * params.roomsCount;
  const breakfastSubtotalInr =
    params.breakfastPlan.pricePerGuestPerNightInr * params.guestsCount * params.nights;
  const subtotal = roomSubtotalInr + breakfastSubtotalInr;
  const taxesAndServiceInr = Math.round(subtotal * TAX_RATE);
  const totalInr = subtotal + taxesAndServiceInr;

  return {
    nights: params.nights,
    roomsCount: params.roomsCount,
    guestsCount: params.guestsCount,
    roomSubtotalInr,
    breakfastSubtotalInr,
    taxesAndServiceInr,
    totalInr,
  };
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
