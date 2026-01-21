/**
 * TopBar component
 * 
 * Market health summary, search, and tag filters.
 */

'use client';

import { useState } from 'react';
import type { TrendHealthSummary, TrendTickerSnapshot } from '../types';
import { getAllTags } from './tagUtils';

interface TopBarProps {
  health: TrendHealthSummary;
  asOfDate: string;
  allTickers: TrendTickerSnapshot[];
  filteredCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
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
}: TopBarProps) {
  const availableTags = getAllTags(allTickers);
  const isFiltered = filteredCount !== allTickers.length;

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
    <div className="bg-zinc-900 border-b border-zinc-800 p-4 space-y-4">
      {/* Market Health Row */}
      <div className="flex flex-wrap items-center gap-4">
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
              <span className="px-2 py-1 text-xs text-zinc-500">
                +{availableTags.length - 12} more
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
