import {
  ApiRouteSummary,
  ConfidenceLevel,
  CrowdingLevel,
  DayType,
  LatLngPoint,
  OperatorHotspotRow,
  PredictionSource,
  RouteCrowdDetail,
  RouteCrowdSegment,
} from '../types/transit';
import { CROWDING_META, getCrowdingLevel } from './transitUtils';

export interface LatLngBoundsBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapPolylineDescriptor {
  id: string;
  routeId: string;
  routeCode: string;
  corridorLabel: string;
  fromName: string;
  toName: string;
  crowding: CrowdingLevel | null;
  loadPct: number | null;
  estimatedPassengers: number | null;
  confidence: ConfidenceLevel | null;
  color: string;
  weight: number;
  opacity: number;
  zIndex: number;
  interactive: boolean;
  path: LatLngPoint[];
}

export interface MapStopDescriptor {
  id: string;
  name: string;
  lat: number;
  lng: number;
  number: number;
  isStart: boolean;
  isEnd: boolean;
}

export interface RouteStopTimelineItem extends MapStopDescriptor {
  stretchCrowding: CrowdingLevel | null;
  stretchLoadPct: number | null;
  stretchColor: string;
  incomingColor: string;
}

export interface MapEndpointLabels {
  start: { name: string; lat: number; lng: number };
  end: { name: string; lat: number; lng: number };
}

export interface RankedRouteEntry {
  route: ApiRouteSummary;
  crowd: RouteCrowdDetail | null;
  hotspot: OperatorHotspotRow | null;
  loadPct: number | null;
  crowding: CrowdingLevel | null;
  confidence: ConfidenceLevel | null;
  ticketCount: number | null;
  predictionSource: PredictionSource | null;
  direction: string;
  busiestStretch: string | null;
  hasData: boolean;
}

export type RouteFilterMode = 'all' | 'crowded' | 'seats' | 'not_enough_data' | 'low_data';

export interface SimplifiedMapRenderData {
  polylines: MapPolylineDescriptor[];
  stops: MapStopDescriptor[];
  stopItems: RouteStopTimelineItem[];
  endpoints: MapEndpointLabels | null;
  allBounds: LatLngBoundsBox | null;
  focusedBounds: LatLngBoundsBox | null;
  focusCenter: LatLngPoint | null;
}

export const DEFAULT_ROUTE_LINE_HEX = '#B8C4B4';

export const NO_LABELS_MAP_STYLE: google.maps.MapTypeStyle[] = [
  {
    featureType: 'all',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
];

export const SAGE_MUTED_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#EEF2EA' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A968C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#EEF2EA' }, { weight: 2.5 }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#EEF2EA' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#E8EDE4' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D6E4E0' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#DFE6DA' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.province', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#8A968C' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.stroke', stylers: [{ color: '#EEF2EA' }, { weight: 2.5 }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#7D8A80' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.stroke', stylers: [{ color: '#EEF2EA' }, { weight: 2.5 }] },
];

export type GoogleMapsKeyIssue = 'missing' | 'invalid_format' | null;

/**
 * Validates that a browser Google Maps JS API key looks like a real Maps key (AIza...)
 * rather than being empty or accidentally populated with a URL or placeholder.
 */
export function getGoogleMapsKeyIssue(rawKey: string | undefined | null): GoogleMapsKeyIssue {
  const key = (rawKey ?? '').trim();
  if (!key) return 'missing';
  if (/^https?:\/\//i.test(key) || /\s/.test(key)) {
    return 'invalid_format';
  }
  if (/^(MY_|YOUR_|REPLACE_|PLACEHOLDER)/i.test(key)) {
    return 'invalid_format';
  }
  if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(key)) {
    return 'invalid_format';
  }
  return null;
}

export function isValidCoordinate(pt: LatLngPoint): boolean {
  return (
    Number.isFinite(pt.lat) &&
    Number.isFinite(pt.lng) &&
    pt.lat !== 0 &&
    pt.lng !== 0 &&
    Math.abs(pt.lat) <= 90 &&
    Math.abs(pt.lng) <= 180
  );
}

export function computeBounds(points: LatLngPoint[]): LatLngBoundsBox | null {
  const valid = points.filter(isValidCoordinate);
  if (valid.length < 2) return null;

  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;

  for (const pt of valid) {
    if (pt.lat > north) north = pt.lat;
    if (pt.lat < south) south = pt.lat;
    if (pt.lng > east) east = pt.lng;
    if (pt.lng < west) west = pt.lng;
  }

  return { north, south, east, west };
}

export function estimatePassengersOnBoard(
  loadPct: number | null,
  explicitPassengers?: number | null
): number | null {
  if (typeof explicitPassengers === 'number' && Number.isFinite(explicitPassengers) && explicitPassengers > 0) {
    return Math.round(explicitPassengers);
  }
  if (loadPct === null || !Number.isFinite(loadPct) || loadPct <= 0) return null;
  return Math.max(1, Math.round((loadPct / 100) * 85));
}

export function formatSegmentTooltip(params: {
  fromName: string;
  toName: string;
  crowding: CrowdingLevel | null;
  loadPct: number | null;
  estimatedPassengers?: number | null;
  confidence: ConfidenceLevel | null;
  corridorLabel?: string;
}): string {
  const stretch =
    params.fromName && params.toName
      ? `${params.fromName} to ${params.toName}`
      : params.corridorLabel || 'Route stretch';

  if (params.crowding === null || params.loadPct === null || params.loadPct <= 0) {
    return `${stretch}, Not enough data`;
  }

  const tierLabel =
    params.crowding === 'crowded'
      ? 'Crowded'
      : params.crowding === 'standing'
        ? 'Standing room'
        : 'Seats available';
  const people = estimatePassengersOnBoard(params.loadPct, params.estimatedPassengers);
  const peopleText = people !== null ? `, about ${people} people on board` : '';
  const confText = params.confidence ? `, confidence ${params.confidence}` : '';
  return `${stretch}, ${tierLabel}${peopleText}${confText}`;
}

export function formatCapacityLabel(
  crowding: CrowdingLevel | null,
  loadPct: number | null
): string {
  if (crowding === null || loadPct === null || !Number.isFinite(loadPct) || loadPct <= 0) {
    return 'Not enough data';
  }
  const tierLabel = CROWDING_META[crowding].label;
  return `${tierLabel}, ${Math.round(loadPct)}% full`;
}

export function formatRouteListCapacity(
  crowding: CrowdingLevel | null,
  loadPct: number | null
): string {
  if (crowding === null || loadPct === null || !Number.isFinite(loadPct) || loadPct <= 0) {
    return 'Not enough data';
  }
  const tierLabel = CROWDING_META[crowding].label;
  return `${tierLabel}, ${Math.round(loadPct)}% full`;
}

export function stripDuplicateRouteCode(corridorLabel: string, routeCode: string): string {
  const trimmed = corridorLabel.trim();
  if (!trimmed || !routeCode.trim()) return trimmed;
  const escaped = routeCode.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleaned = trimmed
    .replace(new RegExp(`^(?:route|bus)?\\s*${escaped}(?:\\s*(?:up|down|dn))?\\s*[:\\-–—|]*\\s*`, 'i'), '')
    .trim();
  return cleaned || trimmed;
}

export function inferRouteDirection(
  route: ApiRouteSummary,
  crowd?: RouteCrowdDetail | null
): string {
  const explicit = crowd?.direction ?? route.direction;
  if (explicit) {
    if (/down|dn|\b1\b/i.test(explicit)) return 'Down';
    if (/up|\b0\b/i.test(explicit)) return 'Up';
    return explicit;
  }
  if (/(\bdown\b|dn$|-dn\b|_dn\b)/i.test(route.routeId) || /(\bdown\b|\bdn\b)/i.test(route.routeCode)) {
    return 'Down';
  }
  return 'Up';
}

function extractValidPositiveLoad(rawLoad: number | null | undefined): number | null {
  if (typeof rawLoad !== 'number' || !Number.isFinite(rawLoad) || rawLoad <= 0) {
    return null;
  }
  return Math.round(rawLoad);
}

export function rankRoutesByLoad(params: {
  routes: ApiRouteSummary[];
  crowdByKey: Record<string, RouteCrowdDetail>;
  hotspots: OperatorHotspotRow[];
  dayType: DayType;
  hour: number;
}): {
  ranked: RankedRouteEntry[];
  top5Ids: Set<string>;
} {
  const { routes, crowdByKey, hotspots, dayType, hour } = params;

  const hotspotByRouteId: Record<string, OperatorHotspotRow> = {};
  const hotspotByRouteCode: Record<string, OperatorHotspotRow> = {};
  for (const h of hotspots) {
    if (extractValidPositiveLoad(h.loadPct) === null) continue;
    const existingId = hotspotByRouteId[h.routeId];
    if (!existingId || h.loadPct > existingId.loadPct) {
      hotspotByRouteId[h.routeId] = h;
    }
    const codeKey = h.routeCode.toLowerCase();
    const existingCode = hotspotByRouteCode[codeKey];
    if (!existingCode || h.loadPct > existingCode.loadPct) {
      hotspotByRouteCode[codeKey] = h;
    }
  }

  const ranked: RankedRouteEntry[] = routes.map((route) => {
    const crowd = crowdByKey[`${route.routeId}::${dayType}::${hour}`] ?? null;
    const hotspot =
      hotspotByRouteId[route.routeId] ?? hotspotByRouteCode[route.routeCode.toLowerCase()] ?? null;

    let crowdValidLoad = crowd ? extractValidPositiveLoad(crowd.loadPct) : null;
    if (crowd && crowdValidLoad === null && crowd.segments?.length) {
      const positiveSegs = crowd.segments
        .map((s) => extractValidPositiveLoad(s.loadPct))
        .filter((v): v is number => v !== null);
      if (positiveSegs.length > 0) {
        crowdValidLoad = Math.round(
          positiveSegs.reduce((sum, v) => sum + v, 0) / positiveSegs.length
        );
      }
    }

    const hotspotValidLoad = hotspot ? extractValidPositiveLoad(hotspot.loadPct) : null;
    const loadPct = crowdValidLoad ?? hotspotValidLoad ?? null;

    const crowding =
      loadPct === null
        ? null
        : crowdValidLoad !== null && crowd
          ? crowd.crowding ?? getCrowdingLevel(loadPct)
          : hotspotValidLoad !== null && hotspot
            ? hotspot.crowding ?? getCrowdingLevel(loadPct)
            : getCrowdingLevel(loadPct);

    const hasData = loadPct !== null && loadPct > 0 && crowding !== null;

    const confidence =
      !hasData
        ? null
        : crowd !== null
          ? crowd.confidence
          : hotspot !== null
            ? hotspot.confidence
            : null;

    const ticketCount =
      crowd !== null
        ? crowd.ticketCount
        : hotspot !== null
          ? hotspot.ticketCount
          : null;

    const predictionSource =
      crowd !== null
        ? crowd.predictionSource
        : hotspot !== null
          ? hotspot.predictionSource
          : null;

    let busiestStretch: string | null = null;
    if (crowd?.segments?.length) {
      const positiveSegs = crowd.segments.filter((s) => extractValidPositiveLoad(s.loadPct) !== null);
      const peakSeg = [...(positiveSegs.length > 0 ? positiveSegs : crowd.segments)].sort(
        (a, b) => b.loadPct - a.loadPct
      )[0];
      if (peakSeg?.fromName && peakSeg?.toName) {
        busiestStretch = `${peakSeg.fromName} to ${peakSeg.toName}`;
      }
    }
    if (!busiestStretch) {
      const raw = crowd?.busiestStretch || hotspot?.busiestStretch;
      if (raw) {
        busiestStretch = raw.replace(/\s*[–—-]\s*/g, ' to ');
      } else if (route.originName && route.destinationName) {
        busiestStretch = `${route.originName} to ${route.destinationName}`;
      }
    }

    return {
      route,
      crowd,
      hotspot,
      loadPct,
      crowding,
      confidence,
      ticketCount,
      predictionSource,
      direction: inferRouteDirection(route, crowd),
      busiestStretch,
      hasData,
    };
  });

  ranked.sort((a, b) => {
    if (a.hasData && !b.hasData) return -1;
    if (!a.hasData && b.hasData) return 1;
    if (a.loadPct !== null && b.loadPct !== null) {
      if (b.loadPct !== a.loadPct) return b.loadPct - a.loadPct;
    }
    return a.route.routeCode.localeCompare(b.route.routeCode, undefined, { numeric: true });
  });

  const top5Ids = new Set(
    ranked
      .filter((entry) => entry.hasData)
      .slice(0, 5)
      .map((entry) => entry.route.routeId)
  );

  return { ranked, top5Ids };
}

export function pickDefaultCrowdedRouteId(ranked: RankedRouteEntry[]): string | null {
  return ranked.find((entry) => entry.hasData)?.route.routeId ?? null;
}

export function matchesRouteFilter(
  entry: RankedRouteEntry,
  filterMode: RouteFilterMode
): boolean {
  switch (filterMode) {
    case 'all':
      return true;
    case 'crowded':
      return entry.hasData && entry.crowding === 'crowded';
    case 'seats':
      return entry.hasData && entry.crowding === 'seats';
    case 'not_enough_data':
      return !entry.hasData;
    case 'low_data':
      return !entry.hasData || entry.confidence === 'Low' || entry.predictionSource === 'ml_fallback';
    default:
      return true;
  }
}

export function filterRankedRoutes(
  ranked: RankedRouteEntry[],
  searchQuery: string,
  filterMode: RouteFilterMode = 'all'
): RankedRouteEntry[] {
  const byFilter = filterMode === 'all' ? ranked : ranked.filter((e) => matchesRouteFilter(e, filterMode));
  const q = searchQuery.trim().toLowerCase();
  if (!q) return byFilter;
  return byFilter.filter(
    ({ route, direction }) =>
      route.routeCode.toLowerCase().includes(q) ||
      `${route.routeCode} ${direction}`.toLowerCase().includes(q) ||
      route.routeName.toLowerCase().includes(q) ||
      route.corridorLabel.toLowerCase().includes(q) ||
      route.originName.toLowerCase().includes(q) ||
      route.destinationName.toLowerCase().includes(q)
  );
}

export function sortListWithPinnedFocus(
  routes: RankedRouteEntry[],
  selectedRouteId: string | null
): RankedRouteEntry[] {
  if (!selectedRouteId) return routes;
  const idx = routes.findIndex((r) => r.route.routeId === selectedRouteId);
  if (idx <= 0) return routes;
  return [routes[idx], ...routes.slice(0, idx), ...routes.slice(idx + 1)];
}

export function getAdjacentRouteId(
  orderedRoutes: RankedRouteEntry[],
  currentRouteId: string | null,
  step: 'next' | 'prev'
): string | null {
  if (orderedRoutes.length === 0) return null;
  if (!currentRouteId) return orderedRoutes[0].route.routeId;
  const idx = orderedRoutes.findIndex((r) => r.route.routeId === currentRouteId);
  if (idx === -1) return orderedRoutes[0].route.routeId;
  const delta = step === 'next' ? 1 : -1;
  const nextIdx = (idx + delta + orderedRoutes.length) % orderedRoutes.length;
  return orderedRoutes[nextIdx].route.routeId;
}

function normalizeStopMatchName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findMatchingSegment(
  segments: RouteCrowdSegment[] | undefined,
  stretchIndex: number,
  stopsCount: number,
  fromName: string,
  toName: string
): RouteCrowdSegment | null {
  if (!segments || segments.length === 0) return null;
  const fromNorm = normalizeStopMatchName(fromName);
  const toNorm = normalizeStopMatchName(toName);

  const byNames = segments.find(
    (s) =>
      normalizeStopMatchName(s.fromName) === fromNorm &&
      normalizeStopMatchName(s.toName) === toNorm
  );
  if (byNames) return byNames;

  if (segments.length === stopsCount - 1 && segments[stretchIndex]) {
    return segments[stretchIndex];
  }

  return segments[stretchIndex] ?? null;
}

function findNearestCoordIndex(
  coords: LatLngPoint[],
  target: LatLngPoint,
  minIndex: number
): number {
  let bestIdx = minIndex;
  let bestDist = Infinity;
  for (let i = minIndex; i < coords.length; i++) {
    const dLat = coords[i].lat - target.lat;
    const dLng = coords[i].lng - target.lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function buildSimplifiedMapRenderData(params: {
  ranked: RankedRouteEntry[];
  top5Ids?: Set<string>;
  selectedRouteId: string | null;
  hoveredRouteId?: string | null;
  filterMode?: RouteFilterMode;
}): SimplifiedMapRenderData {
  const { ranked, selectedRouteId } = params;

  const empty: SimplifiedMapRenderData = {
    polylines: [],
    stops: [],
    stopItems: [],
    endpoints: null,
    allBounds: null,
    focusedBounds: null,
    focusCenter: null,
  };

  if (ranked.length === 0 || !selectedRouteId) {
    return empty;
  }

  const selectedEntry = ranked.find((r) => r.route.routeId === selectedRouteId);
  if (!selectedEntry) {
    return empty;
  }

  const { route, crowd, crowding, loadPct, confidence, hasData } = selectedEntry;
  const fallbackRouteColor =
    hasData && crowding ? CROWDING_META[crowding].hex : DEFAULT_ROUTE_LINE_HEX;

  const rawStops = (crowd?.stops?.length ? crowd.stops : route.stops).filter(isValidCoordinate);
  const uniqueStopIds = new Set<string>();
  const dedupedStops = rawStops.filter((s) => {
    if (uniqueStopIds.has(s.id)) return false;
    uniqueStopIds.add(s.id);
    return true;
  });

  const stops: MapStopDescriptor[] = dedupedStops.map((s, idx) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    number: idx + 1,
    isStart: idx === 0,
    isEnd: idx === dedupedStops.length - 1,
  }));

  const validRouteCoords = (
    crowd?.coordinates?.length ? crowd.coordinates : route.coordinates
  ).filter(isValidCoordinate);

  const segments = crowd?.segments ?? [];
  const hasAnyPositiveSegmentLoad = segments.some(
    (s) => extractValidPositiveLoad(s.loadPct) !== null
  );

  const polylines: MapPolylineDescriptor[] = [];
  const stretchColors: string[] = [];
  const stretchCrowdings: Array<CrowdingLevel | null> = [];
  const stretchLoads: Array<number | null> = [];

  if (stops.length >= 2) {
    let coordCursor = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      const seg = findMatchingSegment(segments, i, stops.length, a.name, b.name);

      const segPositiveLoad = seg ? extractValidPositiveLoad(seg.loadPct) : null;
      let stretchCrowding: CrowdingLevel | null = null;
      let stretchLoadPct: number | null = null;
      let stretchConfidence = confidence;

      if (seg && segPositiveLoad !== null) {
        stretchLoadPct = segPositiveLoad;
        stretchCrowding = seg.crowding ?? getCrowdingLevel(segPositiveLoad);
        stretchConfidence = seg.confidence ?? confidence;
      } else if ((!seg || !hasAnyPositiveSegmentLoad) && hasData && crowding && loadPct) {
        stretchLoadPct = loadPct;
        stretchCrowding = crowding;
      }

      const stretchColor = stretchCrowding
        ? CROWDING_META[stretchCrowding].hex
        : DEFAULT_ROUTE_LINE_HEX;

      stretchColors.push(stretchColor);
      stretchCrowdings.push(stretchCrowding);
      stretchLoads.push(stretchLoadPct);

      let stretchPath: LatLngPoint[] = [];
      const segCoords = seg?.coordinates?.filter(isValidCoordinate) ?? [];
      if (segCoords.length >= 2) {
        stretchPath = segCoords;
      } else if (validRouteCoords.length > stops.length) {
        const startIdx = findNearestCoordIndex(validRouteCoords, a, coordCursor);
        const endIdx = findNearestCoordIndex(validRouteCoords, b, startIdx);
        coordCursor = endIdx;
        if (endIdx > startIdx) {
          stretchPath = [
            { lat: a.lat, lng: a.lng },
            ...validRouteCoords.slice(startIdx + 1, endIdx),
            { lat: b.lat, lng: b.lng },
          ];
        }
      }

      if (stretchPath.length < 2) {
        stretchPath = [
          { lat: a.lat, lng: a.lng },
          { lat: b.lat, lng: b.lng },
        ];
      }

      polylines.push({
        id: `sel-${route.routeId}-stretch-${i}`,
        routeId: route.routeId,
        routeCode: route.routeCode,
        corridorLabel: route.corridorLabel,
        fromName: seg?.fromName || a.name,
        toName: seg?.toName || b.name,
        crowding: stretchCrowding,
        loadPct: stretchLoadPct,
        estimatedPassengers: estimatePassengersOnBoard(stretchLoadPct, seg?.estimatedPassengers),
        confidence: stretchConfidence,
        color: stretchColor,
        weight: 6,
        opacity: 0.96,
        zIndex: 50,
        interactive: true,
        path: stretchPath,
      });
    }
  } else if (segments.some((s) => s.coordinates.filter(isValidCoordinate).length >= 2)) {
    segments.forEach((seg, idx) => {
      const segPath = seg.coordinates.filter(isValidCoordinate);
      if (segPath.length < 2) return;
      const segPositiveLoad = extractValidPositiveLoad(seg.loadPct);
      const segCrowding =
        segPositiveLoad !== null
          ? seg.crowding ?? getCrowdingLevel(segPositiveLoad)
          : !hasAnyPositiveSegmentLoad && hasData
            ? crowding
            : null;
      const segLoad =
        segPositiveLoad !== null ? segPositiveLoad : !hasAnyPositiveSegmentLoad && hasData ? loadPct : null;
      polylines.push({
        id: `sel-${route.routeId}-seg-${seg.id || idx}`,
        routeId: route.routeId,
        routeCode: route.routeCode,
        corridorLabel: route.corridorLabel,
        fromName: seg.fromName || route.originName,
        toName: seg.toName || route.destinationName,
        crowding: segCrowding,
        loadPct: segLoad,
        estimatedPassengers: estimatePassengersOnBoard(segLoad, seg.estimatedPassengers),
        confidence: seg.confidence ?? confidence,
        color: segCrowding ? CROWDING_META[segCrowding].hex : DEFAULT_ROUTE_LINE_HEX,
        weight: 6,
        opacity: 0.96,
        zIndex: 50,
        interactive: true,
        path: segPath,
      });
    });
  } else if (validRouteCoords.length >= 2) {
    polylines.push({
      id: `sel-${route.routeId}-full`,
      routeId: route.routeId,
      routeCode: route.routeCode,
      corridorLabel: route.corridorLabel,
      fromName: route.originName,
      toName: route.destinationName,
      crowding: hasData ? crowding : null,
      loadPct: hasData ? loadPct : null,
      estimatedPassengers: hasData ? estimatePassengersOnBoard(loadPct) : null,
      confidence: hasData ? confidence : null,
      color: fallbackRouteColor,
      weight: 6,
      opacity: 0.96,
      zIndex: 50,
      interactive: true,
      path: validRouteCoords,
    });
  }

  const stopItems: RouteStopTimelineItem[] = stops.map((stop, idx) => ({
    ...stop,
    stretchCrowding: idx < stops.length - 1 ? stretchCrowdings[idx] ?? null : null,
    stretchLoadPct: idx < stops.length - 1 ? stretchLoads[idx] ?? null : null,
    stretchColor: idx < stops.length - 1 ? stretchColors[idx] ?? DEFAULT_ROUTE_LINE_HEX : DEFAULT_ROUTE_LINE_HEX,
    incomingColor: idx > 0 ? stretchColors[idx - 1] ?? DEFAULT_ROUTE_LINE_HEX : DEFAULT_ROUTE_LINE_HEX,
  }));

  const startPt = stops[0]
    ? { name: stops[0].name, lat: stops[0].lat, lng: stops[0].lng }
    : validRouteCoords[0]
      ? {
          name: route.originName || 'Start',
          lat: validRouteCoords[0].lat,
          lng: validRouteCoords[0].lng,
        }
      : null;

  const endStop = stops[stops.length - 1];
  const endCoord = validRouteCoords[validRouteCoords.length - 1];
  const endPt = endStop
    ? { name: endStop.name, lat: endStop.lat, lng: endStop.lng }
    : endCoord
      ? {
          name: route.destinationName || 'End',
          lat: endCoord.lat,
          lng: endCoord.lng,
        }
      : null;

  const endpoints = startPt && endPt ? { start: startPt, end: endPt } : null;

  const focusPoints = stops.length >= 2 ? stops : validRouteCoords;
  const focusedBounds = computeBounds(focusPoints);
  const focusCenter =
    focusedBounds === null && focusPoints.length === 1 && isValidCoordinate(focusPoints[0])
      ? { lat: focusPoints[0].lat, lng: focusPoints[0].lng }
      : null;

  return {
    polylines,
    stops,
    stopItems,
    endpoints,
    allBounds: focusedBounds,
    focusedBounds,
    focusCenter,
  };
}

interface LabelBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function projectToWorldPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Selects stop IDs whose inline map name labels fit without overlapping at the current zoom level.
 * Always prioritizes route start/end stops, then intermediate stops in travel order.
 */
export function selectVisibleStopLabelIds(
  stops: MapStopDescriptor[],
  zoom: number
): Set<string> {
  const visible = new Set<string>();
  if (stops.length === 0) return visible;

  const effectiveZoom = Number.isFinite(zoom) ? zoom : 12;
  const placedBoxes: LabelBox[] = [];

  const endpoints = stops.filter((s) => s.isStart || s.isEnd);
  const middle = stops.filter((s) => !s.isStart && !s.isEnd);
  const ordered = [...endpoints, ...middle];

  for (const stop of ordered) {
    if (!isValidCoordinate(stop)) continue;
    const { x, y } = projectToWorldPx(stop.lat, stop.lng, effectiveZoom);
    const labelWidth = Math.min(152, Math.max(44, stop.name.length * 6.4 + 12));
    const labelHeight = 18;
    const box: LabelBox = {
      left: x + 8,
      right: x + 8 + labelWidth,
      top: y - labelHeight / 2 - 2,
      bottom: y + labelHeight / 2 + 2,
    };

    if (!placedBoxes.some((existing) => boxesOverlap(existing, box))) {
      placedBoxes.push(box);
      visible.add(stop.id);
    }
  }

  return visible;
}

