import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BREAKFAST_PLANS,
  BREAKFAST_TIME_SLOTS,
  ROOM_CATEGORIES,
  SUPPORTED_NETBANKING_BANKS,
  enumerateStayNights,
  formatDateISO,
  formatInr,
  type BookingRecord,
  type BreakfastPlan,
  type DayAvailabilitySummary,
  type RoomCategory,
} from '../shared/hotelData';
import { AvailabilityCalendar } from './components/AvailabilityCalendar';
import { CheckoutPanel } from './components/CheckoutPanel';
import { MyStaysSection } from './components/MyStaysSection';
import { ResilientImage } from './components/ResilientImage';
import { HOTEL_MEDIA } from './data/media';

interface CatalogResponse {
  serverDate: string;
  rooms: RoomCategory[];
  breakfastPlans: BreakfastPlan[];
  breakfastTimeSlots: string[];
  supportedBanks: string[];
  stripeConfigured: boolean;
}

interface AvailabilityResponse {
  start: string;
  days: number;
  generatedAt: string;
  availability: DayAvailabilitySummary[];
}

function addDaysISO(baseISO: string, offset: number): string {
  const dt = new Date(baseISO + 'T00:00:00');
  dt.setDate(dt.getDate() + offset);
  return formatDateISO(dt);
}

export default function App() {
  const todayDefault = useMemo(() => formatDateISO(new Date()), []);

  const [serverDate, setServerDate] = useState<string>(todayDefault);
  const [rooms, setRooms] = useState<RoomCategory[]>(ROOM_CATEGORIES);
  const [breakfastPlans, setBreakfastPlans] = useState<BreakfastPlan[]>(BREAKFAST_PLANS);
  const [breakfastTimeSlots, setBreakfastTimeSlots] = useState<readonly string[]>(
    BREAKFAST_TIME_SLOTS,
  );
  const [supportedBanks, setSupportedBanks] = useState<readonly string[]>(
    SUPPORTED_NETBANKING_BANKS,
  );
  const [stripeConfigured, setStripeConfigured] = useState(false);

  const [availabilityByDate, setAvailabilityByDate] = useState<
    Record<string, DayAvailabilitySummary>
  >({});
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [selectedRoomId, setSelectedRoomId] = useState<string>(ROOM_CATEGORIES[0].id);
  const [selectedBreakfastId, setSelectedBreakfastId] = useState<string>(
    BREAKFAST_PLANS[0].id,
  );
  const [checkIn, setCheckIn] = useState<string>(() => addDaysISO(todayDefault, 1));
  const [checkOut, setCheckOut] = useState<string>(() => addDaysISO(todayDefault, 2));
  const [guestsCount, setGuestsCount] = useState<number>(2);

  const [recentBookings, setRecentBookings] = useState<BookingRecord[]>([]);

  const fetchAvailability = useCallback(async (startISO: string) => {
    setIsLoadingAvailability(true);
    try {
      const params = new URLSearchParams({ start: startISO, days: '90' });
      const res = await fetch(`/api/availability?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as AvailabilityResponse;
      const map: Record<string, DayAvailabilitySummary> = {};
      for (const day of data.availability) {
        map[day.date] = day;
      }
      setAvailabilityByDate(map);
      setLastSyncedAt(data.generatedAt);
    } finally {
      setIsLoadingAvailability(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const res = await fetch('/api/catalog');
        if (res.ok && active) {
          const data = (await res.json()) as CatalogResponse;
          setServerDate(data.serverDate);
          setRooms(data.rooms);
          setBreakfastPlans(data.breakfastPlans);
          setBreakfastTimeSlots(data.breakfastTimeSlots);
          setSupportedBanks(data.supportedBanks);
          setStripeConfigured(data.stripeConfigured);
          setCheckIn(addDaysISO(data.serverDate, 1));
          setCheckOut(addDaysISO(data.serverDate, 2));
          await fetchAvailability(data.serverDate);
          return;
        }
      } catch {
        // Fallback to local default date
      }
      if (active) {
        await fetchAvailability(todayDefault);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [fetchAvailability, todayDefault]);

  // Real-time Server-Sent Events listener so room inventory updates live across tabs/guests
  useEffect(() => {
    const source = new EventSource('/api/availability/stream');
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as { type?: string };
        if (parsed.type === 'availability-updated') {
          void fetchAvailability(serverDate);
        }
      } catch {
        // Ignore malformed frames
      }
    };
    return () => {
      source.close();
    };
  }, [fetchAvailability, serverDate]);

  const stayNights = useMemo(() => enumerateStayNights(checkIn, checkOut), [checkIn, checkOut]);

  const getRoomMinAvailability = useCallback(
    (roomId: string) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return 0;
      if (stayNights.length === 0) return room.totalInventory;
      let minAvail = room.totalInventory;
      for (const night of stayNights) {
        const day = availabilityByDate[night];
        if (day?.rooms[roomId]) {
          minAvail = Math.min(minAvail, day.rooms[roomId].available);
        }
      }
      return minAvail;
    },
    [availabilityByDate, rooms, stayNights],
  );

  const scrollToAvailability = () => {
    const el = document.getElementById('availability');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectSuite = (roomId: string) => {
    setSelectedRoomId(roomId);
    scrollToAvailability();
  };

  const handleSelectBreakfast = (breakfastId: string) => {
    setSelectedBreakfastId(breakfastId);
    scrollToAvailability();
  };

  const handleBookingConfirmed = (booking: BookingRecord) => {
    setRecentBookings((prev) => [booking, ...prev]);
    void fetchAvailability(serverDate);
  };

  const handleBookingCancelled = (updated: BookingRecord) => {
    setRecentBookings((prev) => {
      const exists = prev.some((b) => b.bookingRef === updated.bookingRef);
      if (!exists) return [updated, ...prev];
      return prev.map((b) => (b.bookingRef === updated.bookingRef ? updated : b));
    });
    void fetchAvailability(serverDate);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] text-[#18181B]">
      {/* Strictly 3-zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#F8F7F4]/95 backdrop-blur-sm border-b border-[#E2DFD7]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-editorial text-2xl font-semibold tracking-tight text-[#18181B] whitespace-nowrap shrink-0"
          >
            Sattvika House
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#52525B]"
          >
            <a
              href="#suites"
              className="hover:text-[#18181B] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Suites
            </a>
            <a
              href="#breakfast"
              className="hover:text-[#18181B] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Breakfast
            </a>
            <a
              href="#availability"
              className="hover:text-[#18181B] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Availability
            </a>
            <a
              href="#my-stays"
              className="hover:text-[#18181B] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              My Stays
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={scrollToAvailability}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1B4332] text-white hover:bg-[#143326] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reserve Stay
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split + 4-Column Quick Booking Strip Below */}
        <section className="py-12 sm:py-16">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
              <div className="lg:col-span-5 flex flex-col justify-between py-2">
                <div>
                  <p className="text-xs font-medium text-[#52525B]">
                    Bengaluru Courtyard Sanctuary · 100% Pure Vegetarian Kitchen
                  </p>
                  <h1 className="font-editorial text-4xl sm:text-5xl lg:text-[54px] font-semibold leading-[1.06] tracking-tight text-[#18181B] mt-4 text-balance">
                    Quiet night stays with a pure veg morning table.
                  </h1>
                  <p className="mt-5 text-base text-[#52525B] leading-relaxed max-w-md">
                    Ten stone-walled courtyard rooms designed for deep rest, paired every morning with freshly ground dosas, Jain-dedicated preparations, and seasonal botanical infusions.
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-[#E2DFD7] flex flex-wrap items-center gap-6">
                  <button
                    type="button"
                    onClick={scrollToAvailability}
                    className="px-6 py-3 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#143326] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Check Live Availability
                  </button>
                  <a
                    href="#breakfast"
                    className="text-sm font-medium text-[#18181B] hover:text-[#1B4332] hover:underline underline-offset-4 whitespace-nowrap"
                  >
                    Explore Pure Veg Menu
                  </a>
                </div>
              </div>

              <div className="lg:col-span-7">
                <div className="h-full min-h-[300px] sm:min-h-[380px] rounded-2xl overflow-hidden border border-[#E2DFD7] bg-[#EFECE6]">
                  <ResilientImage
                    src={HOTEL_MEDIA.heroCourtyard}
                    alt="Sunlit limestone arches and lush botanical courtyard at Sattvika House"
                    fallbackTitle="Sattvika House Courtyard"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* 4-column Quick Booking Strip below the hero split */}
            <div className="mt-8 bg-white border border-[#E2DFD7] rounded-2xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label htmlFor="quick-checkin" className="block text-xs font-medium text-[#52525B] mb-1.5">
                  Check-in Night
                </label>
                <input
                  id="quick-checkin"
                  type="date"
                  min={serverDate}
                  value={checkIn}
                  onChange={(e) => {
                    const nextIn = e.target.value;
                    if (!nextIn) return;
                    if (nextIn >= checkOut) {
                      setCheckIn(nextIn);
                      setCheckOut(addDaysISO(nextIn, 1));
                    } else {
                      setCheckIn(nextIn);
                    }
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6] text-sm tabular-nums text-[#18181B] focus:outline-none focus:border-[#1B4332]"
                />
              </div>

              <div>
                <label htmlFor="quick-checkout" className="block text-xs font-medium text-[#52525B] mb-1.5">
                  Check-out Morning
                </label>
                <input
                  id="quick-checkout"
                  type="date"
                  min={addDaysISO(checkIn, 1)}
                  value={checkOut}
                  onChange={(e) => {
                    if (e.target.value > checkIn) {
                      setCheckOut(e.target.value);
                    }
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6] text-sm tabular-nums text-[#18181B] focus:outline-none focus:border-[#1B4332]"
                />
              </div>

              <div>
                <label htmlFor="quick-breakfast" className="block text-xs font-medium text-[#52525B] mb-1.5">
                  Pure Veg Breakfast
                </label>
                <select
                  id="quick-breakfast"
                  value={selectedBreakfastId}
                  onChange={(e) => setSelectedBreakfastId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6] text-sm text-[#18181B] focus:outline-none focus:border-[#1B4332]"
                >
                  {breakfastPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={scrollToAvailability}
                className="h-10 px-5 rounded-lg bg-[#18181B] text-white text-sm font-medium hover:bg-[#27272A] transition-colors whitespace-nowrap cursor-pointer"
              >
                View Calendar & Book
              </button>
            </div>
          </div>
        </section>

        {/* Suites & Night Stay Collection */}
        <section id="suites" className="py-16 sm:py-20 border-t border-[#E2DFD7]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-xs font-medium text-[#52525B]">
                  Night Stay Collection · Pure Veg Breakfast Included
                </p>
                <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#18181B] mt-2">
                  Ten Courtyard Rooms & Suites
                </h2>
              </div>
              <p className="text-xs text-[#52525B] tabular-nums">
                Showing availability for {checkIn} to {checkOut} ({stayNights.length}{' '}
                {stayNights.length === 1 ? 'night' : 'nights'})
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {rooms.map((room) => {
                const remaining = getRoomMinAvailability(room.id);
                const isSelected = selectedRoomId === room.id;

                return (
                  <article
                    key={room.id}
                    className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5 ${
                      isSelected ? 'border-[#1B4332]' : 'border-[#E2DFD7]'
                    }`}
                  >
                    <div className="aspect-[4/3] bg-[#EFECE6] overflow-hidden">
                      <ResilientImage
                        src={HOTEL_MEDIA.rooms[room.id] ?? ''}
                        alt={room.name}
                        fallbackTitle={room.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-xs text-[#52525B]">{room.subtitle}</p>
                        <h3 className="font-editorial text-2xl font-semibold text-[#18181B] mt-1">
                          {room.name}
                        </h3>
                        <p className="mt-2.5 text-sm text-[#52525B] leading-relaxed">
                          {room.description}
                        </p>

                        <ul className="mt-4 pt-4 border-t border-[#EFECE6] space-y-1.5 text-xs text-[#52525B]">
                          {room.highlights.map((item) => (
                            <li key={item}>· {item}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-6 pt-4 border-t border-[#EFECE6] flex items-center justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold tabular-nums text-[#18181B]">
                            {formatInr(room.nightlyRateInr)}{' '}
                            <span className="text-xs font-normal text-[#52525B]">/ night</span>
                          </p>
                          <p
                            className={`text-xs tabular-nums mt-0.5 ${
                              remaining === 0
                                ? 'text-[#991B1B] font-medium'
                                : remaining === 1
                                  ? 'text-[#9A6B2F] font-medium'
                                  : 'text-[#1B4332]'
                            }`}
                          >
                            {remaining === 0
                              ? 'Sold out for selected dates'
                              : `${remaining} of ${room.totalInventory} available`}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectSuite(room.id)}
                          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isSelected
                              ? 'bg-[#1B4332] text-white'
                              : 'bg-[#F5F4F0] text-[#18181B] hover:bg-[#1B4332] hover:text-white'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Select Suite'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* 100% Pure Veg Breakfast Kitchen */}
        <section id="breakfast" className="py-16 sm:py-20 border-t border-[#E2DFD7] bg-white">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
              <div className="lg:col-span-5">
                <div className="h-full min-h-[280px] rounded-2xl overflow-hidden border border-[#E2DFD7] bg-[#EFECE6]">
                  <ResilientImage
                    src={HOTEL_MEDIA.breakfastTable}
                    alt="Pure vegetarian morning breakfast spread with masala dosa, saffron millet bowl, fresh figs, and filter coffee"
                    fallbackTitle="100% Pure Veg Kitchen"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-medium text-[#52525B]">
                    Dedicated Pure Vegetarian Kitchen · Zero Cross-Contamination
                  </p>
                  <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#18181B] mt-2 text-balance">
                    Morning Breakfast, Crafted Exclusively Vegetarian
                  </h2>
                  <p className="mt-3 text-sm sm:text-base text-[#52525B] leading-relaxed">
                    Every overnight stay includes our Sattvic or Jain morning breakfast table. Our kitchen prepares zero meat, zero egg, and maintains separate vessels for strict no-onion, no-garlic Jain menus.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {breakfastPlans.map((plan) => {
                    const active = selectedBreakfastId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => handleSelectBreakfast(plan.id)}
                        className={`text-left p-5 rounded-xl border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#FAF9F6] border-[#1B4332]'
                            : 'bg-white border-[#E2DFD7] hover:border-[#18181B]/40'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs text-[#52525B]">{plan.servingWindow}</span>
                          <span className="text-xs font-semibold tabular-nums text-[#1B4332]">
                            {plan.pricePerGuestPerNightInr === 0
                              ? 'Included'
                              : `+${formatInr(plan.pricePerGuestPerNightInr)}/guest`}
                          </span>
                        </div>
                        <h3 className="font-editorial text-xl font-semibold text-[#18181B] mt-1">
                          {plan.name}
                        </h3>
                        <p className="text-xs font-medium text-[#9A6B2F] mt-0.5">
                          {plan.kitchenGuarantee}
                        </p>
                        <p className="mt-2 text-xs text-[#52525B] leading-relaxed">
                          {plan.dishes.slice(0, 3).join(' · ')}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Real-Time Room Availability Calendar & Online Payment Workbench */}
        <section id="availability" className="py-16 sm:py-24 border-t border-[#E2DFD7]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="mb-10 max-w-2xl">
              <p className="text-xs font-medium text-[#52525B]">
                Live Room Availability & Instant Online Payment
              </p>
              <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#18181B] mt-2 text-balance">
                Reserve Your Night Stay & Pure Veg Breakfast
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7">
                <AvailabilityCalendar
                  serverDate={serverDate}
                  rooms={rooms}
                  availabilityByDate={availabilityByDate}
                  selectedRoomId={selectedRoomId}
                  onSelectRoomFilter={setSelectedRoomId}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onChangeDates={(newIn, newOut) => {
                    setCheckIn(newIn);
                    setCheckOut(newOut);
                  }}
                  isLoading={isLoadingAvailability}
                  lastSyncedAt={lastSyncedAt}
                />
              </div>

              <div className="lg:col-span-5">
                <CheckoutPanel
                  rooms={rooms}
                  breakfastPlans={breakfastPlans}
                  breakfastTimeSlots={breakfastTimeSlots}
                  supportedBanks={supportedBanks}
                  availabilityByDate={availabilityByDate}
                  selectedRoomId={selectedRoomId}
                  onSelectRoom={setSelectedRoomId}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onChangeDates={(newIn, newOut) => {
                    setCheckIn(newIn);
                    setCheckOut(newOut);
                  }}
                  selectedBreakfastId={selectedBreakfastId}
                  onSelectBreakfast={setSelectedBreakfastId}
                  guestsCount={guestsCount}
                  onChangeGuestsCount={setGuestsCount}
                  stripeConfigured={stripeConfigured}
                  onBookingConfirmed={handleBookingConfirmed}
                />
              </div>
            </div>
          </div>
        </section>

        <MyStaysSection
          recentBookings={recentBookings}
          onBookingCancelled={handleBookingCancelled}
        />
      </main>

      <footer className="border-t border-[#E2DFD7] bg-white py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-[#52525B]">
          <div>
            <p className="font-editorial text-lg font-semibold text-[#18181B]">
              Sattvika House
            </p>
            <p className="mt-1">
              14 Laurel Grove Road, Indiranagar · 100% Pure Vegetarian Hospitality Kitchen
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#suites" className="hover:text-[#18181B]">
              Suites
            </a>
            <a href="#breakfast" className="hover:text-[#18181B]">
              Pure Veg Kitchen
            </a>
            <a href="#availability" className="hover:text-[#18181B]">
              Live Availability
            </a>
            <a href="#my-stays" className="hover:text-[#18181B]">
              Manage Folio
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
