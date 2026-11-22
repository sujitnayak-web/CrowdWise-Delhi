import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { planJourneys, searchStops } from '../api/crowdwiseApi';
import { BusStop, DayType, JourneyOption, PreferenceMode } from '../types/transit';
import { RouteDirection } from '../utils/routePlannerUtils';
import { APP_PATHS } from '../utils/routesConfig';
import {
  formatHour,
  MAX_HOUR,
  MIN_HOUR,
  parseTimeToMinutes,
  shortenStopName,
} from '../utils/transitUtils';

export interface RouteCorridorNavOptions {
  mode?: 'route' | 'destination';
  routeCode?: string;
  direction?: RouteDirection;
  firstStopId?: string;
  lastStopId?: string;
}

function makeFallbackStop(name: string): BusStop {
  return {
    id: name,
    name,
    shortName: shortenStopName(name),
    lat: 0,
    lng: 0,
    routes: [],
  };
}

async function resolveStopFromApi(
  primaryQuery: string,
  fallbackQuery?: string,
  signal?: AbortSignal
): Promise<BusStop> {
  try {
    const primary = await searchStops(primaryQuery, 5, signal);
    if (primary.length > 0) return primary[0];
    if (fallbackQuery) {
      const secondary = await searchStops(fallbackQuery, 5, signal);
      if (secondary.length > 0) return secondary[0];
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
  }
  return makeFallbackStop(primaryQuery);
}

interface TransitAppContextValue {
  originStop: BusStop;
  destStop: BusStop;
  setOriginStop: (stop: BusStop) => void;
  setDestStop: (stop: BusStop) => void;
  dayType: DayType;
  setDayType: (dayType: DayType) => void;
  departureTime: string;
  setDepartureTime: (time: string) => void;
  departureHour: number;
  preference: PreferenceMode;
  setPreference: (pref: PreferenceMode) => void;
  journeys: JourneyOption[];
  planLoading: boolean;
  planError: string | null;
  retryPlan: () => void;
  selectedJourneyId: string | null;
  setSelectedJourneyId: (id: string | null) => void;
  selectedJourney: JourneyOption | null;
  focusedMapRouteCode: string | null;
  setFocusedMapRouteCode: (code: string | null) => void;
  gmpQuotaExceeded: boolean;
  handleSwapStops: () => void;
  handleShowJourneyOnMap: (journey: JourneyOption) => void;
  handleShowRouteOnMap: (routeId: string) => void;
  handleSelectCorridor: (
    originQuery: string,
    destinationQuery: string,
    hour?: number,
    originFallback?: string,
    destFallback?: string,
    routeNav?: RouteCorridorNavOptions
  ) => Promise<void>;
}

const TransitAppContext = createContext<TransitAppContextValue | null>(null);

export function TransitAppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const [originStop, setOriginStop] = useState<BusStop>(() => makeFallbackStop('Anand Vihar'));
  const [destStop, setDestStop] = useState<BusStop>(() => makeFallbackStop('Connaught Place'));
  const [stopsBootstrapped, setStopsBootstrapped] = useState(false);

  const [dayType, setDayType] = useState<DayType>('weekday');
  const [departureTime, setDepartureTime] = useState<string>('08:00');
  const [preference, setPreference] = useState<PreferenceMode>('comfortable');

  const [journeys, setJourneys] = useState<JourneyOption[]>([]);
  const [planLoading, setPlanLoading] = useState<boolean>(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planRetryNonce, setPlanRetryNonce] = useState<number>(0);

  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [focusedMapRouteCode, setFocusedMapRouteCode] = useState<string | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const departureHour = useMemo(() => {
    const mins = parseTimeToMinutes(departureTime);
    if (mins === null) return 8;
    return Math.min(MAX_HOUR, Math.max(MIN_HOUR, Math.floor(mins / 60)));
  }, [departureTime]);

  // Bootstrap default origin/destination stop IDs from live GET /api/stops on first load
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      resolveStopFromApi('Anand Vihar', undefined, controller.signal),
      resolveStopFromApi('Connaught Place', 'Shivaji Stadium', controller.signal),
    ])
      .then(([orig, dest]) => {
        setOriginStop(orig);
        setDestStop(dest);
      })
      .catch(() => {
        // Handled cleanly when /api/plan runs
      })
      .finally(() => {
        setStopsBootstrapped(true);
      });

    return () => controller.abort();
  }, []);

  // Fetch live journey plans whenever origin, destination, time, dayType, or preference changes
  useEffect(() => {
    if (!stopsBootstrapped) return;
    if (originStop.id === destStop.id && originStop.name === destStop.name) {
      setJourneys([]);
      setPlanLoading(false);
      setPlanError(null);
      return;
    }

    const controller = new AbortController();
    setPlanLoading(true);
    setPlanError(null);

    planJourneys(
      {
        origin: originStop.name || originStop.id,
        destination: destStop.name || destStop.id,
        time: departureTime,
        dayType,
        preference,
      },
      controller.signal
    )
      .then((results) => {
        setJourneys(results);
        setSelectedJourneyId((prev) =>
          prev && results.some((r) => r.id === prev) ? prev : results[0]?.id ?? null
        );
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setJourneys([]);
        setPlanError(err instanceof Error ? err.message : 'Unable to fetch bus journey plans.');
      })
      .finally(() => {
        setPlanLoading(false);
      });

    return () => controller.abort();
  }, [
    stopsBootstrapped,
    originStop,
    destStop,
    departureTime,
    dayType,
    preference,
    planRetryNonce,
  ]);

  const selectedJourney = useMemo(
    () => journeys.find((j) => j.id === selectedJourneyId) ?? journeys[0] ?? null,
    [journeys, selectedJourneyId]
  );

  const retryPlan = useCallback(() => {
    setPlanRetryNonce((n) => n + 1);
  }, []);

  const handleSwapStops = useCallback(() => {
    setOriginStop(destStop);
    setDestStop(originStop);
  }, [originStop, destStop]);

  const handleShowJourneyOnMap = useCallback(
    (journey: JourneyOption) => {
      setSelectedJourneyId(journey.id);
      if (journey.legs[0]) {
        setFocusedMapRouteCode(journey.legs[0].routeCode);
      }
      navigate(APP_PATHS.CROWD_MAP);
    },
    [navigate]
  );

  const handleShowRouteOnMap = useCallback(
    (routeId: string) => {
      setFocusedMapRouteCode(routeId);
      navigate(APP_PATHS.CROWD_MAP);
    },
    [navigate]
  );

  const handleSelectCorridor = useCallback(
    async (
      originQuery: string,
      destinationQuery: string,
      hour?: number,
      originFallback?: string,
      destFallback?: string,
      routeNav?: RouteCorridorNavOptions
    ) => {
      if (typeof hour === 'number') {
        setDepartureTime(formatHour(hour));
      }
      setOriginStop(makeFallbackStop(originQuery));
      setDestStop(makeFallbackStop(destinationQuery));

      if (routeNav?.mode === 'route' && routeNav.routeCode) {
        const qs = new URLSearchParams();
        qs.set('mode', 'route');
        qs.set('route', routeNav.routeCode);
        if (routeNav.direction) qs.set('dir', routeNav.direction.toLowerCase());
        if (routeNav.firstStopId) qs.set('from', routeNav.firstStopId);
        if (routeNav.lastStopId) qs.set('to', routeNav.lastStopId);
        qs.set('day', dayType);
        qs.set('time', typeof hour === 'number' ? formatHour(hour) : departureTime);
        navigate(`${APP_PATHS.PLANNER}?${qs.toString()}`);
      } else {
        navigate(APP_PATHS.PLANNER);
      }

      const [orig, dest] = await Promise.all([
        resolveStopFromApi(originQuery, originFallback),
        resolveStopFromApi(destinationQuery, destFallback),
      ]);
      if (orig.id !== originQuery || orig.lat !== 0) {
        setOriginStop(orig);
      }
      if (dest.id !== destinationQuery || dest.lat !== 0) {
        setDestStop(dest);
      }
    },
    [navigate, dayType, departureTime]
  );

  const value: TransitAppContextValue = {
    originStop,
    destStop,
    setOriginStop,
    setDestStop,
    dayType,
    setDayType,
    departureTime,
    setDepartureTime,
    departureHour,
    preference,
    setPreference,
    journeys,
    planLoading,
    planError,
    retryPlan,
    selectedJourneyId,
    setSelectedJourneyId,
    selectedJourney,
    focusedMapRouteCode,
    setFocusedMapRouteCode,
    gmpQuotaExceeded,
    handleSwapStops,
    handleShowJourneyOnMap,
    handleShowRouteOnMap,
    handleSelectCorridor,
  };

  return <TransitAppContext.Provider value={value}>{children}</TransitAppContext.Provider>;
}

export function useTransitApp(): TransitAppContextValue {
  const ctx = useContext(TransitAppContext);
  if (!ctx) {
    throw new Error('useTransitApp must be used inside TransitAppProvider');
  }
  return ctx;
}
