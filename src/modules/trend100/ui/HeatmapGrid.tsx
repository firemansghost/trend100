/**
 * HeatmapGrid component
 * 
 * Responsive grid of trend tiles.
 */

import type { TrendTickerSnapshot } from '../types';
import { TrendTile } from './TrendTile';

interface HeatmapGridProps {
  tickers: TrendTickerSnapshot[];
  onTileClick: (ticker: TrendTickerSnapshot) => void;
}

export function HeatmapGrid({ tickers, onTileClick }: HeatmapGridProps) {
  if (tickers.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-400">
        No tickers match the current filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-2">
      {tickers.map((ticker) => (
        <TrendTile
          key={ticker.ticker}
          snapshot={ticker}
          onClick={() => onTileClick(ticker)}
        />
      ))}
    </div>
  );
}
