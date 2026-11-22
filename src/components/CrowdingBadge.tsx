import { Sparkles } from 'lucide-react';
import { ConfidenceLevel, CrowdingLevel, PredictionSource } from '../types/transit';
import { CROWDING_META, ML_FALLBACK_TOOLTIP } from '../utils/transitUtils';

interface CrowdingBadgeProps {
  level: CrowdingLevel;
  loadPct?: number;
  compact?: boolean;
}

export function CrowdingBadge({ level, loadPct, compact = false }: CrowdingBadgeProps) {
  const meta = CROWDING_META[level];
  const label = compact ? meta.shortLabel : meta.label;

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-full px-2.5 py-1 text-xs font-medium leading-none"
      style={{
        backgroundColor: meta.pillBg,
        color: meta.textColor,
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: meta.hex }}
      />
      <span>{label}</span>
      {typeof loadPct === 'number' && (
        <span className="font-mono tabular-nums font-medium opacity-85">
          {loadPct}%
        </span>
      )}
    </span>
  );
}

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  ticketCount?: number | null;
  predictionSource?: PredictionSource;
}

export function ConfidenceTag({
  level,
  ticketCount,
  predictionSource = 'observed_tickets',
}: ConfidenceBadgeProps) {
  if (predictionSource === 'ml_fallback') {
    return (
      <span
        title={ML_FALLBACK_TOOLTIP}
        aria-label={`ML predicted · Sparse route. ${ML_FALLBACK_TOOLTIP}`}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap border border-[#4B5B8C]/25 bg-[#4B5B8C]/10 text-[#2E3C66] cursor-help"
      >
        <Sparkles className="h-3 w-3 shrink-0 text-[#4B5B8C]" strokeWidth={1.5} />
        <span>ML predicted · Sparse route</span>
      </span>
    );
  }

  const dotHex =
    level === 'High' ? '#2F8F6B' : level === 'Medium' ? '#E2A62B' : '#D4563A';

  const ticketText =
    typeof ticketCount === 'number'
      ? ` · ${ticketCount.toLocaleString()} tickets`
      : predictionSource === 'route_average'
        ? ' · Route average'
        : '';

  const label = `${level} confidence${ticketText}`;

  return (
    <span
      title={label}
      className="inline-flex items-center gap-1.5 text-xs text-[#5C6F62] whitespace-nowrap"
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: dotHex }}
      />
      <span>{label}</span>
    </span>
  );
}
