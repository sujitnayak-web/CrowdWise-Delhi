export type CrowdingLevel = 'seats' | 'standing' | 'crowded';
export type DayType = 'weekday' | 'weekend';
export type PreferenceMode = 'comfortable' | 'fastest';
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
export type PredictionSource = 'observed_tickets' | 'ml_fallback' | 'route_average';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface BusStop {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lng: number;
  zone?: string;
  routes: string[];
}

export interface JourneyLeg {
  id: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  operator: string;
  fromStop: BusStop;
  toStop: BusStop;
  intermediateStops: BusStop[];
  stopsCount: number;
  durationMinutes: number;
  waitMinutesBefore?: number;
  departureTime: string;
  arrivalTime: string;
  loadPct: number;
  crowding: CrowdingLevel;
  confidence: ConfidenceLevel;
  ticketCount: number | null;
  predictionSource: PredictionSource;
  coordinates: LatLngPoint[];
}

export interface JourneyOption {
  id: string;
  strategyLabel: string;
  dayType: DayType;
  departureTime: string;
  arrivalTime: string;
  totalMinutes: number;
  transferWaitMinutes: number;
  changes: number;
  totalStops: number;
  overallCrowding: CrowdingLevel;
  peakLoadPct: number;
  avgLoadPct: number;
  confidence: ConfidenceLevel;
  ticketCount: number | null;
  predictionSource: PredictionSource;
  legs: JourneyLeg[];
  forwardNudgeText: string | null;
  forwardNudgeTime: string | null;
}

export interface ApiRouteSummary {
  routeId: string;
  routeCode: string;
  routeName: string;
  operator: string;
  corridorLabel: string;
  direction?: string;
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  headwayMinutes: number | null;
  tripsPerDay?: number | null;
  isAc?: boolean;
  stopsCount?: number;
  coordinates: LatLngPoint[];
  stops: BusStop[];
}

export interface RouteCrowdSegment {
  id: string;
  fromName: string;
  toName: string;
  loadPct: number;
  estimatedPassengers?: number | null;
  crowding: CrowdingLevel;
  confidence: ConfidenceLevel;
  ticketCount: number | null;
  predictionSource: PredictionSource;
  coordinates: LatLngPoint[];
}

export interface RouteCrowdDetail {
  routeId: string;
  routeCode: string;
  routeName: string;
  operator: string;
  corridorLabel: string;
  direction?: string;
  busiestStretch?: string;
  loadPct: number;
  crowding: CrowdingLevel;
  confidence: ConfidenceLevel;
  ticketCount: number | null;
  predictionSource: PredictionSource;
  coordinates: LatLngPoint[];
  segments: RouteCrowdSegment[];
  stops: BusStop[];
}

export interface OperatorHourlyPoint {
  hour: number;
  avgLoadPct: number;
  overloadedCount: number;
  crowding: CrowdingLevel;
}

export interface OperatorHotspotRow {
  id: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  operator: string;
  corridor: string;
  busiestStretch: string;
  hour: number;
  loadPct: number;
  crowding: CrowdingLevel;
  headwayMinutes: number | null;
  confidence: ConfidenceLevel;
  ticketCount: number | null;
  predictionSource: PredictionSource;
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
}

export interface OperatorHotspotsPayload {
  hotspots: OperatorHotspotRow[];
  hourlyNetwork: OperatorHourlyPoint[];
}

export interface MLRegressionModelMetric {
  name: string;
  mae: number;
  rmse: number;
  r2: number;
}

export interface MLClassificationModelMetric {
  name: string;
  accuracy: number;
  macro_f1: number;
}

export interface MLInsightsData {
  split_method: string;
  train_rows: number;
  test_rows: number;
  active_fallback_model: string;
  fallback_stats: {
    total_segments: number;
    observed_segments: number;
    ml_fallback_segments: number;
    ml_fallback_pct: number;
  };
  regression_models: MLRegressionModelMetric[];
  classification_models: MLClassificationModelMetric[];
  confusion_matrix: {
    labels: string[];
    matrix: number[][];
  };
  feature_importance: Array<{
    feature: string;
    weight: number;
  }>;
  concepts: Array<{
    term: string;
    summary: string;
    example: string;
  }>;
}
