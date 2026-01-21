/**
 * Trend100Dashboard component
 * 
 * Main dashboard component that orchestrates all UI elements.
 */

'use client';

import { useState, useMemo } from 'react';
import type {
  TrendSnapshot,
  TrendTickerSnapshot,
  TrendHealthHistoryPoint,
} from '../types';
import { TopBar } from './TopBar';
import { HeatmapGrid } from './HeatmapGrid';
import { TrendModal } from './TrendModal';
import { HealthHistoryChart } from './HealthHistoryChart';
import { applyFilters } from './tagUtils';
import { sortTickers, type SortKey } from './sortUtils';

type Timeframe = '3M' | '1Y' | 'ALL';

interface Trend100DashboardProps {
  snapshot: TrendSnapshot;
  history: TrendHealthHistoryPoint[];
  isDemoMode?: boolean;
}

export function Trend100Dashboard({
  snapshot,
  history,
  isDemoMode = false,
}: Trend100DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('UNIVERSE');
  const [timeframe, setTimeframe] = useState<Timeframe>('1Y');
  const [selectedTicker, setSelectedTicker] =
    useState<TrendTickerSnapshot | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Apply filters first
  const filteredTickers = applyFilters(
    snapshot.tickers,
    searchQuery,
    selectedTags
  );

  // Then apply sorting
  const sortedTickers = sortTickers(filteredTickers, sortKey);

  // Filter history by timeframe
  const filteredHistory = useMemo(() => {
    let points: number;
    switch (timeframe) {
      case '3M':
        points = 90;
        break;
      case '1Y':
        points = 365;
        break;
      case 'ALL':
        return history;
      default:
        points = 365;
    }
    return history.slice(-points);
  }, [history, timeframe]);

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
        isDemoMode={isDemoMode}
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Health History Chart */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-200">
              Market Health Over Time
            </h2>
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
          <h2 className="text-lg font-semibold text-zinc-200 mb-3">
            Ticker Heatmap
          </h2>
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
      />
    </div>
  );
}
