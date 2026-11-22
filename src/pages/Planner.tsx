import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ApiStatusBanner } from '../components/ApiStatusBanner';
import { CrowdingBadge } from '../components/CrowdingBadge';
import { JourneyCard } from '../components/JourneyCard';
import {
  RouteNumberFields,
  RouteNumberResults,
  RoutePlannerInitialSelection,
  useRouteNumberPlannerState,
} from '../components/RouteNumberPlanner';
import { StopAutocomplete } from '../components/StopAutocomplete';
import { useTransitApp } from '../context/TransitAppContext';
import { DayType, PreferenceMode } from '../types/transit';
import { RouteDirection } from '../utils/routePlannerUtils';
import {
  formatHour,
  HOURS_RANGE,
  MAX_HOUR,
  MIN_HOUR,
  POPULAR_CORRIDOR_PRESETS,
} from '../utils/transitUtils';

type PlannerMode = 'destination' | 'route';

export function Planner() {
  const {
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
    selectedJourney,
    setSelectedJourneyId,
    setFocusedMapRouteCode,
    handleSwapStops,
    handleShowJourneyOnMap,
    handleShowRouteOnMap,
    handleSelectCorridor,
  } = useTransitApp();

  const [searchParams, setSearchParams] = useSearchParams();
  const originInputRef = useRef<HTMLInputElement | null>(null);
  const routeResultsAnchorRef = useRef<HTMLDivElement | null>(null);

  const urlMode = searchParams.get('mode') === 'route' ? 'route' : 'destination';
  const [mode, setMode] = useState<PlannerMode>(urlMode);

  // Sync mode + filters when arriving via URL (e.g. Crowd Map "Plan this corridor" or shared URL refresh)
  const initialSelection = useMemo<RoutePlannerInitialSelection>(() => {
    const rawDir = searchParams.get('dir');
    const dir: RouteDirection | undefined =
      rawDir && /up/i.test(rawDir)
        ? 'Up'
        : rawDir && /down/i.test(rawDir)
          ? 'Down'
          : undefined;
    return {
      routeQuery: searchParams.get('route') ?? undefined,
      direction: dir,
      boardingStopId: searchParams.get('from') ?? undefined,
      alightingStopId: searchParams.get('to') ?? undefined,
    };
  }, [searchParams]);

  const appliedUrlKeyRef = useRef<string>('');
  const lastSyncedRef = useRef<{
    mode: PlannerMode;
    departureTime: string;
    dayType: DayType;
    preference: PreferenceMode;
  }>({
    mode: urlMode,
    departureTime,
    dayType,
    preference,
  });

  useEffect(() => {
    const rawKey = searchParams.toString();
    if (!rawKey || appliedUrlKeyRef.current === rawKey) return;
    appliedUrlKeyRef.current = rawKey;

    const paramMode = searchParams.get('mode');
    const paramDay = searchParams.get('day');
    const paramTime = searchParams.get('time');
    const paramPref = searchParams.get('pref');

    const nextMode: PlannerMode =
      paramMode === 'route' ? 'route' : paramMode === 'destination' ? 'destination' : lastSyncedRef.current.mode;
    const nextDay: DayType =
      paramDay === 'weekday' || paramDay === 'weekend' ? (paramDay as DayType) : lastSyncedRef.current.dayType;
    const nextTime =
      paramTime && /^\d{2}:\d{2}$/.test(paramTime) ? paramTime : lastSyncedRef.current.departureTime;
    const nextPref: PreferenceMode =
      paramPref === 'comfortable' || paramPref === 'fastest'
        ? (paramPref as PreferenceMode)
        : lastSyncedRef.current.preference;

    lastSyncedRef.current = {
      mode: nextMode,
      departureTime: nextTime,
      dayType: nextDay,
      preference: nextPref,
    };

    if (paramMode === 'route' || paramMode === 'destination') {
      setMode(paramMode);
    }
    if (paramDay === 'weekday' || paramDay === 'weekend') {
      setDayType(paramDay as DayType);
    }
    if (paramTime && /^\d{2}:\d{2}$/.test(paramTime)) {
      setDepartureTime(paramTime);
    }
    if (paramPref === 'comfortable' || paramPref === 'fastest') {
      setPreference(paramPref as PreferenceMode);
    }
  }, [searchParams, setDayType, setDepartureTime, setPreference]);

  const handleRouteParamsChange = useCallback(
    (next: { route: string; dir: string; from: string; to: string }) => {
      if (mode !== 'route') return;
      setSearchParams(
        (prev) => {
          const curRoute = prev.get('route') || '';
          const curDir = prev.get('dir') || '';
          const curFrom = prev.get('from') || '';
          const curTo = prev.get('to') || '';
          const curMode = prev.get('mode') || '';
          const curTime = prev.get('time') || '';
          const curDay = prev.get('day') || '';
          const curPref = prev.get('pref') || '';

          if (
            curMode === 'route' &&
            curRoute === next.route &&
            curDir === next.dir &&
            curFrom === next.from &&
            curTo === next.to &&
            curTime === departureTime &&
            curDay === dayType &&
            curPref === preference
          ) {
            return prev;
          }

          const updated = new URLSearchParams();
          updated.set('mode', 'route');
          if (next.route) updated.set('route', next.route);
          if (next.dir) updated.set('dir', next.dir);
          if (next.from) updated.set('from', next.from);
          if (next.to) updated.set('to', next.to);
          updated.set('time', departureTime);
          updated.set('day', dayType);
          updated.set('pref', preference);
          appliedUrlKeyRef.current = updated.toString();
          return updated;
        },
        { replace: true }
      );
    },
    [mode, departureTime, dayType, preference, setSearchParams]
  );

  // Sync mode, time, dayType, and preference into URL ONLY when user edits one of those 4 fields
  useEffect(() => {
    const prevSynced = lastSyncedRef.current;
    if (
      prevSynced.mode === mode &&
      prevSynced.departureTime === departureTime &&
      prevSynced.dayType === dayType &&
      prevSynced.preference === preference
    ) {
      return;
    }
    lastSyncedRef.current = { mode, departureTime, dayType, preference };

    setSearchParams(
      (prev) => {
        if (mode === 'destination' && !prev.toString()) {
          return prev;
        }
        const updated = new URLSearchParams(prev);
        updated.set('mode', mode);
        updated.set('time', departureTime);
        updated.set('day', dayType);
        updated.set('pref', preference);
        if (mode === 'destination') {
          updated.delete('route');
          updated.delete('dir');
          updated.delete('from');
          updated.delete('to');
        }
        const nextStr = updated.toString();
        if (nextStr === prev.toString()) {
          return prev;
        }
        appliedUrlKeyRef.current = nextStr;
        return updated;
      },
      { replace: true }
    );
  }, [mode, departureTime, dayType, preference, setSearchParams]);

  const routeState = useRouteNumberPlannerState({
    enabled: mode === 'route',
    dayType,
    departureTime,
    departureHour,
    preference,
    initialSelection,
    onRouteParamsChange: handleRouteParamsChange,
  });

  const timeSelectOptions = useMemo(() => {
    const base = HOURS_RANGE.map((h) => formatHour(h));
    if (!base.includes(departureTime)) {
      return [...base, departureTime].sort();
    }
    return base;
  }, [departureTime]);

  const isSameStop =
    originStop.id === destStop.id &&
    originStop.name.toLowerCase() === destStop.name.toLowerCase();

  return (
    <section
      id="planner"
      aria-labelledby="planner-page-heading"
      className="py-8 sm:py-10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
        {/* Page Heading & Crowding Key */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <p className="cw-section-kicker">Journey Planner</p>
            <h1
              id="planner-page-heading"
              className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-[1.08] text-[#14261C]"
            >
              Pick a bus you can actually sit in
            </h1>
            <p className="text-[15px] sm:text-base text-[#5C6F62] leading-[1.5]">
              Compare Delhi DTC and Cluster routes by real carriage load from ONDC e-ticketing data before stepping out to the stop.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <CrowdingBadge level="seats" />
            <CrowdingBadge level="standing" />
            <CrowdingBadge level="crowded" />
          </div>
        </div>

        {/* Trip Search Form */}
        <div
          role="search"
          aria-label="Delhi bus trip search"
          className="cw-card p-5 sm:p-6 space-y-5"
        >
          {/* Mode Switch: By destination (default) | By route number */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#CFDCC8]">
            <div
              role="group"
              aria-label="Planner search mode"
              className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto items-center p-1 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4]"
            >
              {(
                [
                  { id: 'destination', label: 'By destination' },
                  { id: 'route', label: 'By route number' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  aria-pressed={mode === opt.id}
                  className={`px-3.5 py-2 sm:py-1.5 rounded-[6px] text-xs font-medium whitespace-nowrap text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                    mode === opt.id
                      ? 'bg-[#1F4D3A] text-[#F6FAF3]'
                      : 'text-[#5C6F62] hover:text-[#14261C]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <span className="text-xs text-[#5C6F62]">
              {mode === 'destination'
                ? 'Find direct or 1-change buses between any two stops'
                : 'Inspect crowding along a specific DTC or Cluster bus route'}
            </span>
          </div>

          {/* Mode-Specific Primary Inputs */}
          {mode === 'destination' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
              <div className="md:col-span-4">
                <StopAutocomplete
                  id="from-stop-input"
                  label="From"
                  placeholder="Search origin stop (e.g. Anand Vihar)"
                  selectedStop={originStop}
                  onSelect={setOriginStop}
                  inputRef={originInputRef}
                />
              </div>

              <div className="md:col-span-1 flex justify-start md:justify-center">
                <button
                  type="button"
                  onClick={handleSwapStops}
                  aria-label="Swap From and To bus stops"
                  className="h-10 md:h-11 w-full md:w-11 inline-flex items-center justify-center rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-[#14261C] hover:border-[#1F4D3A] hover:text-[#1F4D3A] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
                >
                  <ArrowLeftRight className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              <div className="md:col-span-4">
                <StopAutocomplete
                  id="to-stop-input"
                  label="To"
                  placeholder="Search destination stop (e.g. Connaught Place)"
                  selectedStop={destStop}
                  onSelect={setDestStop}
                />
              </div>

              {/* Shared Departure Time */}
              <div className="md:col-span-3">
                <label htmlFor="trip-time-select" className="block cw-section-kicker mb-2">
                  Time
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setDepartureTime(formatHour(Math.max(MIN_HOUR, departureHour - 1)))
                    }
                    disabled={departureHour <= MIN_HOUR}
                    aria-label="Earlier hour"
                    className="h-11 w-10 shrink-0 inline-flex items-center justify-center rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-[#14261C] hover:border-[#1F4D3A] hover:text-[#1F4D3A] disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <select
                    id="trip-time-select"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="flex-1 h-11 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] px-3 text-sm sm:text-[15px] font-mono tabular-nums font-medium text-[#14261C] hover:border-[#5C6F62] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 focus-visible:border-[#1F4D3A] transition-colors"
                  >
                    {timeSelectOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setDepartureTime(formatHour(Math.min(MAX_HOUR, departureHour + 1)))
                    }
                    disabled={departureHour >= MAX_HOUR}
                    aria-label="Later hour"
                    className="h-11 w-10 shrink-0 inline-flex items-center justify-center rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-[#14261C] hover:border-[#1F4D3A] hover:text-[#1F4D3A] disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <RouteNumberFields
              catalog={routeState.catalog}
              catalogLoading={routeState.catalogLoading}
              catalogError={routeState.catalogError}
              onRetryCatalog={routeState.retryCatalog}
              selectedRoute={routeState.selectedRoute}
              direction={routeState.direction}
              stops={routeState.stops}
              stopsLoading={routeState.stopsLoading}
              boardingStopId={routeState.boardingStopId}
              alightingStopId={routeState.alightingStopId}
              stopValidationError={
                routeState.stops.length > 0 ? routeState.stopValidation.error : null
              }
              onSelectRoute={routeState.selectRouteEntry}
              onChangeDirection={routeState.changeDirection}
              onChangeBoardingStop={routeState.changeBoardingStop}
              onChangeAlightingStop={routeState.changeAlightingStop}
            />
          )}

          {/* Bottom Bar: Shared Departure Time (in route mode) / Popular Chips + Day Type + Fastest/Comfortable Toggle */}
          <div className="pt-4 border-t border-[#CFDCC8] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            {mode === 'destination' ? (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-[#5C6F62]">
                <span className="cw-section-kicker mr-1">Popular</span>
                {POPULAR_CORRIDOR_PRESETS.map((corridor, idx) => {
                  const active =
                    originStop.name.toLowerCase().includes(corridor.originQuery.toLowerCase()) &&
                    destStop.name
                      .toLowerCase()
                      .includes(corridor.destinationQuery.toLowerCase());
                  return (
                    <span key={corridor.label} className="inline-flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectCorridor(
                            corridor.originQuery,
                            corridor.destinationQuery,
                            undefined,
                            corridor.originFallbackQuery,
                            corridor.destinationFallbackQuery
                          )
                        }
                        className={`whitespace-nowrap hover:text-[#1F4D3A] transition-colors rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                          active ? 'text-[#1F4D3A] font-semibold underline underline-offset-4' : ''
                        }`}
                      >
                        {corridor.label}
                      </button>
                      {idx < POPULAR_CORRIDOR_PRESETS.length - 1 && (
                        <span aria-hidden="true" className="text-[#CFDCC8]">
                          ·
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            ) : (
              /* In route mode: shared Departure Time inline alongside controls */
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <label htmlFor="trip-time-select" className="cw-section-kicker shrink-0">
                  Time
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setDepartureTime(formatHour(Math.max(MIN_HOUR, departureHour - 1)))
                    }
                    disabled={departureHour <= MIN_HOUR}
                    aria-label="Earlier hour"
                    className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-[#14261C] hover:border-[#1F4D3A] hover:text-[#1F4D3A] disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <select
                    id="trip-time-select"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="h-9 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] px-3 text-sm font-mono tabular-nums font-medium text-[#14261C] hover:border-[#5C6F62] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 focus-visible:border-[#1F4D3A] transition-colors"
                  >
                    {timeSelectOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setDepartureTime(formatHour(Math.min(MAX_HOUR, departureHour + 1)))
                    }
                    disabled={departureHour >= MAX_HOUR}
                    aria-label="Later hour"
                    className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-[#14261C] hover:border-[#1F4D3A] hover:text-[#1F4D3A] disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            )}

            {/* Shared Day Type + Fastest/Comfortable + Plan journey button (route mode) */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div
                role="group"
                aria-label="Day type"
                className="inline-flex items-center p-1 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4]"
              >
                {(['weekday', 'weekend'] as const).map((dt) => (
                  <button
                    key={dt}
                    type="button"
                    onClick={() => setDayType(dt)}
                    aria-pressed={dayType === dt}
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-medium capitalize whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                      dayType === dt
                        ? 'bg-[#F6FAF3] text-[#14261C] shadow-[0_1px_2px_rgba(20,38,28,0.06)]'
                        : 'text-[#5C6F62] hover:text-[#14261C]'
                    }`}
                  >
                    {dt}
                  </button>
                ))}
              </div>

              <div
                role="group"
                aria-label="Route preference"
                className="inline-flex items-center p-1 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4]"
              >
                {(
                  [
                    { id: 'comfortable', label: 'Comfortable' },
                    { id: 'fastest', label: 'Fastest' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPreference(opt.id)}
                    aria-pressed={preference === opt.id}
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                      preference === opt.id
                        ? 'bg-[#1F4D3A] text-[#F6FAF3]'
                        : 'text-[#5C6F62] hover:text-[#14261C]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {mode === 'route' && (
                <button
                  type="button"
                  data-testid="plan-route-journey-btn"
                  disabled={
                    !routeState.selectedRoute ||
                    routeState.stopsLoading ||
                    Boolean(routeState.stopValidation.error)
                  }
                  onClick={() => {
                    routeResultsAnchorRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'nearest',
                    });
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-[8px] bg-[#1F4D3A] hover:bg-[#173B2D] disabled:opacity-50 disabled:cursor-not-allowed text-[#F6FAF3] text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
                >
                  Plan journey
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RESULTS AREA */}
        {mode === 'destination' ? (
          <div id="planner-results" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="cw-section-kicker">
                Planner Results ·{' '}
                <span className="font-mono tabular-nums text-[#14261C]">
                  {planLoading ? '…' : journeys.length}
                </span>{' '}
                {journeys.length === 1 ? 'option' : 'options'} ({originStop.shortName} →{' '}
                {destStop.shortName})
              </p>
              <span className="font-mono tabular-nums text-xs text-[#5C6F62]">
                {dayType === 'weekday' ? 'Weekday' : 'Weekend'} · {departureTime} ·{' '}
                {preference === 'comfortable'
                  ? 'Sorted by comfort'
                  : 'Sorted by travel time'}
              </span>
            </div>

            {planError && (
              <ApiStatusBanner
                title="Could not fetch journey options"
                message={planError}
                onRetry={retryPlan}
              />
            )}

            {isSameStop ? (
              <div className="cw-card p-6 space-y-3">
                <h2 className="font-display text-lg font-semibold text-[#14261C]">
                  Choose two different stops
                </h2>
                <p className="text-sm text-[#5C6F62]">
                  Origin and destination are both set to {originStop.name}. Pick another destination stop to view Delhi bus options and carriage crowding.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectCorridor(
                      'Anand Vihar',
                      'Connaught Place',
                      8,
                      undefined,
                      'Shivaji Stadium'
                    )
                  }
                  className="px-4 py-2 rounded-[8px] bg-[#1F4D3A] hover:bg-[#173B2D] text-[#F6FAF3] text-xs font-medium transition-colors"
                >
                  Load Anand Vihar → Connaught Pl.
                </button>
              </div>
            ) : planLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="cw-card p-6 space-y-4">
                    <div className="flex justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="h-5 w-40 rounded bg-[#E8F0E4]" />
                        <div className="h-3.5 w-3/4 rounded bg-[#E8F0E4]" />
                        <div className="h-3 w-44 rounded bg-[#E8F0E4]" />
                      </div>
                      <div className="h-6 w-28 rounded-full bg-[#E8F0E4]" />
                    </div>
                    <div className="h-3 w-full rounded bg-[#E8F0E4]" />
                    <div className="h-8 w-full rounded bg-[#E8F0E4]" />
                  </div>
                ))}
              </div>
            ) : !planError && journeys.length === 0 ? (
              <div className="cw-card p-6 space-y-2">
                <h2 className="font-display text-lg font-semibold text-[#14261C]">
                  No matching bus routes found
                </h2>
                <p className="text-sm text-[#5C6F62]">
                  No routes were returned between {originStop.name} and {destStop.name} at {departureTime}. Try one of the popular corridors above or search nearby GTFS stops.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {journeys.map((journey, idx) => (
                  <JourneyCard
                    key={journey.id}
                    journey={journey}
                    index={idx}
                    isSelected={selectedJourney?.id === journey.id}
                    onSelect={(j) => {
                      setSelectedJourneyId(j.id);
                      if (j.legs[0]) setFocusedMapRouteCode(j.legs[0].routeCode);
                    }}
                    onShowOnMap={handleShowJourneyOnMap}
                    onSelectTime={(t) => setDepartureTime(t)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div ref={routeResultsAnchorRef}>
            <RouteNumberResults
              selectedRoute={routeState.selectedRoute}
              stops={routeState.stops}
              catalogLoading={routeState.catalogLoading}
              stopsLoading={routeState.stopsLoading}
              hourlyLoading={routeState.hourlyLoading}
              hourlyError={routeState.hourlyError}
              onRetryHourly={routeState.retryHourly}
              stopValidation={routeState.stopValidation}
              operatingStatus={routeState.operatingStatus}
              stretchSummary={routeState.stretchSummary}
              timeline={routeState.timeline}
              departures={routeState.departures}
              nextBest={routeState.nextBest}
              dayType={dayType}
              departureTime={departureTime}
              departureHour={departureHour}
              preference={preference}
              onChangeDepartureTime={setDepartureTime}
              onViewRouteOnMap={handleShowRouteOnMap}
            />
          </div>
        )}
      </div>
    </section>
  );
}
