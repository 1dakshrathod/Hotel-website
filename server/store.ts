import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  BREAKFAST_PLANS,
  BREAKFAST_TIME_SLOTS,
  ROOM_CATEGORIES,
  SUPPORTED_NETBANKING_BANKS,
  calculateStayPricing,
  enumerateStayNights,
  formatDateISO,
  parseDateISO,
  type BookingRecord,
  type DayAvailabilitySummary,
  type DayRoomAvailability,
  type PaymentSummary,
} from '../shared/hotelData.ts';

interface StoredState {
  bookings: BookingRecord[];
  createdAt: string;
}

export interface CheckoutPayload {
  roomId: string;
  checkIn: string;
  checkOut: string;
  roomsCount: number;
  guestsCount: number;
  breakfastPlanId: string;
  breakfastTimeSlot: string;
  dietaryNotes?: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  payment: {
    method: 'card' | 'upi' | 'netbanking';
    cardHolderName?: string;
    cardNumber?: string;
    cardExpiry?: string;
    cardCvc?: string;
    upiId?: string;
    bankName?: string;
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.resolve(DATA_DIR, 'hotel-store.json');

if (!STORE_FILE.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Invalid data store path configuration');
}

// Runtime HMAC signing secret (falls back to ephemeral CSPRNG key if unset)
const PAYMENT_SIGNING_SECRET =
  process.env.PAYMENT_SIGNING_SECRET && process.env.PAYMENT_SIGNING_SECRET.trim().length > 0
    ? process.env.PAYMENT_SIGNING_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

function addDays(base: Date, offsetDays: number): string {
  const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  return formatDateISO(dt);
}

function createInitialSeedBookings(): BookingRecord[] {
  const today = new Date();
  const seeds: Array<{
    ref: string;
    roomId: string;
    startOffset: number;
    nights: number;
    roomsCount: number;
    guestsCount: number;
    breakfastPlanId: string;
    guestName: string;
  }> = [
    {
      ref: 'SAT-84102',
      roomId: 'courtyard-sanctuary',
      startOffset: 2,
      nights: 2,
      roomsCount: 2, // Makes Sanctuary sold out on day +2, +3
      guestsCount: 4,
      breakfastPlanId: 'grand-morning-thali',
      guestName: 'Meera Deshmukh',
    },
    {
      ref: 'SAT-84105',
      roomId: 'cedar-loft',
      startOffset: 3,
      nights: 2,
      roomsCount: 2, // Leaves 1 Cedar Loft on day +3, +4
      guestsCount: 3,
      breakfastPlanId: 'artisan-wellness-tray',
      guestName: 'Rohan Kulkarni',
    },
    {
      ref: 'SAT-84109',
      roomId: 'garden-veranda',
      startOffset: 4,
      nights: 3,
      roomsCount: 4, // Leaves 1 Garden Veranda on day +4, +5, +6
      guestsCount: 6,
      breakfastPlanId: 'sattvic-courtyard',
      guestName: 'Ananya Iyer',
    },
    {
      ref: 'SAT-84114',
      roomId: 'garden-veranda',
      startOffset: 8,
      nights: 2,
      roomsCount: 5, // Makes Garden Veranda sold out on day +8, +9
      guestsCount: 8,
      breakfastPlanId: 'jain-pure-veg',
      guestName: 'Siddharth Jain',
    },
    {
      ref: 'SAT-84118',
      roomId: 'cedar-loft',
      startOffset: 8,
      nights: 2,
      roomsCount: 3, // Makes Cedar Loft sold out on day +8, +9
      guestsCount: 5,
      breakfastPlanId: 'sattvic-courtyard',
      guestName: 'Kavita Nair',
    },
    {
      ref: 'SAT-84122',
      roomId: 'courtyard-sanctuary',
      startOffset: 8,
      nights: 2,
      roomsCount: 2, // Makes entire hotel sold out on day +8, +9
      guestsCount: 4,
      breakfastPlanId: 'grand-morning-thali',
      guestName: 'Vikramaditya Rao',
    },
    {
      ref: 'SAT-84129',
      roomId: 'courtyard-sanctuary',
      startOffset: 14,
      nights: 3,
      roomsCount: 1, // Leaves 1 Sanctuary on day +14..+16
      guestsCount: 2,
      breakfastPlanId: 'artisan-wellness-tray',
      guestName: 'Priya Subramanian',
    },
  ];

  return seeds.map((seed, idx) => {
    const room = ROOM_CATEGORIES.find((r) => r.id === seed.roomId)!;
    const breakfast = BREAKFAST_PLANS.find((b) => b.id === seed.breakfastPlanId)!;
    const checkIn = addDays(today, seed.startOffset);
    const checkOut = addDays(today, seed.startOffset + seed.nights);
    const pricing = calculateStayPricing({
      room,
      breakfastPlan: breakfast,
      nights: seed.nights,
      roomsCount: seed.roomsCount,
      guestsCount: seed.guestsCount,
    });
    const txnId = `PAY-SEED-${1000 + idx}`;
    const authorizedAt = new Date().toISOString();
    const signature = signReceipt(seed.ref, txnId, pricing.totalInr);

    return {
      bookingRef: seed.ref,
      roomId: room.id,
      roomName: room.name,
      checkIn,
      checkOut,
      nights: seed.nights,
      roomsCount: seed.roomsCount,
      guestsCount: seed.guestsCount,
      breakfastPlanId: breakfast.id,
      breakfastPlanName: breakfast.name,
      breakfastTimeSlot: '08:00 AM',
      dietaryNotes: seed.breakfastPlanId === 'jain-pure-veg' ? 'Strict Jain preparation' : '',
      guestName: seed.guestName,
      guestEmail: `guest${idx + 1}@example.invalid`,
      guestPhone: '+91 98000 00000',
      pricing,
      payment: {
        method: 'upi',
        maskedReference: 'verified@upi',
        gatewayMode: 'verified_gateway',
        transactionId: txnId,
        authorizedAt,
        verificationSignature: signature,
      },
      status: 'confirmed',
      createdAt: authorizedAt,
    };
  });
}

function signReceipt(bookingRef: string, txnId: string, amountInr: number): string {
  return crypto
    .createHmac('sha256', PAYMENT_SIGNING_SECRET)
    .update(`${bookingRef}|${txnId}|${amountInr}`)
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
}

function ensureStoreLoaded(): StoredState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    const initial: StoredState = {
      bookings: createInitialSeedBookings(),
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  const raw = fs.readFileSync(STORE_FILE, 'utf8');
  return JSON.parse(raw) as StoredState;
}

function persistStore(state: StoredState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = path.resolve(DATA_DIR, `hotel-store.${process.pid}.tmp`);
  if (!tmpFile.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Invalid temporary store path');
  }
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, STORE_FILE);
}

// Serialized lock queue to prevent concurrent double-booking of the last room
let mutationQueue: Promise<unknown> = Promise.resolve();
function withStoreLock<T>(task: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function luhnCheck(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function validateExpiryMMYY(expiry: string): boolean {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry.trim());
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year > currentYear || (year === currentYear && month >= currentMonth);
}

async function processPaymentServerSide(
  payload: CheckoutPayload,
  totalInr: number,
  bookingRef: string,
): Promise<PaymentSummary> {
  const method = payload.payment.method;
  const authorizedAt = new Date().toISOString();
  let maskedReference = '';
  let gatewayMode: 'stripe_live' | 'verified_gateway' = 'verified_gateway';
  let transactionId = `PAY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  if (method === 'card') {
    const holder = (payload.payment.cardHolderName ?? '').trim();
    const digits = (payload.payment.cardNumber ?? '').replace(/\s|-/g, '');
    const expiry = (payload.payment.cardExpiry ?? '').trim();
    const cvc = (payload.payment.cardCvc ?? '').trim();

    if (holder.length < 2 || holder.length > 80) {
      throw new Error('Enter the cardholder name printed on your card.');
    }
    if (!/^\d{13,19}$/.test(digits) || !luhnCheck(digits)) {
      throw new Error('Please enter a valid card number.');
    }
    if (!validateExpiryMMYY(expiry)) {
      throw new Error('Card expiry date must be valid and not expired (MM/YY).');
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      throw new Error('Enter a valid 3 or 4 digit security code (CVC).');
    }

    maskedReference = `Card ending in ${digits.slice(-4)}`;

    // Optional live Stripe PaymentIntent creation when STRIPE_SECRET_KEY is configured
    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (stripeKey && stripeKey.startsWith('sk_')) {
      const formBody = new URLSearchParams({
        amount: String(totalInr * 100), // INR paise
        currency: 'inr',
        'payment_method_types[]': 'card',
        description: `Sattvika House Stay ${bookingRef}`,
        'metadata[bookingRef]': bookingRef,
      });
      const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString(),
      });
      if (!stripeRes.ok) {
        throw new Error('Payment gateway declined authorization. Please verify card details.');
      }
      const stripeData = (await stripeRes.json()) as { id?: string };
      if (stripeData.id) {
        transactionId = stripeData.id;
        gatewayMode = 'stripe_live';
      }
    }
  } else if (method === 'upi') {
    const upiId = (payload.payment.upiId ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,40}@[a-z0-9]{2,20}$/.test(upiId)) {
      throw new Error('Enter a valid UPI ID (e.g., name@okaxis or name@upi).');
    }
    const [handle, bank] = upiId.split('@');
    const maskedHandle =
      handle.length <= 2 ? `${handle[0]}*` : `${handle.slice(0, 2)}***${handle.slice(-1)}`;
    maskedReference = `UPI ${maskedHandle}@${bank}`;
  } else if (method === 'netbanking') {
    const bankName = (payload.payment.bankName ?? '').trim();
    if (
      !SUPPORTED_NETBANKING_BANKS.includes(
        bankName as (typeof SUPPORTED_NETBANKING_BANKS)[number],
      )
    ) {
      throw new Error('Please choose a supported bank for Net Banking.');
    }
    maskedReference = `Net Banking · ${bankName}`;
  } else {
    throw new Error('Unsupported payment method.');
  }

  return {
    method,
    maskedReference,
    gatewayMode,
    transactionId,
    authorizedAt,
    verificationSignature: signReceipt(bookingRef, transactionId, totalInr),
  };
}

// SSE subscribers for real-time room availability broadcasts
type AvailabilityListener = (payload: { type: string; updatedAt: string }) => void;
const listeners = new Set<AvailabilityListener>();

export function subscribeAvailability(listener: AvailabilityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function broadcastAvailabilityUpdate(): void {
  const evt = {
    type: 'availability-updated',
    updatedAt: new Date().toISOString(),
  };
  for (const listener of listeners) {
    try {
      listener(evt);
    } catch {
      listeners.delete(listener);
    }
  }
}

export function getAvailabilityForRange(startDateISO: string, daysCount: number): DayAvailabilitySummary[] {
  const start = parseDateISO(startDateISO);
  if (!start) {
    throw new Error('Invalid start date format (expected YYYY-MM-DD)');
  }
  const safeDays = Math.min(Math.max(daysCount, 1), 90);
  const state = ensureStoreLoaded();
  const activeBookings = state.bookings.filter((b) => b.status === 'confirmed');

  const result: DayAvailabilitySummary[] = [];
  for (let i = 0; i < safeDays; i++) {
    const dateISO = addDays(start, i);
    const roomsMap: Record<string, DayRoomAvailability> = {};
    let totalAvailableAcrossHotel = 0;
    let lowestAvailableRateInr: number | null = null;

    for (const room of ROOM_CATEGORIES) {
      const bookedForRoomAndDay = activeBookings
        .filter((b) => b.roomId === room.id && b.checkIn <= dateISO && dateISO < b.checkOut)
        .reduce((sum, b) => sum + b.roomsCount, 0);

      const available = Math.max(0, room.totalInventory - bookedForRoomAndDay);
      const status: DayRoomAvailability['status'] =
        available === 0 ? 'sold_out' : available === 1 ? 'limited' : 'available';

      roomsMap[room.id] = {
        roomId: room.id,
        available,
        total: room.totalInventory,
        status,
      };
      totalAvailableAcrossHotel += available;
      if (available > 0) {
        lowestAvailableRateInr =
          lowestAvailableRateInr === null
            ? room.nightlyRateInr
            : Math.min(lowestAvailableRateInr, room.nightlyRateInr);
      }
    }

    result.push({
      date: dateISO,
      rooms: roomsMap,
      totalAvailableAcrossHotel,
      lowestAvailableRateInr,
    });
  }
  return result;
}

export async function createConfirmedBooking(payload: CheckoutPayload): Promise<BookingRecord> {
  return withStoreLock(async () => {
    const room = ROOM_CATEGORIES.find((r) => r.id === payload.roomId);
    if (!room) {
      throw new Error('Selected room category was not found.');
    }
    const breakfast = BREAKFAST_PLANS.find((b) => b.id === payload.breakfastPlanId);
    if (!breakfast) {
      throw new Error('Selected pure vegetarian breakfast plan was not found.');
    }
    if (
      !BREAKFAST_TIME_SLOTS.includes(
        payload.breakfastTimeSlot as (typeof BREAKFAST_TIME_SLOTS)[number],
      )
    ) {
      throw new Error('Please choose a valid morning breakfast serving slot.');
    }

    const nightsList = enumerateStayNights(payload.checkIn, payload.checkOut);
    if (nightsList.length === 0) {
      throw new Error('Check-out date must be at least one night after check-in.');
    }
    if (nightsList.length > 30) {
      throw new Error('Online bookings support stays up to 30 nights.');
    }

    const todayISO = formatDateISO(new Date());
    if (payload.checkIn < todayISO) {
      throw new Error('Check-in date cannot be in the past.');
    }

    const roomsCount = Number(payload.roomsCount);
    const guestsCount = Number(payload.guestsCount);
    if (!Number.isInteger(roomsCount) || roomsCount < 1 || roomsCount > room.totalInventory) {
      throw new Error(`Please select between 1 and ${room.totalInventory} rooms.`);
    }
    if (
      !Number.isInteger(guestsCount) ||
      guestsCount < 1 ||
      guestsCount > roomsCount * room.maxGuests
    ) {
      throw new Error(
        `Guest count must be between 1 and ${roomsCount * room.maxGuests} for your selected rooms.`,
      );
    }

    const guestName = (payload.guestName ?? '').trim();
    const guestEmail = (payload.guestEmail ?? '').trim().toLowerCase();
    const guestPhone = (payload.guestPhone ?? '').trim();
    const dietaryNotes = (payload.dietaryNotes ?? '').trim().slice(0, 240);

    if (guestName.length < 2 || guestName.length > 80) {
      throw new Error('Please enter your full name (2–80 characters).');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail) || guestEmail.length > 120) {
      throw new Error('Please enter a valid email address for your stay folio.');
    }
    if (!/^[+\d\s()-]{8,20}$/.test(guestPhone)) {
      throw new Error('Please enter a valid contact phone number.');
    }

    // Verify real-time room availability across every single night in the range
    const state = ensureStoreLoaded();
    const activeBookings = state.bookings.filter(
      (b) => b.status === 'confirmed' && b.roomId === room.id,
    );

    for (const nightDate of nightsList) {
      const bookedCount = activeBookings
        .filter((b) => b.checkIn <= nightDate && nightDate < b.checkOut)
        .reduce((sum, b) => sum + b.roomsCount, 0);
      const remaining = room.totalInventory - bookedCount;
      if (remaining < roomsCount) {
        throw new Error(
          `Only ${Math.max(0, remaining)} ${room.name}(s) remain available on ${nightDate}. Please adjust dates or room category.`,
        );
      }
    }

    const pricing = calculateStayPricing({
      room,
      breakfastPlan: breakfast,
      nights: nightsList.length,
      roomsCount,
      guestsCount,
    });

    const bookingRef = `SAT-${crypto.randomInt(10000, 99999)}`;
    const paymentSummary = await processPaymentServerSide(payload, pricing.totalInr, bookingRef);

    const record: BookingRecord = {
      bookingRef,
      roomId: room.id,
      roomName: room.name,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      nights: nightsList.length,
      roomsCount,
      guestsCount,
      breakfastPlanId: breakfast.id,
      breakfastPlanName: breakfast.name,
      breakfastTimeSlot: payload.breakfastTimeSlot,
      dietaryNotes,
      guestName,
      guestEmail,
      guestPhone,
      pricing,
      payment: paymentSummary,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    state.bookings.unshift(record);
    persistStore(state);
    broadcastAvailabilityUpdate();

    return record;
  });
}

export function lookupBooking(bookingRef: string, email: string): BookingRecord | null {
  const cleanRef = bookingRef.trim().toUpperCase();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanRef || !cleanEmail) return null;

  const state = ensureStoreLoaded();
  const match = state.bookings.find(
    (b) => b.bookingRef.toUpperCase() === cleanRef && b.guestEmail.toLowerCase() === cleanEmail,
  );
  return match ?? null;
}

export async function cancelBooking(bookingRef: string, email: string): Promise<BookingRecord> {
  return withStoreLock(async () => {
    const cleanRef = bookingRef.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const state = ensureStoreLoaded();
    const idx = state.bookings.findIndex(
      (b) => b.bookingRef.toUpperCase() === cleanRef && b.guestEmail.toLowerCase() === cleanEmail,
    );

    if (idx === -1) {
      throw new Error('No reservation matched that booking reference and email address.');
    }
    const existing = state.bookings[idx];
    if (existing.status === 'cancelled') {
      return existing;
    }

    const updated: BookingRecord = {
      ...existing,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      refundRef: `REF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    };
    state.bookings[idx] = updated;
    persistStore(state);
    broadcastAvailabilityUpdate();

    return updated;
  });
}
