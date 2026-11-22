import {
  ConfidenceLevel,
  CrowdingLevel,
  LatLngPoint,
  PredictionSource,
} from '../types/transit';

export const MIN_HOUR = 5; // 05:00
export const MAX_HOUR = 23; // 23:00
export const HOURS_RANGE: number[] = Array.from(
  { length: MAX_HOUR - MIN_HOUR + 1 },
  (_, i) => MIN_HOUR + i
);

export const POPULAR_CORRIDOR_PRESETS: Array<{
  label: string;
  originQuery: string;
  originFallbackQuery?: string;
  destinationQuery: string;
  destinationFallbackQuery?: string;
}> = [
  {
    label: 'Anand Vihar → Connaught Pl.',
    originQuery: 'Anand Vihar',
    destinationQuery: 'Connaught Place',
    destinationFallbackQuery: 'Shivaji Stadium',
  },
  {
    label: 'Nehru Place → Kashmiri Gate',
    originQuery: 'Nehru Place',
    destinationQuery: 'Kashmiri Gate',
    destinationFallbackQuery: 'Kashmere Gate',
  },
  {
    label: 'Kashmiri Gate → AIIMS',
    originQuery: 'Kashmiri Gate',
    originFallbackQuery: 'Kashmere Gate',
    destinationQuery: 'AIIMS',
  },
  {
    label: 'Connaught Pl. → Saket',
    originQuery: 'Connaught Place',
    originFallbackQuery: 'Shivaji Stadium',
    destinationQuery: 'Saket',
  },
];

export const CROWDING_META: Record<
  CrowdingLevel,
  { label: string; shortLabel: string; hex: string; pillBg: string; textColor: string; description: string }
> = {
  seats: {
    label: 'Seats available',
    shortLabel: 'Seats',
    hex: '#2F8F6B',
    pillBg: 'rgba(47, 143, 107, 0.14)',
    textColor: '#14261C',
    description: 'Open seats available across most bays',
  },
  standing: {
    label: 'Standing room',
    shortLabel: 'Standing',
    hex: '#E2A62B',
    pillBg: 'rgba(226, 166, 43, 0.18)',
    textColor: '#14261C',
    description: 'Most seats taken; clear aisle standing',
  },
  crowded: {
    label: 'Crowded',
    shortLabel: 'Crowded',
    hex: '#D4563A',
    pillBg: 'rgba(212, 86, 58, 0.15)',
    textColor: '#14261C',
    description: 'Dense boarding near doors and standing aisle',
  },
};

export const ML_FALLBACK_TOOLTIP =
  'Estimated using our trained Week 1–3 ML fallback model because direct ticket volume is low.';

export function getCrowdingLevel(loadPct: number): CrowdingLevel {
  if (loadPct < 52) return 'seats';
  if (loadPct < 78) return 'standing';
  return 'crowded';
}

export function normalizeCrowdingLevel(raw: unknown, loadPct = 50): CrowdingLevel {
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'seats' || v.includes('seat') || v === 'low') return 'seats';
    if (v === 'standing' || v.includes('stand') || v === 'medium' || v === 'moderate') return 'standing';
    if (v === 'crowded' || v.includes('crowd') || v === 'high' || v === 'packed' || v === 'overload') return 'crowded';
  }
  return getCrowdingLevel(loadPct);
}

export function normalizeLoadPct(rawPct: unknown, rawRatio?: unknown): number {
  const numPct = typeof rawPct === 'number' && Number.isFinite(rawPct) ? rawPct : null;
  if (numPct !== null) {
    if (numPct > 0 && numPct <= 1.5 && rawRatio === undefined) {
      return Math.round(numPct * 100);
    }
    return Math.max(0, Math.min(100, Math.round(numPct)));
  }
  const numRatio = typeof rawRatio === 'number' && Number.isFinite(rawRatio) ? rawRatio : null;
  if (numRatio !== null) {
    const pct = numRatio <= 2 ? numRatio * 100 : numRatio;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }
  return 0;
}

export function normalizeConfidence(raw: unknown): ConfidenceLevel {
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'high') return 'High';
    if (v === 'medium' || v === 'med') return 'Medium';
  }
  return 'Low';
}

export function normalizePredictionSource(raw: unknown): PredictionSource {
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'ml_fallback' || v === 'ml' || v === 'fallback') return 'ml_fallback';
    if (v === 'route_average' || v === 'route_avg' || v === 'average') return 'route_average';
  }
  return 'observed_tickets';
}

export function formatHour(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

export function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const clamped = Math.max(MIN_HOUR * 60, Math.min(MAX_HOUR * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDurationDelta(deltaMins: number): string {
  if (deltaMins < 60) return `${deltaMins} min`;
  const hrs = Math.floor(deltaMins / 60);
  const mins = deltaMins % 60;
  return mins === 0 ? `${hrs} hr` : `${hrs} hr ${mins} min`;
}

export function shortenStopName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\s+(ISBT|Terminal|Crossing|Metro Station|Bus Stand|Depot)$/i, '')
    .replace(/Connaught Place/i, 'Connaught Pl.')
    .replace(/Kashmere Gate/i, 'Kashmiri Gate')
    .trim();
}

export function normalizeCoordinates(rawCoords: unknown): LatLngPoint[] {
  if (!Array.isArray(rawCoords)) return [];
  const points: LatLngPoint[] = [];
  for (const item of rawCoords) {
    if (Array.isArray(item) && item.length >= 2) {
      const lat = Number(item[0]);
      const lng = Number(item[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({ lat, lng });
      }
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const lat = Number(obj.lat ?? obj.stop_lat ?? obj.latitude);
      const lng = Number(obj.lng ?? obj.lon ?? obj.stop_lon ?? obj.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({ lat, lng });
      }
    }
  }
  return points;
}

export function extractForwardNudge(
  rawOption: Record<string, unknown>,
  requestedTime: string
): { text: string | null; time: string | null } {
  const reqMins = parseTimeToMinutes(requestedTime);
  if (reqMins === null) return { text: null, time: null };

  const rawNudge =
    rawOption.departure_nudge ??
    rawOption.forward_nudge ??
    rawOption.calmer_suggestion ??
    rawOption.calmerSuggestion ??
    rawOption.recommended_departure ??
    rawOption.nudge;

  if (rawNudge && typeof rawNudge === 'object') {
    const nObj = rawNudge as Record<string, unknown>;
    const candTimeStr =
      typeof nObj.time === 'string'
        ? nObj.time
        : typeof nObj.departure_time === 'string'
          ? nObj.departure_time
          : typeof nObj.recommended_time === 'string'
            ? nObj.recommended_time
            : null;
    const candMins = parseTimeToMinutes(candTimeStr);
    const shiftMins =
      typeof nObj.shift_minutes === 'number' && nObj.shift_minutes > 0
        ? nObj.shift_minutes
        : candMins !== null
          ? candMins - reqMins
          : null;

    if (candMins !== null && candMins > reqMins && candTimeStr) {
      const diff = shiftMins && shiftMins > 0 ? Math.round(shiftMins) : candMins - reqMins;
      const tier = normalizeCrowdingLevel(
        nObj.crowding ?? nObj.crowding_tier ?? nObj.level,
        normalizeLoadPct(nObj.load_pct, nObj.load_ratio)
      );
      const customLabel = typeof nObj.label === 'string' ? nObj.label : typeof nObj.message === 'string' ? nObj.message : null;
      return {
        text: customLabel || `Leave ${formatDurationDelta(diff)} later (${candTimeStr}) · ${CROWDING_META[tier].label}`,
        time: candTimeStr,
      };
    }
  }

  if (typeof rawNudge === 'string' && rawNudge.trim().length > 0) {
    const timeMatch = rawNudge.match(/\b(\d{1,2}:\d{2})\b/);
    if (timeMatch) {
      const candTime = timeMatch[1].padStart(5, '0');
      const candMins = parseTimeToMinutes(candTime);
      if (candMins === null || candMins <= reqMins) {
        // Reject past-time nudges (e.g., 07:00 when departing at 08:00)
        return { text: null, time: null };
      }
      const diff = candMins - reqMins;
      if (/later|after|shift/i.test(rawNudge)) {
        return { text: rawNudge.trim(), time: candTime };
      }
      const tierMatch = /seat/i.test(rawNudge)
        ? CROWDING_META.seats.label
        : /stand/i.test(rawNudge)
          ? CROWDING_META.standing.label
          : null;
      return {
        text: tierMatch
          ? `Leave ${formatDurationDelta(diff)} later (${candTime}) · ${tierMatch}`
          : `Leave ${formatDurationDelta(diff)} later (${candTime})`,
        time: candTime,
      };
    }
  }

  // Fallback check on explicit future alternative time or hourly profile
  const altHour = rawOption.best_alternative_hour ?? rawOption.bestAlternativeHour;
  if (typeof altHour === 'number' && Number.isFinite(altHour)) {
    const candMins = Math.round(altHour) * 60;
    if (candMins > reqMins) {
      const candTime = formatMinutesToTime(candMins);
      return {
        text: `Leave ${formatDurationDelta(candMins - reqMins)} later (${candTime}) · Calmer departure`,
        time: candTime,
      };
    }
  }

  const altDepartures = rawOption.alternative_departures ?? rawOption.hourly_profile ?? rawOption.hourlyProfile;
  if (Array.isArray(altDepartures)) {
    const currentCrowding = normalizeCrowdingLevel(
      rawOption.crowding ?? rawOption.overall_crowding ?? rawOption.crowding_tier,
      normalizeLoadPct(rawOption.avg_load_pct ?? rawOption.load_pct, rawOption.load_ratio)
    );
    if (currentCrowding !== 'seats') {
      const futureCandidates = altDepartures
        .map((entry) => {
          const item = entry as Record<string, unknown>;
          const tStr =
            typeof item.time === 'string'
              ? item.time
              : typeof item.departure_time === 'string'
                ? item.departure_time
                : typeof item.hour === 'number'
                  ? formatHour(item.hour)
                  : null;
          const mins = parseTimeToMinutes(tStr);
          const load = normalizeLoadPct(item.load_pct ?? item.loadPct, item.load_ratio);
          const crowding = normalizeCrowdingLevel(item.crowding ?? item.crowding_tier, load);
          return { tStr, mins, load, crowding };
        })
        .filter((c) => c.tStr !== null && c.mins !== null && c.mins > reqMins) as Array<{
        tStr: string;
        mins: number;
        load: number;
        crowding: CrowdingLevel;
      }>;

      const better =
        futureCandidates.find((c) => c.crowding === 'seats') ??
        futureCandidates.find((c) => c.crowding === 'standing' && currentCrowding === 'crowded');

      if (better) {
        return {
          text: `Leave ${formatDurationDelta(better.mins - reqMins)} later (${better.tStr}) · ${CROWDING_META[better.crowding].label}`,
          time: better.tStr,
        };
      }
    }
  }

  const rawShifts = rawOption.departure_shifts ?? rawOption.departureShifts;
  if (Array.isArray(rawShifts)) {
    const futureShifts = rawShifts
      .map((entry) => {
        const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        const tStr =
          typeof item.departure_time === 'string'
            ? item.departure_time
            : typeof item.time === 'string'
              ? item.time
              : null;
        const mins = parseTimeToMinutes(tStr);
        const shiftMins =
          typeof item.shift_minutes === 'number' && Number.isFinite(item.shift_minutes)
            ? item.shift_minutes
            : mins !== null
              ? mins - reqMins
              : null;
        const crowding = normalizeCrowdingLevel(
          item.new_crowd_level ?? item.crowding ?? item.crowding_tier,
          50
        );
        return { tStr, mins, shiftMins, crowding, improves: item.improves_crowding !== false };
      })
      .filter(
        (s) =>
          s.tStr !== null &&
          s.mins !== null &&
          s.mins > reqMins &&
          s.shiftMins !== null &&
          s.shiftMins > 0 &&
          s.improves
      ) as Array<{
      tStr: string;
      mins: number;
      shiftMins: number;
      crowding: CrowdingLevel;
      improves: boolean;
    }>;

    const bestShift =
      futureShifts.find((s) => s.crowding === 'seats') ??
      futureShifts.find((s) => s.crowding === 'standing') ??
      futureShifts[0];

    if (bestShift) {
      return {
        text: `Leave ${formatDurationDelta(bestShift.shiftMins)} later (${bestShift.tStr}) · ${CROWDING_META[bestShift.crowding].label}`,
        time: bestShift.tStr,
      };
    }
  }

  return { text: null, time: null };
}
