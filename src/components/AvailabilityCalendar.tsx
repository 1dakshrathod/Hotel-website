import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  formatDateISO,
  parseDateISO,
  type DayAvailabilitySummary,
  type RoomCategory,
} from '../../shared/hotelData';

interface AvailabilityCalendarProps {
  serverDate: string;
  rooms: RoomCategory[];
  availabilityByDate: Record<string, DayAvailabilitySummary>;
  selectedRoomId: string;
  onSelectRoomFilter: (roomId: string) => void;
  checkIn: string;
  checkOut: string;
  onChangeDates: (checkIn: string, checkOut: string) => void;
  isLoading: boolean;
  lastSyncedAt: string | null;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function AvailabilityCalendar({
  serverDate,
  rooms,
  availabilityByDate,
  selectedRoomId,
  onSelectRoomFilter,
  checkIn,
  checkOut,
  onChangeDates,
  isLoading,
  lastSyncedAt,
}: AvailabilityCalendarProps) {
  const baseDate = useMemo(() => parseDateISO(serverDate) ?? new Date(), [serverDate]);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectionHint, setSelectionHint] = useState<'checkIn' | 'checkOut'>('checkIn');

  const displayMonth = useMemo(() => {
    return new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1);
  }, [baseDate, monthOffset]);

  const monthLabel = useMemo(() => {
    return displayMonth.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
  }, [displayMonth]);

  const calendarCells = useMemo(() => {
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: Array<{ iso: string; dayNumber: number } | null> = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(year, month, day);
      cells.push({
        iso: formatDateISO(dt),
        dayNumber: day,
      });
    }
    return cells;
  }, [displayMonth]);

  const getCellInventory = (iso: string) => {
    const daySummary = availabilityByDate[iso];
    if (!daySummary) {
      return { available: null as number | null, status: 'unknown' as const };
    }
    if (selectedRoomId && daySummary.rooms[selectedRoomId]) {
      const roomDay = daySummary.rooms[selectedRoomId];
      return { available: roomDay.available, status: roomDay.status };
    }
    const total = daySummary.totalAvailableAcrossHotel;
    const status = total === 0 ? ('sold_out' as const) : total <= 2 ? ('limited' as const) : ('available' as const);
    return { available: total, status };
  };

  const handleDateClick = (iso: string) => {
    if (iso < serverDate) return;

    const cell = getCellInventory(iso);

    if (selectionHint === 'checkIn') {
      if (cell.available === 0) return;
      const clickedDate = parseDateISO(iso);
      if (!clickedDate) return;
      const nextDay = new Date(
        clickedDate.getFullYear(),
        clickedDate.getMonth(),
        clickedDate.getDate() + 1,
      );
      const nextDayISO = formatDateISO(nextDay);
      onChangeDates(iso, nextDayISO);
      setSelectionHint('checkOut');
      return;
    }

    // Selecting check-out
    if (iso <= checkIn) {
      if (cell.available === 0) return;
      const clickedDate = parseDateISO(iso);
      if (!clickedDate) return;
      const nextDay = new Date(
        clickedDate.getFullYear(),
        clickedDate.getMonth(),
        clickedDate.getDate() + 1,
      );
      onChangeDates(iso, formatDateISO(nextDay));
      setSelectionHint('checkOut');
      return;
    }

    // Verify no sold-out night inside [checkIn, iso) for the active room
    const start = parseDateISO(checkIn);
    const end = parseDateISO(iso);
    if (!start || !end) return;

    const cursor = new Date(start.getTime());
    let blockedNight = false;
    while (cursor < end) {
      const nightIso = formatDateISO(cursor);
      const nightStatus = getCellInventory(nightIso);
      if (nightStatus.available === 0) {
        blockedNight = true;
        break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (blockedNight) {
      // Start fresh from this clicked date if valid
      if (cell.available !== 0) {
        const nextDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
        onChangeDates(iso, formatDateISO(nextDay));
        setSelectionHint('checkOut');
      }
      return;
    }

    onChangeDates(checkIn, iso);
    setSelectionHint('checkIn');
  };

  const syncedTimeLabel = useMemo(() => {
    if (!lastSyncedAt) return null;
    try {
      return new Date(lastSyncedAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return null;
    }
  }, [lastSyncedAt]);

  return (
    <div className="bg-white border border-[#E2DFD7] rounded-2xl p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-6 border-b border-[#EFECE6]">
        <div>
          <p className="text-xs font-medium text-[#52525B] tracking-wide">
            Real-Time Room Inventory · Synchronized Live
          </p>
          <h3 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#18181B] mt-1">
            Select Your Stay Dates
          </h3>
        </div>
        {syncedTimeLabel && (
          <p className="text-xs text-[#52525B] tabular-nums">
            Last synced {syncedTimeLabel}
          </p>
        )}
      </div>

      {/* Room filter tabs (interactive controls) */}
      <div className="mt-5 flex flex-wrap items-center gap-1.5 p-1 bg-[#F5F4F0] rounded-xl">
        {rooms.map((room) => {
          const active = selectedRoomId === room.id;
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => onSelectRoomFilter(room.id)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1B4332] ${
                active
                  ? 'bg-white text-[#18181B] shadow-xs'
                  : 'text-[#52525B] hover:text-[#18181B]'
              }`}
            >
              {room.name}
            </button>
          );
        })}
      </div>

      {/* Month header + step instruction */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
            disabled={monthOffset === 0}
            aria-label="Previous month"
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-[#E2DFD7] text-[#18181B] hover:bg-[#F5F4F0] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-base font-semibold text-[#18181B] min-w-[155px] text-center">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setMonthOffset((m) => Math.min(2, m + 1))}
            disabled={monthOffset >= 2}
            aria-label="Next month"
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-[#E2DFD7] text-[#18181B] hover:bg-[#F5F4F0] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-[#52525B]">
          {selectionHint === 'checkIn'
            ? 'Click a date to set check-in'
            : 'Now click check-out date'}
        </div>
      </div>

      {/* Weekday headers */}
      <div className="mt-5 grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-xs font-medium text-[#52525B] py-1.5">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {calendarCells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="h-16 sm:h-[70px]" />;
          }

          const isPast = cell.iso < serverDate;
          const isCheckIn = cell.iso === checkIn;
          const isCheckOut = cell.iso === checkOut;
          const isInStayRange = cell.iso > checkIn && cell.iso < checkOut;

          const { available, status } = getCellInventory(cell.iso);
          const isSoldOutNight = available === 0;
          const isDisabled = isPast || (selectionHint === 'checkIn' && isSoldOutNight);

          let availabilityText = 'Open';
          let statusTone = 'text-[#1B4332]';
          if (isPast) {
            availabilityText = 'Past';
            statusTone = 'text-[#A1A1AA]';
          } else if (available === null) {
            availabilityText = isLoading ? '...' : 'Call';
            statusTone = 'text-[#52525B]';
          } else if (status === 'sold_out') {
            availabilityText = isCheckOut ? 'Out' : 'Full';
            statusTone = 'text-[#991B1B]';
          } else if (status === 'limited') {
            availabilityText = `${available} left`;
            statusTone = 'text-[#9A6B2F] font-semibold';
          } else {
            availabilityText = `${available} left`;
            statusTone = 'text-[#1B4332]';
          }

          return (
            <button
              key={cell.iso}
              type="button"
              disabled={isDisabled}
              onClick={() => handleDateClick(cell.iso)}
              aria-label={`${cell.iso}, ${availabilityText}`}
              className={`h-16 sm:h-[70px] rounded-xl border p-1.5 flex flex-col items-center justify-between transition-colors tabular-nums focus-visible:outline-2 focus-visible:outline-[#1B4332] ${
                isCheckIn || isCheckOut
                  ? 'bg-[#1B4332] border-[#1B4332] text-white cursor-pointer'
                  : isInStayRange
                    ? 'bg-[#E9F2EC] border-[#B7D4C3] text-[#18181B] cursor-pointer'
                    : isPast
                      ? 'bg-[#FAF9F6] border-[#F0EEE8] text-[#A1A1AA] cursor-not-allowed'
                      : isSoldOutNight && !isCheckOut
                        ? 'bg-[#FDF6F6] border-[#F1DADA] text-[#991B1B] cursor-not-allowed'
                        : 'bg-white border-[#E7E4DC] text-[#18181B] hover:border-[#1B4332] hover:bg-[#FAF9F6] cursor-pointer'
              }`}
            >
              <span className="text-sm font-semibold leading-none pt-0.5">
                {cell.dayNumber}
              </span>
              <span
                className={`text-[11px] leading-none pb-0.5 ${
                  isCheckIn || isCheckOut ? 'text-white/90' : statusTone
                }`}
              >
                {isCheckIn ? 'In' : isCheckOut ? 'Out' : availabilityText}
              </span>
            </button>
          );
        })}
      </div>

      {/* Explicit semantic legend (text + contrast, never hue-only) */}
      <div className="mt-6 pt-5 border-t border-[#EFECE6] flex flex-wrap items-center justify-between gap-4 text-xs text-[#52525B]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-[#1B4332] bg-[#1B4332]" aria-hidden="true" />
            <span>Selected stay</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-[#E7E4DC] bg-white" aria-hidden="true" />
            <span>Available (2+ rooms)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-[#E7E4DC] bg-white font-semibold text-[#9A6B2F] flex items-center justify-center text-[9px]" aria-hidden="true">1</span>
            <span>Limited (1 room left)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-[#F1DADA] bg-[#FDF6F6]" aria-hidden="true" />
            <span>Full (0 left)</span>
          </span>
        </div>
        <span className="tabular-nums">
          Check-in 2:00 PM · Check-out 11:00 AM
        </span>
      </div>
    </div>
  );
}
