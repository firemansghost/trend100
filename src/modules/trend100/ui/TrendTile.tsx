/**
 * TrendTile component
 * 
 * Individual tile in the heatmap grid.
 */

import type { TrendTickerSnapshot } from '../types';

interface TrendTileProps {
  snapshot: TrendTickerSnapshot;
  onClick: () => void;
}

/**
 * Get color classes based on trend status
 */
function getStatusColors(status: TrendTickerSnapshot['status']): string {
  switch (status) {
    case 'GREEN':
      return 'bg-green-600/20 border-green-500/50 hover:bg-green-600/30';
    case 'YELLOW':
      return 'bg-yellow-600/20 border-yellow-500/50 hover:bg-yellow-600/30';
    case 'RED':
      return 'bg-red-600/20 border-red-500/50 hover:bg-red-600/30';
    case 'UNKNOWN':
      return 'bg-zinc-700/20 border-zinc-600/50 hover:bg-zinc-700/30';
    default:
      return 'bg-zinc-700/20 border-zinc-600/50';
  }
}

/**
 * Format change percentage with sign
 */
function formatChangePct(changePct?: number): string {
  if (changePct === undefined) return '';
  const sign = changePct >= 0 ? '+' : '';
  return `${sign}${changePct.toFixed(2)}%`;
}

export function TrendTile({ snapshot, onClick }: TrendTileProps) {
  const statusColors = getStatusColors(snapshot.status);

  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center p-3 rounded-lg border-2
        transition-all duration-200 cursor-pointer
        ${statusColors}
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 focus:ring-zinc-500
      `}
      aria-label={`${snapshot.ticker} - ${snapshot.status}`}
    >
      <div className="text-lg font-bold text-zinc-100 mb-1">
        {snapshot.ticker}
      </div>
      <div className="text-xs text-zinc-400">
        ${snapshot.price.toFixed(2)}
      </div>
      {snapshot.changePct !== undefined && (
        <div
          className={`text-xs mt-0.5 ${
            snapshot.changePct >= 0 ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {formatChangePct(snapshot.changePct)}
        </div>
      )}
    </button>
  );
}
