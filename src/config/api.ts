export const API_BASE = (
  import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '')
).replace(/\/+$/, '');

export function buildApiUrl(path: string, params?: Record<string, string | number | undefined | null>): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = `${API_BASE}${cleanPath}`;
  if (!params) return base;

  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      search.set(key, String(val));
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}
