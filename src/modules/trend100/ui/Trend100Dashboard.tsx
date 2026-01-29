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
type MetricChoice = 'health' | 'heat' | 'upper' | 'stretch';

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

  // Apply filters first (section -> group -> search -> tags)
  const filteredTickers = applyFilters(
    snapshot.tickers,
    searchQuery,
    selectedTags,
    selectedSection,
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
      {/* Group Toggle - show if deck has grouped tickers */}
      {hasGroups && availableGroups.length > 0 && (
        <div className="container mx-auto px-4 py-3 border-b border-zinc-800">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">Filter:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedGroup(null)}
                className={`px-3 py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
                  selectedGroup === null
                    ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                }`}
              >
                All
              </button>
              {availableGroups.map((group) => (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={`px-3 py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
                    selectedGroup === group
                      ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  {group === 'METALS' ? 'Metals' : group === 'MINERS' ? 'Miners' : group}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Section Pills - between TopBar and chart */}
      {deckSections.length > 0 && (
        <div className="container mx-auto px-4 py-3 border-b border-zinc-800">
          <SectionPills
            sections={deckSections}
            selectedSection={selectedSection}
            onChange={setSelectedSection}
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
