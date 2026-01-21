/**
 * TrendModal component
 * 
 * "Visser View" modal showing detailed ticker information.
 */

'use client';

import { useEffect } from 'react';
import type { TrendTickerSnapshot } from '../types';

interface TrendModalProps {
  ticker: TrendTickerSnapshot | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Format percentage with sign
 */
function formatPct(value?: number): string {
  if (value === undefined) return 'N/A';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function TrendModal({ ticker, isOpen, onClose }: TrendModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !ticker) {
    return null;
  }

  const statusColors = {
    GREEN: 'text-green-400',
    YELLOW: 'text-yellow-400',
    RED: 'text-red-400',
    UNKNOWN: 'text-zinc-400',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-zinc-900 border-2 border-zinc-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100 mb-1">
              {ticker.ticker}
            </h2>
            <div className={`text-sm font-medium ${statusColors[ticker.status]}`}>
              {ticker.status}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded p-1"
            aria-label="Close modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tags */}
        {ticker.tags.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              {ticker.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-zinc-800 text-zinc-300 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Price Info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-xs text-zinc-400 mb-1">Price</div>
            <div className="text-lg font-semibold text-zinc-100">
              ${ticker.price.toFixed(2)}
            </div>
          </div>
          {ticker.changePct !== undefined && (
            <div>
              <div className="text-xs text-zinc-400 mb-1">Change</div>
              <div
                className={`text-lg font-semibold ${
                  ticker.changePct >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {formatPct(ticker.changePct)}
              </div>
            </div>
          )}
        </div>

        {/* Moving Averages */}
        {(ticker.sma200 !== undefined ||
          ticker.sma50w !== undefined ||
          ticker.ema50w !== undefined) && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">
              Moving Averages
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {ticker.sma200 !== undefined && (
                <div>
                  <div className="text-zinc-400 mb-1">200d SMA</div>
                  <div className="text-zinc-100">${ticker.sma200.toFixed(2)}</div>
                </div>
              )}
              {ticker.sma50w !== undefined && (
                <div>
                  <div className="text-zinc-400 mb-1">50w SMA</div>
                  <div className="text-zinc-100">${ticker.sma50w.toFixed(2)}</div>
                </div>
              )}
              {ticker.ema50w !== undefined && (
                <div>
                  <div className="text-zinc-400 mb-1">50w EMA</div>
                  <div className="text-zinc-100">${ticker.ema50w.toFixed(2)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Distance Metrics */}
        {(ticker.distanceTo200dPct !== undefined ||
          ticker.distanceToUpperBandPct !== undefined) && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">
              Distance Metrics
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {ticker.distanceTo200dPct !== undefined && (
                <div>
                  <div className="text-zinc-400 mb-1">Distance to 200d</div>
                  <div className="text-zinc-100">{formatPct(ticker.distanceTo200dPct)}</div>
                </div>
              )}
              {ticker.distanceToUpperBandPct !== undefined && (
                <div>
                  <div className="text-zinc-400 mb-1">Distance to Upper Band</div>
                  <div className="text-zinc-100">
                    {formatPct(ticker.distanceToUpperBandPct)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chart Placeholder */}
        <div className="mt-6 pt-6 border-t border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Chart</h3>
          <div className="bg-zinc-800 rounded p-8 text-center text-zinc-500">
            Chart coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
