import { JourneyLeg } from '../types/transit';
import { CROWDING_META } from '../utils/transitUtils';

interface CrowdingRibbonProps {
  legs: JourneyLeg[];
  transferWaitMinutes?: number;
  cardIndex?: number;
}

export function CrowdingRibbon({
  legs,
  transferWaitMinutes = 0,
  cardIndex = 0,
}: CrowdingRibbonProps) {
  const totalDuration = legs.reduce((sum, leg) => sum + Math.max(leg.durationMinutes, 4), 0);

  return (
    <div className="w-full" aria-label="Route stretch crowding ribbon">
      {/* Concise timeline bar labels: "502 · 8m" / "425 · 42m" without clipping */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
        {legs.map((leg, idx) => (
          <span
            key={`${leg.id}-top`}
            className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums whitespace-nowrap text-[#14261C]"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: CROWDING_META[leg.crowding].hex }}
            />
            <span className="font-semibold">
              {leg.routeCode} · {leg.durationMinutes}m
            </span>
            {idx < legs.length - 1 && typeof legs[idx + 1]?.waitMinutesBefore === 'number' && (
              <span className="text-[#5C6F62] font-sans text-[11px]">
                (+{legs[idx + 1].waitMinutesBefore}m wait)
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Segmented crowding ribbon filling left-to-right */}
      <div className="relative flex items-center gap-1">
        {legs.map((leg, idx) => {
          const rawPct = (Math.max(leg.durationMinutes, 4) / Math.max(1, totalDuration)) * 100;
          const widthPct = legs.length > 1 ? Math.max(18, rawPct) : 100;
          const meta = CROWDING_META[leg.crowding];
          const delayMs = Math.min(360, idx * 120 + cardIndex * 60);

          return (
            <div
              key={leg.id}
              style={{ flexBasis: `${widthPct}%`, flexGrow: Math.max(1, leg.durationMinutes) }}
              className="relative flex items-center min-w-[44px]"
              title={`Bus ${leg.routeCode}: ${leg.fromStop.name} to ${leg.toStop.name} · ${meta.label} (${leg.loadPct}%)`}
            >
              <span
                aria-hidden="true"
                className={`z-10 h-2.5 w-2.5 rounded-full bg-[#F6FAF3] shrink-0 border-2 ${
                  idx === 0 ? 'border-[#1F4D3A]' : 'border-[#14261C]'
                }`}
              />
              <div className="h-2.5 flex-1 rounded-[4px] -mx-0.5 bg-[#E8F0E4] overflow-hidden">
                <div
                  className="h-full w-full rounded-[4px] animate-ribbon-load transition-[background-color,opacity] duration-200"
                  style={{
                    backgroundColor: meta.hex,
                    animationDelay: `${delayMs}ms`,
                  }}
                />
              </div>
              {idx === legs.length - 1 && (
                <span
                  aria-hidden="true"
                  className="z-10 h-2.5 w-2.5 rounded-full bg-[#1F4D3A] border-2 border-[#1F4D3A] shrink-0"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom stop labels & transfer wait summary */}
      <div className="flex items-start justify-between gap-2 mt-2 text-xs text-[#5C6F62]">
        <span className="truncate font-medium text-[#14261C]">
          {legs[0]?.fromStop.shortName}
        </span>
        {legs.length > 1 && (
          <span className="truncate text-center text-[#5C6F62]">
            change at {legs.slice(0, -1).map((l) => l.toStop.shortName).join(' · ')}
            {transferWaitMinutes > 0 && (
              <span className="font-mono tabular-nums text-[#14261C]">
                {' '}· {transferWaitMinutes}m wait
              </span>
            )}
          </span>
        )}
        <span className="truncate font-medium text-[#14261C] text-right">
          {legs[legs.length - 1]?.toStop.shortName}
        </span>
      </div>
    </div>
  );
}
