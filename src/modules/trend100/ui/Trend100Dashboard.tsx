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
  initialMetric?: MetricChoice;
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
  initialMetric = 'health',
}: Trend100DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
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

  // Sync selectedGroup from URL (single source of truth when user navigates or loads with ?group=)
  useEffect(() => {
    setSelectedGroup(initialGroupFilter ?? null);
  }, [initialGroupFilter]);

  // Update URL when group filter changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (selectedGroup === null || selectedGroup === 'all') {
        url.searchParams.delete('group');
      } else {
        url.searchParams.set('group', selectedGroup.toLowerCase());
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, [selectedGroup]);

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

  // Find first valid point in displayed range (for notice)
  const firstValidPoint = useMemo(() => {
    for (const point of filteredHistory) {
      if (point.regimeLabel !== 'UNKNOWN') {
        return point;
      }
    }
    return null;
  }, [filteredHistory]);

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
      {/* Single group/section filter: counted tabs (All | Metals (5) | Miners (6)); for grouped decks this drives URL group= and chart + heatmap */}
      {deckSections.length > 0 && (
        <div className="container mx-auto px-4 py-3 border-b border-zinc-800">
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
      )}

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
          <p className="text-xs text-zinc-500 mb-2">
            Metric: {metric === 'health' ? 'Health' : metric === 'heat' ? 'Heat' : metric === 'upper' ? '% Upper' : metric === 'stretch' ? 'Stretch' : 'Med Upper'} (click buttons above to switch)
          </p>
          {firstValidPoint && filteredHistory.length > 0 && filteredHistory[0]!.date < firstValidPoint.date && (
            <p className="text-xs text-zinc-500 mb-2">
              Data unavailable before {firstValidPoint.date} (insufficient history)
            </p>
          )}
          <HealthHistoryChart
            data={filteredHistory}
            showDiffusion={showDiffusion}
            metricKey={metricConfig.metricKey}
            metricLabel={metricConfig.label}
            yDomain={metricConfig.yDomain as any}
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
