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

// Universe types
export type TrendTag = string;

export interface TrendUniverseItem {
  ticker: string;
  tags: TrendTag[];
  section?: string; // Optional section grouping (deck-specific)
  group?: string; // Optional group for filtering (e.g., "METALS", "MINERS")
  providerTicker?: string; // For future real-data provider mapping (e.g., "BTC-USD")
  subtitle?: string; // Optional short label for tiles (e.g., "FBTC", "Technology")
  name?: string; // Optional full descriptive name for modal (e.g., "Technology Select Sector SPDR Fund")
}

export type TrendUniverse = TrendUniverseItem[];

// Snapshot types
export type TrendStatus = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export interface TrendTickerSnapshot {
  ticker: string;
  tags: string[];
  section?: string; // Optional section grouping (deck-specific)
  group?: string; // Optional group for filtering (e.g., "METALS", "MINERS")
  subtitle?: string; // Optional short label for tiles (e.g., "FBTC", "Technology")
  name?: string; // Optional full descriptive name for modal (e.g., "Technology Select Sector SPDR Fund")
  status: TrendStatus;
  price: number;
  changePct?: number;
  sma200?: number;
  sma50w?: number;
  ema50w?: number;
  distanceTo200dPct?: number;
  distanceToUpperBandPct?: number;
}

export interface TrendHealthSummary {
  greenPct: number;
  yellowPct: number;
  redPct: number;
  regimeLabel: 'RISK_ON' | 'TRANSITION' | 'RISK_OFF';
}

export interface TrendSnapshot {
  runDate: string; // ISO YYYY-MM-DD - when the script ran
  asOfDate: string; // ISO YYYY-MM-DD - latest market bar date used (max bar.date across tickers)
  universeSize: number;
  tickers: TrendTickerSnapshot[];
  health: TrendHealthSummary;
}

// Health history types
export interface TrendHealthHistoryPoint {
  date: string; // YYYY-MM-DD
  greenPct: number; // 0-100 (may be 1 decimal); UNKNOWN points use 0
  yellowPct: number;
  redPct: number;
  regimeLabel: 'RISK_ON' | 'TRANSITION' | 'RISK_OFF' | 'UNKNOWN';
  // Diffusion: % of tickers that changed status vs previous trading day
  diffusionPct: number; // 0-100 (may be 1 decimal); first point uses 0
  diffusionCount: number; // Number of tickers that flipped
  diffusionTotalCompared: number; // Total tickers compared (both days known)

  // Overextension / peak-risk metrics (finite numbers; UNKNOWN points use 0)
  pctAboveUpperBand: number; // 0-100
  medianDistanceAboveUpperBandPct: number; // median distanceToUpperBandPct among tickers > 0
  stretch200MedianPct: number; // median distanceTo200dPct, can exceed 100
  heatScore: number; // 0-100 composite

  // Validity metadata (finite numbers)
  knownCount: number; // Number of tickers with known status (GREEN/YELLOW/RED)
  unknownCount: number; // Number of tickers not known (varies by denominator mode)
  totalTickers: number; // Total tickers in deck variant
  // Eligible denominator metadata (for MACRO and similar decks)
  eligibleCount?: number; // Number of tickers with bars (computable or ineligible)
  ineligibleCount?: number; // Number of tickers with bars but insufficient lookback
  missingCount?: number; // Number of tickers with no bars <= date
}

// Deck types
export type TrendDeckId =
  | 'LEADERSHIP'
  | 'US_SECTORS'
  | 'US_FACTORS'
  | 'GLOBAL_EQUITIES'
  | 'FIXED_INCOME'
  | 'MACRO'
  | 'METALS_MINING'
  | 'PLUMBING';

/** Plumbing War Lie Detector artifact (geopolitical plumbing indicator) */
export interface PlumbingWarLieDetector {
  asOf: string;
  inputs: {
    brentProxy: string;
    wtiProxy: string;
    goldProxy: string;
    riskProxy: string;
    tipsProxy: string;
    dxyProxy: string;
  };
  latest: {
    bno: number;
    uso: number;
    spread: number;
    bno_uso_ratio: number;
    spread_ma5: number;
    spread_roc3: number;
    spread_z30: number;
    spread_z60: number;
    gld: number;
    gld_spy_ratio: number;
    gld_spy_roc5: number;
    gld_tip_ratio: number;
    gld_tip_roc5: number;
  };
  signals: {
    spreadWatch: boolean;
    spreadActive: boolean;
    goldConfirm: boolean;
  };
  score: number;
  label: 'THEATER' | 'WATCH' | 'REAL_RISK';
  history: Array<{
    date: string;
    spread: number;
    bno_uso_ratio: number;
    spread_ma5: number;
    gld_spy_ratio: number;
  }>;
}

export interface TrendDeckSection {
  id: string;
  label: string;
}

export interface TrendDeck {
  id: TrendDeckId;
  label: string;
  description?: string;
  universe: TrendUniverse;
  sections?: TrendDeckSection[]; // Optional sections for this deck
}
