export const APP_PATHS = {
  HOME: '/',
  PLANNER: '/planner',
  CROWD_MAP: '/crowd-map',
  OPERATOR: '/operator',
  ML_INSIGHTS: '/ml-insights',
} as const;

export type AppRoutePath = (typeof APP_PATHS)[keyof typeof APP_PATHS];

export interface HeaderNavItem {
  path: AppRoutePath;
  label: string;
}

export const HEADER_NAV_ITEMS: HeaderNavItem[] = [
  { path: APP_PATHS.HOME, label: 'Home' },
  { path: APP_PATHS.PLANNER, label: 'Planner' },
  { path: APP_PATHS.CROWD_MAP, label: 'Crowd Map' },
  { path: APP_PATHS.OPERATOR, label: 'Operator View' },
  { path: APP_PATHS.ML_INSIGHTS, label: 'ML Insights' },
];

export const VALID_APP_PATHS: ReadonlySet<string> = new Set(Object.values(APP_PATHS));

export function normalizeAppPath(pathname: string): string {
  const trimmed = (pathname || '/').trim();
  if (trimmed === '/' || trimmed === '') return '/';
  return trimmed.replace(/\/+$/, '') || '/';
}

export function isNavPathActive(currentPathname: string, navPath: AppRoutePath): boolean {
  const current = normalizeAppPath(currentPathname);
  if (navPath === APP_PATHS.HOME) {
    return current === APP_PATHS.HOME;
  }
  return current === navPath || current.startsWith(`${navPath}/`);
}

export function resolveSafeRoute(pathname: string): AppRoutePath {
  const normalized = normalizeAppPath(pathname);
  if (VALID_APP_PATHS.has(normalized)) {
    return normalized as AppRoutePath;
  }
  return APP_PATHS.HOME;
}
