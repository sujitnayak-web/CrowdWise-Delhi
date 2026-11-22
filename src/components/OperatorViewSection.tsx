import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { fetchOperatorHotspots } from '../api/crowdwiseApi';
import { DayType, OperatorHotspotRow, OperatorHourlyPoint } from '../types/transit';
import {
  CROWDING_META,
  formatHour,
  HOURS_RANGE,
} from '../utils/transitUtils';
import { ApiStatusBanner } from './ApiStatusBanner';
import { ConfidenceTag, CrowdingBadge } from './CrowdingBadge';

interface OperatorViewSectionProps {
  dayType: DayType;
  selectedHour: number;
  onChangeDayType: (dayType: DayType) => void;
  onSelectHour: (hour: number) => void;
  onPlanCorridor: (originQuery: string, destinationQuery: string, hour: number) => void;
  standalonePage?: boolean;
}

export function OperatorViewSection({
  dayType,
  selectedHour,
  onChangeDayType,
  onSelectHour,
  onPlanCorridor,
  standalonePage = false,
}: OperatorViewSectionProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [hotspots, setHotspots] = useState<OperatorHotspotRow[]>([]);
  const [hourlyNetwork, setHourlyNetwork] = useState<OperatorHourlyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErrorMsg(null);

    fetchOperatorHotspots(dayType, selectedHour, 25, controller.signal)
      .then((payload) => {
        setHotspots(payload.hotspots);
        setHourlyNetwork(payload.hourlyNetwork);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setHotspots([]);
        setHourlyNetwork([]);
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load operator hotspots.');
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [dayType, selectedHour, retryNonce]);

  const topOverloaded = useMemo(() => hotspots.slice(0, 6), [hotspots]);

  const activeHourStats = useMemo(() => {
    const targetHour = hoveredHour ?? selectedHour;
    if (hourlyNetwork.length > 0) {
      return hourlyNetwork.find((h) => h.hour === targetHour) ?? hourlyNetwork[0];
    }
    const avgLoadPct =
      hotspots.length > 0
        ? Math.round(hotspots.reduce((sum, r) => sum + r.loadPct, 0) / hotspots.length)
        : 0;
    const overloadedCount = hotspots.filter((r) => r.crowding === 'crowded').length;
    return {
      hour: selectedHour,
      avgLoadPct,
      overloadedCount,
      crowding:
        avgLoadPct < 52
          ? ('seats' as const)
          : avgLoadPct < 78
            ? ('standing' as const)
            : ('crowded' as const),
    };
  }, [hourlyNetwork, hoveredHour, selectedHour, hotspots]);

  const tierBreakdown = useMemo(() => {
    const total = Math.max(1, hotspots.length);
    const crowdedCount = hotspots.filter((h) => h.crowding === 'crowded').length;
    const standingCount = hotspots.filter((h) => h.crowding === 'standing').length;
    const seatsCount = hotspots.filter((h) => h.crowding === 'seats').length;
    const mlFallbackCount = hotspots.filter((h) => h.predictionSource === 'ml_fallback').length;
    return [
      { label: 'Crowded corridors', count: crowdedCount, pct: Math.round((crowdedCount / total) * 100), hex: CROWDING_META.crowded.hex },
      { label: 'Standing room corridors', count: standingCount, pct: Math.round((standingCount / total) * 100), hex: CROWDING_META.standing.hex },
      { label: 'Seats available corridors', count: seatsCount, pct: Math.round((seatsCount / total) * 100), hex: CROWDING_META.seats.hex },
      { label: 'ML fallback predicted', count: mlFallbackCount, pct: Math.round((mlFallbackCount / total) * 100), hex: '#4B5B8C' },
    ];
  }, [hotspots]);

  return (
    <section
      id="operator-view"
      aria-labelledby="operator-view-heading"
      className={
        standalonePage
          ? 'py-8 sm:py-10'
          : 'scroll-mt-20 py-14 sm:py-16 border-t border-[#CFDCC8]'
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
        {/* Heading + Day Type Control */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="cw-section-kicker">Operator View</p>
            {standalonePage ? (
              <h1
                id="operator-view-heading"
                className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-[1.08] text-[#14261C]"
              >
                Most overloaded routes and peak hours
              </h1>
            ) : (
              <h2
                id="operator-view-heading"
                className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-[1.08] text-[#14261C]"
              >
                Most overloaded routes and peak hours
              </h2>
            )}
            <p className="text-[15px] sm:text-base text-[#5C6F62] max-w-2xl">
              Fleet-level pressure across DTC and Cluster corridors from ONDC mobile e-ticketing and GTFS schedules to pinpoint standing bottlenecks.
            </p>
          </div>

          <div
            role="group"
            aria-label="Operator view service day"
            className="inline-flex p-1 rounded-[8px] border border-[#CFDCC8] bg-[#F6FAF3] shrink-0 self-start sm:self-auto"
          >
            {(['weekday', 'weekend'] as const).map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => onChangeDayType(dt)}
                aria-pressed={dayType === dt}
                className={`px-3.5 py-1.5 rounded-[6px] text-xs font-medium capitalize transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
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

        {errorMsg && (
          <ApiStatusBanner
            title="Could not load operator hotspots"
            message={errorMsg}
            onRetry={() => setRetryNonce((n) => n + 1)}
          />
        )}

        {/* Charts Grid: Hour Filter / Hourly Profile + Top Overloaded Hotspots */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Card: Hourly Load Chart (or Hour Selector + Hotspot Tier Distribution) */}
          <div className="lg:col-span-7 cw-card p-5 sm:p-6 flex flex-col justify-between space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="cw-section-kicker">Network Load by Hour</p>
                <h3 className="font-display text-lg font-semibold text-[#14261C] mt-1">
                  Inspection window ({formatHour(selectedHour)} · {dayType})
                </h3>
              </div>

              <div className="text-right">
                <div className="font-mono tabular-nums text-sm font-semibold text-[#14261C]">
                  {formatHour(activeHourStats.hour)} · {activeHourStats.avgLoadPct}% avg
                </div>
                <div className="text-xs text-[#5C6F62]">
                  <span className="font-mono tabular-nums font-medium text-[#14261C]">
                    {activeHourStats.overloadedCount}
                  </span>{' '}
                  overloaded hotspots
                </div>
              </div>
            </div>

            {loading ? (
              <div className="h-44 rounded-[8px] bg-[#E8F0E4] animate-pulse" />
            ) : hourlyNetwork.length > 0 ? (
              <div className="space-y-2">
                <div
                  className="grid grid-cols-[repeat(19,minmax(0,1fr))] gap-1.5 items-end h-44 pt-4"
                  role="group"
                  aria-label="Hourly network crowding bar chart"
                >
                  {hourlyNetwork.map((pt, idx) => {
                    const isSelected = pt.hour === selectedHour;
                    const meta = CROWDING_META[pt.crowding];
                    return (
                      <button
                        key={pt.hour}
                        type="button"
                        onClick={() => onSelectHour(pt.hour)}
                        onMouseEnter={() => setHoveredHour(pt.hour)}
                        onMouseLeave={() => setHoveredHour(null)}
                        aria-label={`${formatHour(pt.hour)}: ${pt.avgLoadPct}% network load, ${pt.overloadedCount} overloaded segments`}
                        className={`h-full flex flex-col items-center justify-end rounded-[4px] p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                          isSelected ? 'bg-[#1F4D3A]/10 ring-1 ring-[#1F4D3A]' : 'hover:bg-[#E8F0E4]'
                        }`}
                      >
                        <span
                          className="w-full rounded-[3px] animate-bar-load transition-[height,background-color] duration-200"
                          style={{
                            height: `${Math.max(16, pt.avgLoadPct)}%`,
                            backgroundColor: meta.hex,
                            animationDelay: `${idx * 10}ms`,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-[repeat(19,minmax(0,1fr))] gap-1.5 text-center font-mono tabular-nums text-[10px] text-[#5C6F62]">
                  {hourlyNetwork.map((pt) => (
                    <span
                      key={`op-lbl-${pt.hour}`}
                      className={pt.hour === selectedHour ? 'font-semibold text-[#1F4D3A]' : ''}
                    >
                      {pt.hour % 2 === 1 ? String(pt.hour).padStart(2, '0') : ''}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Interactive Hour Strip */}
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Select inspection hour">
                  {HOURS_RANGE.map((h) => {
                    const active = h === selectedHour;
                    return (
                      <button
                        key={`hr-${h}`}
                        type="button"
                        onClick={() => onSelectHour(h)}
                        className={`px-2 py-1 rounded-[6px] font-mono tabular-nums text-[11px] font-medium border transition-colors ${
                          active
                            ? 'bg-[#1F4D3A] text-[#F6FAF3] border-[#1F4D3A]'
                            : 'bg-[#E8F0E4] text-[#5C6F62] border-[#CFDCC8] hover:text-[#14261C] hover:border-[#1F4D3A]'
                        }`}
                      >
                        {String(h).padStart(2, '0')}:00
                      </button>
                    );
                  })}
                </div>

                {/* Live Hotspot Tier Breakdown */}
                <div className="space-y-3">
                  {tierBreakdown.map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#14261C] font-medium">{item.label}</span>
                        <span className="font-mono tabular-nums text-[#5C6F62]">
                          {item.count} of {hotspots.length} ({item.pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-[4px] bg-[#E8F0E4] overflow-hidden">
                        <div
                          className="h-full rounded-[4px] animate-ribbon-load"
                          style={{ width: `${item.pct}%`, backgroundColor: item.hex }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Horizontal Bar Chart: Top Overloaded Hotspots */}
          <div className="lg:col-span-5 cw-card p-5 sm:p-6 space-y-4">
            <div>
              <p className="cw-section-kicker">Peak Corridor Stress</p>
              <h3 className="font-display text-lg font-semibold text-[#14261C] mt-1">
                Highest-load corridors ({dayType} · {formatHour(selectedHour)})
              </h3>
            </div>

            {loading ? (
              <div className="space-y-3.5 pt-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-1.5 animate-pulse">
                    <div className="h-3.5 w-full rounded bg-[#E8F0E4]" />
                    <div className="h-2.5 w-4/5 rounded bg-[#E8F0E4]" />
                  </div>
                ))}
              </div>
            ) : topOverloaded.length === 0 ? (
              <p className="text-xs text-[#5C6F62] pt-2">
                No hotspot bars available for this filter.
              </p>
            ) : (
              <div className="space-y-3.5 pt-1">
                {topOverloaded.map((row) => {
                  const meta = CROWDING_META[row.crowding];
                  return (
                    <div key={`bar-${row.id}`} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 truncate">
                          <span className="font-mono font-semibold text-[#14261C] mr-1.5">
                            Bus {row.routeCode}
                          </span>
                          <span className="text-[#5C6F62]">{row.busiestStretch}</span>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-[#14261C] shrink-0">
                          {row.loadPct}%
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-[4px] bg-[#E8F0E4] overflow-hidden">
                        <div
                          className="h-full rounded-[4px] animate-ribbon-load"
                          style={{
                            width: `${row.loadPct}%`,
                            backgroundColor: meta.hex,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Full Corridor Overload Table */}
        <div className="cw-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#CFDCC8] flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-[#14261C]">
              Corridor load &amp; ONDC ticket coverage ({hotspots.length} hotspots)
            </h3>
            <span className="text-xs text-[#5C6F62]">
              Sorted by load percentage · Click any route to inspect in Planner
            </span>
          </div>

          {loading ? (
            <div className="p-5 space-y-3 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-[#E8F0E4]" />
              ))}
            </div>
          ) : hotspots.length === 0 ? (
            <div className="p-6 text-sm text-[#5C6F62]">
              No hotspot records returned for {dayType} at {formatHour(selectedHour)}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#CFDCC8] bg-[#E8F0E4]/55 text-[11px] uppercase tracking-[0.08em] font-semibold text-[#5C6F62]">
                    <th className="py-3 px-4 sm:px-5">Route</th>
                    <th className="py-3 px-4">Busiest stretch</th>
                    <th className="py-3 px-4">Hour</th>
                    <th className="py-3 px-4">Crowding</th>
                    <th className="py-3 px-4">Confidence &amp; source</th>
                    <th className="py-3 px-4 sm:px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CFDCC8] text-xs sm:text-[13px]">
                  {hotspots.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-[#E8F0E4]/50 transition-colors duration-200"
                    >
                      <td className="py-3.5 px-4 sm:px-5 whitespace-nowrap">
                        <div className="font-mono font-semibold text-[#14261C]">
                          Bus {row.routeCode}
                        </div>
                        <div className="text-[11px] text-[#5C6F62]">
                          {row.operator} · {row.corridor}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#14261C] whitespace-nowrap">
                        {row.busiestStretch}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#14261C] whitespace-nowrap">
                        {formatHour(row.hour)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <CrowdingBadge level={row.crowding} loadPct={row.loadPct} />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <ConfidenceTag
                          level={row.confidence}
                          ticketCount={row.ticketCount}
                          predictionSource={row.predictionSource}
                        />
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onPlanCorridor(
                              row.originName || row.originId,
                              row.destinationName || row.destinationId,
                              row.hour
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-xs font-medium text-[#1F4D3A] hover:border-[#1F4D3A] hover:bg-[#1F4D3A] hover:text-[#F6FAF3] transition-colors duration-200"
                        >
                          <span>Inspect</span>
                          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
