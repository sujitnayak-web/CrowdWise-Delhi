import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  Polyline,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  ArrowRight,
  Compass,
  MapPin,
  Route as RouteIcon,
  Search,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchAllRoutes, fetchRouteGeometries, RouteGeometry } from '../api/crowdwiseApi';
import { useTransitApp } from '../context/TransitAppContext';
import { parseRouteCodeAndDirection } from '../utils/routePlannerUtils';
import { ApiRouteSummary, BusStop, LatLngPoint } from '../types/transit';
import {
  computeBounds,
  GoogleMapsKeyIssue,
  getGoogleMapsKeyIssue,
  LatLngBoundsBox,
  NO_LABELS_MAP_STYLE,
  SAGE_MUTED_MAP_STYLE,
} from '../utils/mapGeometry';
import { APP_PATHS } from '../utils/routesConfig';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const DELHI_CENTER: LatLngPoint = { lat: 28.6139, lng: 77.209 };

const CROWDING_COLORS = ['#2F8F6B', '#E2A62B', '#D4563A'];

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

/**
 * Builds one distinct colour per base route code. Colours are assigned by the
 * position of the code in the sorted list (golden-angle hue steps, alternating
 * lightness), so no two routes share a colour and the result is stable on every
 * load for the same set of routes. Up and Down of one route share a base code.
 */
export function buildRouteColorMap(baseCodes: string[]): Map<string, string> {
  const unique = Array.from(new Set(baseCodes)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
  const lightness = [36, 46, 56, 41, 51];
  const map = new Map<string, string>();
  let i = 0;
  for (const code of unique) {
    let color = '';
    let attempt = 0;
    do {
      const hue = ((i + attempt) * 137.508) % 360;
      color = hslToHex(hue, 72, lightness[(i + attempt) % lightness.length]);
      attempt += 1;
    } while (CROWDING_COLORS.includes(color) && attempt < 5);
    map.set(code, color);
    i += 1;
  }
  return map;
}

export interface NetworkRouteItem {
  routeId: string;
  routeCode: string;
  baseCode: string;
  direction: 'Up' | 'Down';
  displayLabel: string;
  corridorLabel: string;
  color: string;
  path: LatLngPoint[];
  stopsCount: number;
  firstStopName: string;
  lastStopName: string;
  firstStopId: string;
  stops: BusStop[];
  startPoint: LatLngPoint;
  endPoint: LatLngPoint;
  bounds: LatLngBoundsBox | null;
}

function NetworkMapCameraController({
  focusedBounds,
  allBounds,
  resetKey,
  initialFitReady,
}: {
  focusedBounds: LatLngBoundsBox | null;
  allBounds: LatLngBoundsBox | null;
  resetKey: number;
  initialFitReady: boolean;
}) {
  const map = useMap();
  const lastResetKeyRef = useRef<number>(0);
  const lastBoundsRef = useRef<string | null>(null);
  const didInitialFitRef = useRef(false);

  useEffect(() => {
    if (!map) return;
    if (!didInitialFitRef.current && initialFitReady && allBounds) {
      didInitialFitRef.current = true;
      map.fitBounds(allBounds, { top: 40, right: 40, bottom: 40, left: 40 });
      return;
    }
    if (resetKey !== lastResetKeyRef.current) {
      lastResetKeyRef.current = resetKey;
      if (allBounds) {
        map.fitBounds(allBounds, { top: 40, right: 40, bottom: 40, left: 40 });
      }
      return;
    }
    if (focusedBounds) {
      const boundKey = `${focusedBounds.north},${focusedBounds.south},${focusedBounds.east},${focusedBounds.west}`;
      if (lastBoundsRef.current !== boundKey) {
        lastBoundsRef.current = boundKey;
        map.fitBounds(focusedBounds, { top: 48, right: 48, bottom: 48, left: 48 });
      }
    }
  }, [map, focusedBounds, allBounds, resetKey, initialFitReady]);

  return null;
}

function RouteEndpointMarkers({
  routes,
  selectedRouteId,
  hoveredRouteId,
}: {
  routes: NetworkRouteItem[];
  selectedRouteId: string | null;
  hoveredRouteId: string | null;
}) {
  const map = useMap();
  const markersRef = useRef<Map<string, google.maps.Marker[]>>(new Map());

  // Create the Start / End dots once per route set.
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.Marker) return;
    const created = markersRef.current;
    for (const r of routes) {
      const start = new google.maps.Marker({
        map,
        position: r.startPoint,
        title: `Start: ${r.firstStopName} (Route ${r.displayLabel})`,
        clickable: false,
        zIndex: 40,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: r.color,
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      });
      const end = new google.maps.Marker({
        map,
        position: r.endPoint,
        title: `End: ${r.lastStopName} (Route ${r.displayLabel})`,
        clickable: false,
        zIndex: 40,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: '#FFFFFF',
          fillOpacity: 1,
          strokeColor: r.color,
          strokeWeight: 3,
        },
      });
      created.set(r.routeId, [start, end]);
    }
    return () => {
      created.forEach((pair) => pair.forEach((m) => m.setMap(null)));
      created.clear();
    };
  }, [map, routes]);

  // Dim endpoints of other routes while one is selected or hovered.
  useEffect(() => {
    const focusId = selectedRouteId ?? hoveredRouteId;
    markersRef.current.forEach((pair, routeId) => {
      const dim = focusId !== null && focusId !== routeId;
      pair.forEach((m) => {
        m.setOpacity(dim ? 0.25 : 1);
        m.setZIndex(!dim && focusId === routeId ? 60 : 40);
      });
    });
  }, [selectedRouteId, hoveredRouteId, routes]);

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
            <code className="font-mono text-[#14261C]">VITE_GOOGLE_MAPS_API_KEY</code> is currently set to a URL or non-key value instead of a Google Maps browser key. Replace it in your environment secrets with a valid Maps JavaScript API key.
          </>
        ) : issue === 'runtime_error' ? (
          <>
            Google Maps could not initialize with the configured key. Verify{' '}
            <code className="font-mono text-[#14261C]">VITE_GOOGLE_MAPS_API_KEY</code> is enabled for Maps JavaScript API or mint a free Maps Demo Key.
          </>
        ) : (
          <>
            Configure <code className="font-mono text-[#14261C]">VITE_GOOGLE_MAPS_API_KEY</code> in your environment secrets to display interactive Delhi network tiles.
          </>
        )}
      </p>
    </div>
  );
}

export function HomeNetworkMapSection() {
  const navigate = useNavigate();
  const { handleShowRouteOnMap } = useTransitApp();

  const [routes, setRoutes] = useState<ApiRouteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMapLabels, setShowMapLabels] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [mapsRuntimeError, setMapsRuntimeError] = useState(false);
  const [geometryById, setGeometryById] = useState<Record<string, RouteGeometry>>({});
  const [geoProgress, setGeoProgress] = useState<{ done: number; total: number } | null>(null);

  const mapsKeyIssue = useMemo(() => getGoogleMapsKeyIssue(GOOGLE_MAPS_API_KEY), []);

  // Google calls this global when the key is rejected (wrong key, API not enabled,
  // referrer blocked). Show the notice card instead of a blank grey map.
  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    const previous = w.gm_authFailure;
    w.gm_authFailure = () => setMapsRuntimeError(true);
    return () => {
      w.gm_authFailure = previous;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchAllRoutes(controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setRoutes(res);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unable to load network route data.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  // /api/routes has no geometry. Load each route's path and stops from the same
  // endpoint the Crowd Map uses, so both pages show the same data.
  useEffect(() => {
    if (routes.length === 0) return;
    const controller = new AbortController();
    setGeoProgress({ done: 0, total: routes.length });
    fetchRouteGeometries(
      routes,
      controller.signal,
      (routeId, geometry) => {
        setGeometryById((prev) => (prev[routeId] ? prev : { ...prev, [routeId]: geometry }));
      },
      (done, total) => setGeoProgress({ done, total })
    ).finally(() => {
      if (!controller.signal.aborted) {
        setGeoProgress((prev) => (prev ? { done: prev.total, total: prev.total } : prev));
      }
    });
    return () => controller.abort();
  }, [routes]);

  const networkRoutes = useMemo<NetworkRouteItem[]>(() => {
    const list: NetworkRouteItem[] = [];
    const baseCodes = routes.map((r) => parseRouteCodeAndDirection(r.routeCode, r.direction).baseCode);
    const colorMap = buildRouteColorMap(baseCodes);
    for (const r of routes) {
      const geo = geometryById[r.routeId];
      const stopSource = r.stops && r.stops.length > 0 ? r.stops : (geo?.stops ?? []);
      const pathSource =
        r.coordinates && r.coordinates.length >= 2 ? r.coordinates : (geo?.coordinates ?? []);
      const validStops = stopSource.filter(
        (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.lat !== 0 && s.lng !== 0
      );
      const coords: LatLngPoint[] =
        pathSource.length >= 2
          ? pathSource.filter(
              (pt) =>
                Number.isFinite(pt.lat) &&
                Number.isFinite(pt.lng) &&
                pt.lat !== 0 &&
                pt.lng !== 0
            )
          : validStops.map((s) => ({ lat: s.lat, lng: s.lng }));

      if (coords.length < 2) continue;

      const { baseCode, direction } = parseRouteCodeAndDirection(r.routeCode, r.direction ?? geo?.direction);
      const color = colorMap.get(baseCode) ?? '#4B5563';
      const bounds = computeBounds(coords);
      const firstStop = validStops[0] || r.originName;
      const lastStop = validStops[validStops.length - 1] || r.destinationName;

      list.push({
        routeId: r.routeId,
        routeCode: r.routeCode,
        baseCode,
        direction,
        displayLabel: `${baseCode} ${direction}`,
        corridorLabel: r.corridorLabel,
        color,
        path: coords,
        stopsCount: validStops.length || r.stopsCount || coords.length,
        firstStopName: typeof firstStop === 'string' ? firstStop : firstStop.shortName || firstStop.name,
        lastStopName: typeof lastStop === 'string' ? lastStop : lastStop.shortName || lastStop.name,
        firstStopId: typeof firstStop === 'object' && firstStop.id ? firstStop.id : '',
        stops: validStops,
        startPoint: coords[0],
        endPoint: coords[coords.length - 1],
        bounds,
      });
    }

    return list.sort((a, b) =>
      a.baseCode.localeCompare(b.baseCode, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [routes, geometryById]);

  const allBounds = useMemo(() => {
    const allPts = networkRoutes.flatMap((r) => r.path);
    return computeBounds(allPts);
  }, [networkRoutes]);

  const selectedRoute = useMemo(
    () => networkRoutes.find((r) => r.routeId === selectedRouteId) ?? null,
    [networkRoutes, selectedRouteId]
  );

  const hoveredRoute = useMemo(
    () => networkRoutes.find((r) => r.routeId === hoveredRouteId) ?? null,
    [networkRoutes, hoveredRouteId]
  );

  const focusedBounds = useMemo(() => selectedRoute?.bounds ?? null, [selectedRoute]);

  const filteredLegendRoutes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return networkRoutes;
    return networkRoutes.filter(
      (r) =>
        r.baseCode.toLowerCase().includes(q) ||
        r.displayLabel.toLowerCase().includes(q) ||
        r.corridorLabel.toLowerCase().includes(q) ||
        r.firstStopName.toLowerCase().includes(q) ||
        r.lastStopName.toLowerCase().includes(q)
    );
  }, [networkRoutes, searchQuery]);

  // Until the user picks a route, every route is drawn. After a pick, only that route.
  const visibleRoutes = useMemo(
    () => (selectedRouteId ? networkRoutes.filter((r) => r.routeId === selectedRouteId) : networkRoutes),
    [networkRoutes, selectedRouteId]
  );

  const handleResetView = useCallback(() => {
    setSelectedRouteId(null);
    setResetKey((k) => k + 1);
  }, []);

  const handleSelectRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
  }, []);

  const totalLoadedCount = networkRoutes.length;
  const geometryLoading = geoProgress !== null && geoProgress.done < geoProgress.total;
  const initialFitReady = !geometryLoading && networkRoutes.length > 0;

  return (
    <section
      id="network-map-section"
      aria-labelledby="network-map-heading"
      className="space-y-8 pt-6 pb-4 border-t border-[#CFDCC8]/60"
    >
      {/* Section Header */}
      <div className="space-y-2">
        <p className="cw-section-kicker">OUR NETWORK</p>
        <h2
          id="network-map-heading"
          className="font-display text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-[#14261C]"
        >
          Every route, one map
        </h2>
        <p className="text-sm sm:text-base text-[#5C6F62] leading-relaxed">
          All {totalLoadedCount} routes from the Crowd Map data. Pick a route to see only that route.
          {geometryLoading && geoProgress ? ` Loading paths… ${geoProgress.done}/${geoProgress.total}` : ''}
        </p>
      </div>

      {/* Map + Legend Grid Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* The Map Card (lg:col-span-8, ~560px tall desktop, 420px mobile) */}
        <div className="lg:col-span-8 cw-card overflow-hidden relative flex flex-col h-[420px] lg:h-[560px]">
          {loading || (networkRoutes.length === 0 && geometryLoading) ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#EEF2EA] animate-pulse">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-[8px] bg-[#E8F0E4] text-[#1F4D3A]">
                <RouteIcon className="h-5 w-5 animate-spin" strokeWidth={1.5} />
              </span>
              <p className="text-xs font-medium text-[#5C6F62]">
                {geoProgress && !loading
                  ? `Loading route paths… ${geoProgress.done} of ${geoProgress.total}`
                  : 'Loading Delhi transit network…'}
              </p>
            </div>
          ) : error ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#EEF2EA]">
              <p className="text-sm font-semibold text-[#14261C]">Could not load network map</p>
              <p className="text-xs text-[#5C6F62]">{error}</p>
            </div>
          ) : networkRoutes.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-6 text-center bg-[#EEF2EA]">
              <p className="text-sm font-semibold text-[#14261C]">No route geometry available</p>
              <p className="text-xs text-[#5C6F62]">The route path data could not be loaded from the Crowd Map data source. Check that the backend API is reachable.</p>
            </div>
          ) : mapsKeyIssue !== null || mapsRuntimeError ? (
            <GoogleMapsNoticeCard issue={mapsKeyIssue ?? 'runtime_error'} />
          ) : (
            <div className="w-full h-full relative">
              <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                <GoogleMap
                  defaultCenter={DELHI_CENTER}
                  defaultZoom={11}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  zoomControl={true}
                  mapTypeControl={true}
                  streetViewControl={false}
                  fullscreenControl={true}
                  styles={showMapLabels ? [] : NO_LABELS_MAP_STYLE}
                  className="w-full h-full"
                  onClick={() => {
                    if (selectedRouteId) {
                      handleResetView();
                    }
                  }}
                >
                  <NetworkMapCameraController
                    focusedBounds={focusedBounds}
                    allBounds={allBounds}
                    resetKey={resetKey}
                    initialFitReady={initialFitReady}
                  />

                  <RouteEndpointMarkers
                    routes={visibleRoutes}
                    selectedRouteId={selectedRouteId}
                    hoveredRouteId={hoveredRouteId}
                  />

                  {visibleRoutes.map((r) => {
                    const isSelected = selectedRouteId === r.routeId;
                    const isHovered = hoveredRouteId === r.routeId;
                    const hasSelection = selectedRouteId !== null;

                    let weight = 4;
                    let opacity = 0.9;
                    let zIndex = 10;

                    if (isSelected) {
                      weight = 7;
                      opacity = 1.0;
                      zIndex = 30;
                    } else if (isHovered) {
                      weight = 7;
                      opacity = 1.0;
                      zIndex = 20;
                    } else if (hasSelection) {
                      weight = 4;
                      opacity = 0.35;
                      zIndex = 1;
                    }

                    return (
                      <Polyline
                        key={r.routeId}
                        path={r.path}
                        strokeColor={r.color}
                        strokeWeight={weight}
                        strokeOpacity={opacity}
                        zIndex={zIndex}
                        clickable={true}
                        icons={
                          r.direction === 'Down'
                            ? [
                                {
                                  icon: {
                                    path: 'M 0,-1 0,1',
                                    strokeOpacity: opacity,
                                    strokeColor: r.color,
                                    scale: 4,
                                  },
                                  offset: '0',
                                  repeat: '14px',
                                },
                              ]
                            : undefined
                        }
                        onClick={(ev) => {
                          if (typeof ev.stop === 'function') ev.stop();
                          handleSelectRoute(r.routeId);
                        }}
                        onMouseOver={() => setHoveredRouteId(r.routeId)}
                        onMouseOut={() => setHoveredRouteId(null)}
                      />
                    );
                  })}
                </GoogleMap>
              </APIProvider>

              {/* Map labels Switch (top right, next to map controls) */}
              <label className="absolute top-[10px] right-[58px] z-10 h-10 px-2.5 rounded-[2px] bg-white hover:bg-[#F8F9FA] border border-black/10 shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] inline-flex items-center gap-2 text-xs font-medium text-[#14261C] cursor-pointer select-none">
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

              {/* Reset / Show all routes button when a route is selected */}
              {selectedRoute && (
                <div className="absolute top-3 left-3 z-10">
                  <button
                    type="button"
                    onClick={handleResetView}
                    className="h-9 px-3 rounded-[8px] border border-[#CFDCC8] bg-[#F6FAF3] hover:bg-[#E8F0E4] text-[#14261C] shadow-md inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Show all routes</span>
                  </button>
                </div>
              )}

              {/* Hover Tooltip */}
              {hoveredRoute && !selectedRoute && (
                <div className="absolute bottom-4 left-4 z-10 pointer-events-none rounded-[8px] border border-[#CFDCC8] bg-[#14261C]/90 text-white px-3 py-1.5 shadow-lg text-xs font-mono">
                  Route {hoveredRoute.displayLabel} · {hoveredRoute.corridorLabel}
                </div>
              )}

              {/* Selected Route Info Card (over map on desktop / bottom on mobile) */}
              {selectedRoute && (
                <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-20 rounded-[10px] border border-[#CFDCC8] bg-[#F6FAF3]/95 backdrop-blur-sm p-4 shadow-[0_10px_28px_rgba(20,38,28,0.18)] space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-[3px] shrink-0"
                          style={{ backgroundColor: selectedRoute.color }}
                        />
                        <h3 className="font-mono text-base font-semibold text-[#14261C]">
                          Route {selectedRoute.displayLabel}
                        </h3>
                      </div>
                      <p className="text-xs text-[#5C6F62] mt-0.5 font-medium">
                        {selectedRoute.stopsCount} stops · {selectedRoute.corridorLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close route info"
                      onClick={handleResetView}
                      className="p-1 rounded-[6px] text-[#5C6F62] hover:text-[#14261C] hover:bg-[#CFDCC8]/40 transition-colors"
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>

                  <p className="text-xs text-[#5C6F62] border-t border-[#CFDCC8] pt-2">
                    <span className="font-medium text-[#14261C]">{selectedRoute.firstStopName}</span>
                    {' → '}
                    <span className="font-medium text-[#14261C]">{selectedRoute.lastStopName}</span>
                  </p>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleShowRouteOnMap(selectedRoute.routeId);
                        navigate(APP_PATHS.CROWD_MAP);
                      }}
                      className="h-10 px-3 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] hover:bg-[#1F4D3A] hover:text-[#F6FAF3] text-[#14261C] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>View crowding</span>
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const q = encodeURIComponent(selectedRoute.baseCode);
                        const dir = encodeURIComponent(selectedRoute.direction.toLowerCase());
                        const from = encodeURIComponent(selectedRoute.firstStopId);
                        navigate(`${APP_PATHS.PLANNER}?mode=route&route=${q}&dir=${dir}&from=${from}`);
                      }}
                      className="h-10 px-3 rounded-[8px] bg-[#1F4D3A] hover:bg-[#173B2D] text-[#F6FAF3] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Compass className="h-3.5 w-3.5" strokeWidth={1.5} />
                      <span>Plan journey</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedRoute ? (
          <div className="lg:col-span-4 cw-card p-4 sm:p-5 flex flex-col h-[320px] lg:h-[560px]">
            <div className="space-y-2 pb-3 border-b border-[#CFDCC8]">
              <button
                type="button"
                onClick={handleResetView}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1F4D3A] hover:underline underline-offset-4"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Back to all routes</span>
              </button>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-[3px] shrink-0"
                    style={{ backgroundColor: selectedRoute.color }}
                  />
                  <h3 className="font-mono text-base font-semibold text-[#14261C]">
                    {selectedRoute.displayLabel}
                  </h3>
                </div>
                <span className="font-mono tabular-nums text-xs font-medium text-[#1F4D3A] px-2 py-0.5 rounded-[6px] bg-[#E8F0E4] border border-[#CFDCC8]">
                  {selectedRoute.stopsCount} stops
                </span>
              </div>
              <p className="text-xs text-[#5C6F62] truncate">{selectedRoute.corridorLabel}</p>
            </div>
            <ol
              tabIndex={0}
              aria-label="Stops on the selected route"
              className="flex-1 overflow-y-auto mt-3 pr-1 focus:outline-none"
            >
              {selectedRoute.stops.length === 0 ? (
                <li className="py-8 text-center text-xs text-[#5C6F62]">Stop list not available for this route.</li>
              ) : (
                selectedRoute.stops.map((stop, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === selectedRoute.stops.length - 1;
                  return (
                    <li key={`${stop.id}-${idx}`} className="relative flex gap-3 pb-3 last:pb-0">
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute left-[5px] top-3 bottom-[-4px] w-px bg-[#CFDCC8]"
                        />
                      )}
                      <span
                        className="relative mt-1 w-[11px] h-[11px] rounded-full border-2 shrink-0"
                        style={{
                          borderColor: selectedRoute.color,
                          backgroundColor: isFirst ? selectedRoute.color : '#F6FAF3',
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#14261C] leading-snug">{stop.name}</p>
                        {(isFirst || isLast) && (
                          <p className="text-[10px] uppercase tracking-[0.08em] text-[#5C6F62]">
                            {isFirst ? 'Start' : 'End'}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ol>
          </div>
        ) : (
        /* Route Legend Card (lg:col-span-4, scrollable list with search) */
        <div className="lg:col-span-4 cw-card p-4 sm:p-5 flex flex-col h-[320px] lg:h-[560px]">
          <div className="space-y-3 pb-3 border-b border-[#CFDCC8]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[#14261C]">
                Route Legend
              </h3>
              <span className="font-mono tabular-nums text-xs font-medium text-[#1F4D3A] px-2 py-0.5 rounded-[6px] bg-[#E8F0E4] border border-[#CFDCC8]">
                {filteredLegendRoutes.length} of {totalLoadedCount}
              </span>
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5C6F62]"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search route, e.g. 85"
                className="w-full h-11 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] pl-9 pr-9 text-sm font-medium text-[#14261C] placeholder:text-[#5C6F62]/75 hover:border-[#5C6F62] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 focus-visible:border-[#1F4D3A] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-[6px] text-[#5C6F62] hover:text-[#14261C] hover:bg-[#CFDCC8]/40 transition-colors"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-label="Scrollable route legend list"
            className="flex-1 overflow-y-auto divide-y divide-[#CFDCC8]/60 pr-1 mt-2 focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30 rounded-[6px]"
          >
            {filteredLegendRoutes.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#5C6F62]">
                No routes matching &quot;{searchQuery}&quot;.
              </div>
            ) : (
              filteredLegendRoutes.map((r) => {
                const isSelected = selectedRouteId === r.routeId;
                const isHovered = hoveredRouteId === r.routeId;

                return (
                  <button
                    key={r.routeId}
                    type="button"
                    onClick={() => handleSelectRoute(r.routeId)}
                    onMouseEnter={() => setHoveredRouteId(r.routeId)}
                    onMouseLeave={() => setHoveredRouteId(null)}
                    className={`w-full min-h-[44px] py-2.5 px-2.5 text-left flex items-center justify-between gap-3 rounded-[6px] transition-colors ${
                      isSelected
                        ? 'bg-[#1F4D3A]/12 border-l-2 border-[#1F4D3A]'
                        : isHovered
                          ? 'bg-[#E8F0E4]'
                          : 'hover:bg-[#E8F0E4]/70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className="w-3.5 h-3.5 rounded-[3px] shrink-0"
                        style={{ backgroundColor: r.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-[#14261C]">
                            {r.baseCode}
                          </span>
                          <span className="text-[10px] font-medium text-[#5C6F62] bg-[#E8F0E4] border border-[#CFDCC8] px-1.5 py-0.2 rounded-[4px]">
                            {r.direction}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5C6F62] truncate mt-0.5">
                          {r.corridorLabel}
                        </p>
                      </div>
                    </div>

                    <span className="font-mono text-xs tabular-nums text-[#5C6F62] shrink-0">
                      {r.stopsCount} stops
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        )}
      </div>
    </section>
  );
}
