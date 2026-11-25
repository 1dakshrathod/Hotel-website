import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Landmark,
  Lock,
  Minus,
  Plus,
  Smartphone,
  Utensils,
} from 'lucide-react';
import {
  calculateStayPricing,
  enumerateStayNights,
  formatInr,
  type BookingRecord,
  type BreakfastPlan,
  type DayAvailabilitySummary,
  type RoomCategory,
} from '../../shared/hotelData';

interface CheckoutPanelProps {
  rooms: RoomCategory[];
  breakfastPlans: BreakfastPlan[];
  breakfastTimeSlots: readonly string[];
  supportedBanks: readonly string[];
  availabilityByDate: Record<string, DayAvailabilitySummary>;
  selectedRoomId: string;
  onSelectRoom: (roomId: string) => void;
  checkIn: string;
  checkOut: string;
  onChangeDates: (checkIn: string, checkOut: string) => void;
  selectedBreakfastId: string;
  onSelectBreakfast: (breakfastId: string) => void;
  guestsCount: number;
  onChangeGuestsCount: (count: number) => void;
  stripeConfigured: boolean;
  onBookingConfirmed: (booking: BookingRecord) => void;
}

function formatCardInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function CheckoutPanel({
  rooms,
  breakfastPlans,
  breakfastTimeSlots,
  supportedBanks,
  availabilityByDate,
  selectedRoomId,
  onSelectRoom,
  checkIn,
  checkOut,
  onChangeDates,
  selectedBreakfastId,
  onSelectBreakfast,
  guestsCount,
  onChangeGuestsCount,
  stripeConfigured,
  onBookingConfirmed,
}: CheckoutPanelProps) {
  const [roomsCount, setRoomsCount] = useState(1);
  const [breakfastTimeSlot, setBreakfastTimeSlot] = useState<string>(
    breakfastTimeSlots[1] ?? '08:00 AM',
  );
  const [dietaryNotes, setDietaryNotes] = useState('');

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi' | 'netbanking'>('card');
  const [cardHolderName, setCardHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [bankName, setBankName] = useState<string>(supportedBanks[0] ?? 'HDFC Bank');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingRecord | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? rooms[0],
    [rooms, selectedRoomId],
  );
  const selectedBreakfast = useMemo(
    () => breakfastPlans.find((b) => b.id === selectedBreakfastId) ?? breakfastPlans[0],
    [breakfastPlans, selectedBreakfastId],
  );

  const nightsList = useMemo(
    () => enumerateStayNights(checkIn, checkOut),
    [checkIn, checkOut],
  );

  // Compute the minimum remaining rooms across every night in [checkIn, checkOut)
  const minRemainingRooms = useMemo(() => {
    if (!selectedRoom || nightsList.length === 0) return 0;
    let minAvail = selectedRoom.totalInventory;
    for (const night of nightsList) {
      const day = availabilityByDate[night];
      if (!day || !day.rooms[selectedRoom.id]) {
        return selectedRoom.totalInventory;
      }
      minAvail = Math.min(minAvail, day.rooms[selectedRoom.id].available);
    }
    return minAvail;
  }, [availabilityByDate, nightsList, selectedRoom]);

  useEffect(() => {
    if (minRemainingRooms > 0 && roomsCount > minRemainingRooms) {
      setRoomsCount(minRemainingRooms);
    }
  }, [minRemainingRooms, roomsCount]);

  useEffect(() => {
    if (selectedRoom) {
      const maxGuests = Math.max(1, roomsCount * selectedRoom.maxGuests);
      if (guestsCount > maxGuests) {
        onChangeGuestsCount(maxGuests);
      }
    }
  }, [guestsCount, onChangeGuestsCount, roomsCount, selectedRoom]);

  const pricing = useMemo(() => {
    if (!selectedRoom || !selectedBreakfast || nightsList.length === 0) {
      return null;
    }
    return calculateStayPricing({
      room: selectedRoom,
      breakfastPlan: selectedBreakfast,
      nights: nightsList.length,
      roomsCount,
      guestsCount,
    });
  }, [selectedRoom, selectedBreakfast, nightsList.length, roomsCount, guestsCount]);

  const fillDemoPayment = () => {
    setErrorMsg(null);
    if (paymentMethod === 'card') {
      setCardHolderName(guestName.trim() || 'Aarav Sharma');
      setCardNumber('4242 4242 4242 4242');
      setCardExpiry('12/29');
      setCardCvc('424');
    } else if (paymentMethod === 'upi') {
      setUpiId('aarav.sharma@okhdfcbank');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedRoom || !selectedBreakfast || nightsList.length === 0) {
      setErrorMsg('Please select valid check-in and check-out dates.');
      return;
    }
    if (minRemainingRooms < roomsCount) {
      setErrorMsg(
        `Only ${minRemainingRooms} ${selectedRoom.name}(s) remain for your chosen dates. Please select another suite or date.`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/bookings/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: selectedRoom.id,
          checkIn,
          checkOut,
          roomsCount,
          guestsCount,
          breakfastPlanId: selectedBreakfast.id,
          breakfastTimeSlot,
          dietaryNotes,
          guestName,
          guestEmail,
          guestPhone,
          payment: {
            method: paymentMethod,
            cardHolderName,
            cardNumber,
            cardExpiry,
            cardCvc,
            upiId,
            bankName,
          },
        }),
      });

      const data = (await res.json()) as { booking?: BookingRecord; error?: string };
      if (!res.ok || !data.booking) {
        throw new Error(data.error || 'Payment authorization could not be completed.');
      }

      setConfirmedBooking(data.booking);
      onBookingConfirmed(data.booking);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete booking checkout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmedBooking) {
    return (
      <div className="bg-white border border-[#E2DFD7] rounded-2xl p-6 sm:p-8">
        <div className="flex items-start gap-3 pb-5 border-b border-[#EFECE6]">
          <CheckCircle2 className="w-6 h-6 text-[#1B4332] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-[#1B4332]">
              Reservation & Payment Confirmed
            </p>
            <h3 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#18181B] mt-0.5">
              Folio {confirmedBooking.bookingRef}
            </h3>
          </div>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[#52525B]">Guest</dt>
            <dd className="font-medium text-[#18181B] text-right">
              {confirmedBooking.guestName} · {confirmedBooking.guestEmail}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#52525B]">Suite</dt>
            <dd className="font-medium text-[#18181B] text-right tabular-nums">
              {confirmedBooking.roomsCount} × {confirmedBooking.roomName}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#52525B]">Night Stay</dt>
            <dd className="font-medium text-[#18181B] text-right tabular-nums">
              {confirmedBooking.checkIn} to {confirmedBooking.checkOut} ({confirmedBooking.nights}{' '}
              {confirmedBooking.nights === 1 ? 'night' : 'nights'})
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#52525B]">Pure Veg Breakfast</dt>
            <dd className="font-medium text-[#18181B] text-right">
              {confirmedBooking.breakfastPlanName} · {confirmedBooking.breakfastTimeSlot}
            </dd>
          </div>
          <div className="flex justify-between gap-4 pt-3 border-t border-[#EFECE6]">
            <dt className="text-[#52525B]">Payment Paid</dt>
            <dd className="font-semibold text-[#1B4332] text-right tabular-nums">
              {formatInr(confirmedBooking.pricing.totalInr)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 text-xs">
            <dt className="text-[#52525B]">Transaction</dt>
            <dd className="font-mono text-[#52525B] text-right tabular-nums">
              {confirmedBooking.payment.transactionId} · {confirmedBooking.payment.maskedReference}
            </dd>
          </div>
          <div className="flex justify-between gap-4 text-xs">
            <dt className="text-[#52525B]">Receipt Verification</dt>
            <dd className="font-mono text-[#52525B] text-right tabular-nums">
              {confirmedBooking.payment.verificationSignature}
            </dd>
          </div>
        </dl>

        <div className="mt-6 pt-5 border-t border-[#EFECE6] flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#52525B]">
            Save folio code <span className="font-mono font-medium text-[#18181B]">{confirmedBooking.bookingRef}</span> for lookup or cancellation below.
          </p>
          <button
            type="button"
            onClick={() => setConfirmedBooking(null)}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-[#1B4332] text-white hover:bg-[#143326] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Book Another Stay
          </button>
        </div>
      </div>
    );
  }

  const maxGuestsAllowed = selectedRoom ? roomsCount * selectedRoom.maxGuests : 4;

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-[#E2DFD7] rounded-2xl p-6 sm:p-8 space-y-6"
    >
      <div className="pb-5 border-b border-[#EFECE6]">
        <p className="text-xs font-medium text-[#52525B]">
          Night Stay + 100% Pure Veg Morning Kitchen
        </p>
        <h3 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#18181B] mt-1">
          Complete Your Reservation
        </h3>
      </div>

      {/* Selected Dates & Room Configuration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="checkout-checkin" className="block text-xs font-medium text-[#52525B] mb-1.5">
            Check-in Date
          </label>
          <input
            id="checkout-checkin"
            type="date"
            value={checkIn}
            onChange={(e) => {
              const nextIn = e.target.value;
              if (nextIn && nextIn >= checkOut) {
                const dt = new Date(nextIn + 'T00:00:00');
                dt.setDate(dt.getDate() + 1);
                const nextOut = dt.toISOString().slice(0, 10);
                onChangeDates(nextIn, nextOut);
              } else if (nextIn) {
                onChangeDates(nextIn, checkOut);
              }
            }}
            className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6] text-sm text-[#18181B] tabular-nums focus:outline-none focus:border-[#1B4332]"
          />
        </div>
        <div>
          <label htmlFor="checkout-checkout" className="block text-xs font-medium text-[#52525B] mb-1.5">
            Check-out Date
          </label>
          <input
            id="checkout-checkout"
            type="date"
            value={checkOut}
            min={checkIn}
            onChange={(e) => {
              if (e.target.value > checkIn) {
                onChangeDates(checkIn, e.target.value);
              }
            }}
            className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6] text-sm text-[#18181B] tabular-nums focus:outline-none focus:border-[#1B4332]"
          />
        </div>
      </div>

      {/* Suite & Steppers */}
      <div className="space-y-4">
        <div>
          <label htmlFor="suite-select" className="block text-xs font-medium text-[#52525B] mb-1.5">
            Suite Category
          </label>
          <select
            id="suite-select"
            value={selectedRoom?.id ?? ''}
            onChange={(e) => onSelectRoom(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm text-[#18181B] focus:outline-none focus:border-[#1B4332]"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} — {formatInr(room.nightlyRateInr)} / night
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs tabular-nums text-[#52525B]">
            {minRemainingRooms > 0 ? (
              <span>
                Live inventory: <strong className="text-[#1B4332]">{minRemainingRooms} available</strong> across all {nightsList.length}{' '}
                {nightsList.length === 1 ? 'night' : 'nights'}
              </span>
            ) : (
              <span className="text-[#991B1B] font-medium">
                Sold out on one or more selected nights — please switch suite or dates on the calendar.
              </span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6]">
            <span className="text-xs font-medium text-[#52525B]">Rooms</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease rooms"
                onClick={() => setRoomsCount((c) => Math.max(1, c - 1))}
                className="w-7 h-7 rounded-md border border-[#E2DFD7] bg-white flex items-center justify-center text-[#18181B] hover:bg-[#EFECE6] cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-semibold tabular-nums w-5 text-center">{roomsCount}</span>
              <button
                type="button"
                aria-label="Increase rooms"
                disabled={roomsCount >= Math.max(1, minRemainingRooms)}
                onClick={() =>
                  setRoomsCount((c) => Math.min(Math.max(1, minRemainingRooms), c + 1))
                }
                className="w-7 h-7 rounded-md border border-[#E2DFD7] bg-white flex items-center justify-center text-[#18181B] hover:bg-[#EFECE6] disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6]">
            <span className="text-xs font-medium text-[#52525B]">Guests</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease guests"
                onClick={() => onChangeGuestsCount(Math.max(1, guestsCount - 1))}
                className="w-7 h-7 rounded-md border border-[#E2DFD7] bg-white flex items-center justify-center text-[#18181B] hover:bg-[#EFECE6] cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-semibold tabular-nums w-5 text-center">{guestsCount}</span>
              <button
                type="button"
                aria-label="Increase guests"
                disabled={guestsCount >= maxGuestsAllowed}
                onClick={() => onChangeGuestsCount(Math.min(maxGuestsAllowed, guestsCount + 1))}
                className="w-7 h-7 rounded-md border border-[#E2DFD7] bg-white flex items-center justify-center text-[#18181B] hover:bg-[#EFECE6] disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pure Veg Breakfast Configurator */}
      <div className="pt-5 border-t border-[#EFECE6] space-y-4">
        <div className="flex items-center gap-2">
          <Utensils className="w-4 h-4 text-[#1B4332]" />
          <h4 className="text-sm font-semibold text-[#18181B]">
            100% Pure Veg Breakfast Selection
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="breakfast-plan" className="block text-xs font-medium text-[#52525B] mb-1.5">
              Morning Kitchen Plan
            </label>
            <select
              id="breakfast-plan"
              value={selectedBreakfast?.id ?? ''}
              onChange={(e) => onSelectBreakfast(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm text-[#18181B] focus:outline-none focus:border-[#1B4332]"
            >
              {breakfastPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}{' '}
                  {plan.pricePerGuestPerNightInr === 0
                    ? '(Included)'
                    : `(+${formatInr(plan.pricePerGuestPerNightInr)}/guest)`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="breakfast-slot" className="block text-xs font-medium text-[#52525B] mb-1.5">
              Serving Window
            </label>
            <select
              id="breakfast-slot"
              value={breakfastTimeSlot}
              onChange={(e) => setBreakfastTimeSlot(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm text-[#18181B] tabular-nums focus:outline-none focus:border-[#1B4332]"
            >
              {breakfastTimeSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="dietary-notes" className="block text-xs font-medium text-[#52525B] mb-1.5">
            Kitchen Notes (optional — e.g. Jain no-root prep, dairy-free, spice preference)
          </label>
          <input
            id="dietary-notes"
            type="text"
            maxLength={240}
            value={dietaryNotes}
            onChange={(e) => setDietaryNotes(e.target.value)}
            placeholder="All dishes prepared in our dedicated pure vegetarian kitchen"
            className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6] text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#1B4332]"
          />
        </div>
      </div>

      {/* Guest Details */}
      <div className="pt-5 border-t border-[#EFECE6] space-y-3">
        <h4 className="text-sm font-semibold text-[#18181B]">Primary Guest Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="guest-name" className="block text-xs font-medium text-[#52525B] mb-1">
              Full Name
            </label>
            <input
              id="guest-name"
              type="text"
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Aarav Sharma"
              className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm text-[#18181B] focus:outline-none focus:border-[#1B4332]"
            />
          </div>
          <div>
            <label htmlFor="guest-phone" className="block text-xs font-medium text-[#52525B] mb-1">
              Mobile Number
            </label>
            <input
              id="guest-phone"
              type="tel"
              required
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="+91 98200 11223"
              className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm text-[#18181B] tabular-nums focus:outline-none focus:border-[#1B4332]"
            />
          </div>
        </div>
        <div>
          <label htmlFor="guest-email" className="block text-xs font-medium text-[#52525B] mb-1">
            Email Address (for booking folio & receipt)
          </label>
          <input
            id="guest-email"
            type="email"
            required
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            placeholder="aarav.sharma@example.com"
            className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm text-[#18181B] focus:outline-none focus:border-[#1B4332]"
          />
        </div>
      </div>

      {/* Online Payment Processing */}
      <div className="pt-5 border-t border-[#EFECE6] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#1B4332]" />
            <h4 className="text-sm font-semibold text-[#18181B]">
              Online Payment {stripeConfigured ? '(Stripe Live)' : '(Encrypted Gateway)'}
            </h4>
          </div>
          {paymentMethod !== 'netbanking' && (
            <button
              type="button"
              onClick={fillDemoPayment}
              className="text-xs font-medium text-[#1B4332] hover:underline cursor-pointer"
            >
              Fill sample {paymentMethod === 'card' ? 'card' : 'UPI ID'}
            </button>
          )}
        </div>

        {/* Payment Method Segmented Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F5F4F0] rounded-xl">
          <button
            type="button"
            onClick={() => setPaymentMethod('card')}
            className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              paymentMethod === 'card'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Card</span>
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('upi')}
            className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              paymentMethod === 'upi'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>UPI</span>
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('netbanking')}
            className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              paymentMethod === 'netbanking'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Net Banking</span>
          </button>
        </div>

        {paymentMethod === 'card' && (
          <div className="space-y-3">
            <div>
              <label htmlFor="card-holder" className="block text-xs font-medium text-[#52525B] mb-1">
                Name on Card
              </label>
              <input
                id="card-holder"
                type="text"
                required
                value={cardHolderName}
                onChange={(e) => setCardHolderName(e.target.value)}
                placeholder="Aarav Sharma"
                className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm text-[#18181B] focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div>
              <label htmlFor="card-number" className="block text-xs font-medium text-[#52525B] mb-1">
                Card Number
              </label>
              <input
                id="card-number"
                type="text"
                inputMode="numeric"
                required
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardInput(e.target.value))}
                placeholder="4242 4242 4242 4242"
                className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm font-mono tabular-nums text-[#18181B] focus:outline-none focus:border-[#1B4332]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="card-expiry" className="block text-xs font-medium text-[#52525B] mb-1">
                  Expiry (MM/YY)
                </label>
                <input
                  id="card-expiry"
                  type="text"
                  inputMode="numeric"
                  required
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(formatExpiryInput(e.target.value))}
                  placeholder="12/29"
                  className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm font-mono tabular-nums text-[#18181B] focus:outline-none focus:border-[#1B4332]"
                />
              </div>
              <div>
                <label htmlFor="card-cvc" className="block text-xs font-medium text-[#52525B] mb-1">
                  CVC
                </label>
                <input
                  id="card-cvc"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="424"
                  className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm font-mono tabular-nums text-[#18181B] focus:outline-none focus:border-[#1B4332]"
                />
              </div>
            </div>
          </div>
        )}

        {paymentMethod === 'upi' && (
          <div>
            <label htmlFor="upi-id" className="block text-xs font-medium text-[#52525B] mb-1">
              UPI Virtual Payment Address (VPA)
            </label>
            <input
              id="upi-id"
              type="text"
              required
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="name@okhdfcbank"
              className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm font-mono text-[#18181B] focus:outline-none focus:border-[#1B4332]"
            />
          </div>
        )}

        {paymentMethod === 'netbanking' && (
          <div>
            <label htmlFor="bank-select" className="block text-xs font-medium text-[#52525B] mb-1">
              Select Bank
            </label>
            <select
              id="bank-select"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-white text-sm text-[#18181B] focus:outline-none focus:border-[#1B4332]"
            >
              {supportedBanks.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Pricing Summary */}
      {pricing && selectedRoom && selectedBreakfast && (
        <div className="pt-5 border-t border-[#EFECE6] space-y-2.5 text-sm">
          <div className="flex justify-between text-[#52525B]">
            <span>
              {selectedRoom.name} × {pricing.nights} {pricing.nights === 1 ? 'night' : 'nights'} ×{' '}
              {pricing.roomsCount} {pricing.roomsCount === 1 ? 'room' : 'rooms'}
            </span>
            <span className="tabular-nums text-[#18181B]">
              {formatInr(pricing.roomSubtotalInr)}
            </span>
          </div>
          <div className="flex justify-between text-[#52525B]">
            <span>
              {selectedBreakfast.name} ({pricing.guestsCount}{' '}
              {pricing.guestsCount === 1 ? 'guest' : 'guests'})
            </span>
            <span className="tabular-nums text-[#18181B]">
              {pricing.breakfastSubtotalInr === 0
                ? 'Included'
                : formatInr(pricing.breakfastSubtotalInr)}
            </span>
          </div>
          <div className="flex justify-between text-[#52525B]">
            <span>Taxes & Hospitality GST (12%)</span>
            <span className="tabular-nums text-[#18181B]">
              {formatInr(pricing.taxesAndServiceInr)}
            </span>
          </div>
          <div className="flex justify-between items-baseline pt-3 border-t border-[#EFECE6] text-base font-semibold text-[#18181B]">
            <span>Total Payable</span>
            <span className="text-xl tabular-nums text-[#1B4332]">
              {formatInr(pricing.totalInr)}
            </span>
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-[#F1DADA] bg-[#FDF6F6] text-xs text-[#991B1B]"
        >
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || minRemainingRooms < roomsCount || !pricing}
        className="w-full py-3.5 px-5 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#143326] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer tabular-nums"
      >
        {isSubmitting
          ? 'Authorizing Payment...'
          : pricing
            ? `Pay ${formatInr(pricing.totalInr)} & Confirm Stay`
            : 'Select Dates to Book'}
      </button>
    </form>
  );
}
