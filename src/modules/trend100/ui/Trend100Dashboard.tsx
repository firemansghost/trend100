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

interface Trend100DashboardProps {
  snapshot: TrendSnapshot;
  history: TrendHealthHistoryPoint[];
  deckId: TrendDeckId;
  deckLabel: string;
  deckDescription?: string;
  deckSections?: TrendDeckSection[];
  isDemoMode?: boolean;
}

export function Trend100Dashboard({
  snapshot,
  history,
  deckId,
  deckLabel,
  deckDescription,
  deckSections = [],
  isDemoMode = false,
}: Trend100DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('UNIVERSE');
  const [timeframe, setTimeframe] = useState<Timeframe>('1Y');
  const [selectedTicker, setSelectedTicker] =
    useState<TrendTickerSnapshot | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  // Apply filters first (section -> search -> tags)
  const filteredTickers = applyFilters(
    snapshot.tickers,
    searchQuery,
    selectedTags,
    selectedSection
  );

  // Then apply sorting
  const sortedTickers = sortTickers(filteredTickers, sortKey);

  // Filter history by timeframe and apply data-side hardening
  const filteredHistory = useMemo(() => {
    // Step 1: Filter to points <= snapshot.asOfDate (effective trading day)
    // This prevents weekend/invalid trailing points
    let filtered = history.filter((point) => point.date <= snapshot.asOfDate);

    // Step 2: Drop trailing all-zero points (belt-and-suspenders)
    while (
      filtered.length > 0 &&
      (filtered[filtered.length - 1]!.greenPct || 0) +
        (filtered[filtered.length - 1]!.yellowPct || 0) +
        (filtered[filtered.length - 1]!.redPct || 0) ===
        0
    ) {
      filtered = filtered.slice(0, -1);
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
            <div className="flex gap-2">
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
            </div>
          </div>
          <HealthHistoryChart data={filteredHistory} />
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
