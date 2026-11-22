import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTransitApp } from '../context/TransitAppContext';
import { Footer } from './Footer';
import { Header } from './Header';

export function Layout() {
  const location = useLocation();
  const { gmpQuotaExceeded } = useTransitApp();

  // Scroll cleanly to the top on every route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#E8F0E4] text-[#14261C] flex flex-col">
      {gmpQuotaExceeded && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-[55] shadow-sm"
        >
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <Header />

      <main className="flex-1 flex flex-col">
        <div key={location.pathname} className="cw-page-fade flex-1 flex flex-col">
          <Outlet />
        </div>
      </main>

      <Footer />
    </div>
  );
}
