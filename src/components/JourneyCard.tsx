import { useState } from 'react';
import { ChevronDown, Clock, MapPin } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { JourneyOption } from '../types/transit';
import { ConfidenceTag, CrowdingBadge } from './CrowdingBadge';
import { CrowdingRibbon } from './CrowdingRibbon';

interface JourneyCardProps {
  journey: JourneyOption;
  index: number;
  isSelected: boolean;
  onSelect: (journey: JourneyOption) => void;
  onShowOnMap: (journey: JourneyOption) => void;
  onSelectTime: (time: string) => void;
}

export function JourneyCard({
  journey,
  index,
  isSelected,
  onSelect,
  onShowOnMap,
  onSelectTime,
}: JourneyCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      data-testid={`journey-card-${journey.id}`}
      className={`cw-card cw-card-hover ${
        isSelected ? 'ring-1 ring-[#1F4D3A] border-[#1F4D3A]' : ''
      }`}
    >
      <div className="p-5 sm:p-6 space-y-4">
        {/* Top Row: Travel time, route codes, changes, crowding badge & confidence/ML fallback */}
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onSelect(journey)}
            className="text-left flex-1 min-w-0 rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
          >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="font-mono tabular-nums text-lg sm:text-xl font-semibold tracking-tight text-[#14261C]">
                {journey.departureTime} – {journey.arrivalTime}
              </span>
              <span className="font-mono tabular-nums text-sm font-medium text-[#1F4D3A]">
                {journey.totalMinutes} min
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[13px] text-[#5C6F62]">
              <span className="font-mono font-semibold text-[#14261C]">
                {journey.legs.map((l) => `Bus ${l.routeCode}`).join(' → ')}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-[#1F4D3A]">{journey.strategyLabel}</span>
              <span aria-hidden="true">·</span>
              <span>
                {journey.changes === 0
                  ? 'Direct (0 changes)'
                  : journey.transferWaitMinutes > 0
                    ? `${journey.changes} ${journey.changes === 1 ? 'change' : 'changes'} (${journey.transferWaitMinutes} min wait)`
                    : `${journey.changes} ${journey.changes === 1 ? 'change' : 'changes'}`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{journey.totalStops} stops</span>
            </div>

            <div className="mt-2">
              <ConfidenceTag
                level={journey.confidence}
                ticketCount={journey.ticketCount}
                predictionSource={journey.predictionSource}
              />
            </div>
          </button>

          <div className="shrink-0 pt-0.5">
            <CrowdingBadge level={journey.overallCrowding} loadPct={journey.avgLoadPct} />
          </div>
        </div>

        {/* Segmented crowding ribbon per route */}
        <div onClick={() => onSelect(journey)} className="cursor-pointer">
          <CrowdingRibbon
            legs={journey.legs}
            transferWaitMinutes={journey.transferWaitMinutes}
            cardIndex={index}
          />
        </div>

        {/* Action & Forward Departure Nudge Row */}
        <div className="pt-3 border-t border-[#CFDCC8] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5C6F62] hover:text-[#14261C] py-1.5 px-2 -ml-2 rounded-[8px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ease-in-out ${
                  expanded ? 'rotate-180' : ''
                }`}
                strokeWidth={1.5}
              />
              <span>{expanded ? 'Hide leg details' : 'Leg breakdown'}</span>
            </button>

            {journey.forwardNudgeText && journey.forwardNudgeTime && (
              <button
                type="button"
                onClick={() => onSelectTime(journey.forwardNudgeTime!)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1F4D3A] hover:text-[#173B2D] hover:underline rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
              >
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                <span>{journey.forwardNudgeText}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onShowOnMap(journey)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-[#1F4D3A] hover:border-[#1F4D3A] hover:bg-[#1F4D3A] hover:text-[#F6FAF3] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
          >
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>View on Crowd Map</span>
          </button>
        </div>

        {/* Expandable stretch details */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="pt-3 border-t border-[#CFDCC8] space-y-2.5">
                {journey.legs.map((leg, lIdx) => (
                  <div key={leg.id} className="space-y-2">
                    {lIdx > 0 && typeof leg.waitMinutesBefore === 'number' && (
                      <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-[#5C6F62]">
                        <Clock className="h-3 w-3 text-[#1F4D3A]" strokeWidth={1.5} />
                        <span>
                          Transfer at {leg.fromStop.name} ·{' '}
                          <span className="font-mono tabular-nums text-[#14261C]">
                            {leg.waitMinutesBefore} min wait
                          </span>
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 px-3.5 rounded-[8px] bg-[#E8F0E4] border border-[#CFDCC8]">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-[#14261C]">
                            Bus {leg.routeCode}
                          </span>
                          <span className="font-medium text-[#14261C]">
                            {leg.routeName}
                          </span>
                          <span aria-hidden="true" className="text-[#5C6F62]">·</span>
                          <span className="text-[#5C6F62]">{leg.operator}</span>
                        </div>
                        <div className="text-xs text-[#5C6F62] truncate">
                          {leg.fromStop.name} → {leg.toStop.name}
                          {leg.intermediateStops.length > 0 && (
                            <span> (via {leg.intermediateStops.map((s) => s.shortName).join(', ')})</span>
                          )}
                        </div>
                        <div>
                          <ConfidenceTag
                            level={leg.confidence}
                            ticketCount={leg.ticketCount}
                            predictionSource={leg.predictionSource}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <span className="font-mono tabular-nums text-xs text-[#5C6F62]">
                          {leg.departureTime}–{leg.arrivalTime} ({leg.durationMinutes}m)
                        </span>
                        <CrowdingBadge level={leg.crowding} loadPct={leg.loadPct} compact />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </article>
  );
}
