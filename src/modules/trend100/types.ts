/**
 * Trend100 module types
 * 
 * Core type definitions for the Trend100 Momentum Dashboard module.
 */

// Ticker symbol type
export type Ticker = string;

// Trend classification
export type TrendClassification = 'Bull' | 'Caution' | 'Bear';

// Market regime
export type MarketRegime = 'Risk-On' | 'Transition' | 'Risk-Off';

// Market Health Score (0-100)
export type MarketHealthScore = number;

// Price data point
export interface PriceData {
  date: Date;
  close: number;
  adjustedClose?: number;
}

// Moving average values
export interface MovingAverages {
  sma200d: number;
  sma50w: number;
  ema50w: number;
}

// Trend analysis result
export interface TrendAnalysis {
  ticker: Ticker;
  classification: TrendClassification;
  price: number;
  movingAverages: MovingAverages;
  distanceTo200d: number; // percentage
  distanceToBand?: number; // percentage (optional)
}

// Market summary
export interface MarketSummary {
  healthScore: MarketHealthScore;
  regime: MarketRegime;
  bullCount: number;
  cautionCount: number;
  bearCount: number;
}
