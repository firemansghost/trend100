/**
 * Trend100Dashboard component
 * 
 * Main dashboard component that orchestrates all UI elements.
 */

'use client';

import { useState } from 'react';
import type { TrendSnapshot, TrendTickerSnapshot } from '../types';
import { TopBar } from './TopBar';
import { HeatmapGrid } from './HeatmapGrid';
import { TrendModal } from './TrendModal';
import { applyFilters } from './tagUtils';
import { sortTickers, type SortKey } from './sortUtils';

interface Trend100DashboardProps {
  snapshot: TrendSnapshot;
  isDemoMode?: boolean;
}

export function Trend100Dashboard({
  snapshot,
  isDemoMode = false,
}: Trend100DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('UNIVERSE');
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

      <main className="container mx-auto px-4 py-6">
        <HeatmapGrid
          tickers={sortedTickers}
          onTileClick={handleTileClick}
        />
      </main>

      <TrendModal
        ticker={selectedTicker}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}
