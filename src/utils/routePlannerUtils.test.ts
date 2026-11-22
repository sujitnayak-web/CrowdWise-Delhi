import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRouteSummary, BusStop, RouteCrowdDetail } from '../types/transit';
import {
  buildHourlyStretchTimeline,
  buildSelectableRouteCatalog,
  buildUpcomingDepartures,
  computeStretchSummary,
  doesRouteOperateAtHour,
  filterRouteCatalog,
  findPairedDirectionRoute,
  formatClock12h,
  parseRouteCodeAndDirection,
  validateStopSelection,
} from './routePlannerUtils';

function makeStop(id: string, name: string, lat = 28.61, lng = 77.21): BusStop {
  return { id, name, shortName: name, lat, lng, routes: ['85'] };
}

function makeRoute(overrides: Partial<ApiRouteSummary> = {}): ApiRouteSummary {
  return {
    routeId: '2340',
    routeCode: '85DOWN',
    routeName: 'Punjabi Bagh to ISBT Anand Vihar',
    operator: 'DTC / Cluster',
    corridorLabel: 'Punjabi Bagh – Anand Vihar',
    originId: 's1',
    destinationId: 's3',
    originName: 'Punjabi Bagh',
    destinationName: 'Anand Vihar',
    headwayMinutes: 12,
    tripsPerDay: 110,
    stopsCount: 3,
    coordinates: [],
    stops: [makeStop('s1', 'Punjabi Bagh'), makeStop('s2', 'ITO'), makeStop('s3', 'Anand Vihar')],
    ...overrides,
  };
}

test('parseRouteCodeAndDirection strips raw UP/DOWN suffix into clean label', () => {
  assert.deepEqual(parseRouteCodeAndDirection('85DOWN'), {
    baseCode: '85',
    direction: 'Down',
    displayLabel: '85 Down',
  });
  assert.deepEqual(parseRouteCodeAndDirection('85UP'), {
    baseCode: '85',
    direction: 'Up',
    displayLabel: '85 Up',
  });
  assert.deepEqual(parseRouteCodeAndDirection('185STL-BBM-1UP'), {
    baseCode: '185STL-BBM-1',
    direction: 'Up',
    displayLabel: '185STL-BBM-1 Up',
  });
});

test('buildSelectableRouteCatalog deduplicates routes and pairs Up/Down cleanly', () => {
  const catalog = buildSelectableRouteCatalog([
    makeRoute({ routeId: '2340', routeCode: '85DOWN', tripsPerDay: 117 }),
    makeRoute({ routeId: '2340-dup', routeCode: '85DOWN', tripsPerDay: 20 }),
    makeRoute({ routeId: '2343', routeCode: '85UP', tripsPerDay: 126 }),
    makeRoute({ routeId: 'empty', routeCode: '999UP', tripsPerDay: 0 }),
  ]);

  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].displayLabel, '85 Down');
  assert.equal(catalog[0].routeId, '2340');
  assert.equal(catalog[1].displayLabel, '85 Up');

  assert.equal(findPairedDirectionRoute(catalog, '85', 'Up')?.routeId, '2343');
  assert.equal(filterRouteCatalog(catalog, '85').length, 2);
});

test('validateStopSelection catches same or reversed boarding/alighting stops', () => {
  const stops = [makeStop('s1', 'A'), makeStop('s2', 'B'), makeStop('s3', 'C')];
  assert.equal(validateStopSelection(stops, 's1', 's3').valid, true);
  assert.equal(validateStopSelection(stops, 's2', 's2').valid, false);
  assert.equal(validateStopSelection(stops, 's3', 's1').valid, false);
  assert.equal(validateStopSelection(stops, 's3', 's3').valid, false);
});

test('computeStretchSummary calculates stretch load and hides 0% as no valid data', () => {
  const stops = [makeStop('s1', 'A'), makeStop('s2', 'B'), makeStop('s3', 'C')];
  const detail: RouteCrowdDetail = {
    routeId: '2340',
    routeCode: '85DOWN',
    routeName: 'A to C',
    operator: 'DTC',
    corridorLabel: 'A – C',
    loadPct: 80,
    crowding: 'crowded',
    confidence: 'High',
    ticketCount: 300,
    predictionSource: 'observed_tickets',
    coordinates: [],
    stops,
    segments: [
      {
        id: 'seg-0',
        fromName: 'A',
        toName: 'B',
        loadPct: 60,
        crowding: 'standing',
        confidence: 'High',
        ticketCount: 120,
        predictionSource: 'observed_tickets',
        coordinates: [],
      },
      {
        id: 'seg-1',
        fromName: 'B',
        toName: 'C',
        loadPct: 68,
        crowding: 'standing',
        confidence: 'High',
        ticketCount: 180,
        predictionSource: 'observed_tickets',
        coordinates: [],
      },
    ],
  };

  const stretch = computeStretchSummary({
    detail,
    stops,
    boardingIndex: 0,
    alightingIndex: 2,
  });
  assert.equal(stretch.hasData, true);
  assert.equal(stretch.loadPct, 64);
  assert.equal(stretch.crowding, 'standing');
  assert.equal(stretch.segments.length, 2);

  // Zero-ticket route_average must report hasData: false (never 0% full)
  const emptyStretch = computeStretchSummary({
    detail: {
      ...detail,
      loadPct: 0,
      ticketCount: 0,
      predictionSource: 'route_average',
      segments: detail.segments.map((s) => ({ ...s, loadPct: 0, ticketCount: 0 })),
    },
    stops,
    boardingIndex: 0,
    alightingIndex: 2,
  });
  assert.equal(emptyStretch.hasData, false);
  assert.equal(emptyStretch.loadPct, null);
});

test('doesRouteOperateAtHour flags inactive Night Special hours and suggests nearest active hour', () => {
  const emptyDay: RouteCrowdDetail = {
    routeId: '3333',
    routeCode: '0118(NS)DOWN',
    routeName: 'Night Route',
    operator: 'DTC',
    corridorLabel: 'A – B',
    loadPct: 14,
    crowding: 'seats',
    confidence: 'Low',
    ticketCount: 0,
    predictionSource: 'route_average',
    coordinates: [],
    stops: [],
    segments: [],
  };
  const activeNight: RouteCrowdDetail = {
    ...emptyDay,
    loadPct: 27,
    ticketCount: 6,
    predictionSource: 'ml_fallback',
  };
  const hourlyMap: Record<number, RouteCrowdDetail> = {
    8: emptyDay,
    22: activeNight,
    23: activeNight,
  };
  const check = doesRouteOperateAtHour({
    routeCode: '0118(NS)DOWN',
    tripsPerDay: 1,
    detail: hourlyMap[8],
    hourlyMap,
    hour: 8,
  });
  assert.equal(check.runsAtHour, false);
  assert.equal(check.nearestActiveHour, 22);
});

test('buildUpcomingDepartures finds calmer departure within 60 minutes and sorts by preference', () => {
  const stops = [makeStop('s1', 'A'), makeStop('s2', 'B')];
  const makeDetail = (loadPct: number): RouteCrowdDetail => ({
    routeId: '2340',
    routeCode: '85DOWN',
    routeName: 'A to B',
    operator: 'DTC',
    corridorLabel: 'A – B',
    loadPct,
    crowding: loadPct < 52 ? 'seats' : loadPct < 78 ? 'standing' : 'crowded',
    confidence: 'High',
    ticketCount: 150,
    predictionSource: 'observed_tickets',
    coordinates: [],
    stops,
    segments: [
      {
        id: 'seg-0',
        fromName: 'A',
        toName: 'B',
        loadPct,
        crowding: loadPct < 52 ? 'seats' : loadPct < 78 ? 'standing' : 'crowded',
        confidence: 'High',
        ticketCount: 150,
        predictionSource: 'observed_tickets',
        coordinates: [],
      },
    ],
  });

  const hourlyMap: Record<number, RouteCrowdDetail> = {
    18: makeDetail(86), // crowded at 6 PM
    19: makeDetail(38), // seats available at 7 PM
    20: makeDetail(30),
  };

  const timeline = buildHourlyStretchTimeline({
    hourlyMap,
    stops,
    boardingIndex: 0,
    alightingIndex: 1,
    routeCode: '85DOWN',
    tripsPerDay: 90,
  });

  const { departures, nextBest } = buildUpcomingDepartures({
    departureTime: '18:30',
    dayType: 'weekday',
    boardingIndex: 0,
    travelMinutes: 25,
    timeline,
    tripsPerDay: 90,
    headwayMinutes: 20,
    preference: 'comfortable',
  });

  assert.equal(formatClock12h(19 * 60 + 20), '7:20 PM');
  assert.ok(nextBest !== null);
  assert.equal(nextBest?.crowding, 'seats');
  assert.ok((nextBest?.minutesAhead ?? 999) <= 60);
  // Comfortable puts lower loadPct departures first
  assert.ok((departures[0]?.loadPct ?? 100) <= (departures[departures.length - 1]?.loadPct ?? 100));
});
