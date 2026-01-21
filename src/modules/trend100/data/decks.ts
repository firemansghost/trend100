/**
 * Deck registry
 * 
 * Defines all available decks (curated universes) for Trend100.
 * Each deck has its own universe, health summary, and history.
 */

import type { TrendDeck, TrendDeckId, TrendUniverse } from '../types';
import { DEFAULT_UNIVERSE } from './universe';
import { validateUniverse } from './validateUniverse';

/**
 * US Sectors deck (12 tickers)
 */
const US_SECTORS_UNIVERSE: TrendUniverse = [
  { ticker: 'SPY', tags: ['etf', 'index', 'broad-us'] },
  { ticker: 'XLB', tags: ['etf', 'sector', 'materials'] },
  { ticker: 'XLC', tags: ['etf', 'sector', 'communications'] },
  { ticker: 'XLE', tags: ['etf', 'sector', 'energy'] },
  { ticker: 'XLF', tags: ['etf', 'sector', 'financials'] },
  { ticker: 'XLI', tags: ['etf', 'sector', 'industrials'] },
  { ticker: 'XLK', tags: ['etf', 'sector', 'tech'] },
  { ticker: 'XLP', tags: ['etf', 'sector', 'staples'] },
  { ticker: 'XLRE', tags: ['etf', 'sector', 'real-estate'] },
  { ticker: 'XLU', tags: ['etf', 'sector', 'utilities'] },
  { ticker: 'XLV', tags: ['etf', 'sector', 'healthcare'] },
  { ticker: 'XLY', tags: ['etf', 'sector', 'discretionary'] },
];

/**
 * US Equity Factors deck (10 tickers)
 */
const US_FACTORS_UNIVERSE: TrendUniverse = [
  { ticker: 'IWB', tags: ['etf', 'factor', 'us', 'broad'] },
  { ticker: 'IWD', tags: ['etf', 'factor', 'us', 'value'] },
  { ticker: 'IWF', tags: ['etf', 'factor', 'us', 'growth'] },
  { ticker: 'IWM', tags: ['etf', 'factor', 'us', 'smallcap'] },
  { ticker: 'IWR', tags: ['etf', 'factor', 'us', 'midcap'] },
  { ticker: 'MTUM', tags: ['etf', 'factor', 'us', 'momentum'] },
  { ticker: 'QQQ', tags: ['etf', 'factor', 'us', 'nasdaq100'] },
  { ticker: 'QUAL', tags: ['etf', 'factor', 'us', 'quality'] },
  { ticker: 'SPHD', tags: ['etf', 'factor', 'us', 'dividend'] },
  { ticker: 'SPLV', tags: ['etf', 'factor', 'us', 'low-vol'] },
];

/**
 * Global Equities deck (11 tickers)
 */
const GLOBAL_EQUITIES_UNIVERSE: TrendUniverse = [
  { ticker: 'ACWX', tags: ['etf', 'global', 'ex-us'] },
  { ticker: 'EEM', tags: ['etf', 'global', 'emerging'] },
  { ticker: 'EWA', tags: ['etf', 'global', 'australia'] },
  { ticker: 'EWC', tags: ['etf', 'global', 'canada'] },
  { ticker: 'EWJ', tags: ['etf', 'global', 'japan'] },
  { ticker: 'EWU', tags: ['etf', 'global', 'uk'] },
  { ticker: 'EWZ', tags: ['etf', 'global', 'brazil'] },
  { ticker: 'EZU', tags: ['etf', 'global', 'europe'] },
  { ticker: 'FXI', tags: ['etf', 'global', 'china'] },
  { ticker: 'GNR', tags: ['etf', 'global', 'natural-resources'] },
  { ticker: 'INDA', tags: ['etf', 'global', 'india'] },
];

/**
 * Fixed Income Sectors deck (18 tickers)
 */
const FIXED_INCOME_UNIVERSE: TrendUniverse = [
  { ticker: 'AGG', tags: ['etf', 'rates', 'aggregate'] },
  { ticker: 'BILS', tags: ['etf', 'rates', 'short-term'] },
  { ticker: 'BIZD', tags: ['etf', 'credit', 'business-dev'] },
  { ticker: 'BKLN', tags: ['etf', 'credit', 'bank-loan'] },
  { ticker: 'BNDX', tags: ['etf', 'rates', 'international'] },
  { ticker: 'BWX', tags: ['etf', 'rates', 'international'] },
  { ticker: 'CWB', tags: ['etf', 'credit', 'convertible'] },
  { ticker: 'EMB', tags: ['etf', 'credit', 'emerging'] },
  { ticker: 'EMLC', tags: ['etf', 'credit', 'emerging-local'] },
  { ticker: 'HYG', tags: ['etf', 'credit', 'high-yield'] },
  { ticker: 'IEF', tags: ['etf', 'rates', 'intermediate'] },
  { ticker: 'LQD', tags: ['etf', 'credit', 'investment-grade'] },
  { ticker: 'MBB', tags: ['etf', 'rates', 'mortgage'] },
  { ticker: 'PFF', tags: ['etf', 'credit', 'preferred'] },
  { ticker: 'SHY', tags: ['etf', 'rates', 'short-term'] },
  { ticker: 'STIP', tags: ['etf', 'rates', 'tips'] },
  { ticker: 'TIP', tags: ['etf', 'rates', 'tips'] },
  { ticker: 'TLT', tags: ['etf', 'rates', 'long-term'] },
];

/**
 * Macro Exposure deck (15 tickers + 2 crypto placeholders)
 */
const MACRO_UNIVERSE: TrendUniverse = [
  // Commodities
  { ticker: 'DBA', tags: ['etf', 'commodities', 'agriculture'] },
  { ticker: 'DBB', tags: ['etf', 'commodities', 'metals'] },
  { ticker: 'PDBC', tags: ['etf', 'commodities', 'diversified'] },
  { ticker: 'USO', tags: ['etf', 'commodities', 'energy', 'oil'] },
  // FX
  { ticker: 'FXA', tags: ['etf', 'fx', 'australia'] },
  { ticker: 'FXB', tags: ['etf', 'fx', 'uk'] },
  { ticker: 'FXC', tags: ['etf', 'fx', 'canada'] },
  { ticker: 'FXE', tags: ['etf', 'fx', 'euro'] },
  { ticker: 'FXY', tags: ['etf', 'fx', 'japan'] },
  { ticker: 'UUP', tags: ['etf', 'fx', 'dollar'] },
  // Metals
  { ticker: 'GDX', tags: ['etf', 'metals', 'gold-miners'] },
  { ticker: 'GLDM', tags: ['etf', 'metals', 'gold'] },
  { ticker: 'SIL', tags: ['etf', 'metals', 'silver-miners'] },
  { ticker: 'SLV', tags: ['etf', 'metals', 'silver'] },
  // Uranium
  { ticker: 'SRUUF', tags: ['etf', 'uranium', 'energy'] },
  // Crypto placeholders (not real tickers, but symbols for future provider mapping)
  { ticker: 'Bitcoin', tags: ['crypto'], providerTicker: 'BTC-USD' },
  { ticker: 'Ethereum', tags: ['crypto'], providerTicker: 'ETH-USD' },
];

// Validate all universes
validateUniverse(US_SECTORS_UNIVERSE);
validateUniverse(US_FACTORS_UNIVERSE);
validateUniverse(GLOBAL_EQUITIES_UNIVERSE);
validateUniverse(FIXED_INCOME_UNIVERSE);
validateUniverse(MACRO_UNIVERSE);

/**
 * All available decks
 */
export const DECKS: TrendDeck[] = [
  {
    id: 'LEADERSHIP',
    label: 'Leadership 100',
    description: '100 curated high-liquidity tickers representing market leadership',
    universe: DEFAULT_UNIVERSE,
  },
  {
    id: 'US_SECTORS',
    label: 'US Sectors',
    description: 'US sector ETFs (SPY + 11 sector SPDRs)',
    universe: US_SECTORS_UNIVERSE,
  },
  {
    id: 'US_FACTORS',
    label: 'US Equity Factors',
    description: 'US equity factor ETFs (broad, value, growth, momentum, quality, etc.)',
    universe: US_FACTORS_UNIVERSE,
  },
  {
    id: 'GLOBAL_EQUITIES',
    label: 'Global Equities',
    description: 'Global and regional equity ETFs',
    universe: GLOBAL_EQUITIES_UNIVERSE,
  },
  {
    id: 'FIXED_INCOME',
    label: 'Fixed Income Sectors',
    description: 'Fixed income ETFs (rates, credit, emerging, TIPS)',
    universe: FIXED_INCOME_UNIVERSE,
  },
  {
    id: 'MACRO',
    label: 'Macro Exposure',
    description: 'Commodities, FX, metals, and crypto exposure',
    universe: MACRO_UNIVERSE,
  },
];

/**
 * Get a deck by ID, with safe fallback to LEADERSHIP
 */
export function getDeck(deckId: TrendDeckId): TrendDeck {
  const deck = DECKS.find((d) => d.id === deckId);
  if (!deck) {
    console.warn(`Deck ${deckId} not found, falling back to LEADERSHIP`);
    return DECKS[0]; // LEADERSHIP
  }
  return deck;
}

/**
 * Get all deck IDs
 */
export function getAllDeckIds(): TrendDeckId[] {
  return DECKS.map((d) => d.id);
}
