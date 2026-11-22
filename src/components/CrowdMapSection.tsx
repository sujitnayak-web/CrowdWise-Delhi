import { Component, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  Map as GoogleMap,
  Polyline,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { fetchAllRoutes, fetchOperatorHotspots, fetchRouteCrowd } from '../api/crowdwiseApi';
import { RouteCorridorNavOptions } from '../context/TransitAppContext';
import { parseRouteCodeAndDirection, RouteDirection } from '../utils/routePlannerUtils';
import {
  ApiRouteSummary,
  BusStop,
  DayType,
  JourneyOption,
  LatLngPoint,
  OperatorHotspotRow,
  RouteCrowdDetail,
} from '../types/transit';
import {
  buildSimplifiedMapRenderData,
  DEFAULT_ROUTE_LINE_HEX,
  filterRankedRoutes,
  formatRouteListCapacity,
  formatSegmentTooltip,
  getAdjacentRouteId,
  getGoogleMapsKeyIssue,
  GoogleMapsKeyIssue,
  LatLngBoundsBox,
  MapPolylineDescriptor,
  NO_LABELS_MAP_STYLE,
  pickDefaultCrowdedRouteId,
  rankRoutesByLoad,
  RouteFilterMode,
  RouteStopTimelineItem,
  selectVisibleStopLabelIds,
  SimplifiedMapRenderData,
  sortListWithPinnedFocus,
  stripDuplicateRouteCode,
} from '../utils/mapGeometry';
import {
  CROWDING_META,
  formatHour,
  MAX_HOUR,
  MIN_HOUR,
} from '../utils/transitUtils';
import { ApiStatusBanner } from './ApiStatusBanner';
import { ConfidenceTag } from './CrowdingBadge';
import { GoogleMapOverlay } from './GoogleMapOverlay';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const DELHI_CENTER: LatLngPoint = { lat: 28.6139, lng: 77.209 };

interface CrowdMapSectionProps {
  hour: number;
  dayType: DayType;
  selectedJourney: JourneyOption | null;
  focusedRouteCode: string | null;
  onChangeHour: (hour: number) => void;
  onChangeDayType: (dayType: DayType) => void;
  onSelectCorridor: (
    originQuery: string,
    destinationQuery: string,
    routeNav?: RouteCorridorNavOptions
  ) => void;
  standalonePage?: boolean;
}

interface SegmentTooltipState {
  position: LatLngPoint;
  text: string;
}

interface StopTooltipState {
  stopId: string;
  name: string;
  position: LatLngPoint;
  pinned?: boolean;
}

interface StopFocusRequest {
  stopId: string;
  lat: number;
  lng: number;
  seq: number;
}

const ROUTE_FILTER_CHIPS: Array<{ id: RouteFilterMode; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'crowded', label: 'Most crowded' },
  { id: 'seats', label: 'Seats available' },
  { id: 'not_enough_data', label: 'Not enough data' },
];

function DelhiMapCameraController({
  focusedBounds,
  focusCenter,
  focusRequestKey,
  stopFocusRequest,
}: {
  focusedBounds: LatLngBoundsBox | null;
  focusCenter: LatLngPoint | null;
  focusRequestKey: string | null;
  stopFocusRequest: StopFocusRequest | null;
}) {
  const map = useMap();
  const lastFocusKeyRef = useRef<string | null>(null);
  const lastStopSeqRef = useRef<number>(0);

  useEffect(() => {
    if (!map || !focusRequestKey) return;
    if (lastFocusKeyRef.current === focusRequestKey) return;

    if (focusedBounds) {
      lastFocusKeyRef.current = focusRequestKey;
      map.fitBounds(focusedBounds, { top: 48, right: 48, bottom: 52, left: 48 });
      return;
    }

    if (focusCenter) {
      lastFocusKeyRef.current = focusRequestKey;
      map.panTo(focusCenter);
      if ((map.getZoom() ?? 11) < 13) {
        map.setZoom(14);
      }
    }
  }, [map, focusedBounds, focusCenter, focusRequestKey]);

  useEffect(() => {
    if (!map || !stopFocusRequest) return;
    if (lastStopSeqRef.current === stopFocusRequest.seq) return;
    lastStopSeqRef.current = stopFocusRequest.seq;

    map.panTo({ lat: stopFocusRequest.lat, lng: stopFocusRequest.lng });
    if ((map.getZoom() ?? 11) < 15) {
      map.setZoom(15);
    }
  }, [map, stopFocusRequest]);

  return null;
}

function GoogleMapsNoticeCard({ issue }: { issue: GoogleMapsKeyIssue | 'runtime_error' }) {
  const isInvalid = issue === 'invalid_format' || issue === 'runtime_error';
  return (
    <div
      data-testid="google-maps-config-notice"
      className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#EEF2EA]"
    >
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-[8px] border border-[#CFDCC8] bg-[#F6FAF3] text-[#1F4D3A]">
        <MapPin className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <p className="font-display text-base font-semibold text-[#14261C]">
        {isInvalid ? 'Google Maps API key needs update' : 'Google Maps API key required'}
      </p>
      <p className="text-xs text-[#5C6F62] max-w-md leading-relaxed">
        {issue === 'invalid_format' ? (
          <>
            <code className="font-mono text-[#14261C]">VITE_GOOGLE_MAPS_API_KEY</code> is currently set to a URL or non-key value instead of a Google Maps browser key. Replace it in your environment secrets with a valid Maps JavaScript API key while keeping the right-hand corridor list active.
          </>
        ) : issue === 'runtime_error' ? (
          <>
            Google Maps could not initialize with the configured key. Verify{' '}
            <code className="font-mono text-[#14261C]">VITE_GOOGLE_MAPS_API_KEY</code> is enabled for Maps JavaScript API or mint a free Maps Demo Key; corridor crowding data on the right remains live.
          </>
        ) : (
          <>
            Configure <code className="font-mono text-[#14261C]">VITE_GOOGLE_MAPS_API_KEY</code> in your environment secrets to display interactive Delhi corridor tiles.
          </>
        )}
      </p>
    </div>
  );
}

class MapErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; onErrorDetected?: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onErrorDetected?.();
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function DelhiMapStatusNotice({ onAuthFailure }: { onAuthFailure: () => void }) {
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE) {
      onAuthFailure();
    }
  }, [status, onAuthFailure]);

  if (status === APILoadingStatus.FAILED) {
    return (
      <div className="absolute top-3 left-3 z-20 max-w-xs rounded-[8px] border border-[#CFDCC8] bg-[#F6FAF3]/95 px-3 py-2 text-xs text-[#14261C] shadow-sm">
        Unable to load Google Maps tiles. Check network connectivity or API key configuration.
      </div>
    );
  }

  return null;
}

function DelhiMapLayers({
  mapRenderData,
  showMapLabels,
  activeStopTooltip,
  hoveredStopId,
  segmentTooltip,
  focusRequestKey,
  stopFocusRequest,
  onPolylineHover,
  onClearSegmentTooltip,
  onHoverStop,
  onSetStopTooltip,
  onAuthFailure,
}: {
  mapRenderData: SimplifiedMapRenderData;
  showMapLabels: boolean;
  activeStopTooltip: StopTooltipState | null;
  hoveredStopId: string | null;
  segmentTooltip: SegmentTooltipState | null;
  focusRequestKey: string | null;
  stopFocusRequest: StopFocusRequest | null;
  onPolylineHover: (line: MapPolylineDescriptor, ev: google.maps.MapMouseEvent) => void;
  onClearSegmentTooltip: () => void;
  onHoverStop: (stopId: string | null, source: 'map' | 'panel') => void;
  onSetStopTooltip: (updater: (prev: StopTooltipState | null) => StopTooltipState | null) => void;
  onAuthFailure: () => void;
}) {
  const map = useMap();
  const status = useApiLoadingStatus();
  const isApiReady =
    status === APILoadingStatus.LOADED &&
    typeof google !== 'undefined' &&
    Boolean(google.maps?.Polyline);

  const showMapLabelsRef = useRef(showMapLabels);
  showMapLabelsRef.current = showMapLabels;
  const [mapZoom, setMapZoom] = useState<number>(12);

  useEffect(() => {
    if (!map) return;
    const syncZoom = () => {
      const z = map.getZoom();
      if (typeof z === 'number' && Number.isFinite(z)) {
        setMapZoom(z);
      }
    };
    syncZoom();
    const zoomListener = map.addListener('zoom_changed', syncZoom);

    const typeListener = map.addListener('maptypeid_changed', () => {
      const currentType = map.getMapTypeId();
      if (currentType === 'satellite' && showMapLabelsRef.current) {
        map.setMapTypeId('hybrid');
      } else if (currentType === 'hybrid' && !showMapLabelsRef.current) {
        map.setMapTypeId('satellite');
      }
    });

    return () => {
      zoomListener.remove();
      typeListener.remove();
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    map.setOptions({
      styles: showMapLabels ? [] : NO_LABELS_MAP_STYLE,
    });
    const currentType = map.getMapTypeId();
    if (currentType === 'satellite' && showMapLabels) {
      map.setMapTypeId('hybrid');
    } else if (currentType === 'hybrid' && !showMapLabels) {
      map.setMapTypeId('satellite');
    }
  }, [map, showMapLabels]);

  const visibleStopLabelIds = useMemo(
    () => selectVisibleStopLabelIds(mapRenderData.stops, mapZoom),
    [mapRenderData.stops, mapZoom]
  );

  return (
    <>
      <DelhiMapCameraController
        focusedBounds={mapRenderData.focusedBounds}
        focusCenter={mapRenderData.focusCenter}
        focusRequestKey={focusRequestKey}
        stopFocusRequest={stopFocusRequest}
      />
      <DelhiMapStatusNotice onAuthFailure={onAuthFailure} />

      {isApiReady &&
        mapRenderData.polylines
          .filter((line) => line.path.length >= 2)
          .map((line) => (
            <Polyline
              key={line.id}
              path={line.path}
              strokeColor={line.color}
              strokeWeight={line.weight}
              strokeOpacity={line.opacity}
              zIndex={line.zIndex}
              clickable={line.interactive}
              onClick={(ev) => {
                if (typeof ev.stop === 'function') ev.stop();
                onPolylineHover(line, ev);
              }}
              onMouseOver={(ev) => {
                onPolylineHover(line, ev);
              }}
              onMouseOut={() => {
                onClearSegmentTooltip();
              }}
            />
          ))}

      {/* Stop dots ONLY for the selected route; names show on hover or tap */}
      {isApiReady &&
        mapRenderData.stops.map((stop) => {
          const isHighlighted =
            hoveredStopId === stop.id || activeStopTooltip?.stopId === stop.id;
          return (
            <GoogleMapOverlay
              key={stop.id}
              position={{ lat: stop.lat, lng: stop.lng }}
              pane="overlayMouseTarget"
              zIndex={isHighlighted ? 75 : 60}
            >
              <button
                type="button"
                aria-label={`Stop ${stop.number}: ${stop.name}`}
                data-stop-id={stop.id}
                data-highlighted={isHighlighted ? 'true' : undefined}
                onMouseEnter={() => {
                  onHoverStop(stop.id, 'map');
                  onSetStopTooltip((prev) =>
                    prev?.pinned && prev.stopId !== stop.id
                      ? prev
                      : {
                          stopId: stop.id,
                          name: stop.name,
                          position: { lat: stop.lat, lng: stop.lng },
                          pinned: prev?.stopId === stop.id ? prev.pinned : false,
                        }
                  );
                }}
                onMouseLeave={() => {
                  onHoverStop(null, 'map');
                  onSetStopTooltip((prev) =>
                    prev?.stopId === stop.id && !prev.pinned ? null : prev
                  );
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSetStopTooltip((prev) =>
                    prev?.stopId === stop.id && prev.pinned
                      ? null
                      : {
                          stopId: stop.id,
                          name: stop.name,
                          position: { lat: stop.lat, lng: stop.lng },
                          pinned: true,
                        }
                  );
                }}
                className={`rounded-full block cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/40 ${
                  isHighlighted
                    ? 'w-3.5 h-3.5 bg-[#1F4D3A] border-2 border-[#F6FAF3] ring-4 ring-[#1F4D3A]/35 shadow-sm'
                    : 'w-2.5 h-2.5 bg-[#F6FAF3] border-[1.5px] border-[#14261C] shadow-xs hover:scale-125'
                }`}
              />
            </GoogleMapOverlay>
          );
        })}

      {/* Stop name labels next to markers (decluttered by zoom; light halo for Map & Satellite legibility) */}
      {isApiReady &&
        mapRenderData.stops.map((stop) => {
          const isTooltipOpenForStop = activeStopTooltip?.stopId === stop.id;
          const isHighlighted = hoveredStopId === stop.id || isTooltipOpenForStop;
          if (!visibleStopLabelIds.has(stop.id) || isTooltipOpenForStop) {
            return null;
          }
          return (
            <GoogleMapOverlay
              key={`stop-label-${stop.id}`}
              position={{ lat: stop.lat, lng: stop.lng }}
              pane="floatPane"
              zIndex={isHighlighted ? 74 : stop.isStart || stop.isEnd ? 68 : 64}
            >
              <div className="relative w-0 h-0 pointer-events-none select-none">
                <span
                  data-testid="map-stop-label"
                  data-stop-id={stop.id}
                  style={{
                    textShadow:
                      '-1px -1px 0 rgba(255,255,255,0.96), 1px -1px 0 rgba(255,255,255,0.96), -1px 1px 0 rgba(255,255,255,0.96), 1px 1px 0 rgba(255,255,255,0.96), 0 0 4px rgba(255,255,255,0.96)',
                  }}
                  className={`absolute left-2.5 top-0 -translate-y-1/2 whitespace-nowrap text-[11px] leading-tight text-[#14261C] ${
                    stop.isStart || stop.isEnd || isHighlighted ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {stop.name}
                </span>
              </div>
            </GoogleMapOverlay>
          );
        })}

      {/* Stop hover/tap name tooltip */}
      {isApiReady && activeStopTooltip && (
        <GoogleMapOverlay
          position={activeStopTooltip.position}
          pane="floatPane"
          zIndex={80}
          offsetY={-20}
        >
          <div
            data-testid="map-stop-tooltip"
            className="px-2.5 py-1 rounded-[6px] bg-[#F6FAF3] text-[#14261C] border border-[#CFDCC8] text-xs font-medium whitespace-nowrap shadow-sm"
          >
            {activeStopTooltip.name}
          </div>
        </GoogleMapOverlay>
      )}

      {/* Segment hover tooltip */}
      {isApiReady && segmentTooltip && (
        <GoogleMapOverlay
          position={segmentTooltip.position}
          pane="floatPane"
          zIndex={90}
          offsetY={-22}
        >
          <div className="px-2.5 py-1.5 rounded-[8px] bg-[#F6FAF3] text-[#14261C] border border-[#CFDCC8] text-xs font-medium max-w-[260px] shadow-md">
            {segmentTooltip.text}
          </div>
        </GoogleMapOverlay>
      )}
    </>
  );
}

export function CrowdMapSection({
  hour,
  dayType,
  focusedRouteCode,
  onChangeHour,
  onChangeDayType,
  onSelectCorridor,
  standalonePage = false,
}: CrowdMapSectionProps) {
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const stopRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [routes, setRoutes] = useState<ApiRouteSummary[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [hotspotsByKey, setHotspotsByKey] = useState<Record<string, OperatorHotspotRow[]>>({});
  const [crowdByKey, setCrowdByKey] = useState<Record<string, RouteCrowdDetail>>({});
  const [routeGeometryById, setRouteGeometryById] = useState<
    Record<string, { stops: BusStop[]; coordinates: LatLngPoint[]; direction?: string }>
  >({});
  const [crowdLoading, setCrowdLoading] = useState(false);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [sidePanelMode, setSidePanelMode] = useState<'stops' | 'list'>('list');
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [manualFocusSeq, setManualFocusSeq] = useState(0);
  const [stopFocusRequest, setStopFocusRequest] = useState<StopFocusRequest | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<RouteFilterMode>('all');

  const [segmentTooltip, setSegmentTooltip] = useState<SegmentTooltipState | null>(null);
  const [activeStopTooltip, setActiveStopTooltip] = useState<StopTooltipState | null>(null);
  const [showMapLabels, setShowMapLabels] = useState(false);
  const [mapsRuntimeError, setMapsRuntimeError] = useState(false);

  const mapsKeyIssue = useMemo(() => getGoogleMapsKeyIssue(GOOGLE_MAPS_API_KEY), []);

  useEffect(() => {
    const onInvalidKey = () => setMapsRuntimeError(true);
    window.addEventListener('gmp-invalid-key', onInvalidKey);
    return () => window.removeEventListener('gmp-invalid-key', onInvalidKey);
  }, []);

  // Load GTFS route catalog
  useEffect(() => {
    const controller = new AbortController();
    setRoutesLoading(true);
    setRoutesError(null);

    fetchAllRoutes(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) {
          setRoutes(list);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setRoutes([]);
        setRoutesError(err instanceof Error ? err.message : 'Unable to load routes from API.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRoutesLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadNonce]);

  // Load ranked hotspots for the current hour + dayType (StrictMode-safe)
  useEffect(() => {
    const key = `${dayType}::${hour}`;
    if (hotspotsByKey[key] !== undefined) return;

    const controller = new AbortController();
    fetchOperatorHotspots(dayType, hour, 50, controller.signal)
      .then((payload) => {
        if (!controller.signal.aborted) {
          setHotspotsByKey((prev) => ({ ...prev, [key]: payload.hotspots }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHotspotsByKey((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: [] }));
        }
      });

    return () => controller.abort();
  }, [dayType, hour, reloadNonce, hotspotsByKey]);

  const currentHotspots = useMemo(
    () => hotspotsByKey[`${dayType}::${hour}`] ?? [],
    [hotspotsByKey, dayType, hour]
  );
  const currentHotspotsSettled = hotspotsByKey[`${dayType}::${hour}`] !== undefined;

  // Merge GTFS routes with all hotspot routes discovered across hours/dayTypes so changing time or dayType never drops the selected route
  const mergedRoutes = useMemo(() => {
    const seenIds = new Set<string>();
    const combined: ApiRouteSummary[] = [];

    const hydrateRoute = (route: ApiRouteSummary): ApiRouteSummary => {
      const geo = routeGeometryById[route.routeId];
      if (!geo) return route;
      const needsStops = route.stops.length === 0 && geo.stops.length > 0;
      const needsCoords = route.coordinates.length === 0 && geo.coordinates.length > 0;
      const needsDir = !route.direction && Boolean(geo.direction);
      if (!needsStops && !needsCoords && !needsDir) return route;
      return {
        ...route,
        stops: needsStops ? geo.stops : route.stops,
        coordinates: needsCoords ? geo.coordinates : route.coordinates,
        direction: route.direction ?? geo.direction,
      };
    };

    for (const r of routes) {
      seenIds.add(r.routeId);
      combined.push(hydrateRoute(r));
    }

    for (const list of Object.values(hotspotsByKey)) {
      for (const h of list) {
        if (seenIds.has(h.routeId)) continue;
        seenIds.add(h.routeId);
        combined.push(
          hydrateRoute({
            routeId: h.routeId,
            routeCode: h.routeCode,
            routeName: h.routeName,
            operator: h.operator,
            corridorLabel: h.corridor || h.busiestStretch || h.routeName,
            originId: h.originId,
            destinationId: h.destinationId,
            originName: h.originName,
            destinationName: h.destinationName,
            headwayMinutes: h.headwayMinutes,
            coordinates: [],
            stops: [],
          })
        );
      }
    }

    return combined;
  }, [routes, hotspotsByKey, routeGeometryById]);

  // Jump from Planner / URL link ("Plan this corridor", "View crowding") sets map route AND opens Stops panel directly
  useEffect(() => {
    if (!focusedRouteCode || mergedRoutes.length === 0) return;
    const match = mergedRoutes.find(
      (r) =>
        r.routeCode.toLowerCase() === focusedRouteCode.toLowerCase() ||
        r.routeId.toLowerCase() === focusedRouteCode.toLowerCase()
    );
    if (match) {
      setSelectedRouteId(match.routeId);
      setSidePanelMode('stops');
      setManualFocusSeq((s) => s + 1);
      setHoveredStopId(null);
      setSegmentTooltip(null);
      setActiveStopTooltip(null);
    }
  }, [focusedRouteCode, mergedRoutes]);

  // Rank routes by positive load (filtering out 0/null/missing as hasData: false)
  const { ranked, top5Ids } = useMemo(
    () =>
      rankRoutesByLoad({
        routes: mergedRoutes,
        crowdByKey,
        hotspots: currentHotspots,
        dayType,
        hour,
      }),
    [mergedRoutes, crowdByKey, currentHotspots, dayType, hour]
  );

  // Default on load: once hotspots settle, auto-select the default crowded route on map, but keep side panel on Route List (not Stops panel)
  useEffect(() => {
    if (selectedRouteId !== null || focusedRouteCode || !currentHotspotsSettled) return;
    const defaultId = pickDefaultCrowdedRouteId(ranked);
    if (defaultId) {
      setSelectedRouteId(defaultId);
    }
  }, [ranked, selectedRouteId, focusedRouteCode, currentHotspotsSettled]);

  // Fetch detailed route crowd (stops + segment stretches) for selected route
  useEffect(() => {
    if (mergedRoutes.length === 0 || (!currentHotspotsSettled && !selectedRouteId)) return;

    const targetRoutes = selectedRouteId
      ? mergedRoutes.filter((r) => r.routeId === selectedRouteId)
      : currentHotspots.length === 0
        ? mergedRoutes.slice(0, 5)
        : [];

    const missing = targetRoutes.filter((r) => {
      const key = `${r.routeId}::${dayType}::${hour}`;
      return !crowdByKey[key] && !inFlightKeysRef.current.has(key);
    });

    if (missing.length === 0) {
      setCrowdLoading(false);
      return;
    }

    const controller = new AbortController();
    const batchKeys = missing.map((r) => `${r.routeId}::${dayType}::${hour}`);
    for (const k of batchKeys) inFlightKeysRef.current.add(k);
    setCrowdLoading(true);

    (async () => {
      try {
        const results = await Promise.allSettled(
          missing.map((route) =>
            fetchRouteCrowd(route.routeId, dayType, hour, route, controller.signal).then(
              (detail) => ({
                key: `${route.routeId}::${dayType}::${hour}`,
                detail,
              })
            )
          )
        );
        if (controller.signal.aborted) return;
        const updates: Record<string, RouteCrowdDetail> = {};
        const geoUpdates: Record<
          string,
          { stops: BusStop[]; coordinates: LatLngPoint[]; direction?: string }
        > = {};
        for (const res of results) {
          if (res.status === 'fulfilled') {
            const detail = res.value.detail;
            updates[res.value.key] = detail;
            if (detail.stops.length > 0 || detail.coordinates.length > 0) {
              geoUpdates[detail.routeId] = {
                stops: detail.stops,
                coordinates: detail.coordinates,
                direction: detail.direction,
              };
            }
          }
        }
        if (Object.keys(updates).length > 0) {
          setCrowdByKey((prev) => ({ ...prev, ...updates }));
        }
        if (Object.keys(geoUpdates).length > 0) {
          setRouteGeometryById((prev) => ({ ...prev, ...geoUpdates }));
        }
      } finally {
        for (const k of batchKeys) inFlightKeysRef.current.delete(k);
        if (!controller.signal.aborted) {
          setCrowdLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      for (const k of batchKeys) inFlightKeysRef.current.delete(k);
    };
  }, [mergedRoutes, currentHotspots.length, currentHotspotsSettled, selectedRouteId, dayType, hour, crowdByKey, reloadNonce]);

  // Clear tooltips when changing hour, dayType, or selected route
  useEffect(() => {
    setSegmentTooltip(null);
    setActiveStopTooltip(null);
    setHoveredStopId(null);
  }, [hour, dayType, selectedRouteId]);

  const filteredRoutes = useMemo(
    () => filterRankedRoutes(ranked, searchQuery, filterMode),
    [ranked, searchQuery, filterMode]
  );

  const selectedEntry = useMemo(
    () => (selectedRouteId ? ranked.find((r) => r.route.routeId === selectedRouteId) ?? null : null),
    [ranked, selectedRouteId]
  );

  const selectableNavRoutes = useMemo(() => {
    const filteredSelectable = filteredRoutes.filter((r) => r.hasData);
    if (filteredSelectable.length > 0) return filteredSelectable;
    return ranked.filter((r) => r.hasData);
  }, [filteredRoutes, ranked]);

  const mapRenderData = useMemo(
    () =>
      buildSimplifiedMapRenderData({
        ranked,
        top5Ids,
        selectedRouteId,
        hoveredRouteId: null,
        filterMode,
      }),
    [ranked, top5Ids, selectedRouteId, filterMode]
  );

  const boundsSignature = useMemo(() => {
    const b = mapRenderData.focusedBounds;
    if (!b) return 'none';
    return `${b.north.toFixed(4)},${b.south.toFixed(4)},${b.east.toFixed(4)},${b.west.toFixed(4)}`;
  }, [mapRenderData.focusedBounds]);

  const focusRequestKey = useMemo(() => {
    if (!selectedEntry) return null;
    return `${selectedEntry.route.routeId}:${boundsSignature}:${manualFocusSeq}`;
  }, [selectedEntry, boundsSignature, manualFocusSeq]);

  const focusRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
    setSidePanelMode('stops');
    setManualFocusSeq((s) => s + 1);
    setHoveredStopId(null);
    setSegmentTooltip(null);
    setActiveStopTooltip(null);
  }, []);

  const handleSelectRoute = (routeId: string) => {
    focusRoute(routeId);
  };

  const handleStepRoute = (step: 'prev' | 'next') => {
    const nextId = getAdjacentRouteId(selectableNavRoutes, selectedRouteId, step);
    if (nextId) {
      setSelectedRouteId(nextId);
      setManualFocusSeq((s) => s + 1);
      setHoveredStopId(null);
      setSegmentTooltip(null);
      setActiveStopTooltip(null);
    }
  };

  const handleSelectFilterChip = (mode: RouteFilterMode) => {
    setFilterMode(mode);
  };

  const handleHoverStop = useCallback((stopId: string | null, source: 'map' | 'panel') => {
    setHoveredStopId(stopId);
    if (source === 'map' && stopId) {
      const rowEl = stopRowRefs.current[stopId];
      if (rowEl && typeof rowEl.scrollIntoView === 'function') {
        rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, []);

  const handleClickStopInPanel = (stop: RouteStopTimelineItem) => {
    setHoveredStopId(stop.id);
    setActiveStopTooltip({
      stopId: stop.id,
      name: stop.name,
      position: { lat: stop.lat, lng: stop.lng },
      pinned: true,
    });
    setStopFocusRequest((prev) => ({
      stopId: stop.id,
      lat: stop.lat,
      lng: stop.lng,
      seq: (prev?.seq ?? 0) + 1,
    }));
  };

  const handlePolylineHover = (line: MapPolylineDescriptor, ev: google.maps.MapMouseEvent) => {
    const pos = ev.latLng
      ? { lat: ev.latLng.lat(), lng: ev.latLng.lng() }
      : line.path[Math.floor(line.path.length / 2)];
    if (!pos) return;
    setSegmentTooltip({
      position: pos,
      text: formatSegmentTooltip({
        fromName: line.fromName,
        toName: line.toName,
        crowding: line.crowding,
        loadPct: line.loadPct,
        estimatedPassengers: line.estimatedPassengers,
        confidence: line.confidence,
        corridorLabel: line.corridorLabel,
      }),
    });
  };

  const showStopsPanel = sidePanelMode === 'stops' && selectedEntry !== null;

  return (
    <section
      id="crowd-map"
      aria-labelledby="crowd-map-heading"
      className={
        standalonePage
          ? 'py-6 sm:py-8'
          : 'scroll-mt-20 py-14 sm:py-16 border-t border-[#CFDCC8]'
      }
    >
      <div
        className={`max-w-7xl mx-auto px-4 sm:px-6 ${
          standalonePage ? 'space-y-4' : 'space-y-6'
        }`}
      >
        {/* Section Title */}
        <div className="space-y-1.5">
          <p className="cw-section-kicker">Network Crowd Map</p>
          {standalonePage ? (
            <h1
              id="crowd-map-heading"
              className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-[1.08] text-[#14261C]"
            >
              Delhi bus corridors by hour
            </h1>
          ) : (
            <h2
              id="crowd-map-heading"
              className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-[1.08] text-[#14261C]"
            >
              Delhi bus corridors by hour
            </h2>
          )}
          <p className="text-[15px] sm:text-base text-[#5C6F62] max-w-2xl">
            Inspect one route at a time with stretch-by-stretch load and every stop in travel order.
          </p>
        </div>

        {/* Compact Time Slider + Weekday/Weekend Bar Above Map */}
        <div className="cw-card px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center justify-between sm:justify-start gap-2.5 shrink-0">
              <label htmlFor="crowd-map-hour-slider" className="cw-section-kicker">
                Time
              </label>
              <span className="font-mono tabular-nums text-sm font-semibold text-[#14261C] px-2 py-0.5 rounded-[6px] bg-[#E8F0E4] border border-[#CFDCC8]">
                {formatHour(hour)}
              </span>
            </div>

            <div className="flex-1 flex items-center gap-2.5">
              <span className="text-[11px] font-mono tabular-nums text-[#5C6F62] shrink-0">
                05:00
              </span>
              <input
                id="crowd-map-hour-slider"
                type="range"
                min={MIN_HOUR}
                max={MAX_HOUR}
                step={1}
                value={hour}
                onChange={(e) => onChangeHour(Number(e.target.value))}
                className="cw-slider w-full"
              />
              <span className="text-[11px] font-mono tabular-nums text-[#5C6F62] shrink-0">
                23:00
              </span>
            </div>
          </div>

          <div
            role="group"
            aria-label="Crowd map service day"
            className="inline-flex self-start md:self-auto p-1 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] shrink-0"
          >
            {(['weekday', 'weekend'] as const).map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => onChangeDayType(dt)}
                aria-pressed={dayType === dt}
                className={`px-3 py-1 rounded-[6px] text-xs font-medium capitalize transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                  dayType === dt
                    ? 'bg-[#1F4D3A] text-[#F6FAF3]'
                    : 'text-[#5C6F62] hover:text-[#14261C]'
                }`}
              >
                {dt}
              </button>
            ))}
          </div>
        </div>

        {routesError && (
          <ApiStatusBanner
            title="Could not load corridor map from backend"
            message={routesError}
            onRetry={() => {
              inFlightKeysRef.current.clear();
              setHotspotsByKey({});
              setCrowdByKey({});
              setReloadNonce((n) => n + 1);
            }}
          />
        )}

        {/* Map + Right Route / Stops Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: Caption + Clean Google Map */}
          <div className="lg:col-span-8 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <p className="text-xs sm:text-[13px] text-[#5C6F62]">
                {selectedEntry ? (
                  <>
                    Showing{' '}
                    <span className="font-mono font-semibold text-[#14261C]">
                      {parseRouteCodeAndDirection(selectedEntry.route.routeCode, selectedEntry.direction).displayLabel}
                    </span>
                    {' · '}
                    <span>
                      {stripDuplicateRouteCode(
                        selectedEntry.route.corridorLabel,
                        selectedEntry.route.routeCode
                      )}
                    </span>
                    {' · '}
                    <span className="font-mono font-medium text-[#14261C]">
                      {formatHour(hour)}
                    </span>
                    , {dayType}
                  </>
                ) : (
                  <span>
                    {routesLoading || crowdLoading
                      ? 'Finding most crowded corridor…'
                      : `No corridors with valid crowding data at ${formatHour(hour)}, ${dayType}`}
                  </span>
                )}
              </p>
            </div>

            <div
              className={`cw-card overflow-hidden flex flex-col relative z-0 isolate ${
                standalonePage ? 'flex-1' : ''
              }`}
            >
              {selectedEntry && (
                <div
                  role="region"
                  aria-label="Focused route bar"
                  data-testid="map-focus-bar"
                  className="border-b border-[#CFDCC8] bg-[#F6FAF3] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#14261C]"
                >
                  <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-[#14261C]">
                      Bus {parseRouteCodeAndDirection(selectedEntry.route.routeCode, selectedEntry.direction).displayLabel}
                    </span>
                    <span className="text-[#CFDCC8]" aria-hidden="true">
                      |
                    </span>
                    <span className="text-[#5C6F62] truncate max-w-[340px] sm:max-w-[420px]">
                      Busiest stretch:{' '}
                      <span className="font-medium text-[#14261C]">
                        {selectedEntry.busiestStretch ||
                          stripDuplicateRouteCode(
                            selectedEntry.route.corridorLabel,
                            selectedEntry.route.routeCode
                          )}
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="inline-flex items-center rounded-[6px] border border-[#CFDCC8] bg-[#E8F0E4] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleStepRoute('prev')}
                        disabled={selectableNavRoutes.length < 2}
                        aria-label="Previous route"
                        title="Previous route"
                        className="p-1 text-[#14261C] hover:bg-[#CFDCC8]/60 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <span className="w-px h-3.5 bg-[#CFDCC8]" aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() => handleStepRoute('next')}
                        disabled={selectableNavRoutes.length < 2}
                        aria-label="Next route"
                        title="Next route"
                        className="p-1 text-[#14261C] hover:bg-[#CFDCC8]/60 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
                      >
                        <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div
                data-testid="delhi-google-map"
                data-selected-route={selectedRouteId ?? ''}
                data-polyline-count={mapRenderData.polylines.length}
                data-stop-count={mapRenderData.stops.length}
                data-map-labels={showMapLabels ? 'on' : 'off'}
                className={`cw-map-container relative w-full ${
                  standalonePage
                    ? 'h-[400px] sm:h-[460px] lg:flex-1 lg:min-h-[450px]'
                    : 'h-[380px] sm:h-[440px] lg:h-[500px]'
                }`}
              >
                {mapsKeyIssue !== null || mapsRuntimeError ? (
                  <GoogleMapsNoticeCard issue={mapsKeyIssue ?? 'runtime_error'} />
                ) : (
                  <MapErrorBoundary
                    fallback={<GoogleMapsNoticeCard issue="runtime_error" />}
                    onErrorDetected={() => setMapsRuntimeError(true)}
                  >
                    <APIProvider
                      apiKey={GOOGLE_MAPS_API_KEY.trim()}
                      language="en"
                      region="IN"
                    >
                      <GoogleMap
                        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                        defaultCenter={DELHI_CENTER}
                        defaultZoom={11}
                        gestureHandling="cooperative"
                        styles={showMapLabels ? [] : NO_LABELS_MAP_STYLE}
                        onClick={() => {
                          setSegmentTooltip(null);
                          setActiveStopTooltip(null);
                        }}
                        className="w-full h-full"
                        style={{ width: '100%', height: '100%' }}
                      >
                        <DelhiMapLayers
                          mapRenderData={mapRenderData}
                          showMapLabels={showMapLabels}
                          activeStopTooltip={activeStopTooltip}
                          hoveredStopId={hoveredStopId}
                          segmentTooltip={segmentTooltip}
                          focusRequestKey={focusRequestKey}
                          stopFocusRequest={stopFocusRequest}
                          onPolylineHover={handlePolylineHover}
                          onClearSegmentTooltip={() => setSegmentTooltip(null)}
                          onHoverStop={handleHoverStop}
                          onSetStopTooltip={setActiveStopTooltip}
                          onAuthFailure={() => setMapsRuntimeError(true)}
                        />
                      </GoogleMap>
                    </APIProvider>
                  </MapErrorBoundary>
                )}

                {/* Top-Right "Map labels" Switch next to Google Map controls */}
                {mapsKeyIssue === null && !mapsRuntimeError && (
                  <label
                    className="absolute top-[10px] right-[58px] z-10 h-10 px-2.5 rounded-[2px] bg-white hover:bg-[#F8F9FA] border border-black/10 shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] inline-flex items-center gap-2 text-xs font-medium text-[#14261C] cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label="Map labels"
                      checked={showMapLabels}
                      onChange={(e) => setShowMapLabels(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`w-7 h-4 rounded-[4px] p-0.5 transition-colors duration-150 inline-flex items-center ${
                        showMapLabels ? 'bg-[#1F4D3A]' : 'bg-[#CFDCC8]'
                      }`}
                    >
                      <span
                        className={`w-3 h-3 rounded-[2px] bg-white shadow-xs transition-transform duration-150 ${
                          showMapLabels ? 'translate-x-3' : 'translate-x-0'
                        }`}
                      />
                    </span>
                    <span>Map labels</span>
                  </label>
                )}

                {/* Bottom-Left Map Legend (above Google logo) */}
                <div
                  aria-label="Map crowding legend"
                  className="absolute bottom-8 left-3 z-10 rounded-[8px] border border-[#CFDCC8] bg-[#F6FAF3]/95 px-3 py-2 shadow-sm flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] font-medium text-[#14261C]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CROWDING_META.seats.hex }}
                    />
                    <span>Seats available</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CROWDING_META.standing.hex }}
                    />
                    <span>Standing room</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CROWDING_META.crowded.hex }}
                    />
                    <span>Crowded</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[#5C6F62]">
                    <span
                      aria-hidden="true"
                      className="w-3.5 h-[2px] rounded-full"
                      style={{ backgroundColor: DEFAULT_ROUTE_LINE_HEX }}
                    />
                    <span>Low data</span>
                  </span>
                </div>

                {(routesLoading || crowdLoading) && (
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-[8px] border border-[#CFDCC8] bg-[#F6FAF3]/95 text-xs font-medium text-[#14261C] shadow-sm whitespace-nowrap">
                    Updating corridor load…
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Stops Panel (when route selected) OR Route Selection List */}
          <div className="lg:col-span-4 flex flex-col">
            {showStopsPanel ? (
              <div
                data-testid="stops-panel"
                className={`cw-card p-4 sm:p-5 flex flex-col gap-3 overflow-hidden ${
                  standalonePage
                    ? 'h-[480px] sm:h-[520px] lg:h-[calc(100vh-290px)] lg:min-h-[520px]'
                    : 'h-[480px] sm:h-[520px] lg:h-[578px]'
                }`}
              >
                {/* Top Back Button */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSidePanelMode('list')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1F4D3A] hover:text-[#173B2D] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 rounded-[4px] py-0.5"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Back to all routes</span>
                  </button>
                  <span className="font-mono tabular-nums text-[11px] text-[#5C6F62]">
                    {formatHour(hour)} · {dayType}
                  </span>
                </div>

                {/* Stops Panel Header */}
                <div className="space-y-1.5 pb-2 border-b border-[#CFDCC8]">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-mono text-lg font-bold text-[#14261C] tracking-tight">
                      {parseRouteCodeAndDirection(selectedEntry.route.routeCode, selectedEntry.direction).displayLabel}
                    </h3>
                    <span className="font-mono tabular-nums text-xs font-medium text-[#5C6F62] shrink-0">
                      {mapRenderData.stopItems.length > 0
                        ? `${mapRenderData.stopItems.length} ${
                            mapRenderData.stopItems.length === 1 ? 'stop' : 'stops'
                          }`
                        : crowdLoading
                          ? 'Loading stops…'
                          : '0 stops'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {selectedEntry.hasData &&
                    selectedEntry.crowding &&
                    selectedEntry.loadPct !== null ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#14261C]">
                        <span
                          aria-hidden="true"
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: CROWDING_META[selectedEntry.crowding].hex,
                          }}
                        />
                        <span>
                          {formatRouteListCapacity(
                            selectedEntry.crowding,
                            selectedEntry.loadPct
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-[#5C6F62]">
                        Not enough data
                      </span>
                    )}

                    {selectedEntry.confidence && selectedEntry.hasData && (
                      <ConfidenceTag
                        level={selectedEntry.confidence}
                        ticketCount={selectedEntry.ticketCount}
                        predictionSource={
                          selectedEntry.predictionSource ?? 'observed_tickets'
                        }
                      />
                    )}
                  </div>
                </div>

                {/* Vertical Metro-Line Stops List (independently scrollable) */}
                <div
                  role="list"
                  aria-label="Route stops in travel order"
                  data-testid="stops-panel-list"
                  className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-0"
                >
                  {crowdLoading && mapRenderData.stopItems.length === 0 ? (
                    <div className="space-y-2.5 py-2">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="h-9 rounded bg-[#E8F0E4] animate-pulse" />
                      ))}
                    </div>
                  ) : mapRenderData.stopItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#5C6F62]">
                      Stop-by-stop coordinates are unavailable for this corridor.
                    </div>
                  ) : (
                    mapRenderData.stopItems.map((stop) => {
                      const isRowHighlighted =
                        hoveredStopId === stop.id ||
                        activeStopTooltip?.stopId === stop.id;
                      const stretchMeta = stop.stretchCrowding
                        ? CROWDING_META[stop.stretchCrowding]
                        : null;

                      return (
                        <div key={stop.id} role="listitem">
                          <button
                            ref={(el) => {
                              stopRowRefs.current[stop.id] = el;
                            }}
                            type="button"
                            aria-label={`Stop ${stop.number}: ${stop.name}${
                              stop.isStart ? ' (Start)' : ''
                            }${stop.isEnd ? ' (End)' : ''}`}
                            data-stop-id={stop.id}
                            data-highlighted={isRowHighlighted ? 'true' : undefined}
                            onMouseEnter={() => handleHoverStop(stop.id, 'panel')}
                            onMouseLeave={() => {
                              setHoveredStopId((prev) =>
                                prev === stop.id ? null : prev
                              );
                            }}
                            onClick={() => handleClickStopInPanel(stop)}
                            className={`w-full px-2 rounded-[6px] flex items-stretch gap-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                              isRowHighlighted
                                ? 'bg-[#E8F0E4] ring-1 ring-[#1F4D3A]/40'
                                : 'hover:bg-[#E8F0E4]/65'
                            }`}
                          >
                            {/* Metro Line Rail + Node + Outgoing Stretch Segment */}
                            <span
                              aria-hidden="true"
                              className="w-6 shrink-0 flex flex-col items-center relative"
                            >
                              {/* Top connector from previous stop */}
                              <span
                                className="w-[2px] flex-1 min-h-[10px]"
                                style={{
                                  backgroundColor: stop.isStart
                                    ? 'transparent'
                                    : stop.incomingColor,
                                }}
                              />

                              {/* Stop node circle */}
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold shrink-0 transition-transform ${
                                  isRowHighlighted
                                    ? 'bg-[#1F4D3A] text-[#F6FAF3] ring-2 ring-[#1F4D3A]/30 scale-105'
                                    : stop.isStart
                                      ? 'bg-[#1F4D3A] text-[#F6FAF3]'
                                      : stop.isEnd
                                        ? 'bg-[#14261C] text-[#F6FAF3]'
                                        : 'bg-[#F6FAF3] text-[#14261C] border-[1.5px] border-[#14261C]'
                                }`}
                              >
                                {stop.number}
                              </span>

                              {/* Bottom connector to next stop with stretch crowding dot */}
                              <span
                                className="w-[2px] flex-1 min-h-[14px] relative flex items-center justify-center"
                                style={{
                                  backgroundColor: stop.isEnd
                                    ? 'transparent'
                                    : stop.stretchColor,
                                }}
                              >
                                {!stop.isEnd && (
                                  <span
                                    className="w-2 h-2 rounded-full border border-[#F6FAF3] shrink-0"
                                    style={{ backgroundColor: stop.stretchColor }}
                                  />
                                )}
                              </span>
                            </span>

                            {/* Stop Name + Start/End Label + Outgoing Stretch Dot */}
                            <span className="min-w-0 flex-1 py-2 flex items-center justify-between gap-2">
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-medium text-[#14261C] leading-snug">
                                    {stop.name}
                                  </span>
                                  {stop.isStart && (
                                    <span className="px-1.5 py-0.5 rounded-[4px] bg-[#1F4D3A] text-[#F6FAF3] text-[10px] font-medium leading-tight">
                                      Start
                                    </span>
                                  )}
                                  {stop.isEnd && (
                                    <span className="px-1.5 py-0.5 rounded-[4px] bg-[#14261C] text-[#F6FAF3] text-[10px] font-medium leading-tight">
                                      End
                                    </span>
                                  )}
                                </span>
                              </span>

                              {!stop.isEnd && stretchMeta && (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-medium text-[#5C6F62] shrink-0 whitespace-nowrap"
                                  title={`Next stretch: ${stretchMeta.label}`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: stretchMeta.hex }}
                                  />
                                  <span>{stretchMeta.shortLabel}</span>
                                </span>
                              )}
                            </span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Card Footer: Plan This Corridor */}
                <div className="pt-2.5 border-t border-[#CFDCC8] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#5C6F62]">
                    Tap a stop to focus on map
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const parsed = parseRouteCodeAndDirection(
                        selectedEntry.route.routeCode,
                        selectedEntry.direction
                      );
                      const firstStopId =
                        mapRenderData.stopItems[0]?.id || selectedEntry.route.originId;
                      const lastStopId =
                        mapRenderData.stopItems[mapRenderData.stopItems.length - 1]?.id ||
                        selectedEntry.route.destinationId;
                      onSelectCorridor(
                        selectedEntry.route.originName || selectedEntry.route.originId,
                        selectedEntry.route.destinationName ||
                          selectedEntry.route.destinationId,
                        {
                          mode: 'route',
                          routeCode: parsed.baseCode,
                          direction: parsed.direction as RouteDirection,
                          firstStopId,
                          lastStopId,
                        }
                      );
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[8px] bg-[#1F4D3A] hover:bg-[#173B2D] text-[#F6FAF3] text-xs font-medium transition-colors shrink-0"
                  >
                    <span>Plan this corridor</span>
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ) : (
              /* Search + Route Selection List Card */
              <div
                data-testid="route-list-panel"
                className={`cw-card p-4 sm:p-5 flex flex-col gap-3.5 overflow-hidden ${
                  standalonePage
                    ? 'h-[480px] sm:h-[520px] lg:h-[calc(100vh-290px)] lg:min-h-[520px]'
                    : 'h-[480px] sm:h-[520px] lg:h-[578px]'
                }`}
              >
                {/* Header: "Select a route", with a count */}
                <div className="flex items-center justify-between pb-2 border-b border-[#CFDCC8]">
                  <h3 className="font-display text-base font-semibold text-[#14261C]">Select a route</h3>
                  <span className="font-mono tabular-nums text-xs font-semibold text-[#5C6F62]">
                    {ranked.length} routes
                  </span>
                </div>

                {/* Top Search Box */}
                <div className="relative">
                  <Search
                    className="h-4 w-4 text-[#5C6F62] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    strokeWidth={1.5}
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const firstValid = filteredRoutes.find((r) => r.hasData);
                        if (firstValid) {
                          e.preventDefault();
                          focusRoute(firstValid.route.routeId);
                        }
                      }
                    }}
                    placeholder="Search route, e.g. 85"
                    aria-label="Search bus route"
                    className="w-full h-10 pl-9 pr-8 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-sm text-[#14261C] placeholder:text-[#5C6F62] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 focus-visible:border-[#1F4D3A]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear route search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5C6F62] hover:text-[#14261C]"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                {/* Filter Chips above route list */}
                <div
                  role="group"
                  aria-label="Filter routes by crowding"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {ROUTE_FILTER_CHIPS.map((chip) => {
                    const active = filterMode === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => handleSelectFilterChip(chip.id)}
                        aria-pressed={active}
                        className={`px-2.5 py-1 rounded-[6px] border text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                          active
                            ? 'bg-[#1F4D3A] text-[#F6FAF3] border-[#1F4D3A]'
                            : 'bg-[#E8F0E4] text-[#5C6F62] border-[#CFDCC8] hover:text-[#14261C]'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#5C6F62]">
                  <span className="cw-section-kicker">
                    {searchQuery.trim() || filterMode !== 'all'
                      ? `Matches (${filteredRoutes.length})`
                      : `All routes (${filteredRoutes.length})`}
                  </span>
                  <span>Click to inspect</span>
                </div>

                {routesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-9 rounded bg-[#E8F0E4] animate-pulse" />
                    ))}
                  </div>
                ) : filteredRoutes.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#5C6F62]">
                    {routes.length === 0
                      ? 'No routes returned by backend.'
                      : searchQuery.trim()
                        ? `No routes matching "${searchQuery}".`
                        : 'No routes match this crowding filter.'}
                  </div>
                ) : (
                  <div className="divide-y divide-[#CFDCC8] flex-1 min-h-0 overflow-y-auto pr-1">
                    {filteredRoutes.map((entry) => {
                      const isCurrentMapRoute = selectedRouteId === entry.route.routeId;
                      const meta = entry.crowding ? CROWDING_META[entry.crowding] : null;
                      const routeDisplay = parseRouteCodeAndDirection(
                        entry.route.routeCode,
                        entry.direction
                      ).displayLabel;
                      const corridorSubtitle = stripDuplicateRouteCode(
                        entry.route.corridorLabel,
                        entry.route.routeCode
                      );
                      const capacityText = formatRouteListCapacity(
                        entry.crowding,
                        entry.loadPct
                      );
                      const isSelectable = entry.hasData;

                      if (!isSelectable) {
                        return (
                          <div
                            key={entry.route.routeId}
                            aria-disabled="true"
                            data-selectable="false"
                            className="w-full py-2.5 px-2.5 rounded-[6px] flex flex-col gap-1.5 text-left opacity-60 cursor-not-allowed select-none border border-transparent"
                          >
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="font-mono text-xs font-semibold text-[#5C6F62]">
                                {routeDisplay}
                              </span>
                              <span className="text-xs text-[#8A968C] shrink-0 whitespace-nowrap">
                                Not enough data
                              </span>
                            </div>
                            {corridorSubtitle &&
                              corridorSubtitle !== entry.route.routeCode && (
                                <div className="text-[11px] text-[#8A968C] truncate">
                                  {corridorSubtitle}
                                </div>
                              )}
                            <div className="w-full h-1 bg-[#CFDCC8] rounded-full overflow-hidden mt-0.5">
                              <div className="h-full bg-[#8A968C] w-0" />
                            </div>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={entry.route.routeId}
                          type="button"
                          aria-pressed={isCurrentMapRoute}
                          data-selectable="true"
                          onClick={() => handleSelectRoute(entry.route.routeId)}
                          className={`w-full py-2.5 px-2.5 rounded-[6px] flex flex-col gap-1.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                            isCurrentMapRoute
                              ? 'bg-[#E8F0E4]/90 border border-[#1F4D3A]/30'
                              : 'hover:bg-[#E8F0E4]/70 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="font-mono text-xs font-semibold text-[#14261C] flex items-center gap-2">
                              <span>{routeDisplay}</span>
                              {isCurrentMapRoute && (
                                <span className="px-1.5 py-0.5 rounded-[4px] bg-[#1F4D3A]/10 text-[#1F4D3A] text-[10px] font-medium tracking-wide">
                                  Shown on map
                                </span>
                              )}
                            </span>
                            {meta && (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#14261C] shrink-0 whitespace-nowrap">
                                <span
                                  aria-hidden="true"
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: meta.hex }}
                                />
                                <span>{capacityText}</span>
                              </span>
                            )}
                          </div>
                          {corridorSubtitle &&
                            corridorSubtitle !== entry.route.routeCode && (
                              <div className="text-[11px] text-[#5C6F62] truncate">
                                {corridorSubtitle}
                              </div>
                            )}
                          <div className="w-full h-1 bg-[#CFDCC8] rounded-full overflow-hidden mt-0.5">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(4, entry.loadPct ?? 0))}%`,
                                backgroundColor: meta?.hex ?? '#1F4D3A',
                              }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
