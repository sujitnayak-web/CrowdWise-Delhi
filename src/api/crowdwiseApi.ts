import { API_BASE, buildApiUrl } from '../config/api';
import {
  ApiRouteSummary,
  BusStop,
  DayType,
  JourneyLeg,
  JourneyOption,
  LatLngPoint,
  MLInsightsData,
  OperatorHotspotRow,
  OperatorHotspotsPayload,
  OperatorHourlyPoint,
  PreferenceMode,
  RouteCrowdDetail,
  RouteCrowdSegment,
} from '../types/transit';
import {
  extractForwardNudge,
  getCrowdingLevel,
  normalizeConfidence,
  normalizeCoordinates,
  normalizeCrowdingLevel,
  normalizeLoadPct,
  normalizePredictionSource,
  parseTimeToMinutes,
  shortenStopName,
} from '../utils/transitUtils';

export class ApiRequestError extends Error {
  status?: number;
  endpoint: string;

  constructor(message: string, endpoint: string, status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.endpoint = endpoint;
    this.status = status;
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    const target = API_BASE || window.location.origin;
    throw new ApiRequestError(
      `Unable to reach the CrowdWise backend at ${target}. Check that the Python API server is running or verify VITE_API_BASE_URL.`,
      url
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          detail = String(parsed.detail ?? parsed.message ?? parsed.error ?? text);
        } catch {
          detail = text.slice(0, 180);
        }
      }
    } catch {
      // Ignore secondary parse failure
    }
    throw new ApiRequestError(
      detail ? `API error (${response.status}): ${detail}` : `Backend returned HTTP ${response.status} for ${url}`,
      url,
      response.status
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    const snippet = await response.text();
    if (snippet.trim().startsWith('<')) {
      throw new ApiRequestError(
        `Backend returned HTML instead of JSON for ${url}. Verify VITE_API_BASE_URL points to the Python API server.`,
        url,
        response.status
      );
    }
    return JSON.parse(snippet) as T;
  }

  return (await response.json()) as T;
}

export function normalizeStop(raw: unknown): BusStop | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = String(obj.stop_id ?? obj.id ?? obj.code ?? obj.stop_name ?? obj.name ?? '').trim();
  const name = String(obj.stop_name ?? obj.name ?? obj.label ?? id).trim();
  if (!id && !name) return null;

  const shortName = String(obj.short_name ?? obj.shortName ?? shortenStopName(name)).trim() || name;
  const lat = Number(obj.lat ?? obj.stop_lat ?? obj.latitude ?? 0);
  const lng = Number(obj.lng ?? obj.lon ?? obj.stop_lon ?? obj.longitude ?? 0);
  const routesRaw = obj.routes ?? obj.route_codes ?? obj.route_names;
  const routes = Array.isArray(routesRaw) ? routesRaw.map((r) => String(r)) : [];

  return {
    id: id || name,
    name: name || id,
    shortName,
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    zone: typeof obj.zone === 'string' ? obj.zone : undefined,
    routes,
  };
}

export async function searchStops(
  query: string,
  limit = 15,
  signal?: AbortSignal
): Promise<BusStop[]> {
  const url = buildApiUrl('/api/stops', { q: query.trim(), limit });
  const data = await fetchJson<unknown>(url, signal);
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).stops ??
         (data as Record<string, unknown>).results ??
         (data as Record<string, unknown>).items ??
         [])
      : [];

  if (!Array.isArray(list)) return [];
  return list.map(normalizeStop).filter((s): s is BusStop => s !== null);
}

function normalizeTicketCount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.round(Number(raw)));
  }
  return null;
}

function normalizeLeg(raw: unknown, idx: number, prevArrivalTime?: string): JourneyLeg {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const routeId = String(obj.route_id ?? obj.routeId ?? obj.route_code ?? obj.route ?? `route-${idx + 1}`);
  const routeCode = String(obj.route_code ?? obj.route_short_name ?? obj.routeCode ?? obj.route ?? routeId);
  const routeName = String(obj.route_name ?? obj.route_long_name ?? obj.routeName ?? `Route ${routeCode}`);
  const operator = String(obj.operator ?? obj.agency ?? 'DTC / Cluster');

  const fromStop =
    normalizeStop(obj.from_stop ?? obj.fromStop) ?? {
      id: String(obj.from_stop_id ?? obj.origin_id ?? obj.from ?? `from-${idx}`),
      name: String(obj.from_stop_name ?? obj.origin_name ?? obj.from_name ?? obj.from ?? 'Origin stop'),
      shortName: shortenStopName(
        String(obj.from_stop_name ?? obj.origin_name ?? obj.from_name ?? obj.from ?? 'Origin')
      ),
      lat: Number(obj.from_lat ?? 0),
      lng: Number(obj.from_lng ?? 0),
      routes: [routeCode],
    };

  const toStop =
    normalizeStop(obj.to_stop ?? obj.toStop) ?? {
      id: String(obj.to_stop_id ?? obj.destination_id ?? obj.to ?? `to-${idx}`),
      name: String(obj.to_stop_name ?? obj.destination_name ?? obj.to_name ?? obj.to ?? 'Destination stop'),
      shortName: shortenStopName(
        String(obj.to_stop_name ?? obj.destination_name ?? obj.to_name ?? obj.to ?? 'Destination')
      ),
      lat: Number(obj.to_lat ?? 0),
      lng: Number(obj.to_lng ?? 0),
      routes: [routeCode],
    };

  const rawIntermediates = obj.intermediate_stops ?? obj.intermediateStops ?? [];
  const intermediateStops = Array.isArray(rawIntermediates)
    ? rawIntermediates.map(normalizeStop).filter((s): s is BusStop => s !== null)
    : [];

  const durationMinutes = Math.max(
    1,
    Math.round(
      Number(obj.duration_minutes ?? obj.durationMinutes ?? obj.travel_minutes ?? obj.ride_min ?? 10)
    )
  );
  const departureTime = String(obj.departure_time ?? obj.departureTime ?? '08:00');
  const arrivalTime = String(obj.arrival_time ?? obj.arrivalTime ?? departureTime);

  const explicitWait =
    obj.wait_minutes ??
    obj.transfer_wait_minutes ??
    obj.waitMinutesBefore ??
    (idx > 0 ? obj.wait_min : undefined);
  let waitMinutesBefore: number | undefined;
  if (typeof explicitWait === 'number' && Number.isFinite(explicitWait) && explicitWait >= 0) {
    waitMinutesBefore = Math.round(explicitWait);
  } else if (idx > 0 && prevArrivalTime) {
    const prevMins = parseTimeToMinutes(prevArrivalTime);
    const depMins = parseTimeToMinutes(departureTime);
    if (prevMins !== null && depMins !== null && depMins >= prevMins) {
      waitMinutesBefore = depMins - prevMins;
    }
  }

  const loadPct = normalizeLoadPct(
    obj.load_pct ?? obj.loadPct ?? obj.avg_load_pct,
    obj.load_ratio ?? obj.avg_load_ratio ?? obj.max_load_ratio
  );
  const crowding = normalizeCrowdingLevel(
    obj.crowding ?? obj.crowding_tier ?? obj.level ?? obj.max_crowd_level ?? obj.avg_crowd_level,
    loadPct
  );
  const confidence = normalizeConfidence(obj.confidence);
  const ticketCount = normalizeTicketCount(obj.ticket_count ?? obj.ticketCount);
  const predictionSource = normalizePredictionSource(obj.prediction_source ?? obj.predictionSource);
  const coordinates = normalizeCoordinates(obj.coordinates ?? obj.geometry ?? obj.polyline);
  const stopsCount = Math.max(
    1,
    Math.round(
      Number(obj.stops_count ?? obj.stopsCount ?? obj.num_stops ?? obj.stops ?? intermediateStops.length + 1)
    )
  );

  return {
    id: String(obj.id ?? `leg-${idx}-${routeId}`),
    routeId,
    routeCode,
    routeName,
    operator,
    fromStop,
    toStop,
    intermediateStops,
    stopsCount,
    durationMinutes,
    waitMinutesBefore,
    departureTime,
    arrivalTime,
    loadPct,
    crowding,
    confidence,
    ticketCount,
    predictionSource,
    coordinates,
  };
}

function formatStrategyTag(rawTag: unknown, legsCount: number): string {
  if (typeof rawTag === 'string' && rawTag.trim()) {
    const cleaned = rawTag.trim().replace(/[_-]+/g, ' ');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return legsCount <= 1 ? 'Direct bus' : '1-change route';
}

export function normalizeJourneyOption(
  raw: unknown,
  idx: number,
  requestedTime: string,
  dayType: DayType,
  topLevelShifts?: unknown
): JourneyOption {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawLegs = Array.isArray(obj.legs) ? obj.legs : [];
  const legs: JourneyLeg[] = [];
  for (let i = 0; i < rawLegs.length; i++) {
    const prevArr = i > 0 ? legs[i - 1].arrivalTime : undefined;
    legs.push(normalizeLeg(rawLegs[i], i, prevArr));
  }

  const avgLoadPct = normalizeLoadPct(
    obj.avg_load_pct ?? obj.avgLoadPct ?? obj.load_pct ?? obj.loadPct,
    obj.load_ratio ?? obj.avg_load_ratio
  );
  const peakLoadPct = normalizeLoadPct(
    obj.peak_load_pct ?? obj.peakLoadPct ?? avgLoadPct,
    obj.peak_load_ratio ?? obj.max_load_ratio
  );
  const overallCrowding = normalizeCrowdingLevel(
    obj.overall_crowding ?? obj.crowding ?? obj.crowding_tier ?? obj.max_crowd_level ?? obj.avg_crowd_level,
    avgLoadPct
  );

  const computedWaitFromLegs = legs.reduce((sum, leg) => sum + (leg.waitMinutesBefore ?? 0), 0);
  const rawTransferWait =
    obj.transfer_wait_minutes ??
    obj.transferWaitMinutes ??
    (legs.length > 1 ? obj.wait_min : 0);
  const transferWaitMinutes =
    typeof rawTransferWait === 'number' && Number.isFinite(rawTransferWait)
      ? Math.max(0, Math.round(rawTransferWait))
      : computedWaitFromLegs;

  const nudgeInput =
    obj.departure_shifts || obj.departureShifts || !Array.isArray(topLevelShifts) || overallCrowding === 'seats'
      ? obj
      : { ...obj, departure_shifts: topLevelShifts };
  const { text: forwardNudgeText, time: forwardNudgeTime } = extractForwardNudge(nudgeInput, requestedTime);
  const totalStops =
    typeof obj.total_stops === 'number' || typeof obj.totalStops === 'number'
      ? Number(obj.total_stops ?? obj.totalStops)
      : legs.reduce((acc, l) => acc + l.stopsCount, 0);

  return {
    id: String(obj.id ?? obj.option_id ?? `journey-${idx}-${legs.map((l) => l.routeCode).join('-')}`),
    strategyLabel: String(
      obj.strategy_label ?? obj.strategyLabel ?? formatStrategyTag(obj.tag, legs.length)
    ),
    dayType: (obj.day_type as DayType) || dayType,
    departureTime: String(obj.departure_time ?? obj.departureTime ?? legs[0]?.departureTime ?? requestedTime),
    arrivalTime: String(obj.arrival_time ?? obj.arrivalTime ?? legs[legs.length - 1]?.arrivalTime ?? requestedTime),
    totalMinutes: Math.max(
      1,
      Math.round(
        Number(
          obj.total_minutes ??
            obj.totalMinutes ??
            obj.total_duration_min ??
            obj.duration_minutes ??
            legs.reduce((s, l) => s + l.durationMinutes, 0) + transferWaitMinutes
        )
      )
    ),
    transferWaitMinutes,
    changes:
      typeof obj.changes === 'number'
        ? obj.changes
        : typeof obj.transfers === 'number'
          ? obj.transfers
          : Math.max(0, legs.length - 1),
    totalStops,
    overallCrowding,
    peakLoadPct: peakLoadPct || avgLoadPct,
    avgLoadPct,
    confidence: normalizeConfidence(obj.confidence ?? legs[0]?.confidence),
    ticketCount: normalizeTicketCount(obj.ticket_count ?? obj.ticketCount),
    predictionSource: normalizePredictionSource(obj.prediction_source ?? obj.predictionSource),
    legs,
    forwardNudgeText,
    forwardNudgeTime,
  };
}

export async function planJourneys(
  params: {
    origin: string;
    destination: string;
    time: string;
    dayType: DayType;
    preference: PreferenceMode;
  },
  signal?: AbortSignal
): Promise<JourneyOption[]> {
  const url = buildApiUrl('/api/plan', {
    origin: params.origin,
    destination: params.destination,
    time: params.time,
    day_type: params.dayType,
    preference: params.preference,
  });

  const data = await fetchJson<unknown>(url, signal);
  const dataObj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const topLevelShifts = dataObj?.departure_shifts ?? dataObj?.departureShifts;
  const rawList = Array.isArray(data)
    ? data
    : dataObj
      ? (dataObj.options ??
         dataObj.journeys ??
         dataObj.plans ??
         dataObj.routes ??
         [])
      : [];

  if (!Array.isArray(rawList)) return [];
  return rawList.map((item, idx) =>
    normalizeJourneyOption(item, idx, params.time, params.dayType, topLevelShifts)
  );
}

function mapRawRouteSummary(raw: unknown, idx: number): ApiRouteSummary {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const routeId = String(obj.route_id ?? obj.id ?? obj.route_code ?? `route-${idx}`);
  const routeCode = String(obj.route_short_name ?? obj.route_code ?? obj.code ?? routeId);
  const stops = Array.isArray(obj.stops)
    ? obj.stops.map(normalizeStop).filter((s): s is BusStop => s !== null)
    : [];
  let coordinates = normalizeCoordinates(
    obj.coordinates ?? obj.geometry ?? obj.polyline ?? obj.shape
  );
  if (coordinates.length === 0 && stops.length > 0) {
    coordinates = stops.filter((s) => s.lat !== 0 && s.lng !== 0).map((s) => ({ lat: s.lat, lng: s.lng }));
  }

  const originName = String(
    obj.origin_name ?? obj.origin_stop ?? obj.from_name ?? stops[0]?.shortName ?? ''
  );
  const destinationName = String(
    obj.destination_name ?? obj.destination_stop ?? obj.to_name ?? stops[stops.length - 1]?.shortName ?? ''
  );
  const corridorLabel = String(
    obj.corridor_label ??
      obj.corridor ??
      (originName && destinationName ? `${originName} – ${destinationName}` : obj.route_long_name ?? obj.name ?? routeCode)
  );

  const rawDirection = obj.direction ?? obj.direction_label ?? obj.dir;
  const direction =
    typeof rawDirection === 'string' && rawDirection.trim()
      ? rawDirection.trim()
      : obj.direction_id === 0 || obj.direction_id === '0'
        ? 'Up'
        : obj.direction_id === 1 || obj.direction_id === '1'
          ? 'Down'
          : undefined;

  const tripsPerDay =
    typeof obj.trips_per_day === 'number' && Number.isFinite(obj.trips_per_day)
      ? Math.round(obj.trips_per_day)
      : null;
  const stopsCount =
    typeof obj.num_stops === 'number' && Number.isFinite(obj.num_stops)
      ? Math.round(obj.num_stops)
      : stops.length > 0
        ? stops.length
        : undefined;

  return {
    routeId,
    routeCode,
    routeName: String(obj.route_long_name ?? obj.route_name ?? obj.name ?? `Route ${routeCode}`),
    operator: String(obj.operator ?? obj.agency ?? 'DTC / Cluster'),
    corridorLabel,
    direction,
    originId: String(obj.origin_stop_id ?? obj.origin_id ?? stops[0]?.id ?? originName),
    destinationId: String(
      obj.destination_stop_id ?? obj.destination_id ?? stops[stops.length - 1]?.id ?? destinationName
    ),
    originName: originName || corridorLabel,
    destinationName: destinationName || corridorLabel,
    headwayMinutes:
      typeof obj.headway_minutes === 'number'
        ? Math.round(obj.headway_minutes)
        : typeof obj.headwayMinutes === 'number'
          ? Math.round(obj.headwayMinutes)
          : null,
    tripsPerDay,
    isAc: typeof obj.is_ac === 'boolean' ? obj.is_ac : undefined,
    stopsCount,
    coordinates,
    stops,
  };
}

let cachedAllRoutes: ApiRouteSummary[] | null = null;
let allRoutesInFlight: Promise<ApiRouteSummary[]> | null = null;
const routeHourlyProfileCache = new Map<string, Record<number, RouteCrowdDetail>>();

export async function fetchRoutes(
  signal?: AbortSignal,
  limit = 50,
  offset = 0,
  query?: string
): Promise<ApiRouteSummary[]> {
  const url = buildApiUrl('/api/routes', { limit, offset: offset > 0 ? offset : undefined, q: query });
  const data = await fetchJson<unknown>(url, signal);
  const rawList = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).routes ?? (data as Record<string, unknown>).items ?? [])
      : [];

  if (!Array.isArray(rawList)) return [];
  return rawList.map((raw, idx) => mapRawRouteSummary(raw, idx));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        results[idx] = await fn(items[idx]);
      }
    })
  );
  return results;
}

async function fetchRoutesPageWithRetry(offset: number): Promise<ApiRouteSummary[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchRoutes(undefined, 50, offset);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function fetchAllRoutes(signal?: AbortSignal): Promise<ApiRouteSummary[]> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  if (cachedAllRoutes && cachedAllRoutes.length > 0) {
    return cachedAllRoutes;
  }
  if (!allRoutesInFlight) {
    allRoutesInFlight = (async () => {
      const firstUrl = buildApiUrl('/api/routes', { limit: 50 });
      const firstData = await fetchJson<unknown>(firstUrl);
      const firstObj =
        firstData && typeof firstData === 'object' && !Array.isArray(firstData)
          ? (firstData as Record<string, unknown>)
          : null;
      const rawFirstList = Array.isArray(firstData)
        ? firstData
        : (firstObj?.routes ?? firstObj?.items ?? []);
      const firstRoutes = Array.isArray(rawFirstList)
        ? rawFirstList.map((raw, idx) => mapRawRouteSummary(raw, idx))
        : [];

      const total =
        firstObj && typeof firstObj.total === 'number' && Number.isFinite(firstObj.total)
          ? firstObj.total
          : firstRoutes.length;

      if (total <= firstRoutes.length || firstRoutes.length === 0) {
        cachedAllRoutes = firstRoutes;
        return firstRoutes;
      }

      const offsets: number[] = [];
      for (let off = 500; off < total; off += 500) {
        offsets.push(off);
      }

      let allPagesOk = true;
      const remainingPages = await mapWithConcurrency(offsets, 1, async (off) => {
        try {
          return await fetchRoutesPageWithRetry(off);
        } catch {
          allPagesOk = false;
          return [] as ApiRouteSummary[];
        }
      });
      const combined = [...firstRoutes, ...remainingPages.flat()];
      if (allPagesOk && combined.length > 0) {
        cachedAllRoutes = combined;
      }
      return combined;
    })().finally(() => {
      allRoutesInFlight = null;
    });
  }

  const routes = await allRoutesInFlight;
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return routes;
}

export async function fetchRouteHourlyProfile(
  routeId: string,
  dayType: DayType,
  fallbackSummary?: ApiRouteSummary,
  signal?: AbortSignal
): Promise<Record<number, RouteCrowdDetail>> {
  const cacheKey = `${routeId}::${dayType}`;
  const cached = routeHourlyProfileCache.get(cacheKey);
  if (cached) return cached;

  const hours = Array.from({ length: 19 }, (_, i) => i + 5);
  const settled = await mapWithConcurrency(hours, 3, async (hr) => {
    try {
      const detail = await fetchRouteCrowd(routeId, dayType, hr, fallbackSummary, signal);
      return { hr, detail };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      await new Promise((r) => setTimeout(r, 250));
      try {
        const detail = await fetchRouteCrowd(routeId, dayType, hr, fallbackSummary, signal);
        return { hr, detail };
      } catch {
        return null;
      }
    }
  });

  const byHour: Record<number, RouteCrowdDetail> = {};
  for (const item of settled) {
    if (item) {
      byHour[item.hr] = item.detail;
    }
  }

  if (Object.keys(byHour).length === hours.length && !signal?.aborted) {
    routeHourlyProfileCache.set(cacheKey, byHour);
  }
  return byHour;
}

export interface RouteGeometry {
  stops: BusStop[];
  coordinates: LatLngPoint[];
  direction?: string;
}

const routeGeometryCache = new Map<string, RouteGeometry>();

/**
 * Route geometry (stops + path) for the network overview. This reads the same
 * /api/routes/{id}/crowd endpoint the Crowd Map uses, so Home and Crowd Map show
 * the same routes from the same data. The /api/routes list itself carries no
 * geometry. Results are cached per route and fetched with limited concurrency.
 */
export async function fetchRouteGeometries(
  routes: ApiRouteSummary[],
  signal: AbortSignal,
  onResult: (routeId: string, geometry: RouteGeometry) => void,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const pending: ApiRouteSummary[] = [];
  let done = 0;
  for (const r of routes) {
    const cached = routeGeometryCache.get(r.routeId);
    if (cached) {
      onResult(r.routeId, cached);
      done += 1;
    } else if (r.coordinates.length >= 2) {
      done += 1;
    } else {
      pending.push(r);
    }
  }
  const total = routes.length;
  onProgress?.(done, total);

  await mapWithConcurrency(pending, 4, async (route) => {
    if (signal.aborted) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const detail = await fetchRouteCrowd(route.routeId, 'weekday', 8, route, signal);
        if (detail.coordinates.length >= 2 || detail.stops.length >= 2) {
          const geometry: RouteGeometry = {
            stops: detail.stops,
            coordinates: detail.coordinates,
            direction: detail.direction,
          };
          routeGeometryCache.set(route.routeId, geometry);
          if (!signal.aborted) onResult(route.routeId, geometry);
        }
        break;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
      }
    }
    done += 1;
    if (!signal.aborted) onProgress?.(done, total);
  });
}

export async function fetchRouteCrowd(
  routeId: string,
  dayType: DayType,
  hour: number,
  fallbackSummary?: ApiRouteSummary,
  signal?: AbortSignal
): Promise<RouteCrowdDetail> {
  const url = buildApiUrl(`/api/routes/${encodeURIComponent(routeId)}/crowd`, {
    day_type: dayType,
    hour,
  });
  const data = await fetchJson<Record<string, unknown>>(url, signal);
  const summary = (
    data.summary && typeof data.summary === 'object' ? data.summary : {}
  ) as Record<string, unknown>;

  const loadPct = normalizeLoadPct(
    data.avg_load_pct ??
      data.load_pct ??
      data.loadPct ??
      summary.avg_load_pct ??
      summary.max_load_pct,
    data.load_ratio ?? summary.avg_load_ratio ?? summary.max_load_ratio
  );
  const crowding = normalizeCrowdingLevel(
    data.crowding ??
      data.crowding_tier ??
      data.level ??
      summary.max_crowd_level ??
      summary.crowd_level,
    loadPct
  );
  const confidence = normalizeConfidence(data.confidence ?? summary.confidence);
  const ticketCount = normalizeTicketCount(
    data.ticket_count ?? data.ticketCount ?? summary.ticket_count ?? summary.ticketCount
  );
  const predictionSource = normalizePredictionSource(
    data.prediction_source ??
      data.predictionSource ??
      summary.prediction_source ??
      summary.predictionSource
  );

  const rawStops = Array.isArray(data.stops)
    ? data.stops.map(normalizeStop).filter((s): s is BusStop => s !== null)
    : fallbackSummary?.stops ?? [];

  let coordinates: LatLngPoint[] = normalizeCoordinates(
    data.coordinates ?? data.geometry ?? data.polyline ?? data.shape
  );
  if (coordinates.length === 0) {
    coordinates = fallbackSummary?.coordinates ?? [];
  }

  const rawSegments = Array.isArray(data.segments) ? data.segments : [];
  const segments: RouteCrowdSegment[] = rawSegments.map((segRaw, idx) => {
    const seg = (segRaw && typeof segRaw === 'object' ? segRaw : {}) as Record<string, unknown>;
    const segLoad = normalizeLoadPct(seg.load_pct ?? seg.loadPct, seg.load_ratio);
    const segCoords = normalizeCoordinates(seg.coordinates ?? seg.geometry ?? seg.polyline);
    const rawPax =
      seg.estimated_passengers ??
      seg.est_passengers ??
      seg.passengers ??
      seg.people_on_board ??
      seg.occupancy;
    const estimatedPassengers =
      typeof rawPax === 'number' && Number.isFinite(rawPax)
        ? Math.max(0, Math.round(rawPax))
        : null;
    return {
      id: String(seg.id ?? `${routeId}-seg-${idx}`),
      fromName: String(seg.from_name ?? seg.from_stop_name ?? seg.from_stop ?? seg.from ?? ''),
      toName: String(seg.to_name ?? seg.to_stop_name ?? seg.to_stop ?? seg.to ?? ''),
      loadPct: segLoad,
      estimatedPassengers,
      crowding: normalizeCrowdingLevel(
        seg.crowding ?? seg.crowding_tier ?? seg.crowd_level,
        segLoad
      ),
      confidence: normalizeConfidence(seg.confidence ?? summary.confidence ?? data.confidence),
      ticketCount: normalizeTicketCount(seg.ticket_count ?? seg.ticketCount),
      predictionSource: normalizePredictionSource(
        seg.prediction_source ??
          seg.predictionSource ??
          summary.prediction_source ??
          data.prediction_source
      ),
      coordinates: segCoords,
    };
  });

  if (coordinates.length === 0 && segments.length > 0) {
    coordinates = segments.flatMap((s) => s.coordinates);
  }

  const rawDirection = data.direction ?? data.direction_label ?? data.dir;
  const direction =
    typeof rawDirection === 'string' && rawDirection.trim()
      ? rawDirection.trim()
      : data.direction_id === 0 || data.direction_id === '0'
        ? 'Up'
        : data.direction_id === 1 || data.direction_id === '1'
          ? 'Down'
          : fallbackSummary?.direction;

  const rawBusiest = data.busiest_stretch ?? data.peak_stretch;
  const busiestStretch =
    typeof rawBusiest === 'string' && rawBusiest.trim() ? rawBusiest.trim() : undefined;

  return {
    routeId: String(data.route_id ?? fallbackSummary?.routeId ?? routeId),
    routeCode: String(data.route_short_name ?? data.route_code ?? fallbackSummary?.routeCode ?? routeId),
    routeName: String(data.route_long_name ?? data.route_name ?? fallbackSummary?.routeName ?? routeId),
    operator: String(data.operator ?? fallbackSummary?.operator ?? 'DTC / Cluster'),
    corridorLabel: String(
      data.corridor_label ??
        fallbackSummary?.corridorLabel ??
        (rawStops.length >= 2
          ? `${rawStops[0].shortName} – ${rawStops[rawStops.length - 1].shortName}`
          : '')
    ),
    direction,
    busiestStretch,
    loadPct,
    crowding,
    confidence,
    ticketCount,
    predictionSource,
    coordinates,
    segments,
    stops: rawStops,
  };
}

export async function fetchOperatorHotspots(
  dayType: DayType,
  hour: number,
  limit = 25,
  signal?: AbortSignal
): Promise<OperatorHotspotsPayload> {
  const url = buildApiUrl('/api/operator/hotspots', {
    day_type: dayType,
    hour,
    limit,
  });
  const data = await fetchJson<unknown>(url, signal);

  const obj = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const rawHotspots = Array.isArray(data)
    ? data
    : Array.isArray(obj.hotspots)
      ? obj.hotspots
      : Array.isArray(obj.rows)
        ? obj.rows
        : Array.isArray(obj.routes)
          ? obj.routes
          : [];

  const hotspots: OperatorHotspotRow[] = rawHotspots.map((raw, idx) => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const routeId = String(r.route_id ?? r.id ?? r.route_code ?? `route-${idx}`);
    const routeCode = String(r.route_short_name ?? r.route_code ?? r.code ?? routeId);
    const loadPct = normalizeLoadPct(
      r.load_pct ?? r.peak_load_pct ?? r.avg_load_pct,
      r.load_ratio
    );
    const originName = String(r.origin_name ?? r.from_stop_name ?? r.from_stop ?? r.from_name ?? '');
    const destinationName = String(r.destination_name ?? r.to_stop_name ?? r.to_stop ?? r.to_name ?? '');
    const busiestStretch = String(
      r.busiest_stretch ??
        r.stretch ??
        r.segment_name ??
        (originName && destinationName ? `${shortenStopName(originName)} – ${shortenStopName(destinationName)}` : r.corridor ?? routeCode)
    );

    return {
      id: String(r.id ?? `${routeId}-${idx}`),
      routeId,
      routeCode,
      routeName: String(r.route_long_name ?? r.route_name ?? `Route ${routeCode}`),
      operator: String(r.operator ?? r.agency ?? 'DTC / Cluster'),
      corridor: String(r.corridor ?? r.route_name ?? busiestStretch),
      busiestStretch,
      hour: typeof r.hour === 'number' ? r.hour : typeof r.peak_hour === 'number' ? r.peak_hour : hour,
      loadPct,
      crowding: normalizeCrowdingLevel(r.crowding ?? r.crowding_tier ?? r.crowd_level, loadPct),
      headwayMinutes:
        typeof r.headway_minutes === 'number' ? Math.round(r.headway_minutes) : null,
      confidence: normalizeConfidence(r.confidence),
      ticketCount: normalizeTicketCount(r.ticket_count ?? r.ticketCount),
      predictionSource: normalizePredictionSource(r.prediction_source ?? r.predictionSource),
      originId: String(r.origin_stop_id ?? r.from_stop_id ?? r.origin_id ?? originName),
      destinationId: String(r.destination_stop_id ?? r.to_stop_id ?? r.destination_id ?? destinationName),
      originName: originName || busiestStretch,
      destinationName: destinationName || busiestStretch,
    };
  });

  const rawHourly = obj.hourly_network ?? obj.hourly_summary ?? obj.hourly ?? [];
  const hourlyNetwork: OperatorHourlyPoint[] = Array.isArray(rawHourly)
    ? rawHourly.map((pt) => {
        const p = (pt && typeof pt === 'object' ? pt : {}) as Record<string, unknown>;
        const avgLoadPct = normalizeLoadPct(p.avg_load_pct ?? p.load_pct, p.load_ratio);
        return {
          hour: Number(p.hour ?? hour),
          avgLoadPct,
          overloadedCount: Number(p.overloaded_count ?? p.overloadedCount ?? 0),
          crowding: normalizeCrowdingLevel(p.crowding ?? p.crowding_tier, avgLoadPct) ?? getCrowdingLevel(avgLoadPct),
        };
      })
    : [];

  return { hotspots, hourlyNetwork };
}

export async function fetchMLInsights(signal?: AbortSignal): Promise<MLInsightsData> {
  const url = buildApiUrl('/api/ml/insights');
  return await fetchJson<MLInsightsData>(url, signal);
}
