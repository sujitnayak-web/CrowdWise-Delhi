import {
  ApiRouteSummary,
  BusStop,
  ConfidenceLevel,
  CrowdingLevel,
  DayType,
  PredictionSource,
  RouteCrowdDetail,
  RouteCrowdSegment,
} from '../types/transit';
import {
  CROWDING_META,
  formatHour,
  getCrowdingLevel,
  HOURS_RANGE,
  parseTimeToMinutes,
} from './transitUtils';

export type RouteDirection = 'Up' | 'Down';

export interface RouteCatalogEntry {
  route: ApiRouteSummary;
  routeId: string;
  baseCode: string;
  direction: RouteDirection;
  displayLabel: string;
  corridorLabel: string;
  tripsPerDay: number | null;
  hasObservedHotspot: boolean;
}

export interface StretchSegmentItem {
  id: string;
  fromName: string;
  toName: string;
  loadPct: number | null;
  crowding: CrowdingLevel | null;
  color: string;
}

export interface StretchCrowdSummary {
  loadPct: number | null;
  crowding: CrowdingLevel | null;
  confidence: ConfidenceLevel | null;
  ticketCount: number | null;
  predictionSource: PredictionSource;
  hasData: boolean;
  segments: StretchSegmentItem[];
  stopCount: number;
  travelMinutes: number;
}

export interface RouteHourlyTimelinePoint {
  hour: number;
  loadPct: number | null;
  crowding: CrowdingLevel | null;
  hasData: boolean;
  runsAtHour: boolean;
  ticketCount: number | null;
  predictionSource: PredictionSource;
}

export interface ScheduledRouteDeparture {
  id: string;
  departureTime: string;
  arrivalTime: string;
  departureMinutes: number;
  arrivalMinutes: number;
  durationMinutes: number;
  loadPct: number | null;
  crowding: CrowdingLevel | null;
  hasData: boolean;
}

export interface NextBestTravelSuggestion {
  time: string;
  displayTime: string;
  crowding: CrowdingLevel;
  loadPct: number;
  minutesAhead: number;
}

const CROWD_RANK: Record<CrowdingLevel, number> = {
  seats: 0,
  standing: 1,
  crowded: 2,
};

export function parseRouteCodeAndDirection(
  rawRouteCode: string,
  explicitDirection?: string
): {
  baseCode: string;
  direction: RouteDirection;
  displayLabel: string;
} {
  const cleanedRaw = (rawRouteCode || '').trim();
  const dirSuffixMatch = cleanedRaw.match(/^(.*?)(?:[\s_-]*(up|down|dn))$/i);
  const baseCode = (dirSuffixMatch && dirSuffixMatch[1].trim()
    ? dirSuffixMatch[1].trim()
    : cleanedRaw
  ).replace(/[\s_-]+$/, '');

  let direction: RouteDirection = 'Up';
  if (dirSuffixMatch) {
    direction = /down|dn/i.test(dirSuffixMatch[2]) ? 'Down' : 'Up';
  } else if (explicitDirection) {
    direction = /down|dn|\b1\b/i.test(explicitDirection) ? 'Down' : 'Up';
  }

  return {
    baseCode: baseCode || cleanedRaw,
    direction,
    displayLabel: `${baseCode || cleanedRaw} ${direction}`,
  };
}

export function isRouteNightSpecial(routeCode: string, tripsPerDay?: number | null): boolean {
  return /\(NS\)/i.test(routeCode) || (typeof tripsPerDay === 'number' && tripsPerDay > 0 && tripsPerDay <= 2);
}

export function buildSelectableRouteCatalog(
  routes: ApiRouteSummary[],
  hotspotRouteIds?: Set<string>
): RouteCatalogEntry[] {
  const deduped = new Map<string, RouteCatalogEntry>();

  for (const route of routes) {
    const stopsCount = route.stopsCount ?? route.stops.length;
    if (stopsCount > 0 && stopsCount < 2) continue;
    if (typeof route.tripsPerDay === 'number' && route.tripsPerDay <= 0) continue;

    const { baseCode, direction, displayLabel } = parseRouteCodeAndDirection(
      route.routeCode,
      route.direction
    );
    const key = `${baseCode.toLowerCase()}::${direction.toLowerCase()}`;
    const hasHotspot = hotspotRouteIds ? hotspotRouteIds.has(route.routeId) : false;

    const candidate: RouteCatalogEntry = {
      route,
      routeId: route.routeId,
      baseCode,
      direction,
      displayLabel,
      corridorLabel: route.corridorLabel,
      tripsPerDay: route.tripsPerDay ?? null,
      hasObservedHotspot: hasHotspot,
    };

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, candidate);
    } else {
      const candidateScore =
        (candidate.hasObservedHotspot ? 1000 : 0) +
        (candidate.tripsPerDay ?? 0) +
        (route.stopsCount ?? route.stops.length);
      const existingScore =
        (existing.hasObservedHotspot ? 1000 : 0) +
        (existing.tripsPerDay ?? 0) +
        (existing.route.stopsCount ?? existing.route.stops.length);
      if (candidateScore > existingScore) {
        deduped.set(key, candidate);
      }
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const baseCmp = a.baseCode.localeCompare(b.baseCode, undefined, { numeric: true });
    if (baseCmp !== 0) return baseCmp;
    return a.direction.localeCompare(b.direction);
  });
}

export function filterRouteCatalog(
  catalog: RouteCatalogEntry[],
  query: string
): RouteCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;

  const exactPrefix: RouteCatalogEntry[] = [];
  const otherMatch: RouteCatalogEntry[] = [];

  for (const entry of catalog) {
    const dispLower = entry.displayLabel.toLowerCase();
    const baseLower = entry.baseCode.toLowerCase();
    const rawLower = entry.route.routeCode.toLowerCase();
    const corridorLower = entry.corridorLabel.toLowerCase();

    if (baseLower === q || dispLower.startsWith(q)) {
      exactPrefix.push(entry);
    } else if (
      baseLower.includes(q) ||
      dispLower.includes(q) ||
      rawLower.includes(q) ||
      corridorLower.includes(q)
    ) {
      otherMatch.push(entry);
    }
  }

  return [...exactPrefix, ...otherMatch];
}

export function findPairedDirectionRoute(
  catalog: RouteCatalogEntry[],
  baseCode: string,
  targetDirection: RouteDirection
): RouteCatalogEntry | null {
  const norm = baseCode.trim().toLowerCase();
  return (
    catalog.find(
      (entry) => entry.baseCode.toLowerCase() === norm && entry.direction === targetDirection
    ) ?? null
  );
}

export function validateStopSelection(
  stops: BusStop[],
  boardingStopId: string,
  alightingStopId: string
): {
  valid: boolean;
  boardingIndex: number;
  alightingIndex: number;
  error: string | null;
} {
  if (stops.length < 2) {
    return {
      valid: false,
      boardingIndex: -1,
      alightingIndex: -1,
      error: 'Stop list is unavailable for this route.',
    };
  }
  const bIdx = stops.findIndex((s) => s.id === boardingStopId);
  const aIdx = stops.findIndex((s) => s.id === alightingStopId);

  if (bIdx === -1 || aIdx === -1) {
    return {
      valid: false,
      boardingIndex: bIdx,
      alightingIndex: aIdx,
      error: 'Select both a boarding and an alighting stop.',
    };
  }
  if (bIdx === stops.length - 1) {
    return {
      valid: false,
      boardingIndex: bIdx,
      alightingIndex: aIdx,
      error: 'Cannot board at the final terminal stop. Choose an earlier boarding stop.',
    };
  }
  if (aIdx <= bIdx) {
    return {
      valid: false,
      boardingIndex: bIdx,
      alightingIndex: aIdx,
      error: 'Alighting stop must be after the boarding stop.',
    };
  }

  return { valid: true, boardingIndex: bIdx, alightingIndex: aIdx, error: null };
}

function estimateSegmentTravelMinutes(stops: BusStop[], boardingIdx: number, alightingIdx: number): number {
  const hops = Math.max(1, alightingIdx - boardingIdx);
  // Calculate approximate route distance if coordinates exist; average Delhi bus corridor ~19 km/h (~3.2 min/km)
  let totalKm = 0;
  let validCoords = 0;
  for (let i = boardingIdx; i < alightingIdx; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a && b && a.lat !== 0 && a.lng !== 0 && b.lat !== 0 && b.lng !== 0) {
      const dLat = (b.lat - a.lat) * 111.32;
      const dLng = (b.lng - a.lng) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
      totalKm += Math.hypot(dLat, dLng);
      validCoords++;
    }
  }
  if (validCoords > 0 && totalKm > 0.2) {
    return Math.max(3, Math.round(totalKm * 3.1 + hops * 0.5));
  }
  return Math.max(4, Math.round(hops * 2.2));
}

export function doesRouteOperateAtHour(params: {
  routeCode: string;
  tripsPerDay?: number | null;
  detail: RouteCrowdDetail | undefined;
  hourlyMap: Record<number, RouteCrowdDetail>;
  hour: number;
}): { runsAtHour: boolean; nearestActiveHour: number | null } {
  const { routeCode, tripsPerDay, detail, hourlyMap, hour } = params;
  const isNightOnly = /\(NS\)/i.test(routeCode);

  const hasAnyHourlyData = Object.keys(hourlyMap).length > 0;

  const isHourActive = (d: RouteCrowdDetail | undefined, h: number): boolean => {
    if (!d) {
      if (isNightOnly) return hasAnyHourlyData ? false : h >= 22;
      return true;
    }
    if (isNightOnly) {
      return (d.ticketCount ?? 0) > 0 || h >= 22;
    }
    if (typeof tripsPerDay === 'number' && tripsPerDay <= 2) {
      return (d.ticketCount ?? 0) > 0 || d.predictionSource !== 'route_average';
    }
    // Standard daytime/all-day DTC/Cluster route operates 05:00-23:00 unless explicit zero-ticket route_average
    return !((d.ticketCount ?? 0) === 0 && d.predictionSource === 'route_average');
  };

  const runsNow = isHourActive(detail, hour);
  if (runsNow) {
    return { runsAtHour: true, nearestActiveHour: hour };
  }

  let bestHour: number | null = null;
  let bestDist = Infinity;
  for (const h of HOURS_RANGE) {
    if (isHourActive(hourlyMap[h], h)) {
      const dist = Math.abs(h - hour);
      if (dist < bestDist) {
        bestDist = dist;
        bestHour = h;
      }
    }
  }
  if (bestHour === null && isNightOnly) {
    bestHour = 22;
  }

  return { runsAtHour: false, nearestActiveHour: bestHour };
}

export function computeStretchSummary(params: {
  detail: RouteCrowdDetail | undefined;
  stops: BusStop[];
  boardingIndex: number;
  alightingIndex: number;
}): StretchCrowdSummary {
  const { detail, stops, boardingIndex, alightingIndex } = params;
  const validRange = boardingIndex >= 0 && alightingIndex > boardingIndex;
  const travelMinutes = validRange
    ? estimateSegmentTravelMinutes(stops, boardingIndex, alightingIndex)
    : 0;
  const stopCount = validRange ? alightingIndex - boardingIndex + 1 : 0;

  if (!detail || !validRange) {
    return {
      loadPct: null,
      crowding: null,
      confidence: null,
      ticketCount: null,
      predictionSource: 'observed_tickets',
      hasData: false,
      segments: [],
      stopCount,
      travelMinutes,
    };
  }

  const allSegs: RouteCrowdSegment[] = detail.segments ?? [];
  const sliceEnd = Math.min(allSegs.length, alightingIndex);
  const slicedRaw = allSegs.slice(boardingIndex, sliceEnd);

  const segments: StretchSegmentItem[] = slicedRaw.map((seg, idx) => {
    const validLoad =
      typeof seg.loadPct === 'number' && Number.isFinite(seg.loadPct) && seg.loadPct > 0
        ? Math.round(seg.loadPct)
        : null;
    const crowding = validLoad !== null ? seg.crowding ?? getCrowdingLevel(validLoad) : null;
    return {
      id: seg.id || `stretch-${boardingIndex + idx}`,
      fromName: seg.fromName || stops[boardingIndex + idx]?.name || '',
      toName: seg.toName || stops[boardingIndex + idx + 1]?.name || '',
      loadPct: validLoad,
      crowding,
      color: crowding ? CROWDING_META[crowding].hex : '#B8C4B4',
    };
  });

  const validLoads = segments
    .map((s) => s.loadPct)
    .filter((v): v is number => v !== null && v > 0);

  let loadPct: number | null = null;
  if (validLoads.length > 0) {
    loadPct = Math.round(validLoads.reduce((a, b) => a + b, 0) / validLoads.length);
  } else if (
    typeof detail.loadPct === 'number' &&
    Number.isFinite(detail.loadPct) &&
    detail.loadPct > 0 &&
    (detail.ticketCount ?? 0) > 0
  ) {
    loadPct = Math.round(detail.loadPct);
  }

  const hasValidPositiveData =
    loadPct !== null &&
    loadPct > 0 &&
    !((detail.ticketCount ?? 0) === 0 && detail.predictionSource === 'route_average');

  if (!hasValidPositiveData) {
    return {
      loadPct: null,
      crowding: null,
      confidence: null,
      ticketCount: detail.ticketCount,
      predictionSource: detail.predictionSource,
      hasData: false,
      segments,
      stopCount,
      travelMinutes,
    };
  }

  const crowding = getCrowdingLevel(loadPct!);
  const ticketSum = slicedRaw.reduce((acc, s) => acc + (s.ticketCount ?? 0), 0);
  const ticketCount =
    slicedRaw.length > 0 && ticketSum > 0 ? ticketSum : detail.ticketCount;

  // Derive stretch confidence cleanly if slices provide tickets, else use route confidence
  let confidence: ConfidenceLevel = detail.confidence;
  if (slicedRaw.length > 0) {
    const avgTickets = ticketSum / slicedRaw.length;
    confidence = avgTickets >= 50 ? 'High' : avgTickets >= 12 ? 'Medium' : detail.confidence;
  }

  return {
    loadPct,
    crowding,
    confidence,
    ticketCount,
    predictionSource: detail.predictionSource,
    hasData: true,
    segments,
    stopCount,
    travelMinutes,
  };
}

export function formatClock12h(totalMinutes: number): string {
  const minsInDay = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(minsInDay / 60);
  const m = minsInDay % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatMinutesToHHMM(totalMinutes: number): string {
  const minsInDay = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(minsInDay / 60);
  const m = minsInDay % 60;
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildHourlyStretchTimeline(params: {
  hourlyMap: Record<number, RouteCrowdDetail>;
  stops: BusStop[];
  boardingIndex: number;
  alightingIndex: number;
  routeCode: string;
  tripsPerDay?: number | null;
}): RouteHourlyTimelinePoint[] {
  const { hourlyMap, stops, boardingIndex, alightingIndex, routeCode, tripsPerDay } = params;

  return HOURS_RANGE.map((hr) => {
    const detail = hourlyMap[hr];
    const { runsAtHour } = doesRouteOperateAtHour({
      routeCode,
      tripsPerDay,
      detail,
      hourlyMap,
      hour: hr,
    });
    const stretch = computeStretchSummary({
      detail,
      stops,
      boardingIndex,
      alightingIndex,
    });
    return {
      hour: hr,
      loadPct: runsAtHour ? stretch.loadPct : null,
      crowding: runsAtHour ? stretch.crowding : null,
      hasData: runsAtHour && stretch.hasData,
      runsAtHour,
      ticketCount: detail?.ticketCount ?? null,
      predictionSource: detail?.predictionSource ?? 'observed_tickets',
    };
  });
}

export function estimateHeadwayMinutes(tripsPerDay?: number | null, explicitHeadway?: number | null): number {
  if (typeof explicitHeadway === 'number' && Number.isFinite(explicitHeadway) && explicitHeadway >= 4) {
    return Math.round(explicitHeadway);
  }
  if (typeof tripsPerDay === 'number' && tripsPerDay > 2) {
    // 19 operating hours (05:00-23:00 = 1140 min)
    return Math.max(8, Math.min(45, Math.round(1140 / tripsPerDay)));
  }
  return 20;
}

export function buildUpcomingDepartures(params: {
  departureTime: string;
  dayType: DayType;
  boardingIndex: number;
  travelMinutes: number;
  timeline: RouteHourlyTimelinePoint[];
  tripsPerDay?: number | null;
  headwayMinutes?: number | null;
  preference: 'comfortable' | 'fastest';
  count?: number;
}): {
  departures: ScheduledRouteDeparture[];
  nextBest: NextBestTravelSuggestion | null;
} {
  const {
    departureTime,
    dayType,
    boardingIndex,
    travelMinutes,
    timeline,
    tripsPerDay,
    headwayMinutes,
    preference,
    count = 5,
  } = params;

  const baseMins = parseTimeToMinutes(departureTime) ?? 8 * 60;
  const baseHeadway = estimateHeadwayMinutes(tripsPerDay, headwayMinutes);
  const effectiveHeadway = dayType === 'weekend' ? Math.min(45, Math.round(baseHeadway * 1.25)) : baseHeadway;
  const boardingOffsetMins = (boardingIndex * 2) % effectiveHeadway;

  const timelineByHour = new Map<number, RouteHourlyTimelinePoint>();
  for (const pt of timeline) timelineByHour.set(pt.hour, pt);

  const candidates: ScheduledRouteDeparture[] = [];
  const startScan = baseMins;
  const endScan = Math.min(23 * 60 + 50, baseMins + 180);

  // Align to GTFS headway grid relative to 05:00 + boarding offset
  const firstSlotOffset = Math.ceil((startScan - (5 * 60 + boardingOffsetMins)) / effectiveHeadway);
  let slotMins = 5 * 60 + boardingOffsetMins + Math.max(0, firstSlotOffset) * effectiveHeadway;

  let guard = 0;
  while (slotMins <= endScan && candidates.length < Math.max(count + 4, 8) && guard < 40) {
    guard++;
    const hr = Math.min(23, Math.max(5, Math.floor(slotMins / 60)));
    const pt = timelineByHour.get(hr);
    if (pt && pt.runsAtHour) {
      const arrivalMins = slotMins + travelMinutes;
      candidates.push({
        id: `dep-${slotMins}`,
        departureTime: formatMinutesToHHMM(slotMins),
        arrivalTime: formatMinutesToHHMM(arrivalMins),
        departureMinutes: slotMins,
        arrivalMinutes: arrivalMins,
        durationMinutes: travelMinutes,
        loadPct: pt.loadPct,
        crowding: pt.crowding,
        hasData: pt.hasData,
      });
    }
    slotMins += effectiveHeadway;
  }

  // Next best calmer departure within next 60 minutes (strictly after requested departureTime)
  const currentHr = Math.min(23, Math.max(5, Math.floor(baseMins / 60)));
  const currentPt = timelineByHour.get(currentHr);
  let nextBest: NextBestTravelSuggestion | null = null;

  if (currentPt?.hasData && currentPt.crowding && currentPt.loadPct !== null) {
    const within60 = candidates.filter(
      (d) =>
        d.departureMinutes > baseMins &&
        d.departureMinutes <= baseMins + 60 &&
        d.hasData &&
        d.crowding !== null &&
        d.loadPct !== null
    );
    const calmer = within60
      .filter(
        (d) =>
          CROWD_RANK[d.crowding!] < CROWD_RANK[currentPt.crowding!] ||
          (d.loadPct! <= currentPt.loadPct! - 8 && d.crowding !== 'crowded')
      )
      .sort((a, b) => {
        const tierDiff = CROWD_RANK[a.crowding!] - CROWD_RANK[b.crowding!];
        if (tierDiff !== 0) return tierDiff;
        return a.departureMinutes - b.departureMinutes;
      })[0];

    if (calmer && calmer.crowding && calmer.loadPct !== null) {
      nextBest = {
        time: calmer.departureTime,
        displayTime: formatClock12h(calmer.departureMinutes),
        crowding: calmer.crowding,
        loadPct: calmer.loadPct,
        minutesAhead: calmer.departureMinutes - baseMins,
      };
    }
  }

  const sliced = candidates.slice(0, count);
  const sorted = [...sliced].sort((a, b) => {
    if (preference === 'comfortable') {
      if (a.hasData && !b.hasData) return -1;
      if (!a.hasData && b.hasData) return 1;
      const loadA = a.loadPct ?? 999;
      const loadB = b.loadPct ?? 999;
      if (loadA !== loadB) return loadA - loadB;
    }
    return a.arrivalMinutes - b.arrivalMinutes;
  });

  return { departures: sorted, nextBest };
}

export function formatHourLabel(hour: number): string {
  return formatHour(hour);
}
