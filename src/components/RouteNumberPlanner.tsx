import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bus,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  fetchAllRoutes,
  fetchOperatorHotspots,
  fetchRouteHourlyProfile,
} from '../api/crowdwiseApi';
import { BusStop, DayType, PreferenceMode, RouteCrowdDetail } from '../types/transit';
import {
  buildHourlyStretchTimeline,
  buildSelectableRouteCatalog,
  buildUpcomingDepartures,
  computeStretchSummary,
  doesRouteOperateAtHour,
  filterRouteCatalog,
  findPairedDirectionRoute,
  formatMinutesToHHMM,
  RouteCatalogEntry,
  RouteDirection,
  validateStopSelection,
} from '../utils/routePlannerUtils';
import {
  CROWDING_META,
  formatHour,
  parseTimeToMinutes,
} from '../utils/transitUtils';
import { ApiStatusBanner } from './ApiStatusBanner';
import { ConfidenceTag, CrowdingBadge } from './CrowdingBadge';

export interface RoutePlannerInitialSelection {
  routeQuery?: string;
  direction?: RouteDirection;
  boardingStopId?: string;
  alightingStopId?: string;
}

export function useRouteNumberPlannerState({
  enabled,
  dayType,
  departureTime,
  departureHour,
  preference,
  initialSelection,
  onRouteParamsChange,
}: {
  enabled: boolean;
  dayType: DayType;
  departureTime: string;
  departureHour: number;
  preference: PreferenceMode;
  initialSelection?: RoutePlannerInitialSelection;
  onRouteParamsChange?: (params: {
    route: string;
    dir: string;
    from: string;
    to: string;
  }) => void;
}) {
  const [catalog, setCatalog] = useState<RouteCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogNonce, setCatalogNonce] = useState(0);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [direction, setDirection] = useState<RouteDirection>(
    initialSelection?.direction ?? 'Down'
  );
  const [boardingStopId, setBoardingStopId] = useState<string>(
    initialSelection?.boardingStopId ?? ''
  );
  const [alightingStopId, setAlightingStopId] = useState<string>(
    initialSelection?.alightingStopId ?? ''
  );
  const [appliedInitialKey, setAppliedInitialKey] = useState<string>('');

  const [hourlyMap, setHourlyMap] = useState<Record<number, RouteCrowdDetail>>({});
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [hourlyError, setHourlyError] = useState<string | null>(null);
  const [hourlyNonce, setHourlyNonce] = useState(0);

  // Load route catalog once By route number mode is active
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError(null);

    fetchAllRoutes(controller.signal)
      .then((allRoutes) => {
        if (controller.signal.aborted) return;
        setCatalog(buildSelectableRouteCatalog(allRoutes));
        // Enrich "Busy" badges in background without delaying route selection
        fetchOperatorHotspots(dayType, departureHour, 25, controller.signal)
          .then((hotspotsPayload) => {
            if (controller.signal.aborted || hotspotsPayload.hotspots.length === 0) return;
            const hotspotIds = new Set(hotspotsPayload.hotspots.map((h) => h.routeId));
            setCatalog(buildSelectableRouteCatalog(allRoutes, hotspotIds));
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setCatalogError(err instanceof Error ? err.message : 'Unable to load route list.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCatalogLoading(false);
        }
      });

    return () => controller.abort();
  }, [enabled, catalogNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const incomingKey = `${initialSelection?.routeQuery ?? ''}::${initialSelection?.direction ?? ''}::${initialSelection?.boardingStopId ?? ''}::${initialSelection?.alightingStopId ?? ''}`;

  // Pick URL-specified or default route once catalog arrives
  useEffect(() => {
    if (!enabled || catalog.length === 0) return;

    if (initialSelection?.routeQuery && appliedInitialKey !== incomingKey) {
      const q = initialSelection.routeQuery.trim().toLowerCase();
      const targetDir = initialSelection.direction;
      const exactMatch =
        catalog.find(
          (e) =>
            (e.baseCode.toLowerCase() === q ||
              e.routeId.toLowerCase() === q ||
              e.displayLabel.toLowerCase() === q ||
              e.route.routeCode.toLowerCase() === q) &&
            (!targetDir || e.direction === targetDir)
        ) ??
        catalog.find(
          (e) =>
            e.baseCode.toLowerCase() === q ||
            e.routeId.toLowerCase() === q ||
            e.displayLabel.toLowerCase() === q ||
            e.route.routeCode.toLowerCase() === q
        );

      if (exactMatch) {
        setAppliedInitialKey(incomingKey);
        if (exactMatch.routeId !== selectedRouteId) {
          setSelectedRouteId(exactMatch.routeId);
          setDirection(exactMatch.direction);
          setBoardingStopId(initialSelection.boardingStopId ?? '');
          setAlightingStopId(initialSelection.alightingStopId ?? '');
        } else {
          if (exactMatch.direction !== direction) {
            setDirection(exactMatch.direction);
          }
          if (initialSelection.boardingStopId && initialSelection.boardingStopId !== boardingStopId) {
            setBoardingStopId(initialSelection.boardingStopId);
          }
          if (initialSelection.alightingStopId && initialSelection.alightingStopId !== alightingStopId) {
            setAlightingStopId(initialSelection.alightingStopId);
          }
        }
        return;
      }
    }

    if (!selectedRouteId) {
      const preferred =
        catalog.find((e) => e.baseCode === '85' && e.direction === 'Down') ??
        catalog.find((e) => e.hasObservedHotspot) ??
        catalog[0];
      if (preferred) {
        setSelectedRouteId(preferred.routeId);
        setDirection(preferred.direction);
      }
    }
  }, [enabled, catalog, initialSelection, incomingKey, appliedInitialKey, selectedRouteId]);

  const selectedRoute = useMemo(
    () => catalog.find((c) => c.routeId === selectedRouteId) ?? null,
    [catalog, selectedRouteId]
  );

  // Fetch 19-hour profile + ordered stops for selected route & dayType
  useEffect(() => {
    if (!enabled || !selectedRoute) return;
    const controller = new AbortController();
    setHourlyLoading(true);
    setHourlyError(null);

    fetchRouteHourlyProfile(
      selectedRoute.routeId,
      dayType,
      selectedRoute.route,
      controller.signal
    )
      .then((byHour) => {
        if (!controller.signal.aborted) {
          setHourlyMap(byHour);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setHourlyMap({});
        setHourlyError(
          err instanceof Error ? err.message : 'Unable to fetch route schedule and crowding.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setHourlyLoading(false);
        }
      });

    return () => controller.abort();
  }, [enabled, selectedRoute?.routeId, dayType, hourlyNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeHourDetail = useMemo(
    () => hourlyMap[departureHour] ?? Object.values(hourlyMap)[0],
    [hourlyMap, departureHour]
  );

  const stops = useMemo<BusStop[]>(() => {
    if (activeHourDetail?.stops?.length) return activeHourDetail.stops;
    return selectedRoute?.route.stops ?? [];
  }, [activeHourDetail, selectedRoute]);

  // Default boarding -> first stop, alighting -> last stop when route stops load
  useEffect(() => {
    if (stops.length < 2) return;
    const hasBoarding = stops.some((s) => s.id === boardingStopId);
    const nextBoarding = hasBoarding ? boardingStopId : stops[0].id;
    const hasAlighting = stops.some((s) => s.id === alightingStopId);
    const nextAlighting = hasAlighting ? alightingStopId : stops[stops.length - 1].id;

    if (nextBoarding !== boardingStopId) {
      setBoardingStopId(nextBoarding);
    }
    if (nextAlighting !== alightingStopId) {
      setAlightingStopId(nextAlighting);
    }
  }, [stops]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopValidation = useMemo(
    () => validateStopSelection(stops, boardingStopId, alightingStopId),
    [stops, boardingStopId, alightingStopId]
  );

  useEffect(() => {
    if (!enabled || !selectedRoute || !onRouteParamsChange) return;
    if (initialSelection?.routeQuery && appliedInitialKey !== incomingKey) return;
    if (stops.length < 2 || !boardingStopId || !alightingStopId) return;
    onRouteParamsChange({
      route: selectedRoute.baseCode,
      dir: direction.toLowerCase(),
      from: boardingStopId,
      to: alightingStopId,
    });
  }, [
    enabled,
    selectedRoute,
    direction,
    boardingStopId,
    alightingStopId,
    stops.length,
    initialSelection?.routeQuery,
    appliedInitialKey,
    incomingKey,
    onRouteParamsChange,
  ]);

  const selectRouteEntry = useCallback((entry: RouteCatalogEntry) => {
    setSelectedRouteId(entry.routeId);
    setDirection(entry.direction);
    setBoardingStopId('');
    setAlightingStopId('');
  }, []);

  const changeDirection = useCallback(
    (nextDir: RouteDirection) => {
      setDirection(nextDir);
      if (!selectedRoute) return;
      const paired = findPairedDirectionRoute(catalog, selectedRoute.baseCode, nextDir);
      if (paired && paired.routeId !== selectedRoute.routeId) {
        setSelectedRouteId(paired.routeId);
        setBoardingStopId('');
        setAlightingStopId('');
      }
    },
    [catalog, selectedRoute]
  );

  const changeBoardingStop = useCallback(
    (nextBoardingId: string) => {
      setBoardingStopId(nextBoardingId);
      if (stops.length < 2) return;
      const newBIdx = stops.findIndex((s) => s.id === nextBoardingId);
      const curAIdx = stops.findIndex((s) => s.id === alightingStopId);
      if (newBIdx >= 0 && newBIdx < stops.length - 1 && curAIdx <= newBIdx) {
        setAlightingStopId(stops[stops.length - 1].id);
      }
    },
    [stops, alightingStopId]
  );

  const operatingStatus = useMemo(() => {
    if (!selectedRoute) return { runsAtHour: true, nearestActiveHour: departureHour };
    return doesRouteOperateAtHour({
      routeCode: selectedRoute.route.routeCode,
      tripsPerDay: selectedRoute.tripsPerDay,
      detail: activeHourDetail,
      hourlyMap,
      hour: departureHour,
    });
  }, [selectedRoute, activeHourDetail, hourlyMap, departureHour]);

  const stretchSummary = useMemo(() => {
    if (!stopValidation.valid) return null;
    return computeStretchSummary({
      detail: operatingStatus.runsAtHour ? activeHourDetail : undefined,
      stops,
      boardingIndex: stopValidation.boardingIndex,
      alightingIndex: stopValidation.alightingIndex,
    });
  }, [stopValidation, operatingStatus.runsAtHour, activeHourDetail, stops]);

  const timeline = useMemo(() => {
    if (!selectedRoute || !stopValidation.valid) return [];
    return buildHourlyStretchTimeline({
      hourlyMap,
      stops,
      boardingIndex: stopValidation.boardingIndex,
      alightingIndex: stopValidation.alightingIndex,
      routeCode: selectedRoute.route.routeCode,
      tripsPerDay: selectedRoute.tripsPerDay,
    });
  }, [selectedRoute, stopValidation, hourlyMap, stops]);

  const { departures, nextBest } = useMemo(() => {
    if (!selectedRoute || !stopValidation.valid || !stretchSummary) {
      return { departures: [], nextBest: null };
    }
    return buildUpcomingDepartures({
      departureTime,
      dayType,
      boardingIndex: stopValidation.boardingIndex,
      travelMinutes: stretchSummary.travelMinutes,
      timeline,
      tripsPerDay: selectedRoute.tripsPerDay,
      headwayMinutes: selectedRoute.route.headwayMinutes,
      preference,
      count: 5,
    });
  }, [
    selectedRoute,
    stopValidation,
    stretchSummary,
    departureTime,
    dayType,
    timeline,
    preference,
  ]);

  return {
    catalog,
    catalogLoading,
    catalogError,
    retryCatalog: () => setCatalogNonce((n) => n + 1),
    selectedRoute,
    direction,
    stops,
    stopsLoading: hourlyLoading && stops.length === 0,
    boardingStopId,
    alightingStopId,
    stopValidation,
    hourlyLoading,
    hourlyError,
    retryHourly: () => setHourlyNonce((n) => n + 1),
    operatingStatus,
    stretchSummary,
    timeline,
    departures,
    nextBest,
    selectRouteEntry,
    changeDirection,
    changeBoardingStop,
    changeAlightingStop: setAlightingStopId,
  };
}

export function RouteNumberFields({
  catalog,
  catalogLoading,
  catalogError,
  onRetryCatalog,
  selectedRoute,
  direction,
  stops,
  stopsLoading,
  boardingStopId,
  alightingStopId,
  stopValidationError,
  onSelectRoute,
  onChangeDirection,
  onChangeBoardingStop,
  onChangeAlightingStop,
}: {
  catalog: RouteCatalogEntry[];
  catalogLoading: boolean;
  catalogError: string | null;
  onRetryCatalog: () => void;
  selectedRoute: RouteCatalogEntry | null;
  direction: RouteDirection;
  stops: BusStop[];
  stopsLoading: boolean;
  boardingStopId: string;
  alightingStopId: string;
  stopValidationError: string | null;
  onSelectRoute: (entry: RouteCatalogEntry) => void;
  onChangeDirection: (dir: RouteDirection) => void;
  onChangeBoardingStop: (stopId: string) => void;
  onChangeAlightingStop: (stopId: string) => void;
}) {
  const routeBoxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(selectedRoute?.displayLabel ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  useEffect(() => {
    if (!isFocused) {
      setQuery(selectedRoute?.displayLabel ?? '');
    }
  }, [selectedRoute, isFocused]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
        setQuery(selectedRoute?.displayLabel ?? '');
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [selectedRoute]);

  const filteredCatalog = useMemo(() => {
    const effectiveQuery =
      selectedRoute && query.trim() === selectedRoute.displayLabel ? '' : query;
    return filterRouteCatalog(catalog, effectiveQuery).slice(0, 60);
  }, [catalog, query, selectedRoute]);

  const upAvailable = useMemo(
    () =>
      selectedRoute
        ? findPairedDirectionRoute(catalog, selectedRoute.baseCode, 'Up') !== null
        : true,
    [catalog, selectedRoute]
  );

  const downAvailable = useMemo(
    () =>
      selectedRoute
        ? findPairedDirectionRoute(catalog, selectedRoute.baseCode, 'Down') !== null
        : true,
    [catalog, selectedRoute]
  );

  const boardingIdx = useMemo(
    () => stops.findIndex((s) => s.id === boardingStopId),
    [stops, boardingStopId]
  );

  const alightingStopOptions = useMemo(() => {
    if (stops.length === 0) return [];
    if (boardingIdx < 0) return stops;
    return stops.slice(boardingIdx + 1);
  }, [stops, boardingIdx]);

  const handleChooseRoute = (entry: RouteCatalogEntry) => {
    setQuery(entry.displayLabel);
    setIsOpen(false);
    setIsFocused(false);
    onSelectRoute(entry);
  };

  return (
    <div className="space-y-3">
      {catalogError && (
        <ApiStatusBanner
          title="Could not load Delhi route catalog"
          message={catalogError}
          onRetry={onRetryCatalog}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
        {/* Searchable Route Number Autocomplete */}
        <div ref={containerRef} className="md:col-span-4 relative">
          <label htmlFor="route-number-input" className="block cw-section-kicker mb-2">
            Route number
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5C6F62]"
              strokeWidth={1.5}
            />
            <input
              id="route-number-input"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-controls={routeBoxId}
              value={query}
              placeholder={catalogLoading ? 'Loading routes…' : 'Search route, e.g. 85'}
              onFocus={() => {
                setIsFocused(true);
                setIsOpen(true);
                setActiveIndex(0);
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
                setActiveIndex(0);
              }}
              onKeyDown={(e) => {
                if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                  setIsOpen(true);
                  return;
                }
                if (!isOpen) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIndex((prev) =>
                    filteredCatalog.length > 0 ? (prev + 1) % filteredCatalog.length : 0
                  );
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIndex((prev) =>
                    filteredCatalog.length > 0
                      ? (prev - 1 + filteredCatalog.length) % filteredCatalog.length
                      : 0
                  );
                } else if (e.key === 'Enter') {
                  const chosen = filteredCatalog[activeIndex] ?? filteredCatalog[0];
                  if (chosen) {
                    e.preventDefault();
                    handleChooseRoute(chosen);
                  }
                } else if (e.key === 'Escape') {
                  setIsOpen(false);
                  setIsFocused(false);
                  setQuery(selectedRoute?.displayLabel ?? '');
                }
              }}
              className="w-full h-11 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] pl-9 pr-9 text-sm sm:text-[15px] font-medium text-[#14261C] placeholder:text-[#5C6F62]/75 hover:border-[#5C6F62] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 focus-visible:border-[#1F4D3A] transition-colors"
            />
            {catalogLoading ? (
              <Loader2
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[#1F4D3A]"
                strokeWidth={1.5}
              />
            ) : query ? (
              <button
                type="button"
                aria-label="Clear route search"
                onClick={() => {
                  setQuery('');
                  setIsFocused(true);
                  setIsOpen(true);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-[6px] text-[#5C6F62] hover:text-[#14261C] hover:bg-[#CFDCC8]/40 transition-colors"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>

          {isOpen && (
            <div
              id={routeBoxId}
              role="listbox"
              aria-label="Matching bus routes"
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 rounded-[10px] border border-[#CFDCC8] bg-[#F6FAF3] shadow-[0_10px_28px_rgba(20,38,28,0.12)] max-h-72 overflow-y-auto py-1.5"
            >
              {catalogLoading && filteredCatalog.length === 0 ? (
                <div className="px-3.5 py-2.5 text-xs text-[#5C6F62]">
                  Loading Delhi bus routes…
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div className="px-3.5 py-2.5 text-xs text-[#5C6F62]">
                  No routes matching &quot;{query}&quot;.
                </div>
              ) : (
                filteredCatalog.map((entry, idx) => {
                  const isCurrent = selectedRoute?.routeId === entry.routeId;
                  const isHighlighted = idx === activeIndex;
                  return (
                    <button
                      key={entry.routeId}
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleChooseRoute(entry);
                      }}
                      className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                        isHighlighted ? 'bg-[#E8F0E4]' : 'hover:bg-[#E8F0E4]/70'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <Bus className="h-3.5 w-3.5 text-[#1F4D3A] shrink-0" strokeWidth={1.5} />
                          <span className="font-mono text-sm font-semibold text-[#14261C]">
                            {entry.displayLabel}
                          </span>
                        </span>
                        <span className="block truncate text-[11px] text-[#5C6F62] pl-5.5">
                          {entry.corridorLabel}
                        </span>
                      </span>
                      {entry.hasObservedHotspot && (
                        <span className="text-[10px] font-medium text-[#1F4D3A] bg-[#E8F0E4] border border-[#CFDCC8] px-1.5 py-0.5 rounded-[4px] shrink-0">
                          Busy
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Direction Up / Down Switch */}
        <div className="md:col-span-2">
          <span className="block cw-section-kicker mb-2">Direction</span>
          <div
            role="group"
            aria-label="Route direction"
            className="grid grid-cols-2 h-11 p-1 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4]"
          >
            {(['Up', 'Down'] as const).map((dir) => {
              const available = dir === 'Up' ? upAvailable : downAvailable;
              const active = direction === dir;
              return (
                <button
                  key={dir}
                  type="button"
                  disabled={!available && !active}
                  title={
                    !available && !active
                      ? `No ${dir} service available for ${selectedRoute?.baseCode ?? 'route'}`
                      : `Select ${dir} direction`
                  }
                  onClick={() => onChangeDirection(dir)}
                  aria-pressed={active}
                  className={`rounded-[6px] text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 disabled:opacity-40 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-[#1F4D3A] text-[#F6FAF3]'
                      : 'text-[#5C6F62] hover:text-[#14261C]'
                  }`}
                >
                  {dir}
                </button>
              );
            })}
          </div>
        </div>

        {/* Boarding Stop Select */}
        <div className="md:col-span-3">
          <label htmlFor="route-boarding-select" className="block cw-section-kicker mb-2">
            Boarding stop
          </label>
          <div className="relative">
            <select
              id="route-boarding-select"
              value={boardingStopId}
              disabled={stopsLoading || stops.length === 0}
              onChange={(e) => onChangeBoardingStop(e.target.value)}
              className="w-full h-11 appearance-none rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] pl-3 pr-8 text-sm font-medium text-[#14261C] hover:border-[#5C6F62] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 focus-visible:border-[#1F4D3A] transition-colors truncate"
            >
              {stops.length === 0 ? (
                <option value="">{stopsLoading ? 'Loading stops…' : 'Select a route'}</option>
              ) : (
                stops.map((stop, idx) => (
                  <option key={stop.id} value={stop.id}>
                    {idx + 1}. {stop.name}
                  </option>
                ))
              )}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5C6F62]"
              strokeWidth={1.5}
            />
          </div>
        </div>

        {/* Alighting Stop Select (only stops strictly AFTER boarding stop) */}
        <div className="md:col-span-3">
          <label htmlFor="route-alighting-select" className="block cw-section-kicker mb-2">
            Alighting stop
          </label>
          <div className="relative">
            <select
              id="route-alighting-select"
              value={alightingStopId}
              disabled={stopsLoading || alightingStopOptions.length === 0}
              onChange={(e) => onChangeAlightingStop(e.target.value)}
              className={`w-full h-11 appearance-none rounded-[8px] border bg-[#E8F0E4] pl-3 pr-8 text-sm font-medium text-[#14261C] hover:border-[#5C6F62] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 transition-colors truncate ${
                stopValidationError
                  ? 'border-[#D4563A]'
                  : 'border-[#CFDCC8] focus-visible:border-[#1F4D3A]'
              }`}
            >
              {alightingStopOptions.length === 0 ? (
                <option value="">
                  {stopsLoading
                    ? 'Loading stops…'
                    : stops.length > 0
                      ? 'No stops after boarding stop'
                      : 'Select a route'}
                </option>
              ) : (
                alightingStopOptions.map((stop) => {
                  const travelOrderIdx = stops.findIndex((s) => s.id === stop.id);
                  return (
                    <option key={stop.id} value={stop.id}>
                      {travelOrderIdx + 1}. {stop.name}
                    </option>
                  );
                })
              )}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5C6F62]"
              strokeWidth={1.5}
            />
          </div>
        </div>
      </div>

      {stopValidationError && (
        <p
          role="alert"
          data-testid="route-stop-error"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D4563A]"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span>{stopValidationError}</span>
        </p>
      )}
    </div>
  );
}

export function RouteNumberResults({
  selectedRoute,
  stops,
  catalogLoading,
  stopsLoading,
  hourlyLoading,
  hourlyError,
  onRetryHourly,
  stopValidation,
  operatingStatus,
  stretchSummary,
  timeline,
  departures,
  nextBest,
  dayType,
  departureTime,
  departureHour,
  preference,
  onChangeDepartureTime,
  onViewRouteOnMap,
}: {
  selectedRoute: RouteCatalogEntry | null;
  stops: BusStop[];
  catalogLoading: boolean;
  stopsLoading: boolean;
  hourlyLoading: boolean;
  hourlyError: string | null;
  onRetryHourly: () => void;
  stopValidation: ReturnType<typeof validateStopSelection>;
  operatingStatus: { runsAtHour: boolean; nearestActiveHour: number | null };
  stretchSummary: ReturnType<typeof computeStretchSummary> | null;
  timeline: ReturnType<typeof buildHourlyStretchTimeline>;
  departures: ReturnType<typeof buildUpcomingDepartures>['departures'];
  nextBest: ReturnType<typeof buildUpcomingDepartures>['nextBest'];
  dayType: DayType;
  departureTime: string;
  departureHour: number;
  preference: PreferenceMode;
  onChangeDepartureTime: (time: string) => void;
  onViewRouteOnMap: (routeId: string) => void;
}) {
  const boardingStopObj = stops[stopValidation.boardingIndex] ?? null;
  const alightingStopObj = stops[stopValidation.alightingIndex] ?? null;
  const departureMins = parseTimeToMinutes(departureTime) ?? departureHour * 60;
  const estimatedArrivalMins = departureMins + (stretchSummary?.travelMinutes ?? 0);

  return (
    <div id="route-planner-results" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="cw-section-kicker">
          Route Journey ·{' '}
          <span className="font-mono text-[#14261C]">
            {selectedRoute ? `Bus ${selectedRoute.displayLabel}` : 'Select a route'}
          </span>
        </p>
        <span className="font-mono tabular-nums text-xs text-[#5C6F62]">
          {dayType === 'weekday' ? 'Weekday' : 'Weekend'} · {departureTime} ·{' '}
          {preference === 'comfortable'
            ? 'Sorted by lowest crowding'
            : 'Sorted by earliest arrival'}
        </span>
      </div>

      {hourlyError && (
        <ApiStatusBanner
          title="Could not load route crowding details"
          message={hourlyError}
          onRetry={onRetryHourly}
        />
      )}

      {catalogLoading || stopsLoading ? (
        <div className="cw-card p-6 space-y-4 animate-pulse">
          <div className="flex justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="h-5 w-48 rounded bg-[#E8F0E4]" />
              <div className="h-3.5 w-2/3 rounded bg-[#E8F0E4]" />
            </div>
            <div className="h-7 w-32 rounded-full bg-[#E8F0E4]" />
          </div>
          <div className="h-4 w-full rounded bg-[#E8F0E4]" />
          <div className="h-32 w-full rounded bg-[#E8F0E4]" />
        </div>
      ) : !selectedRoute ? (
        <div className="cw-card p-6 space-y-2">
          <h2 className="font-display text-lg font-semibold text-[#14261C]">
            Choose a Delhi bus route
          </h2>
          <p className="text-sm text-[#5C6F62]">
            Search by route number above (for example &quot;85&quot; or &quot;258&quot;) to inspect stop-by-stop stretch crowding and upcoming departures.
          </p>
        </div>
      ) : !stopValidation.valid || !stretchSummary ? (
        <div className="cw-card p-6 space-y-2">
          <h2 className="font-display text-lg font-semibold text-[#14261C]">
            Fix stop selection to view this journey
          </h2>
          <p className="text-sm text-[#5C6F62]">
            {stopValidation.error ||
              'Select a boarding stop followed by a downstream alighting stop.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {!operatingStatus.runsAtHour && (
            <div
              role="status"
              data-testid="route-inactive-hour-notice"
              className="cw-card p-4 sm:p-5 border-[#E2A62B]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#14261C]">
                  Bus {selectedRoute.displayLabel} does not run at {departureTime}.
                </p>
                <p className="text-xs text-[#5C6F62]">
                  {operatingStatus.nearestActiveHour !== null
                    ? `Nearest scheduled service runs around ${formatHour(operatingStatus.nearestActiveHour)}.`
                    : 'No scheduled departures observed for this service window.'}
                </p>
              </div>
              {operatingStatus.nearestActiveHour !== null && (
                <button
                  type="button"
                  onClick={() =>
                    onChangeDepartureTime(formatHour(operatingStatus.nearestActiveHour!))
                  }
                  className="px-3.5 py-2 rounded-[8px] bg-[#1F4D3A] hover:bg-[#173B2D] text-[#F6FAF3] text-xs font-medium shrink-0 transition-colors"
                >
                  Switch to {formatHour(operatingStatus.nearestActiveHour)}
                </button>
              )}
            </div>
          )}

          {/* Main Stretch Journey Summary Card */}
          <article
            data-testid="route-number-summary-card"
            className="cw-card p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="font-mono tabular-nums text-xl font-semibold text-[#14261C]">
                    {departureTime} – {formatMinutesToHHMM(estimatedArrivalMins)}
                  </span>
                  <span className="font-mono tabular-nums text-sm font-medium text-[#1F4D3A]">
                    {stretchSummary.travelMinutes} min
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#5C6F62]">
                  <span className="font-mono font-semibold text-[#14261C]">
                    Bus {selectedRoute.displayLabel}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {stretchSummary.stopCount} stops
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedRoute.route.operator}</span>
                </div>

                {boardingStopObj && alightingStopObj && (
                  <p className="text-xs sm:text-[13px] text-[#5C6F62]">
                    <span className="font-medium text-[#14261C]">{boardingStopObj.name}</span>
                    {' → '}
                    <span className="font-medium text-[#14261C]">{alightingStopObj.name}</span>
                  </p>
                )}

                {stretchSummary.hasData && stretchSummary.confidence && (
                  <div className="pt-0.5">
                    <ConfidenceTag
                      level={stretchSummary.confidence}
                      ticketCount={stretchSummary.ticketCount}
                      predictionSource={stretchSummary.predictionSource}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                {stretchSummary.hasData &&
                stretchSummary.crowding &&
                stretchSummary.loadPct !== null ? (
                  <CrowdingBadge
                    level={stretchSummary.crowding}
                    loadPct={stretchSummary.loadPct}
                  />
                ) : (
                  <span
                    data-testid="route-no-data-badge"
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-[#E8F0E4] text-[#5C6F62] border border-[#CFDCC8]"
                  >
                    Not enough data for this route at this time
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onViewRouteOnMap(selectedRoute.routeId)}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-[#1F4D3A] hover:border-[#1F4D3A] hover:bg-[#1F4D3A] hover:text-[#F6FAF3] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
                >
                  <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>View on Crowd Map</span>
                </button>
              </div>
            </div>

            {/* Segmented crowding ribbon ONLY between boarding and alighting stop */}
            <div className="space-y-1.5" data-testid="stretch-crowding-ribbon">
              <div className="flex items-center justify-between text-[11px] text-[#5C6F62]">
                <span>Stretch crowding profile ({stretchSummary.segments.length} segments)</span>
                {stretchSummary.hasData &&
                  stretchSummary.crowding &&
                  stretchSummary.loadPct !== null && (
                    <span className="font-medium text-[#14261C]">
                      {CROWDING_META[stretchSummary.crowding].label}, {stretchSummary.loadPct}% full
                    </span>
                  )}
              </div>

              <div className="flex h-3 w-full gap-0.5 rounded-[4px] overflow-hidden bg-[#E8F0E4]">
                {stretchSummary.segments.length > 0 ? (
                  stretchSummary.segments.map((seg) => (
                    <div
                      key={seg.id}
                      title={
                        seg.crowding && seg.loadPct !== null
                          ? `${seg.fromName} → ${seg.toName}: ${CROWDING_META[seg.crowding].label}, ${seg.loadPct}% full`
                          : `${seg.fromName} → ${seg.toName}: Not enough data`
                      }
                      className="flex-1 h-full transition-colors duration-200"
                      style={{ backgroundColor: seg.color }}
                    />
                  ))
                ) : (
                  <div className="flex-1 h-full bg-[#CFDCC8]" />
                )}
              </div>

              {boardingStopObj && alightingStopObj && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#5C6F62]">
                  <span className="truncate">
                    {boardingStopObj.shortName || boardingStopObj.name}
                  </span>
                  <span className="truncate text-right">
                    {alightingStopObj.shortName || alightingStopObj.name}
                  </span>
                </div>
              )}
            </div>
          </article>

          {/* Hour-by-Hour Timeline + Upcoming GTFS Departures */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 cw-card p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="cw-section-kicker">Hourly Stretch Crowding</p>
                  <h3 className="font-display text-lg font-semibold text-[#14261C] mt-0.5">
                    05:00 – 23:00 on this stretch ({dayType})
                  </h3>
                </div>
                <span className="font-mono tabular-nums text-xs font-medium text-[#1F4D3A] px-2 py-1 rounded-[6px] bg-[#E8F0E4] border border-[#CFDCC8]">
                  Selected: {formatHour(departureHour)}
                </span>
              </div>

              {hourlyLoading && timeline.every((pt) => !pt.hasData) ? (
                <div className="h-36 rounded-[8px] bg-[#E8F0E4] animate-pulse" />
              ) : (
                <div className="space-y-2">
                  <div
                    role="group"
                    aria-label="Hour-by-hour crowding timeline for selected stretch"
                    data-testid="stretch-hourly-timeline"
                    className="grid grid-cols-[repeat(19,minmax(0,1fr))] gap-1 items-end h-36 pt-3"
                  >
                    {timeline.map((pt) => {
                      const isSelected = pt.hour === departureHour;
                      const barColor =
                        pt.hasData && pt.crowding
                          ? CROWDING_META[pt.crowding].hex
                          : '#CFDCC8';
                      const heightPct =
                        pt.hasData && pt.loadPct !== null ? Math.max(14, pt.loadPct) : 14;
                      return (
                        <button
                          key={pt.hour}
                          type="button"
                          data-selected={isSelected ? 'true' : undefined}
                          onClick={() => onChangeDepartureTime(formatHour(pt.hour))}
                          aria-label={
                            pt.hasData && pt.crowding && pt.loadPct !== null
                              ? `${formatHour(pt.hour)}: ${CROWDING_META[pt.crowding].label}, ${pt.loadPct}% full`
                              : `${formatHour(pt.hour)}: Not enough data`
                          }
                          title={
                            pt.hasData && pt.crowding && pt.loadPct !== null
                              ? `${formatHour(pt.hour)} · ${CROWDING_META[pt.crowding].label} (${pt.loadPct}%)`
                              : `${formatHour(pt.hour)} · Not enough data`
                          }
                          className={`h-full flex flex-col items-center justify-end rounded-[4px] p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                            isSelected
                              ? 'bg-[#1F4D3A]/12 ring-1 ring-[#1F4D3A]'
                              : 'hover:bg-[#E8F0E4]'
                          }`}
                        >
                          <span
                            className="w-full rounded-[3px] transition-[height,background-color] duration-200"
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: barColor,
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-[repeat(19,minmax(0,1fr))] gap-1 text-center font-mono tabular-nums text-[10px] text-[#5C6F62]">
                    {timeline.map((pt) => (
                      <span
                        key={`tl-lbl-${pt.hour}`}
                        className={
                          pt.hour === departureHour ? 'font-semibold text-[#1F4D3A]' : ''
                        }
                      >
                        {pt.hour % 2 === 1 ? String(pt.hour).padStart(2, '0') : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {nextBest && (
                <button
                  type="button"
                  data-testid="next-best-travel-btn"
                  onClick={() => onChangeDepartureTime(nextBest.time)}
                  className="w-full px-3.5 py-2.5 rounded-[8px] border border-[#2F8F6B]/30 bg-[#2F8F6B]/10 hover:bg-[#2F8F6B]/15 text-left flex items-center justify-between gap-2 text-xs text-[#14261C] transition-colors"
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-[#1F4D3A] shrink-0" strokeWidth={1.5} />
                    <span>
                      Next best time to travel:{' '}
                      <span className="font-semibold text-[#1F4D3A]">
                        {nextBest.displayTime}, {CROWDING_META[nextBest.crowding].label.toLowerCase()}
                      </span>
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-[#1F4D3A] shrink-0">
                    +{nextBest.minutesAhead} min
                  </span>
                </button>
              )}
            </div>

            <div className="lg:col-span-5 cw-card p-5 sm:p-6 space-y-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="cw-section-kicker">Upcoming GTFS Departures</p>
                  <h3 className="font-display text-lg font-semibold text-[#14261C] mt-0.5">
                    From {boardingStopObj?.shortName || boardingStopObj?.name || 'boarding stop'}
                  </h3>
                </div>
                <span className="text-[11px] text-[#5C6F62] shrink-0 pt-1">
                  {preference === 'comfortable' ? 'Lowest crowd' : 'Earliest arrival'}
                </span>
              </div>

              {departures.length === 0 ? (
                <p className="text-xs text-[#5C6F62] py-4">
                  No departures scheduled from this stop after {departureTime}.
                </p>
              ) : (
                <div className="divide-y divide-[#CFDCC8]" data-testid="upcoming-departures-list">
                  {departures.map((dep) => (
                    <div
                      key={dep.id}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-mono tabular-nums text-sm font-semibold text-[#14261C]">
                          <Clock className="h-3.5 w-3.5 text-[#5C6F62] shrink-0" strokeWidth={1.5} />
                          <span>
                            {dep.departureTime} → {dep.arrivalTime}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5C6F62] pl-5.5 font-mono tabular-nums">
                          {dep.durationMinutes} min ride
                        </p>
                      </div>

                      {dep.hasData && dep.crowding && dep.loadPct !== null ? (
                        <CrowdingBadge level={dep.crowding} loadPct={dep.loadPct} compact />
                      ) : (
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-[#E8F0E4] text-[#5C6F62] border border-[#CFDCC8] whitespace-nowrap">
                          Not enough data
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
