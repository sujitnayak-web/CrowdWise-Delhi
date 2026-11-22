import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { searchStops } from '../api/crowdwiseApi';
import { BusStop } from '../types/transit';

interface StopAutocompleteProps {
  id: string;
  label: string;
  placeholder: string;
  selectedStop: BusStop | null;
  onSelect: (stop: BusStop) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function StopAutocomplete({
  id,
  label,
  placeholder,
  selectedStop,
  onSelect,
  inputRef,
}: StopAutocompleteProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(selectedStop?.name ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<BusStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Sync display text when parent updates selected stop (e.g. swap or quick-fill chip)
  useEffect(() => {
    if (!isFocused) {
      setQuery(selectedStop?.name ?? '');
    }
  }, [selectedStop, isFocused]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
        setQuery(selectedStop?.name ?? '');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [selectedStop]);

  // Fetch matching stops from backend GET /api/stops?q=<query>&limit=15
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    const trimmed = query.trim();
    const effectiveQuery =
      selectedStop && trimmed === selectedStop.name ? '' : trimmed;

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const results = await searchStops(effectiveQuery, 15, controller.signal);
        setSuggestions(results);
        setActiveIndex(results.length > 0 ? 0 : -1);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSuggestions([]);
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load stops');
      } finally {
        setLoading(false);
      }
    }, effectiveQuery ? 180 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen, selectedStop]);

  const handleChoose = (stop: BusStop) => {
    setQuery(stop.name);
    setIsOpen(false);
    setIsFocused(false);
    setActiveIndex(-1);
    onSelect(stop);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (suggestions.length > 0 ? (prev + 1) % suggestions.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        suggestions.length > 0 ? (prev - 1 + suggestions.length) % suggestions.length : -1
      );
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        handleChoose(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setIsFocused(false);
      setQuery(selectedStop?.name ?? '');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="block cw-section-kicker mb-2">
        {label}
      </label>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5C6F62]"
          strokeWidth={1.5}
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            isOpen && activeIndex >= 0 && suggestions[activeIndex]
              ? `${listboxId}-opt-${suggestions[activeIndex].id}`
              : undefined
          }
          value={query}
          placeholder={placeholder}
          onFocus={() => {
            setIsFocused(true);
            setIsOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full h-11 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] pl-9 pr-9 text-sm sm:text-[15px] font-medium text-[#14261C] placeholder:text-[#5C6F62]/75 hover:border-[#5C6F62] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/30 focus-visible:border-[#1F4D3A] transition-colors"
        />

        {loading ? (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[#1F4D3A]"
            strokeWidth={1.5}
          />
        ) : query ? (
          <button
            type="button"
            aria-label={`Clear ${label} stop`}
            onClick={() => {
              setQuery('');
              setIsFocused(true);
              setIsOpen(true);
              inputRef?.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-[6px] text-[#5C6F62] hover:text-[#14261C] hover:bg-[#CFDCC8]/40 transition-colors"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} stop suggestions`}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 rounded-[10px] border border-[#CFDCC8] bg-[#F6FAF3] shadow-[0_10px_28px_rgba(20,38,28,0.12)] max-h-72 overflow-y-auto py-1.5"
        >
          {loading && suggestions.length === 0 ? (
            <div className="px-3.5 py-2.5 space-y-2">
              <div className="h-4 w-3/4 rounded bg-[#E8F0E4] animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-[#E8F0E4] animate-pulse" />
            </div>
          ) : errorMsg ? (
            <div className="px-3.5 py-2.5 text-xs text-[#D4563A]">{errorMsg}</div>
          ) : suggestions.length === 0 ? (
            <div className="px-3.5 py-2.5 text-xs text-[#5C6F62]">
              No matching Delhi GTFS stops found.
            </div>
          ) : (
            suggestions.map((stop, idx) => {
              const isHighlighted = idx === activeIndex;
              const isCurrent = selectedStop?.id === stop.id;
              return (
                <button
                  key={`${stop.id}-${idx}`}
                  id={`${listboxId}-opt-${stop.id}`}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleChoose(stop);
                  }}
                  className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                    isHighlighted ? 'bg-[#E8F0E4]' : 'hover:bg-[#E8F0E4]/70'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <MapPin
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isCurrent ? 'text-[#1F4D3A]' : 'text-[#5C6F62]'
                      }`}
                      strokeWidth={1.5}
                    />
                    <span className="truncate text-sm font-medium text-[#14261C]">
                      {stop.name}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-[#5C6F62] shrink-0">
                    {stop.routes.length > 0 ? stop.routes.slice(0, 3).join(', ') : stop.id}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
