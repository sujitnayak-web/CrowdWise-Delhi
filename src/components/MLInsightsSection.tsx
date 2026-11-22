import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Cpu, Layers, Split } from 'lucide-react';
import { fetchMLInsights } from '../api/crowdwiseApi';
import { MLInsightsData } from '../types/transit';
import { ApiStatusBanner } from './ApiStatusBanner';

export function MLInsightsSection({ standalonePage = false }: { standalonePage?: boolean }) {
  const [data, setData] = useState<MLInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErrorMsg(null);

    fetchMLInsights(controller.signal)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setData(null);
        setErrorMsg(err instanceof Error ? err.message : 'Unable to fetch ML Insights.');
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [retryNonce]);

  const regWinnerName = useMemo(() => {
    if (!data?.regression_models?.length) return null;
    const exact = data.regression_models.find(
      (m) => m.name.toLowerCase() === data.active_fallback_model.toLowerCase()
    );
    if (exact) return exact.name;
    return [...data.regression_models].sort((a, b) => a.rmse - b.rmse || b.r2 - a.r2)[0].name;
  }, [data]);

  const clsWinnerName = useMemo(() => {
    if (!data?.classification_models?.length) return null;
    return [...data.classification_models].sort(
      (a, b) => b.macro_f1 - a.macro_f1 || b.accuracy - a.accuracy
    )[0].name;
  }, [data]);

  const maxFeatureWeight = useMemo(() => {
    if (!data?.feature_importance?.length) return 1;
    const maxAbs = Math.max(...data.feature_importance.map((f) => Math.abs(f.weight)));
    return maxAbs > 0 ? maxAbs : 1;
  }, [data]);

  const formatMetric = (val: number, decimals = 3) =>
    Number.isFinite(val) ? val.toFixed(decimals) : '—';

  const formatPct = (val: number) => {
    if (!Number.isFinite(val)) return '—';
    const pct = val <= 1.05 ? val * 100 : val;
    return `${pct.toFixed(1)}%`;
  };

  return (
    <section
      id="ml-insights"
      aria-labelledby="ml-insights-heading"
      className={
        standalonePage
          ? 'py-8 sm:py-10'
          : 'scroll-mt-20 py-14 sm:py-16 border-t border-[#CFDCC8]'
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
        {/* Section Heading */}
        <div className="space-y-2">
          <p className="cw-section-kicker">Machine Learning Validation &amp; Fallback</p>
          {standalonePage ? (
            <h1
              id="ml-insights-heading"
              className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-[1.08] text-[#14261C]"
            >
              ML Insights &amp; Sparse Route Coverage
            </h1>
          ) : (
            <h2
              id="ml-insights-heading"
              className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-[1.08] text-[#14261C]"
            >
              ML Insights &amp; Sparse Route Coverage
            </h2>
          )}
          <p className="text-[15px] sm:text-base text-[#5C6F62] max-w-2xl">
            Temporal holdout validation across 2.56M October ONDC mobile e-tickets, benchmarking our sparse-segment prediction fallback models.
          </p>
        </div>

        {errorMsg && (
          <ApiStatusBanner
            title="Could not load ML Insights"
            message={errorMsg}
            onRetry={() => setRetryNonce((n) => n + 1)}
          />
        )}

        {loading ? (
          <div className="space-y-6 animate-pulse">
            <div className="cw-card p-6 h-28 bg-[#F6FAF3]">
              <div className="h-4 w-1/3 rounded bg-[#E8F0E4] mb-3" />
              <div className="h-6 w-2/3 rounded bg-[#E8F0E4]" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="cw-card p-6 h-52" />
              <div className="cw-card p-6 h-52" />
            </div>
            <div className="cw-card p-6 h-64" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Card 1: Validation Summary Strip */}
            <div className="cw-card p-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                <div className="md:col-span-5 space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] font-semibold text-[#1F4D3A]">
                    <Split className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>{data.split_method || 'Temporal Holdout Split'}</span>
                  </div>
                  <h3 className="font-display text-lg sm:text-xl font-semibold text-[#14261C]">
                    Train: Oct Weeks 1–3 → Test: Unseen Week 4
                  </h3>
                  <p className="font-mono tabular-nums text-xs text-[#5C6F62]">
                    {data.train_rows.toLocaleString()} train rows · {data.test_rows.toLocaleString()} test rows
                  </p>
                </div>

                <div className="md:col-span-4 md:border-l md:border-[#CFDCC8] md:pl-5 space-y-1">
                  <div className="inline-flex items-center gap-1.5 cw-section-kicker">
                    <Cpu className="h-3.5 w-3.5 text-[#1F4D3A]" strokeWidth={1.5} />
                    <span>Active Fallback Model</span>
                  </div>
                  <p className="font-display text-lg font-semibold text-[#14261C]">
                    {data.active_fallback_model}
                  </p>
                  <p className="text-xs text-[#5C6F62]">
                    Serves predictions when direct ONDC ticket counts are low
                  </p>
                </div>

                <div className="md:col-span-3 md:border-l md:border-[#CFDCC8] md:pl-5 space-y-1">
                  <div className="inline-flex items-center gap-1.5 cw-section-kicker">
                    <Layers className="h-3.5 w-3.5 text-[#1F4D3A]" strokeWidth={1.5} />
                    <span>Sparse Fallback Coverage</span>
                  </div>
                  <p className="font-mono tabular-nums text-2xl font-semibold text-[#1F4D3A]">
                    {Number(data.fallback_stats.ml_fallback_pct).toFixed(1)}%
                  </p>
                  <p className="font-mono tabular-nums text-xs text-[#5C6F62]">
                    {data.fallback_stats.ml_fallback_segments.toLocaleString()} of{' '}
                    {data.fallback_stats.total_segments.toLocaleString()} segments (
                    {data.fallback_stats.observed_segments.toLocaleString()} observed)
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Model Benchmark Comparison (Two Side-by-Side Cards) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Regression (Load Ratio) */}
              <div className="cw-card p-5 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="cw-section-kicker">Regression Benchmark</p>
                    <h3 className="font-display text-lg font-semibold text-[#14261C] mt-1">
                      Regression (Load Ratio)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-[#5C6F62]">
                    Lower MAE/RMSE · Higher R²
                  </span>
                </div>

                <div className="space-y-3">
                  {data.regression_models.map((model) => {
                    const isWinner = model.name === regWinnerName;
                    return (
                      <div
                        key={model.name}
                        className={`rounded-[8px] p-4 border transition-colors ${
                          isWinner
                            ? 'bg-[#E8F0E4] border-[#1F4D3A]'
                            : 'bg-[#F6FAF3] border-[#CFDCC8]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <span className="font-display text-sm sm:text-base font-semibold text-[#14261C]">
                            {model.name}
                          </span>
                          {isWinner && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-[#1F4D3A] text-[#F6FAF3]">
                              <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
                              <span>Active Winner</span>
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <div className="cw-section-kicker">MAE</div>
                            <div className="font-mono tabular-nums text-sm font-semibold text-[#14261C] mt-0.5">
                              {formatMetric(model.mae)}
                            </div>
                          </div>
                          <div>
                            <div className="cw-section-kicker">RMSE</div>
                            <div className="font-mono tabular-nums text-sm font-semibold text-[#14261C] mt-0.5">
                              {formatMetric(model.rmse)}
                            </div>
                          </div>
                          <div>
                            <div className="cw-section-kicker">R²</div>
                            <div className="font-mono tabular-nums text-sm font-semibold text-[#1F4D3A] mt-0.5">
                              {formatMetric(model.r2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Classification (Crowding Tier) */}
              <div className="cw-card p-5 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="cw-section-kicker">Classification Benchmark</p>
                    <h3 className="font-display text-lg font-semibold text-[#14261C] mt-1">
                      Classification (Crowding Tier)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-[#5C6F62]">
                    Higher Accuracy &amp; Macro-F1
                  </span>
                </div>

                <div className="space-y-3">
                  {data.classification_models.map((model) => {
                    const isWinner = model.name === clsWinnerName;
                    return (
                      <div
                        key={model.name}
                        className={`rounded-[8px] p-4 border transition-colors ${
                          isWinner
                            ? 'bg-[#E8F0E4] border-[#1F4D3A]'
                            : 'bg-[#F6FAF3] border-[#CFDCC8]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <span className="font-display text-sm sm:text-base font-semibold text-[#14261C]">
                            {model.name}
                          </span>
                          {isWinner && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-[#1F4D3A] text-[#F6FAF3]">
                              <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
                              <span>Best Classifier</span>
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <div className="cw-section-kicker">Accuracy</div>
                            <div className="font-mono tabular-nums text-sm font-semibold text-[#14261C] mt-0.5">
                              {formatPct(model.accuracy)}
                            </div>
                          </div>
                          <div>
                            <div className="cw-section-kicker">Macro-F1</div>
                            <div className="font-mono tabular-nums text-sm font-semibold text-[#1F4D3A] mt-0.5">
                              {formatMetric(model.macro_f1)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Card 3: Unseen Week 4 Confusion Matrix + Feature Drivers */}
            <div className="cw-card p-5 sm:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left: 3x3 Confusion Matrix */}
                <div className="lg:col-span-7 space-y-4">
                  <div>
                    <p className="cw-section-kicker">Unseen Week 4 Holdout</p>
                    <h3 className="font-display text-lg font-semibold text-[#14261C] mt-1">
                      Confusion Matrix (Actual vs. Predicted)
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="py-2 pr-3 text-left cw-section-kicker font-semibold">
                            Actual \ Pred
                          </th>
                          {data.confusion_matrix.labels.map((lbl) => (
                            <th
                              key={`col-${lbl}`}
                              className="py-2 px-2 text-center font-semibold text-[#14261C]"
                            >
                              {lbl}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#CFDCC8]">
                        {data.confusion_matrix.matrix.map((rowVals, rIdx) => {
                          const rowSum = rowVals.reduce((s, v) => s + v, 0) || 1;
                          const rowLabel = data.confusion_matrix.labels[rIdx] ?? `Tier ${rIdx + 1}`;
                          return (
                            <tr key={`row-${rowLabel}`}>
                              <th className="py-2.5 pr-3 text-left font-medium text-[#14261C] whitespace-nowrap">
                                {rowLabel}
                              </th>
                              {rowVals.map((cellVal, cIdx) => {
                                const share = cellVal / rowSum;
                                const isDiagonal = rIdx === cIdx;
                                const bgColor = isDiagonal
                                  ? `rgba(47, 143, 107, ${(0.12 + share * 0.28).toFixed(2)})`
                                  : cellVal > 0
                                    ? `rgba(212, 86, 58, ${(0.05 + share * 0.2).toFixed(2)})`
                                    : 'transparent';

                                return (
                                  <td
                                    key={`cell-${rIdx}-${cIdx}`}
                                    className="p-1.5"
                                  >
                                    <div
                                      style={{ backgroundColor: bgColor }}
                                      className={`rounded-[6px] py-2.5 px-2 text-center border ${
                                        isDiagonal ? 'border-[#2F8F6B]/35' : 'border-[#CFDCC8]'
                                      }`}
                                    >
                                      <div className="font-mono tabular-nums text-sm font-semibold text-[#14261C]">
                                        {cellVal.toLocaleString()}
                                      </div>
                                      <div className="font-mono tabular-nums text-[10px] text-[#5C6F62]">
                                        {Math.round(share * 100)}%
                                      </div>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right: Top Feature Drivers (Horizontal Progress Bars) */}
                <div className="lg:col-span-5 space-y-4 lg:border-l lg:border-[#CFDCC8] lg:pl-7">
                  <div>
                    <p className="cw-section-kicker">Model Interpretability</p>
                    <h3 className="font-display text-lg font-semibold text-[#14261C] mt-1">
                      Top Feature Drivers
                    </h3>
                  </div>

                  <div className="space-y-3.5 pt-1">
                    {data.feature_importance.map((item) => {
                      const pctWidth = Math.max(
                        6,
                        Math.round((Math.abs(item.weight) / maxFeatureWeight) * 100)
                      );
                      const isNegative = item.weight < 0;
                      return (
                        <div key={item.feature} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-[#14261C] truncate">
                              {item.feature}
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-[#14261C] shrink-0">
                              {item.weight > 0 ? `+${item.weight.toFixed(3)}` : item.weight.toFixed(3)}
                            </span>
                          </div>
                          <div className="h-2.5 w-full rounded-[4px] bg-[#E8F0E4] overflow-hidden">
                            <div
                              className="h-full rounded-[4px] animate-ribbon-load"
                              style={{
                                width: `${pctWidth}%`,
                                backgroundColor: isNegative ? '#E2A62B' : '#1F4D3A',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          </div>
        ) : null}
      </div>
    </section>
  );
}
