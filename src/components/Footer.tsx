import { Bus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_PATHS, HEADER_NAV_ITEMS } from '../utils/routesConfig';

export function Footer() {
  return (
    <footer className="w-full bg-[#14261C] text-[#E8F0E4] border-t border-[#1F4D3A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left: Logo + Short Description */}
          <div className="md:col-span-5 space-y-3">
            <Link
              to={APP_PATHS.HOME}
              className="inline-flex items-center gap-2.5 text-[#E8F0E4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8F0E4]/40 rounded-[8px]"
            >
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] bg-[#1F4D3A] text-[#E8F0E4]">
                <Bus className="h-4 w-4" strokeWidth={1.5} />
              </span>
              <span className="font-display text-lg font-bold tracking-[-0.02em]">
                CrowdWise Delhi
              </span>
            </Link>
            <p className="text-sm text-[#E8F0E4]/80 max-w-sm leading-relaxed">
              Crowding-aware bus route planning and corridor load insights for everyday commuters and transit planners across Delhi.
            </p>
          </div>

          {/* Center: Navigation Links */}
          <div className="md:col-span-3 space-y-2.5">
            <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#E8F0E4]/65">
              Pages
            </p>
            <ul className="space-y-2 text-sm">
              {HEADER_NAV_ITEMS.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className="text-[#E8F0E4]/90 hover:text-[#E8F0E4] hover:underline underline-offset-4 transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Hackathon & Data Sources */}
          <div className="md:col-span-4 space-y-2.5">
            <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#E8F0E4]/65">
              Project &amp; Sources
            </p>
            <p className="text-sm font-medium text-[#E8F0E4]">
              Built for Transport Stack Hackathon 2026, Delhi
            </p>
            <p className="text-xs text-[#E8F0E4]/75 leading-relaxed">
              Data source: ONDC e-ticketing data (Oct 2026) &amp; Static GTFS
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-[#E8F0E4]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#E8F0E4]/70">
          <span>&copy; 2026 CrowdWise Delhi. Open civic mobility prototype.</span>
          <span className="font-mono tabular-nums">
            Oct 2026 · 2.56M ONDC tickets · Static GTFS
          </span>
        </div>
      </div>
    </footer>
  );
}
