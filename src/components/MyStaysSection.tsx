import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { formatInr, type BookingRecord } from '../../shared/hotelData';

interface MyStaysSectionProps {
  recentBookings: BookingRecord[];
  onBookingCancelled: (updated: BookingRecord) => void;
}

export function MyStaysSection({
  recentBookings,
  onBookingCancelled,
}: MyStaysSectionProps) {
  const [lookupRef, setLookupRef] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<BookingRecord | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [cancellingRef, setCancellingRef] = useState<string | null>(null);

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setLookupResult(null);
    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        ref: lookupRef.trim(),
        email: lookupEmail.trim(),
      });
      const res = await fetch(`/api/bookings/lookup?${params.toString()}`);
      const data = (await res.json()) as { booking?: BookingRecord; error?: string };
      if (!res.ok || !data.booking) {
        throw new Error(data.error || 'Reservation not found.');
      }
      setLookupResult(data.booking);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to look up reservation.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleCancel = async (booking: BookingRecord) => {
    setCancellingRef(booking.bookingRef);
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(booking.bookingRef)}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: booking.guestEmail }),
        },
      );
      const data = (await res.json()) as { booking?: BookingRecord; error?: string };
      if (!res.ok || !data.booking) {
        throw new Error(data.error || 'Unable to cancel booking.');
      }
      if (lookupResult?.bookingRef === data.booking.bookingRef) {
        setLookupResult(data.booking);
      }
      onBookingCancelled(data.booking);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to cancel reservation.');
    } finally {
      setCancellingRef(null);
    }
  };

  const displayedBookings = useMemoMerge(recentBookings, lookupResult);

  return (
    <section id="my-stays" className="py-16 sm:py-24 border-t border-[#E2DFD7]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5">
            <p className="text-xs font-medium text-[#52525B]">
              Reservation Lookup & Cancellation
            </p>
            <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#18181B] mt-2 text-balance">
              Manage Your Stay & Breakfast Folio
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#52525B] leading-relaxed">
              Enter your folio code and booking email to inspect payment verification or cancel a stay. Cancelled nights return to the live availability calendar immediately.
            </p>

            <form onSubmit={handleLookup} className="mt-6 space-y-3 bg-white border border-[#E2DFD7] rounded-2xl p-5">
              <div>
                <label htmlFor="lookup-ref" className="block text-xs font-medium text-[#52525B] mb-1">
                  Booking Reference
                </label>
                <input
                  id="lookup-ref"
                  type="text"
                  required
                  value={lookupRef}
                  onChange={(e) => setLookupRef(e.target.value.toUpperCase())}
                  placeholder="SAT-84102"
                  className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6] text-sm font-mono text-[#18181B] focus:outline-none focus:border-[#1B4332]"
                />
              </div>
              <div>
                <label htmlFor="lookup-email" className="block text-xs font-medium text-[#52525B] mb-1">
                  Guest Email
                </label>
                <input
                  id="lookup-email"
                  type="email"
                  required
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="guest@example.com"
                  className="w-full h-10 px-3 rounded-lg border border-[#E2DFD7] bg-[#FAF9F6] text-sm text-[#18181B] focus:outline-none focus:border-[#1B4332]"
                />
              </div>
              {lookupError && (
                <p role="alert" className="text-xs text-[#991B1B]">
                  {lookupError}
                </p>
              )}
              <button
                type="submit"
                disabled={isSearching}
                className="w-full py-2.5 px-4 rounded-lg bg-[#18181B] text-white text-xs font-semibold hover:bg-[#27272A] transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{isSearching ? 'Searching...' : 'Retrieve Stay Folio'}</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-4">
            {displayedBookings.length === 0 ? (
              <div className="bg-white border border-[#E2DFD7] rounded-2xl p-8 text-center">
                <p className="font-editorial text-2xl text-[#18181B]">No Active Folios Loaded</p>
                <p className="mt-2 text-sm text-[#52525B] max-w-md mx-auto">
                  Reservations you confirm in this browser appear here automatically, or use the lookup form to load any booking by folio reference and email.
                </p>
              </div>
            ) : (
              displayedBookings.map((booking) => (
                <div
                  key={booking.bookingRef}
                  className="bg-white border border-[#E2DFD7] rounded-2xl p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#EFECE6]">
                    <div>
                      <div className="text-xs text-[#52525B] tabular-nums">
                        <span className="font-mono font-medium text-[#18181B]">
                          {booking.bookingRef}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>
                          {booking.status === 'confirmed'
                            ? 'Confirmed & Paid'
                            : `Cancelled · Refund ${booking.refundRef ?? 'Issued'}`}
                        </span>
                      </div>
                      <h3 className="font-editorial text-2xl font-semibold text-[#18181B] mt-1">
                        {booking.roomName}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-semibold tabular-nums text-[#18181B]">
                        {formatInr(booking.pricing.totalInr)}
                      </p>
                      <p className="text-xs font-mono text-[#52525B] tabular-nums">
                        {booking.payment.maskedReference}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-[#52525B]">Stay Dates</p>
                      <p className="font-medium text-[#18181B] tabular-nums">
                        {booking.checkIn} to {booking.checkOut} ({booking.nights}{' '}
                        {booking.nights === 1 ? 'night' : 'nights'}, {booking.roomsCount}{' '}
                        {booking.roomsCount === 1 ? 'room' : 'rooms'})
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#52525B]">Pure Veg Breakfast Table</p>
                      <p className="font-medium text-[#18181B]">
                        {booking.breakfastPlanName} · {booking.breakfastTimeSlot}
                      </p>
                    </div>
                  </div>

                  {booking.dietaryNotes && (
                    <p className="text-xs text-[#52525B]">
                      Kitchen note: {booking.dietaryNotes}
                    </p>
                  )}

                  <div className="pt-3 border-t border-[#EFECE6] flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-mono text-[#52525B] tabular-nums">
                      Txn {booking.payment.transactionId}
                    </span>
                    {booking.status === 'confirmed' && (
                      <button
                        type="button"
                        disabled={cancellingRef === booking.bookingRef}
                        onClick={() => handleCancel(booking)}
                        className="px-3.5 py-2 text-xs font-medium rounded-lg border border-[#E2DFD7] text-[#991B1B] hover:bg-[#FDF6F6] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {cancellingRef === booking.bookingRef
                          ? 'Cancelling...'
                          : 'Cancel & Release Room'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function useMemoMerge(
  recent: BookingRecord[],
  lookupResult: BookingRecord | null,
): BookingRecord[] {
  if (!lookupResult) return recent;
  const exists = recent.some((b) => b.bookingRef === lookupResult.bookingRef);
  if (exists) {
    return recent.map((b) =>
      b.bookingRef === lookupResult.bookingRef ? lookupResult : b,
    );
  }
  return [lookupResult, ...recent];
}
