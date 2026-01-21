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
  { ticker: 'SPY', tags: ['etf', 'index', 'broad-us'], section: 'Sectors' },
  { ticker: 'XLB', tags: ['etf', 'sector', 'materials'], section: 'Sectors' },
  { ticker: 'XLC', tags: ['etf', 'sector', 'communications'], section: 'Sectors' },
  { ticker: 'XLE', tags: ['etf', 'sector', 'energy'], section: 'Sectors' },
  { ticker: 'XLF', tags: ['etf', 'sector', 'financials'], section: 'Sectors' },
  { ticker: 'XLI', tags: ['etf', 'sector', 'industrials'], section: 'Sectors' },
  { ticker: 'XLK', tags: ['etf', 'sector', 'tech'], section: 'Sectors' },
  { ticker: 'XLP', tags: ['etf', 'sector', 'staples'], section: 'Sectors' },
  { ticker: 'XLRE', tags: ['etf', 'sector', 'real-estate'], section: 'Sectors' },
  { ticker: 'XLU', tags: ['etf', 'sector', 'utilities'], section: 'Sectors' },
  { ticker: 'XLV', tags: ['etf', 'sector', 'healthcare'], section: 'Sectors' },
  { ticker: 'XLY', tags: ['etf', 'sector', 'discretionary'], section: 'Sectors' },
];

/**
 * US Equity Factors deck (10 tickers)
 */
const US_FACTORS_UNIVERSE: TrendUniverse = [
  { ticker: 'IWB', tags: ['etf', 'factor', 'us', 'broad'], section: 'Size' },
  { ticker: 'IWD', tags: ['etf', 'factor', 'us', 'value'], section: 'Style' },
  { ticker: 'IWF', tags: ['etf', 'factor', 'us', 'growth'], section: 'Style' },
  { ticker: 'IWM', tags: ['etf', 'factor', 'us', 'smallcap'], section: 'Size' },
  { ticker: 'IWR', tags: ['etf', 'factor', 'us', 'midcap'], section: 'Size' },
  { ticker: 'MTUM', tags: ['etf', 'factor', 'us', 'momentum'], section: 'Momentum' },
  { ticker: 'QQQ', tags: ['etf', 'factor', 'us', 'nasdaq100'], section: 'Size' },
  { ticker: 'QUAL', tags: ['etf', 'factor', 'us', 'quality'], section: 'Quality/LowVol' },
  { ticker: 'SPHD', tags: ['etf', 'factor', 'us', 'dividend'], section: 'Quality/LowVol' },
  { ticker: 'SPLV', tags: ['etf', 'factor', 'us', 'low-vol'], section: 'Quality/LowVol' },
];

/**
 * Global Equities deck (11 tickers)
 */
const GLOBAL_EQUITIES_UNIVERSE: TrendUniverse = [
  { ticker: 'ACWX', tags: ['etf', 'global', 'ex-us'], section: 'Global ex-US' },
  { ticker: 'EEM', tags: ['etf', 'global', 'emerging'], section: 'Emerging' },
  { ticker: 'EWA', tags: ['etf', 'global', 'australia'], section: 'Developed' },
  { ticker: 'EWC', tags: ['etf', 'global', 'canada'], section: 'Developed' },
  { ticker: 'EWJ', tags: ['etf', 'global', 'japan'], section: 'Developed' },
  { ticker: 'EWU', tags: ['etf', 'global', 'uk'], section: 'Developed' },
  { ticker: 'EWZ', tags: ['etf', 'global', 'brazil'], section: 'Emerging' },
  { ticker: 'EZU', tags: ['etf', 'global', 'europe'], section: 'Developed' },
  { ticker: 'FXI', tags: ['etf', 'global', 'china'], section: 'Emerging' },
  { ticker: 'GNR', tags: ['etf', 'global', 'natural-resources'], section: 'Commodities/Resources' },
  { ticker: 'INDA', tags: ['etf', 'global', 'india'], section: 'Emerging' },
];

/**
 * Fixed Income Sectors deck (18 tickers)
 */
const FIXED_INCOME_UNIVERSE: TrendUniverse = [
  { ticker: 'AGG', tags: ['etf', 'rates', 'aggregate'], section: 'Rates' },
  { ticker: 'BILS', tags: ['etf', 'rates', 'short-term'], section: 'Cash' },
  { ticker: 'BIZD', tags: ['etf', 'credit', 'business-dev'], section: 'Loans/BDC' },
  { ticker: 'BKLN', tags: ['etf', 'credit', 'bank-loan'], section: 'Loans/BDC' },
  { ticker: 'BNDX', tags: ['etf', 'rates', 'international'], section: 'Rates' },
  { ticker: 'BWX', tags: ['etf', 'rates', 'international'], section: 'Rates' },
  { ticker: 'CWB', tags: ['etf', 'credit', 'convertible'], section: 'Credit' },
  { ticker: 'EMB', tags: ['etf', 'credit', 'emerging'], section: 'EM Debt' },
  { ticker: 'EMLC', tags: ['etf', 'credit', 'emerging-local'], section: 'EM Debt' },
  { ticker: 'HYG', tags: ['etf', 'credit', 'high-yield'], section: 'Credit' },
  { ticker: 'IEF', tags: ['etf', 'rates', 'intermediate'], section: 'Rates' },
  { ticker: 'LQD', tags: ['etf', 'credit', 'investment-grade'], section: 'Credit' },
  { ticker: 'MBB', tags: ['etf', 'rates', 'mortgage'], section: 'Securitized' },
  { ticker: 'PFF', tags: ['etf', 'credit', 'preferred'], section: 'Preferreds' },
  { ticker: 'SHY', tags: ['etf', 'rates', 'short-term'], section: 'Rates' },
  { ticker: 'STIP', tags: ['etf', 'rates', 'tips'], section: 'Rates' },
  { ticker: 'TIP', tags: ['etf', 'rates', 'tips'], section: 'Rates' },
  { ticker: 'TLT', tags: ['etf', 'rates', 'long-term'], section: 'Rates' },
];

/**
 * Macro Exposure deck (15 tickers + 2 crypto placeholders)
 */
const MACRO_UNIVERSE: TrendUniverse = [
  // Commodities
  { ticker: 'DBA', tags: ['etf', 'commodities', 'agriculture'], section: 'Commodities' },
  { ticker: 'DBB', tags: ['etf', 'commodities', 'metals'], section: 'Commodities' },
  { ticker: 'PDBC', tags: ['etf', 'commodities', 'diversified'], section: 'Commodities' },
  { ticker: 'USO', tags: ['etf', 'commodities', 'energy', 'oil'], section: 'Energy' },
  // FX
  { ticker: 'FXA', tags: ['etf', 'fx', 'australia'], section: 'FX' },
  { ticker: 'FXB', tags: ['etf', 'fx', 'uk'], section: 'FX' },
  { ticker: 'FXC', tags: ['etf', 'fx', 'canada'], section: 'FX' },
  { ticker: 'FXE', tags: ['etf', 'fx', 'euro'], section: 'FX' },
  { ticker: 'FXY', tags: ['etf', 'fx', 'japan'], section: 'FX' },
  { ticker: 'UUP', tags: ['etf', 'fx', 'dollar'], section: 'Dollar' },
  // Metals
  { ticker: 'GDX', tags: ['etf', 'metals', 'gold-miners'], section: 'Metals' },
  { ticker: 'GLDM', tags: ['etf', 'metals', 'gold'], section: 'Metals' },
  { ticker: 'SIL', tags: ['etf', 'metals', 'silver-miners'], section: 'Metals' },
  { ticker: 'SLV', tags: ['etf', 'metals', 'silver'], section: 'Metals' },
  // Uranium
  { ticker: 'SRUUF', tags: ['etf', 'uranium', 'energy'], section: 'Uranium' },
  // Crypto placeholders (not real tickers, but symbols for future provider mapping)
  { ticker: 'Bitcoin', tags: ['crypto'], section: 'Crypto', providerTicker: 'BTC-USD' },
  { ticker: 'Ethereum', tags: ['crypto'], section: 'Crypto', providerTicker: 'ETH-USD' },
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
    // No sections for Leadership (optional, can add later)
  },
  {
    id: 'US_SECTORS',
    label: 'US Sectors',
    description: 'US sector ETFs (SPY + 11 sector SPDRs)',
    universe: US_SECTORS_UNIVERSE,
    sections: [{ id: 'Sectors', label: 'Sectors' }],
  },
  {
    id: 'US_FACTORS',
    label: 'US Equity Factors',
    description: 'US equity factor ETFs (broad, value, growth, momentum, quality, etc.)',
    universe: US_FACTORS_UNIVERSE,
    sections: [
      { id: 'Size', label: 'Size' },
      { id: 'Style', label: 'Style' },
      { id: 'Quality/LowVol', label: 'Quality/LowVol' },
      { id: 'Momentum', label: 'Momentum' },
    ],
  },
  {
    id: 'GLOBAL_EQUITIES',
    label: 'Global Equities',
    description: 'Global and regional equity ETFs',
    universe: GLOBAL_EQUITIES_UNIVERSE,
    sections: [
      { id: 'Developed', label: 'Developed' },
      { id: 'Emerging', label: 'Emerging' },
      { id: 'Global ex-US', label: 'Global ex-US' },
      { id: 'Commodities/Resources', label: 'Commodities/Resources' },
    ],
  },
  {
    id: 'FIXED_INCOME',
    label: 'Fixed Income Sectors',
    description: 'Fixed income ETFs (rates, credit, emerging, TIPS)',
    universe: FIXED_INCOME_UNIVERSE,
    sections: [
      { id: 'Rates', label: 'Rates' },
      { id: 'Credit', label: 'Credit' },
      { id: 'EM Debt', label: 'EM Debt' },
      { id: 'Securitized', label: 'Securitized' },
      { id: 'Preferreds', label: 'Preferreds' },
      { id: 'Loans/BDC', label: 'Loans/BDC' },
      { id: 'Cash', label: 'Cash' },
    ],
  },
  {
    id: 'MACRO',
    label: 'Macro Exposure',
    description: 'Commodities, FX, metals, and crypto exposure',
    universe: MACRO_UNIVERSE,
    sections: [
      { id: 'FX', label: 'FX' },
      { id: 'Metals', label: 'Metals' },
      { id: 'Commodities', label: 'Commodities' },
      { id: 'Energy', label: 'Energy' },
      { id: 'Uranium', label: 'Uranium' },
      { id: 'Crypto', label: 'Crypto' },
      { id: 'Dollar', label: 'Dollar' },
    ],
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

/**
 * Set of valid deck IDs for fast lookup
 */
const DECK_ID_SET = new Set<TrendDeckId>(DECKS.map((d) => d.id));

/**
 * Type guard to check if a value is a valid TrendDeckId
 */
export function isDeckId(x: unknown): x is TrendDeckId {
  return typeof x === 'string' && DECK_ID_SET.has(x as TrendDeckId);
}
