import { ArrowRight, BarChart3, Compass, Info, Map, Route, Ticket, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CrowdingBadge } from '../components/CrowdingBadge';
import { HomeNetworkMapSection } from '../components/HomeNetworkMapSection';
import { APP_PATHS } from '../utils/routesConfig';

const FEATURE_CARDS = [
  {
    to: APP_PATHS.PLANNER,
    kicker: 'Route Planner',
    title: 'Planner',
    description:
      'Compare direct and 1-change DTC or Cluster buses sorted by expected carriage comfort or speed.',
    cta: 'Plan a journey',
    Icon: Route,
  },
  {
    to: APP_PATHS.CROWD_MAP,
    kicker: 'Corridor Explorer',
    title: 'Crowd Map',
    description:
      'Inspect one Delhi corridor at a time across every stop and stretch by hour and service day.',
    cta: 'Open crowd map',
    Icon: Map,
  },
  {
    to: APP_PATHS.OPERATOR,
    kicker: 'Fleet Diagnostics',
    title: 'Operator View',
    description:
      'Spot the most overloaded routes, bottleneck stretches, and peak pressure windows across the network.',
    cta: 'View operator load',
    Icon: BarChart3,
  },
] as const;

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'ONDC e-tickets',
    detail:
      '2.56 million anonymized October e-tickets show boarding and alighting demand along DTC and Cluster bus stops.',
    Icon: Ticket,
  },
  {
    step: '02',
    title: 'Crowding estimate',
    detail:
      'Stop-to-stop occupancy estimates carriage load as Seats available, Standing room, or Crowded—with ML fallback for sparser stretches.',
    Icon: Users,
  },
  {
    step: '03',
    title: 'Better journey choice',
    detail:
      'Compare calmer departures or alternate routes before stepping out to the bus stop.',
    Icon: Compass,
  },
] as const;

export function Home() {
  return (
    <div className="py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
        {/* Hero Header */}
        <section aria-labelledby="home-hero-heading" className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <p className="cw-section-kicker">Delhi Bus Crowding Planner</p>
              <h1
                id="home-hero-heading"
                className="font-display text-[40px] sm:text-[50px] lg:text-[56px] font-bold tracking-[-0.02em] leading-[1.04] text-[#14261C] text-balance"
              >
                Pick a bus you can actually sit in.
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
        </section>

        {/* Three Feature Entry Cards */}
        <section aria-label="Explore CrowdWise Delhi tools" className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURE_CARDS.map(({ to, kicker, title, description, cta, Icon }) => (
            <Link
              key={to}
              to={to}
              className="cw-card cw-card-hover p-6 flex flex-col justify-between gap-5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/40"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="cw-section-kicker">{kicker}</span>
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-[#1F4D3A]">
                    <Icon className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                </div>
                <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#14261C]">
                  {title}
                </h2>
                <p className="text-sm text-[#5C6F62] leading-relaxed">
                  {description}
                </p>
              </div>

              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1F4D3A] group-hover:underline underline-offset-4">
                <span>{cta}</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.5} />
              </span>
            </Link>
          ))}
        </section>

        {/* How It Works */}
        <section aria-labelledby="how-it-works-heading" className="space-y-4">
          <div className="space-y-1">
            <p className="cw-section-kicker">How It Works</p>
            <h2
              id="how-it-works-heading"
              className="font-display text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-[#14261C]"
            >
              From raw bus tickets to calmer departures
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {HOW_IT_WORKS_STEPS.map(({ step, title, detail, Icon }) => (
              <div key={step} className="cw-card p-5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[#1F4D3A] px-2 py-0.5 rounded-[6px] bg-[#E8F0E4] border border-[#CFDCC8]">
                    Step {step}
                  </span>
                  <Icon className="h-4 w-4 text-[#5C6F62]" strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-lg font-semibold text-[#14261C]">
                  {title}
                </h3>
                <p className="text-sm text-[#5C6F62] leading-relaxed">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Data Limitations Note */}
        <section aria-labelledby="data-limitations-heading">
          <div className="cw-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-4">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-[#1F4D3A] shrink-0">
              <Info className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div className="space-y-1.5 text-sm text-[#5C6F62]">
              <h2
                id="data-limitations-heading"
                className="font-display text-base font-semibold text-[#14261C]"
              >
                Data scope &amp; limitations
              </h2>
              <p className="leading-relaxed">
                Estimates are built from 2.56M October 2026 ONDC mobile e-tickets paired with Static GTFS schedules—paper tickets and monthly passes are not directly observed. Corridors with low direct ticket samples either fall back to our trained Week 1–3 ML model (labeled clearly) or display <span className="font-medium text-[#14261C]">Not enough data</span> rather than guessing.
              </p>
            </div>
          </div>
        </section>

        {/* Network Map Section */}
        <HomeNetworkMapSection />
      </div>
    </div>
  );
}
