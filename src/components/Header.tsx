import { useEffect, useState } from 'react';
import { Bus, Menu, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { APP_PATHS, HEADER_NAV_ITEMS, isNavPathActive } from '../utils/routesConfig';

export function Header() {
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  return (
    <>
      <header
        style={{ position: 'sticky', top: 0, zIndex: 50 }}
        className={`w-full bg-[#F6FAF3]/85 backdrop-blur-md border-b border-[#CFDCC8] transition-[height,box-shadow] duration-200 ease-in-out ${
          isScrolled ? 'h-[64px] shadow-[0_4px_18px_rgba(20,38,28,0.08)]' : 'h-[80px]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-4 sm:gap-8">
          {/* Left: Logo */}
          <Link
            to={APP_PATHS.HOME}
            onClick={() => setMobileOpen(false)}
            className="inline-flex items-center gap-2.5 text-[#14261C] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 rounded-[8px]"
          >
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] bg-[#1F4D3A] text-[#F6FAF3]">
              <Bus className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <span className="font-display text-lg font-bold tracking-[-0.02em]">
              CrowdWise Delhi
            </span>
          </Link>

          {/* Center/Right Nav Links (Desktop) */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 h-full"
          >
            {HEADER_NAV_ITEMS.map((item) => {
              const isActive = isNavPathActive(location.pathname, item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative h-full inline-flex items-center text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 ${
                    isActive
                      ? 'text-[#1F4D3A]'
                      : 'text-[#5C6F62] hover:text-[#14261C]'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <motion.span
                      layoutId="header-active-underline"
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1F4D3A] rounded-t-[1px]"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right: Plan a trip CTA + Mobile Hamburger */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to={APP_PATHS.PLANNER}
              onClick={() => setMobileOpen(false)}
              className="hidden sm:inline-flex items-center justify-center px-4 py-2 rounded-[8px] bg-[#1F4D3A] hover:bg-[#173B2D] text-[#F6FAF3] text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
            >
              Plan a trip
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-[8px] border border-[#CFDCC8] bg-[#F6FAF3] text-[#14261C] hover:border-[#1F4D3A] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30"
            >
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-In Side Drawer & Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[60] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          {/* Outside tap backdrop */}
          <div
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-[#14261C]/35 transition-opacity duration-200"
          />

          {/* Slide-in side panel */}
          <aside
            id="mobile-nav-drawer"
            className="fixed top-0 right-0 bottom-0 w-72 max-w-[85vw] bg-[#F6FAF3] border-l border-[#CFDCC8] p-5 flex flex-col justify-between shadow-[0_8px_32px_rgba(20,38,28,0.16)]"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#CFDCC8]">
                <Link
                  to={APP_PATHS.HOME}
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center gap-2 font-display font-bold text-[#14261C] text-base"
                >
                  <Bus className="h-4 w-4 text-[#1F4D3A]" strokeWidth={1.5} />
                  <span>CrowdWise Delhi</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation menu"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-[8px] border border-[#CFDCC8] text-[#14261C] hover:border-[#1F4D3A]"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              <nav aria-label="Mobile navigation links" className="flex flex-col gap-1.5">
                {HEADER_NAV_ITEMS.map((item) => {
                  const isActive = isNavPathActive(location.pathname, item.path);
                  return (
                    <Link
                      key={`mob-${item.path}`}
                      to={item.path}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={`px-3.5 py-2.5 rounded-[8px] text-sm font-medium transition-colors duration-200 ${
                        isActive
                          ? 'bg-[#1F4D3A]/10 text-[#1F4D3A] border border-[#1F4D3A]/30'
                          : 'text-[#5C6F62] hover:bg-[#E8F0E4] hover:text-[#14261C] border border-transparent'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <Link
              to={APP_PATHS.PLANNER}
              onClick={() => setMobileOpen(false)}
              className="w-full py-2.5 px-4 rounded-[8px] bg-[#1F4D3A] hover:bg-[#173B2D] text-[#F6FAF3] text-sm font-medium text-center transition-colors duration-200"
            >
              Plan a trip
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}
