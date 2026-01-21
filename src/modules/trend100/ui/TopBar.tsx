/**
 * TopBar component
 * 
 * Market health summary, search, and tag filters.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TrendHealthSummary, TrendTickerSnapshot, TrendDeckId } from '../types';
import { getAllTags } from './tagUtils';
import { TagPickerModal } from './TagPickerModal';
import { DemoBadge } from './DemoBadge';
import type { SortKey } from './sortUtils';
import { DECKS } from '../data/decks';

interface TopBarProps {
  health: TrendHealthSummary;
  asOfDate: string;
  allTickers: TrendTickerSnapshot[];
  filteredCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  deckId: TrendDeckId;
  deckLabel: string;
  isDemoMode?: boolean;
}

export function TopBar({
  health,
  asOfDate,
  allTickers,
  filteredCount,
  searchQuery,
  onSearchChange,
  selectedTags,
  onTagsChange,
  sortKey,
  onSortChange,
  deckId,
  deckLabel,
  isDemoMode = false,
}: TopBarProps) {
  const router = useRouter();
  const availableTags = getAllTags(allTickers);
  const isFiltered = filteredCount !== allTickers.length;
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);

  const handleDeckChange = (newDeckId: TrendDeckId) => {
    // Update URL with deck param (or remove it for default LEADERSHIP)
    // Use router.refresh() to force server component re-render
    if (newDeckId === 'LEADERSHIP') {
      router.push('/');
      router.refresh();
    } else {
      router.push(`/?deck=${newDeckId}`);
      router.refresh();
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const clearFilters = () => {
    onSearchChange('');
    onTagsChange([]);
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'RISK_ON':
        return 'bg-green-600/20 text-green-400 border-green-500/50';
      case 'TRANSITION':
        return 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50';
      case 'RISK_OFF':
        return 'bg-red-600/20 text-red-400 border-red-500/50';
      default:
        return 'bg-zinc-700/20 text-zinc-400 border-zinc-600/50';
    }
  };

  return (
    <>
      <div className="bg-zinc-900 border-b border-zinc-800 p-4 space-y-4">
        {/* Deck Selector and Market Health Row */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Deck Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400 whitespace-nowrap">Deck:</label>
            <select
              value={deckId}
              onChange={(e) => handleDeckChange(e.target.value as TrendDeckId)}
              className="px-3 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
            >
              {DECKS.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.label}
                </option>
              ))}
            </select>
          </div>
        <div>
          <div className="text-xs text-zinc-400 mb-1">Market Health</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-zinc-300">{health.greenPct}%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-sm text-zinc-300">{health.yellowPct}%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-sm text-zinc-300">{health.redPct}%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded border text-xs font-medium ${getRegimeColor(
              health.regimeLabel
            )}`}
          >
            {health.regimeLabel.replace('_', ' ')}
          </span>
        </div>

        <div className="text-xs text-zinc-500">
          As of {asOfDate}
        </div>

        {isFiltered && (
          <div className="text-xs text-zinc-400">
            Showing {filteredCount}/{allTickers.length}
          </div>
        )}
      </div>

      {/* Search and Filters Row */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search tickers..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
          />
        </div>

        {/* Sort Control */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400 whitespace-nowrap">Sort:</label>
          <select
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
          >
            <option value="UNIVERSE">Universe</option>
            <option value="STATUS">Status</option>
            <option value="CHANGE">Change</option>
            <option value="TICKER">Ticker</option>
          </select>
        </div>

        {/* Tag Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {(selectedTags.length > 0 || searchQuery) && (
            <button
              onClick={clearFilters}
              className="px-3 py-1 text-xs bg-zinc-800 text-zinc-300 rounded border border-zinc-700 hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              Clear
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            {availableTags.slice(0, 12).map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-2 py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
                    isSelected
                      ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
            {availableTags.length > 12 && (
              <button
                onClick={() => setIsTagPickerOpen(true)}
                className="px-2 py-1 text-xs text-zinc-400 border border-zinc-700 rounded bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-300 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500"
                aria-label={`Show all ${availableTags.length} tags`}
              >
                +{availableTags.length - 12} more
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
      {isDemoMode && <DemoBadge />}
      <TagPickerModal
        isOpen={isTagPickerOpen}
        onClose={() => setIsTagPickerOpen(false)}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onTagsChange={onTagsChange}
      />
    </>
  );
}
