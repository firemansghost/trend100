/**
 * Trend100Dashboard component
 * 
 * Main dashboard component that orchestrates all UI elements.
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import type {
  TrendSnapshot,
  TrendTickerSnapshot,
  TrendHealthHistoryPoint,
  TrendDeckId,
} from '../types';
import { TopBar } from './TopBar';
import { HeatmapGrid } from './HeatmapGrid';
import { TrendModal } from './TrendModal';
import { HealthHistoryChart } from './HealthHistoryChart';
import { applyFilters, getAllTags, getTagCounts } from './tagUtils';
import { sortTickers, type SortKey } from './sortUtils';
import { SectionPills } from './SectionPills';
import type { TrendDeckSection } from '../types';
import { toSectionKey } from '../data/sectionKey';

/** Format boolean for display: "true"/"false"/"—" when null. */
function fmtBool(b: boolean | null): string {
  if (b === null) return '—';
  return b ? 'true' : 'false';
}

/** Format number for display: 2 decimals or "—" when null. */
function fmtNum(n: number | null): string {
  if (n == null) return '—';
  return n.toFixed(2);
}

/** Resolve section id from URL sectionKey (e.g. quality-lowvol -> Quality/LowVol section id). */
function sectionIdFromSectionKey(sections: TrendDeckSection[], sectionKey: string): string | null {
  const key = sectionKey.toLowerCase().trim();
  const found = sections.find((s) => toSectionKey(s.id) === key);
  return found?.id ?? null;
}

type Timeframe = '3M' | '1Y' | 'ALL';
type MetricChoice = 'health' | 'heat' | 'upper' | 'stretch' | 'medUpper';

interface Trend100DashboardProps {
  snapshot: TrendSnapshot;
  history: TrendHealthHistoryPoint[];
  deckId: TrendDeckId;
  deckLabel: string;
  deckDescription?: string;
  deckSections?: TrendDeckSection[];
  isDemoMode?: boolean;
  initialGroupFilter?: string | null;
  initialSectionKey?: string | null;
  initialMetric?: MetricChoice;
  /** When true, variant file was all UNKNOWN so we show base history and this banner. */
  historyVariantFallback?: boolean;
  /** Turbulence green bar data (from /turbulence.greenbar.json). */
  greenbarData?: Array<{ date: string; shockZ: number | null; spxAbove50dma: boolean | null; vixBelow25: boolean | null; isGreenBar: boolean | null }> | null;
}

export function Trend100Dashboard({
  snapshot,
  history,
  deckId,
  deckLabel,
  deckDescription,
  deckSections = [],
  isDemoMode = false,
  initialGroupFilter = null,
  initialSectionKey = null,
  initialMetric = 'health',
  historyVariantFallback = false,
  greenbarData = null,
}: Trend100DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(() =>
    initialSectionKey ? sectionIdFromSectionKey(deckSections, initialSectionKey) : null
  );
  const [selectedGroup, setSelectedGroup] = useState<string | null>(initialGroupFilter);
  const [metric, setMetric] = useState<MetricChoice>(initialMetric);
  const [sortKey, setSortKey] = useState<SortKey>('UNIVERSE');
  const [timeframe, setTimeframe] = useState<Timeframe>('1Y');
  const [selectedTicker, setSelectedTicker] =
    useState<TrendTickerSnapshot | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDiffusion, setShowDiffusion] = useState(false);
  const [showMetricHelp, setShowMetricHelp] = useState(false);
  const [showMetricHint, setShowMetricHint] = useState(false);
  const [showTurbulenceExplainer, setShowTurbulenceExplainer] = useState(false);

  useEffect(() => {
    // One-time hint for metric discoverability (client-only)
    try {
      const key = 'trend100_metric_hint_seen_v1';
      if (typeof window !== 'undefined' && window.localStorage) {
        const seen = window.localStorage.getItem(key);
        if (!seen) {
          setShowMetricHint(true);
          window.localStorage.setItem(key, '1');
          const t = window.setTimeout(() => setShowMetricHint(false), 8000);
          return () => window.clearTimeout(t);
        }
      }
    } catch {
      // ignore
    }
    return;
  }, []);

  // Compute deck-specific tags and counts from current deck's tickers
  const availableTags = useMemo(
    () => getAllTags(snapshot.tickers),
    [snapshot.tickers]
  );
  const tagCounts = useMemo(
    () => getTagCounts(snapshot.tickers),
    [snapshot.tickers]
  );

  // Compute section counts from current deck's tickers
  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    snapshot.tickers.forEach((ticker) => {
      if (ticker.section) {
        counts[ticker.section] = (counts[ticker.section] || 0) + 1;
      }
    });
    return counts;
  }, [snapshot.tickers]);

  // Safety: remove any selected tags that aren't in the current deck
  useEffect(() => {
    const validTags = selectedTags.filter((tag) => availableTags.includes(tag));
    if (validTags.length !== selectedTags.length) {
      setSelectedTags(validTags);
    }
  }, [availableTags, selectedTags]);

  // Safety: reset selectedSection if it's not in current deck sections
  useEffect(() => {
    if (selectedSection !== null) {
      const sectionIds = deckSections.map((s) => s.id);
      if (!sectionIds.includes(selectedSection)) {
        setSelectedSection(null);
      }
    }
  }, [selectedSection, deckSections]);

  // Check if deck has grouped tickers (for showing toggle)
  const hasGroups = useMemo(() => {
    return snapshot.tickers.some((t) => t.group !== undefined);
  }, [snapshot.tickers]);

  // Get available groups from current deck's tickers
  const availableGroups = useMemo(() => {
    const groups = new Set<string>();
    snapshot.tickers.forEach((ticker) => {
      if (ticker.group) {
        groups.add(ticker.group);
      }
    });
    return Array.from(groups).sort();
  }, [snapshot.tickers]);

  // Sync from URL when user navigates or loads with ?group= or ?section=
  useEffect(() => {
    setSelectedGroup(initialGroupFilter ?? null);
  }, [initialGroupFilter]);
  useEffect(() => {
    if (initialSectionKey == null || initialSectionKey.trim() === '') {
      setSelectedSection(null);
    } else {
      setSelectedSection(sectionIdFromSectionKey(deckSections, initialSectionKey) ?? null);
    }
  }, [initialSectionKey, deckSections]);

  // Update URL when group or section filter changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (hasGroups) {
      url.searchParams.delete('section');
      if (selectedGroup === null || selectedGroup === 'all') {
        url.searchParams.delete('group');
      } else {
        url.searchParams.set('group', selectedGroup.toLowerCase());
      }
    } else {
      url.searchParams.delete('group');
      if (selectedSection === null) {
        url.searchParams.delete('section');
      } else {
        url.searchParams.set('section', toSectionKey(selectedSection));
      }
    }
    window.history.replaceState({}, '', url.toString());
  }, [hasGroups, selectedGroup, selectedSection]);

  // Update URL when metric changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (metric === 'health') {
        url.searchParams.delete('metric');
      } else {
        url.searchParams.set('metric', metric);
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, [metric]);

  // Apply filters: for grouped decks only group drives filter; for others section + group
  const effectiveSection = hasGroups ? null : selectedSection;
  const filteredTickers = applyFilters(
    snapshot.tickers,
    searchQuery,
    selectedTags,
    effectiveSection,
    selectedGroup
  );

  // Then apply sorting
  const sortedTickers = sortTickers(filteredTickers, sortKey);

  const greenBarDates = useMemo(() => {
    if (!greenbarData) return new Set<string>();
    return new Set(greenbarData.filter((p) => p.isGreenBar === true).map((p) => p.date));
  }, [greenbarData]);

  // Filter history by timeframe and apply data-side hardening
  const filteredHistory = useMemo(() => {
    // Step 1: Filter to points <= snapshot.asOfDate (effective trading day)
    // This prevents weekend/invalid trailing points
    let filtered = history.filter((point) => point.date <= snapshot.asOfDate);

    // Step 2: Drop trailing all-zero or UNKNOWN points (belt-and-suspenders)
    while (filtered.length > 0) {
      const last = filtered[filtered.length - 1]!;
      const totalPct = last.greenPct + last.yellowPct + last.redPct;
      if (totalPct === 0 || last.regimeLabel === 'UNKNOWN') {
        filtered = filtered.slice(0, -1);
      } else {
        break;
      }
    }

    // Step 3: Apply timeframe filter (by date range, not point count)
    const today = new Date(snapshot.asOfDate);
    let cutoffDate: Date;
    switch (timeframe) {
      case '3M':
        cutoffDate = new Date(today);
        cutoffDate.setMonth(cutoffDate.getMonth() - 3);
        break;
      case '1Y':
        cutoffDate = new Date(today);
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
        break;
      case 'ALL':
        return filtered; // Return all filtered points
      default:
        cutoffDate = new Date(today);
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
    }
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]!;
    return filtered.filter((point) => point.date >= cutoffDateStr);
  }, [history, timeframe, snapshot.asOfDate]);

  // Chart date range (for green bar legend visibility)
  const chartMinDate = filteredHistory[0]?.date ?? null;
  const chartMaxDate =
    filteredHistory.length > 0 ? filteredHistory[filteredHistory.length - 1]!.date : null;
  const hasGreenBarInChartRange = useMemo(() => {
    if (!chartMinDate || !chartMaxDate || greenBarDates.size === 0) return false;
    return [...greenBarDates].some((d) => d >= chartMinDate && d <= chartMaxDate);
  }, [chartMinDate, chartMaxDate, greenBarDates]);

  // Find first valid point in displayed range (for notice)
  const firstValidPoint = useMemo(() => {
    for (const point of filteredHistory) {
      if (point.regimeLabel !== 'UNKNOWN') {
        return point;
      }
    }
    return null;
  }, [filteredHistory]);

  // Show legend when chart renders shaded "missing history" region (PR2)
  const hasMissingHistoryRegion = useMemo(() => {
    if (filteredHistory.length === 0) return false;
    const first = filteredHistory[0]!;
    // Leading UNKNOWN: first valid point is after chart start
    if (firstValidPoint && new Date(firstValidPoint.date) > new Date(first.date)) {
      return true;
    }
    // All UNKNOWN in range: no valid point but we have points
    if (!firstValidPoint) return true;
    return false;
  }, [filteredHistory, firstValidPoint]);

  // History coverage stats for incomplete series (PR7)
  const historyCoverage = useMemo(() => {
    const totalPoints = filteredHistory.length;
    const validPoints = filteredHistory.filter((p) => p.regimeLabel !== 'UNKNOWN').length;
    const unknownPoints = totalPoints - validPoints;
    const firstValidDateString = firstValidPoint?.date ?? null;
    const showCoverage =
      totalPoints > 0 && (unknownPoints > 0 || validPoints === 0);
    return {
      totalPoints,
      validPoints,
      unknownPoints,
      firstValidDateString,
      showCoverage,
    };
  }, [filteredHistory, firstValidPoint]);

  const metricConfig = useMemo(() => {
    switch (metric) {
      case 'health':
        return { metricKey: 'greenPct' as const, label: 'Health (Green %)', yDomain: [0, 100] as const };
      case 'heat':
        return { metricKey: 'heatScore' as const, label: 'Heat (0–100)', yDomain: [0, 100] as const };
      case 'upper':
        return { metricKey: 'pctAboveUpperBand' as const, label: '% Above Upper Band', yDomain: [0, 100] as const };
      case 'stretch':
        return { metricKey: 'stretch200MedianPct' as const, label: 'Stretch vs 200D (Median %)', yDomain: ['auto', 'auto'] as const };
      case 'medUpper':
        return { metricKey: 'medianDistanceAboveUpperBandPct' as const, label: 'Median > Upper (%)', yDomain: ['auto', 'auto'] as const };
      default:
        return { metricKey: 'greenPct' as const, label: 'Health (Green %)', yDomain: [0, 100] as const };
    }
  }, [metric]);

  const handleTileClick = (ticker: TrendTickerSnapshot) => {
    setSelectedTicker(ticker);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTicker(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopBar
        health={snapshot.health}
        asOfDate={snapshot.asOfDate}
        allTickers={snapshot.tickers}
        filteredCount={filteredTickers.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        sortKey={sortKey}
        onSortChange={setSortKey}
        deckId={deckId}
        deckLabel={deckLabel}
        availableTags={availableTags}
        tagCounts={tagCounts}
        isDemoMode={isDemoMode}
      />
      {/* Group or section filter: show only when deck has >=2 sections (hide for LEADERSHIP, US_SECTORS). Grouped decks use group=; others use section= and swap chart history. */}
      {deckSections.length >= 2 && (
        <div className="container mx-auto px-4 py-3 border-b border-zinc-800">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">
              {hasGroups ? 'Group:' : 'Section:'}
            </span>
            <SectionPills
              sections={deckSections}
              selectedSection={
                hasGroups
                  ? (selectedGroup ? deckSections.find((s) => s.id.toUpperCase() === selectedGroup)?.id ?? null : null)
                  : selectedSection
              }
              onChange={
                hasGroups
                  ? (sectionId) => setSelectedGroup(sectionId ? sectionId.toUpperCase() : null)
                  : setSelectedSection
              }
              counts={sectionCounts}
            />
          </div>
        </div>
      )}

      {/* Turbulence status (Green Bar from Jordi Visser model) */}
      {greenbarData && greenbarData.length > 0 && (() => {
        const SHOCK_Z_THRESHOLD = 2.0;
        const latest = greenbarData[greenbarData.length - 1]!;
        const latestShockDate = latest.date;
        const latestGateRow = (() => {
          for (let i = greenbarData!.length - 1; i >= 0; i--) {
            const p = greenbarData![i]!;
            if (p.spxAbove50dma != null && p.vixBelow25 != null) return p;
          }
          return null;
        })();
        const latestGateDate = latestGateRow?.date ?? null;
        const pendingGates =
          latest.spxAbove50dma === null ||
          latest.vixBelow25 === null ||
          latest.isGreenBar === null;
        const status = pendingGates
          ? 'PENDING'
          : latest.isGreenBar === true
            ? 'GREEN BAR ACTIVE'
            : latest.shockZ != null &&
                latest.shockZ >= SHOCK_Z_THRESHOLD * 0.75 &&
                latest.spxAbove50dma === true &&
                latest.vixBelow25 === true
              ? 'ELEVATED'
              : 'NORMAL';

        const shockDate = latestShockDate;
        const gatesDate = latestGateDate;
        const lagDays =
          shockDate && gatesDate
            ? Math.round(
                (new Date(shockDate).getTime() - new Date(gatesDate).getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            : null;

        // Gate values to display: use latestGateRow when pending, else latest
        const displayGateRow = pendingGates && latestGateRow ? latestGateRow : latest;
        const showAsOf = pendingGates && latestGateRow != null;

        const shockMet = latest.shockZ != null && latest.shockZ >= SHOCK_Z_THRESHOLD;
        const spxMet = displayGateRow.spxAbove50dma === true;
        const vixMet = displayGateRow.vixBelow25 === true;
        const spxKnown = displayGateRow.spxAbove50dma != null;
        const vixKnown = displayGateRow.vixBelow25 != null;

        return (
          <div className="container mx-auto px-4 py-2 border-b border-zinc-800">
            <div className="text-xs text-slate-400">
              <span className="font-medium text-slate-300">Turbulence:</span>{' '}
              <span
                className={
                  status === 'GREEN BAR ACTIVE'
                    ? 'text-green-400 font-medium'
                    : status === 'ELEVATED'
                      ? 'text-amber-400'
                      : status === 'PENDING'
                        ? 'text-slate-500 italic'
                        : ''
                }
              >
                {status === 'PENDING' ? 'PENDING (waiting on FRED gates)' : status}
              </span>
              <span className="ml-3 text-slate-500">
                ShockZ={fmtNum(latest.shockZ)}{' '}
                SPX&gt;50DMA={
                  showAsOf
                    ? `${displayGateRow.spxAbove50dma ? 'true' : 'false'} (as of ${latestGateDate})`
                    : fmtBool(latest.spxAbove50dma)
                }{' '}
                VIX&lt;25={
                  showAsOf
                    ? `${displayGateRow.vixBelow25 ? 'true' : 'false'} (as of ${latestGateDate})`
                    : fmtBool(latest.vixBelow25)
                }
              </span>
            </div>
            {pendingGates && shockDate && (
              <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                {latest.shockZ != null && (
                  <div>
                    Shock: {shockDate} (z={fmtNum(latest.shockZ)}){' '}
                    {gatesDate != null
                      ? `| Gates: ${gatesDate} (lag ${lagDays}d)`
                      : '| Gates: pending'}
                  </div>
                )}
                <div>Gates lag by 0–1 days depending on FRED update timing.</div>
              </div>
            )}
            {/* 3-condition checklist (Jordi Visser Turbulence Model) */}
            <div className="text-xs text-slate-400 mt-1.5 space-y-0.5">
              <div>
                Covariance shock (ShockZ ≥ {SHOCK_Z_THRESHOLD}):{' '}
                {latest.shockZ != null ? (
                  <>
                    {shockMet ? '✅' : '❌'} (z={fmtNum(latest.shockZ)})
                  </>
                ) : (
                  '—'
                )}
              </div>
              <div>
                SPX &gt; 50DMA:{' '}
                {spxKnown ? (
                  <>
                    {spxMet ? '✅' : '❌'}
                    {showAsOf && latestGateDate && (
                      <span className="text-slate-500">
                        {' '}(as of {latestGateDate}{pendingGates ? ', pending' : ''})
                      </span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </div>
              <div>
                VIX &lt; 25:{' '}
                {vixKnown ? (
                  <>
                    {vixMet ? '✅' : '❌'}
                    {showAsOf && latestGateDate && (
                      <span className="text-slate-500">
                        {' '}(as of {latestGateDate}{pendingGates ? ', pending' : ''})
                      </span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowTurbulenceExplainer((v) => !v)}
                aria-expanded={showTurbulenceExplainer}
                aria-controls="turbulence-explainer-panel"
                aria-label="About Green Bar"
                className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 hover:underline focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-1 focus:ring-offset-zinc-950 rounded"
              >
                <svg
                  className="h-3 w-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                About Green Bar
              </button>
            </div>
            {showTurbulenceExplainer && (
              <div
                id="turbulence-explainer-panel"
                role="region"
                aria-label="Turbulence explainer"
                className="mt-2 rounded border border-zinc-800 bg-zinc-900/80 p-3 text-xs text-slate-400 space-y-2"
              >
                <div className="font-semibold text-slate-300">
                  Turbulence / &quot;Green Bar&quot;
                </div>
                <p>
                  A &quot;Green Bar&quot; flags hidden internal stress: correlations between assets are shifting fast even if the index still looks fine.
                </p>
                <p>
                  It triggers when ALL 3 align: (1) ShockZ ≥ {SHOCK_Z_THRESHOLD}, (2) SPX above its 50-day average, (3) VIX below 25.
                </p>
                <p>
                  ShockZ is computed from a proxy correlation matrix (sector ETFs). Gates come from FRED (SP500 + VIXCLS).
                </p>
                <p>
                  PENDING means Shock updated, but the latest FRED gate day hasn&apos;t posted yet (often 0–1 day lag).
                </p>
                <button
                  type="button"
                  onClick={() => setShowTurbulenceExplainer(false)}
                  className="text-slate-500 hover:text-slate-300 underline focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        );
      })()}

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Health History Chart */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-200">
                Market Health Over Time
              </h2>
              <div className="mt-1">
                <span className="text-xs font-medium text-zinc-300">{deckLabel}</span>
                {deckDescription && (
                  <span className="text-xs text-zinc-500 ml-2">— {deckDescription}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {([
                { key: 'health', label: 'Health' },
                { key: 'heat', label: 'Heat' },
                { key: 'upper', label: '% Upper' },
                { key: 'stretch', label: 'Stretch' },
                { key: 'medUpper', label: 'Med Upper' },
              ] as Array<{ key: MetricChoice; label: string }>).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`px-3 py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
                    metric === m.key
                      ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
              <button
                onClick={() => setShowMetricHelp((v) => !v)}
                className="px-2 py-1 text-xs rounded border bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                aria-label="Metric help"
                title="What do these metrics mean?"
              >
                What is this?
              </button>
              {(['3M', '1Y', 'ALL'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
                    timeframe === tf
                      ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  {tf}
                </button>
              ))}
              <button
                onClick={() => setShowDiffusion(!showDiffusion)}
                className={`px-3 py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
                  showDiffusion
                    ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                }`}
              >
                Diffusion
              </button>
            </div>
          </div>
          {showMetricHint && (
            <div className="mb-2 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
              Chart stuck at 100%? Click Heat / % Upper / Stretch / Med Upper above the chart.
              <button
                className="ml-3 text-zinc-300 underline hover:text-zinc-100"
                onClick={() => setShowMetricHint(false)}
              >
                Dismiss
              </button>
            </div>
          )}
          {showMetricHelp && (
            <div className="mb-2 rounded border border-zinc-800 bg-zinc-900/80 p-3 text-xs text-zinc-300">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-zinc-200">Why the line won’t move</span>
                <button
                  className="text-zinc-300 hover:text-zinc-100"
                  onClick={() => setShowMetricHelp(false)}
                >
                  Close
                </button>
              </div>
              <p className="text-zinc-400 mb-2">
                These buttons change what the line chart measures.
                <br />
                If Health is pegged at 100%, that’s not a bug — it’s a strong regime. Use the other metrics to see how ‘overcooked’ it is.
              </p>
              <div className="space-y-2 text-zinc-400">
                <div>
                  <div><span className="text-zinc-200">Health</span> — “Breadth: % GREEN tickers.”</div>
                  <div>“Strong markets can live at 100% forever. Annoying, but honest.”</div>
                </div>
                <div>
                  <div><span className="text-zinc-200">Heat</span> — “0–100 ‘how spicy is this rally?’ score.”</div>
                  <div>“Higher = hotter = more air in the balloon.”</div>
                </div>
                <div>
                  <div><span className="text-zinc-200">% Upper</span> — “% tickers above upper band.”</div>
                  <div>“How many names are officially partying too hard.”</div>
                </div>
                <div>
                  <div><span className="text-zinc-200">Stretch</span> — “Median % above 200D baseline.”</div>
                  <div>“How far above trend the deck is. Gravity still works.”</div>
                </div>
                <div>
                  <div><span className="text-zinc-200">Med Upper</span> — “Median % above upper band (only for tickers above it).”</div>
                  <div>“Not ‘how many,’ but ‘how insane.’”</div>
                </div>
              </div>
              <p className="text-zinc-400 mt-3">
                If Health is flat, stop staring at it. Click Heat / Stretch / Med Upper. That’s where the risk hides.
              </p>
            </div>
          )}
          {historyVariantFallback && (
            <p className="text-xs text-amber-400/90 mb-2 rounded border border-amber-600/40 bg-amber-950/30 px-3 py-2">
              Section history not ready/invalid — showing All history.
            </p>
          )}
          <p className="text-xs text-zinc-500 mb-2">
            Metric: {metric === 'health' ? 'Health' : metric === 'heat' ? 'Heat' : metric === 'upper' ? '% Upper' : metric === 'stretch' ? 'Stretch' : 'Med Upper'} (click buttons above to switch)
          </p>
          {firstValidPoint && filteredHistory.length > 0 && filteredHistory[0]!.date < firstValidPoint.date && (
            <p className="text-xs text-zinc-500 mb-2">
              Data unavailable before {firstValidPoint.date} (insufficient history)
            </p>
          )}
          {hasMissingHistoryRegion && (
            <p className="text-xs text-slate-400 mt-1 mb-2">
              Shaded region = insufficient history.
            </p>
          )}
          {historyCoverage.showCoverage && (
            <p className="text-xs text-slate-400 mt-1 mb-2">
              {historyCoverage.validPoints > 0
                ? `History coverage: ${historyCoverage.validPoints}/${historyCoverage.totalPoints} days (first valid: ${historyCoverage.firstValidDateString}).`
                : `History coverage: 0/${historyCoverage.totalPoints} days (no valid history in range).`}
            </p>
          )}
          {hasGreenBarInChartRange && (
            <p className="text-xs text-slate-400 mt-1 mb-2">
              Vertical bands = Green Bar events.
            </p>
          )}
          <HealthHistoryChart
            data={filteredHistory}
            showDiffusion={showDiffusion}
            metricKey={metricConfig.metricKey}
            metricLabel={metricConfig.label}
            yDomain={metricConfig.yDomain as any}
            greenBarDates={greenBarDates}
          />
        </div>

        {/* Heatmap Grid */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-1">
            Ticker Heatmap
          </h2>
          <p className="text-xs text-zinc-500 mb-3">{deckLabel} ({snapshot.universeSize} tickers)</p>
          <HeatmapGrid
            tickers={sortedTickers}
            onTileClick={handleTileClick}
          />
        </div>
      </main>

      <TrendModal
        ticker={selectedTicker}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        deckId={deckId}
        asOfDate={snapshot.asOfDate}
      />
    </div>
  );
}
