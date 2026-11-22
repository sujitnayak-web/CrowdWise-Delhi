import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRouteSummary, OperatorHotspotRow, RouteCrowdDetail } from '../types/transit';
import {
  buildSimplifiedMapRenderData,
  computeBounds,
  DEFAULT_ROUTE_LINE_HEX,
  filterRankedRoutes,
  formatCapacityLabel,
  formatRouteListCapacity,
  formatSegmentTooltip,
  getAdjacentRouteId,
  getGoogleMapsKeyIssue,
  matchesRouteFilter,
  NO_LABELS_MAP_STYLE,
  pickDefaultCrowdedRouteId,
  rankRoutesByLoad,
  selectVisibleStopLabelIds,
  sortListWithPinnedFocus,
  stripDuplicateRouteCode,
} from './mapGeometry';

function makeRoute(code: string, latOffset: number): ApiRouteSummary {
  const lat1 = Number((28.60 + latOffset).toFixed(4));
  const lat2 = Number((28.62 + latOffset).toFixed(4));
  const lat3 = Number((28.64 + latOffset).toFixed(4));
  return {
    routeId: `r-${code}`,
    routeCode: code,
    routeName: `Route ${code}`,
    operator: 'DTC',
    corridorLabel: `Stop ${code}A – Stop ${code}C`,
    originId: `s-${code}-1`,
    destinationId: `s-${code}-3`,
    originName: `Stop ${code}A`,
    destinationName: `Stop ${code}C`,
    headwayMinutes: 10,
    coordinates: [
      { lat: lat1, lng: 77.20 },
      { lat: lat2, lng: 77.22 },
      { lat: lat3, lng: 77.24 },
    ],
    stops: [
      { id: `s-${code}-1`, name: `Stop ${code}A`, shortName: `${code}A`, lat: lat1, lng: 77.20, routes: [code] },
      { id: `s-${code}-2`, name: `Stop ${code}B`, shortName: `${code}B`, lat: lat2, lng: 77.22, routes: [code] },
      { id: `s-${code}-3`, name: `Stop ${code}C`, shortName: `${code}C`, lat: lat3, lng: 77.24, routes: [code] },
    ],
  };
}

test('computeBounds handles invalid coordinates and computes bounding box', () => {
  assert.equal(computeBounds([{ lat: 0, lng: 0 }, { lat: 28.6, lng: 77.2 }]), null);
  assert.deepEqual(
    computeBounds([
      { lat: 28.5, lng: 77.1 },
      { lat: 28.7, lng: 77.3 },
    ]),
    { north: 28.7, south: 28.5, east: 77.3, west: 77.1 }
  );
});

test('never shows 0% full and never auto-selects routes without valid positive crowding data', () => {
  const routes = [
    makeRoute('100', 0.01),
    makeRoute('101', 0.02),
    makeRoute('102', 0.03),
  ];

  // Route 100 explicitly has 0% load; Route 102 has missing data; Route 101 has 92%
  const crowdZero: RouteCrowdDetail = {
    routeId: 'r-100',
    routeCode: '100',
    routeName: 'Route 100',
    operator: 'DTC',
    corridorLabel: 'Stop 100A – Stop 100C',
    direction: 'Up',
    loadPct: 0,
    crowding: 'seats',
    confidence: 'Low',
    ticketCount: 0,
    predictionSource: 'observed_tickets',
    coordinates: routes[0].coordinates,
    stops: routes[0].stops,
    segments: [],
  };

  const hotspots: OperatorHotspotRow[] = [
    { id: 'h1', routeId: 'r-101', routeCode: '101', routeName: '101', operator: 'DTC', corridor: 'c1', busiestStretch: 'A to B', hour: 8, loadPct: 92, crowding: 'crowded', headwayMinutes: 10, confidence: 'High', ticketCount: 300, predictionSource: 'observed_tickets', originId: 'o', destinationId: 'd', originName: 'A', destinationName: 'B' },
    { id: 'h0', routeId: 'r-102', routeCode: '102', routeName: '102', operator: 'DTC', corridor: 'c2', busiestStretch: 'A to B', hour: 8, loadPct: 0, crowding: 'seats', headwayMinutes: 10, confidence: 'Low', ticketCount: 0, predictionSource: 'observed_tickets', originId: 'o', destinationId: 'd', originName: 'A', destinationName: 'B' },
  ];

  const { ranked } = rankRoutesByLoad({
    routes,
    crowdByKey: { 'r-100::weekday::8': crowdZero },
    hotspots,
    dayType: 'weekday',
    hour: 8,
  });

  // Highest valid route first; 0% and missing data routes marked hasData: false with null load/crowding
  assert.equal(ranked[0].route.routeCode, '101');
  assert.equal(ranked[0].hasData, true);
  assert.equal(ranked[1].hasData, false);
  assert.equal(ranked[1].loadPct, null);
  assert.equal(ranked[1].crowding, null);
  assert.equal(ranked[2].hasData, false);

  assert.equal(pickDefaultCrowdedRouteId(ranked), 'r-101');

  // If NO routes have valid data, pickDefaultCrowdedRouteId returns null
  const noDataRanked = rankRoutesByLoad({
    routes: [routes[0], routes[2]],
    crowdByKey: { 'r-100::weekday::8': crowdZero },
    hotspots: [],
    dayType: 'weekday',
    hour: 8,
  }).ranked;
  assert.equal(pickDefaultCrowdedRouteId(noDataRanked), null);

  // Never output "0%" or "0% full"
  assert.equal(formatCapacityLabel('seats', 0), 'Not enough data');
  assert.equal(formatCapacityLabel(null, null), 'Not enough data');
  assert.equal(formatRouteListCapacity('seats', 0), 'Not enough data');
  assert.equal(formatRouteListCapacity(null, null), 'Not enough data');
  assert.equal(formatCapacityLabel('crowded', 92), 'Crowded, 92% full');
  assert.equal(formatRouteListCapacity('crowded', 92), 'Crowded, 92% full');
  assert.equal(
    formatSegmentTooltip({
      fromName: 'A',
      toName: 'B',
      crowding: 'seats',
      loadPct: 0,
      confidence: 'Low',
    }),
    'A to B, Not enough data'
  );
});

test('draws ONLY the selected single route (never base/top5/hover lines for other routes) and builds ordered stop timeline', () => {
  const routes = [makeRoute('502', 0.01), makeRoute('85', 0.02), makeRoute('425', 0.05)];
  const crowdDetail: RouteCrowdDetail = {
    routeId: 'r-502',
    routeCode: '502',
    routeName: 'Route 502',
    operator: 'DTC',
    corridorLabel: 'Stop 502A – Stop 502C',
    direction: 'Down',
    loadPct: 88,
    crowding: 'crowded',
    confidence: 'Medium',
    ticketCount: 180,
    predictionSource: 'observed_tickets',
    coordinates: routes[0].coordinates,
    stops: routes[0].stops,
    segments: [
      {
        id: 'seg-1',
        fromName: 'Stop 502A',
        toName: 'Stop 502B',
        loadPct: 92,
        estimatedPassengers: 78,
        crowding: 'crowded',
        confidence: 'Medium',
        ticketCount: 95,
        predictionSource: 'observed_tickets',
        coordinates: [routes[0].coordinates[0], routes[0].coordinates[1]],
      },
      {
        id: 'seg-2',
        fromName: 'Stop 502B',
        toName: 'Stop 502C',
        loadPct: 40,
        estimatedPassengers: 34,
        crowding: 'seats',
        confidence: 'High',
        ticketCount: 85,
        predictionSource: 'observed_tickets',
        coordinates: [routes[0].coordinates[1], routes[0].coordinates[2]],
      },
    ],
  };

  const { ranked } = rankRoutesByLoad({
    routes,
    crowdByKey: { 'r-502::weekday::8': crowdDetail },
    hotspots: [],
    dayType: 'weekday',
    hour: 8,
  });

  // Unselected map draws zero lines and zero stops
  const emptyMap = buildSimplifiedMapRenderData({
    ranked,
    selectedRouteId: null,
    hoveredRouteId: 'r-85',
  });
  assert.equal(emptyMap.polylines.length, 0);
  assert.equal(emptyMap.stops.length, 0);

  // Selected map draws ONLY r-502 stretches, completely hides r-85 and r-425 even if hovered
  const mapData = buildSimplifiedMapRenderData({
    ranked,
    selectedRouteId: 'r-502',
    hoveredRouteId: 'r-85',
  });

  assert.equal(mapData.polylines.length, 2);
  assert.ok(mapData.polylines.every((p) => p.routeId === 'r-502' && p.weight === 6));
  assert.equal(mapData.polylines[0].color, '#D4563A');
  assert.equal(mapData.polylines[1].color, '#2F8F6B');

  assert.equal(mapData.stops.length, 3);
  assert.equal(mapData.stopItems.length, 3);
  assert.equal(mapData.stopItems[0].number, 1);
  assert.equal(mapData.stopItems[0].isStart, true);
  assert.equal(mapData.stopItems[0].isEnd, false);
  assert.equal(mapData.stopItems[0].stretchCrowding, 'crowded');
  assert.equal(mapData.stopItems[0].stretchColor, '#D4563A');
  assert.equal(mapData.stopItems[1].stretchCrowding, 'seats');
  assert.equal(mapData.stopItems[1].stretchColor, '#2F8F6B');
  assert.equal(mapData.stopItems[2].isStart, false);
  assert.equal(mapData.stopItems[2].isEnd, true);
  assert.equal(mapData.stopItems[2].stretchCrowding, null);
  assert.equal(mapData.stopItems[2].stretchColor, DEFAULT_ROUTE_LINE_HEX);

  assert.equal(mapData.endpoints?.start.name, 'Stop 502A');
  assert.equal(mapData.endpoints?.end.name, 'Stop 502C');
  assert.deepEqual(mapData.focusedBounds, {
    north: 28.65,
    south: 28.61,
    east: 77.24,
    west: 77.20,
  });

  assert.equal(filterRankedRoutes(ranked, '85').length, 1);
  assert.equal(
    formatSegmentTooltip({
      fromName: 'Stop A',
      toName: 'Stop B',
      crowding: 'crowded',
      loadPct: 92,
      estimatedPassengers: 78,
      confidence: 'Medium',
    }),
    'Stop A to Stop B, Crowded, about 78 people on board, confidence Medium'
  );
  assert.equal(stripDuplicateRouteCode('85 Down: Old Delhi – Anand Vihar', '85'), 'Old Delhi – Anand Vihar');
});

test('filter chips, pinned focus, and next/prev stepping work deterministically', () => {
  const routes = [
    makeRoute('85', 0.01),
    makeRoute('425', 0.02),
    makeRoute('502', 0.03),
    makeRoute('711', 0.04),
  ];
  const hotspots: OperatorHotspotRow[] = [
    { id: 'h1', routeId: 'r-85', routeCode: '85', routeName: '85', operator: 'DTC', corridor: 'c1', busiestStretch: 'A to B', hour: 8, loadPct: 92, crowding: 'crowded', headwayMinutes: 10, confidence: 'High', ticketCount: 300, predictionSource: 'observed_tickets', originId: 'o', destinationId: 'd', originName: 'A', destinationName: 'B' },
    { id: 'h2', routeId: 'r-425', routeCode: '425', routeName: '425', operator: 'DTC', corridor: 'c2', busiestStretch: 'C to D', hour: 8, loadPct: 35, crowding: 'seats', headwayMinutes: 12, confidence: 'High', ticketCount: 220, predictionSource: 'observed_tickets', originId: 'o', destinationId: 'd', originName: 'C', destinationName: 'D' },
    { id: 'h3', routeId: 'r-502', routeCode: '502', routeName: '502', operator: 'DTC', corridor: 'c3', busiestStretch: 'E to F', hour: 8, loadPct: 68, crowding: 'standing', headwayMinutes: 15, confidence: 'Low', ticketCount: 15, predictionSource: 'ml_fallback', originId: 'o', destinationId: 'd', originName: 'E', destinationName: 'F' },
  ];

  const { ranked } = rankRoutesByLoad({
    routes,
    crowdByKey: {},
    hotspots,
    dayType: 'weekday',
    hour: 8,
  });

  // Highest crowding first: 85 (92%), 502 (68%), 425 (35%), 711 (no data)
  assert.deepEqual(ranked.map((r) => r.route.routeCode), ['85', '502', '425', '711']);

  assert.equal(matchesRouteFilter(ranked[0], 'crowded'), true);
  assert.equal(matchesRouteFilter(ranked[1], 'crowded'), false);
  assert.equal(matchesRouteFilter(ranked[2], 'seats'), true);
  assert.equal(matchesRouteFilter(ranked[1], 'low_data'), true); // ml_fallback
  assert.equal(matchesRouteFilter(ranked[3], 'low_data'), true); // no data

  assert.deepEqual(
    filterRankedRoutes(ranked, '', 'crowded').map((r) => r.route.routeCode),
    ['85']
  );
  assert.deepEqual(
    filterRankedRoutes(ranked, '', 'seats').map((r) => r.route.routeCode),
    ['425']
  );
  assert.deepEqual(
    filterRankedRoutes(ranked, '', 'low_data').map((r) => r.route.routeCode),
    ['502', '711']
  );

  // Pinning focused route moves it to top while preserving highest-first order for others
  const pinned = sortListWithPinnedFocus(ranked, 'r-425');
  assert.deepEqual(pinned.map((r) => r.route.routeCode), ['425', '85', '502', '711']);

  // Next / Previous wraps cleanly on selectable routes
  const selectable = ranked.filter((r) => r.hasData);
  assert.equal(getAdjacentRouteId(selectable, 'r-85', 'next'), 'r-502');
  assert.equal(getAdjacentRouteId(selectable, 'r-85', 'prev'), 'r-425');
  assert.equal(getAdjacentRouteId(selectable, 'r-425', 'next'), 'r-85');
});

test('getGoogleMapsKeyIssue detects missing, URL-misconfigured, placeholder, and valid keys', () => {
  assert.equal(getGoogleMapsKeyIssue(''), 'missing');
  assert.equal(getGoogleMapsKeyIssue('   '), 'missing');
  assert.equal(getGoogleMapsKeyIssue('https://delhi-crowd-hackathon.onrender.com'), 'invalid_format');
  assert.equal(getGoogleMapsKeyIssue('MY_GOOGLE_MAPS_KEY'), 'invalid_format');
  assert.equal(getGoogleMapsKeyIssue('not a key'), 'invalid_format');
  assert.equal(getGoogleMapsKeyIssue('AIzaSyDummyValidLookingKey1234567890'), null);
});

test('NO_LABELS_MAP_STYLE hides all base map labels and selectVisibleStopLabelIds avoids overlap by zoom', () => {
  assert.deepEqual(NO_LABELS_MAP_STYLE, [
    {
      featureType: 'all',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
  ]);

  const denseStops = [
    { id: 's1', name: 'Chauhan Patti Terminal', lat: 28.7300, lng: 77.2600, number: 1, isStart: true, isEnd: false },
    { id: 's2', name: 'Sabhapur Crossing', lat: 28.7296, lng: 77.2602, number: 2, isStart: false, isEnd: false },
    { id: 's3', name: 'Annpurna Mandir', lat: 28.7292, lng: 77.2604, number: 3, isStart: false, isEnd: false },
    { id: 's4', name: 'Mori Gate Terminal', lat: 28.6632, lng: 77.2215, number: 4, isStart: false, isEnd: true },
  ];

  // Zoomed out: closely spaced s2 and s3 collide with s1, while distant s4 (End) fits
  const zoomedOutVisible = selectVisibleStopLabelIds(denseStops, 11);
  assert.equal(zoomedOutVisible.has('s1'), true);
  assert.equal(zoomedOutVisible.has('s4'), true);
  assert.equal(zoomedOutVisible.has('s2'), false);
  assert.equal(zoomedOutVisible.has('s3'), false);

  // Zoomed way in (zoom 17): all stops have enough screen separation to display labels
  const zoomedInVisible = selectVisibleStopLabelIds(denseStops, 17);
  assert.equal(zoomedInVisible.has('s1'), true);
  assert.equal(zoomedInVisible.has('s2'), true);
  assert.equal(zoomedInVisible.has('s3'), true);
  assert.equal(zoomedInVisible.has('s4'), true);
});

