import { Lock, ShieldAlert, UserCheck } from 'lucide-react';
import { useState } from 'react';
import type { TripBerthItem } from '../types/travel';
import type { TranslationDictionary } from '../i18n/translations';

interface BerthSelectorProps {
  berths: TripBerthItem[];
  selectedIds: number[];
  onToggleBerth: (berth: TripBerthItem) => void;
  t: TranslationDictionary;
  lockExpiresAt: string | null;
}

export function BerthSelector({
  berths,
  selectedIds,
  onToggleBerth,
  t,
  lockExpiresAt,
}: BerthSelectorProps) {
  const [activeMobileDeck, setActiveMobileDeck] = useState<'lower' | 'upper'>('lower');

  const renderDeck = (deck: 'lower' | 'upper') => {
    const deckBerths = berths.filter((b) => b.deck === deck);
    const maxRow = deckBerths.reduce((m, b) => Math.max(m, b.rowIndex), 0);
    const rows: number[] = [];
    for (let r = 0; r <= maxRow; r++) rows.push(r);

    return (
      <div className="luxury-surface-3d rounded-xl border border-[#D4AF37]/25 p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <div>
            <h4 className="text-sm font-semibold tracking-wide text-[#FAF7F0]">
              {deck === 'lower' ? t.lowerDeck : t.upperDeck}
            </h4>
            <p className="text-xs text-[#FAF7F0]/60">
              {deckBerths.filter((b) => b.liveStatus === 'available' || b.liveStatus === 'locked_by_me').length} /{' '}
              {deckBerths.filter((b) => b.liveStatus !== 'disabled').length} {t.available}
            </p>
          </div>
          <div className="text-xs font-mono-tabular text-[#D4AF37]">
            {deck === 'lower' ? 'FRONT CABIN · DRIVER' : 'UPPER SLEEPER BAY'}
          </div>
        </div>

        {/* Column headers: Single Left | Aisle | Double Right */}
        <div className="grid grid-cols-[1fr_24px_2fr] gap-2 mb-2 text-[11px] text-[#FAF7F0]/50 text-center">
          <span>Single Berth</span>
          <span aria-hidden="true" />
          <span>Double Berth Cabin</span>
        </div>

        <div className="space-y-2.5">
          {rows.map((r) => {
            const singleBerth = deckBerths.find((b) => b.rowIndex === r && b.colIndex === 0);
            const double1 = deckBerths.find((b) => b.rowIndex === r && b.colIndex === 1);
            const double2 = deckBerths.find((b) => b.rowIndex === r && b.colIndex === 2);

            return (
              <div key={`${deck}-${r}`} className="grid grid-cols-[1fr_24px_2fr] gap-2 items-stretch">
                <div>{singleBerth ? renderBerthButton(singleBerth) : <div className="h-16" />}</div>
                <div className="flex items-center justify-center">
                  <div className="h-full w-px bg-white/10" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>{double1 ? renderBerthButton(double1) : <div className="h-16" />}</div>
                  <div>{double2 ? renderBerthButton(double2) : <div className="h-16" />}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderBerthButton = (b: TripBerthItem) => {
    const isSelected = selectedIds.includes(b.id);
    const isBooked = b.liveStatus === 'booked';
    const isDisabled = b.liveStatus === 'disabled';
    const isLockedOther = b.liveStatus === 'locked_by_other';
    const isLockedMe = b.liveStatus === 'locked_by_me';
    const clickable = !isBooked && !isDisabled && !isLockedOther;

    let styleClass =
      'bg-[#FAF7F0] text-[#09090B] border-[#D4AF37]/40 hover:border-[#D4AF37] hover:bg-[#F3EDE0]';
    let statusTag = `Rs.${b.fare}`;

    if (isSelected || isLockedMe) {
      styleClass =
        'bg-[#D4AF37] text-[#09090B] border-[#F5E199] ring-2 ring-[#D4AF37]/40';
    } else if (isBooked) {
      styleClass =
        'bg-[#1D1D24] text-[#FAF7F0]/35 border-white/10 cursor-not-allowed';
      statusTag = b.genderBooked === 'female' ? 'Booked (F)' : 'Booked';
    } else if (isLockedOther) {
      styleClass =
        'bg-[#2A2212] text-[#E8C86B]/70 border-[#D4AF37]/30 cursor-not-allowed';
      statusTag = 'Locked';
    } else if (isDisabled) {
      styleClass =
        'bg-[#16161B] text-[#FAF7F0]/25 border-white/5 cursor-not-allowed';
      statusTag = 'N/A';
    } else if (b.ladiesReserved) {
      styleClass =
        'bg-[#3A1B2E] text-[#FDE8F2] border-[#EC4899]/50 hover:border-[#EC4899]';
    }

    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={() => clickable && onToggleBerth(b)}
        aria-label={`Berth ${b.berthNumber} ${b.deck} ${b.berthType} ${statusTag}`}
        data-testid={`berth-${b.berthNumber}`}
        className={`berth-pod-3d w-full h-16 rounded-lg border px-1.5 sm:px-2 py-1.5 flex flex-col justify-between text-left ${styleClass} ${
          clickable ? 'cursor-pointer' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="font-mono-tabular text-xs font-semibold leading-none">{b.berthNumber}</span>
          {b.ladiesReserved && !isBooked ? (
            <UserCheck className="w-3.5 h-3.5 text-pink-300 shrink-0" aria-hidden="true" />
          ) : isLockedOther ? (
            <Lock className="w-3 h-3 text-[#E8C86B] shrink-0" aria-hidden="true" />
          ) : isDisabled ? (
            <ShieldAlert className="w-3 h-3 opacity-40 shrink-0" aria-hidden="true" />
          ) : (
            <span className="w-3 h-2 rounded-xs border border-current opacity-45 shrink-0" />
          )}
        </div>
        <div className="w-full">
          <span className="block font-mono-tabular text-[11px] font-semibold leading-tight whitespace-nowrap">
            {statusTag}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Legend + Lock Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#141418] px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-[#FAF7F0]">
            <span className="w-3.5 h-3.5 rounded-xs bg-[#FAF7F0] border border-[#D4AF37]/60" />
            {t.available}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#FAF7F0]">
            <span className="w-3.5 h-3.5 rounded-xs bg-[#D4AF37]" />
            {t.selected}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#FAF7F0]/70">
            <span className="w-3.5 h-3.5 rounded-xs bg-[#1D1D24] border border-white/20" />
            {t.booked}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#E8C86B]">
            <span className="w-3.5 h-3.5 rounded-xs bg-[#2A2212] border border-[#D4AF37]/40" />
            {t.locked}
          </span>
          <span className="inline-flex items-center gap-1.5 text-pink-200">
            <span className="w-3.5 h-3.5 rounded-xs bg-[#3A1B2E] border border-[#EC4899]/50" />
            {t.ladiesOnly}
          </span>
        </div>
        {lockExpiresAt && (
          <div className="font-mono-tabular text-[#E8C86B]">
            Hold active until {new Date(lockExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Mobile Deck Switcher */}
      <div className="flex lg:hidden gap-2 p-1 rounded-lg bg-[#141418] border border-white/10">
        <button
          type="button"
          onClick={() => setActiveMobileDeck('lower')}
          className={`flex-1 min-h-[44px] py-2 text-xs font-semibold rounded-md cursor-pointer ${
            activeMobileDeck === 'lower'
              ? 'bg-[#D4AF37] text-[#09090B]'
              : 'text-[#FAF7F0]/70'
          }`}
        >
          {t.lowerDeck}
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileDeck('upper')}
          className={`flex-1 min-h-[44px] py-2 text-xs font-semibold rounded-md cursor-pointer ${
            activeMobileDeck === 'upper'
              ? 'bg-[#D4AF37] text-[#09090B]'
              : 'text-[#FAF7F0]/70'
          }`}
        >
          {t.upperDeck}
        </button>
      </div>

      {/* Desktop Side-by-Side Decks */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-5">
        {renderDeck('lower')}
        {renderDeck('upper')}
      </div>

      {/* Mobile Single Active Deck */}
      <div className="lg:hidden">{renderDeck(activeMobileDeck)}</div>
    </div>
  );
}
