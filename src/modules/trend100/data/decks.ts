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
  { ticker: 'SPY', tags: ['etf', 'index', 'broad-us'], section: 'Sectors', subtitle: 'S&P 500', name: 'SPDR S&P 500 ETF Trust' },
  { ticker: 'XLB', tags: ['etf', 'sector', 'materials'], section: 'Sectors', subtitle: 'Materials', name: 'Materials Select Sector SPDR Fund' },
  { ticker: 'XLC', tags: ['etf', 'sector', 'communications'], section: 'Sectors', subtitle: 'Comm Svcs', name: 'Communication Services Select Sector SPDR Fund' },
  { ticker: 'XLE', tags: ['etf', 'sector', 'energy'], section: 'Sectors', subtitle: 'Energy', name: 'Energy Select Sector SPDR Fund' },
  { ticker: 'XLF', tags: ['etf', 'sector', 'financials'], section: 'Sectors', subtitle: 'Financials', name: 'Financial Select Sector SPDR Fund' },
  { ticker: 'XLI', tags: ['etf', 'sector', 'industrials'], section: 'Sectors', subtitle: 'Industrials', name: 'Industrial Select Sector SPDR Fund' },
  { ticker: 'XLK', tags: ['etf', 'sector', 'tech'], section: 'Sectors', subtitle: 'Technology', name: 'Technology Select Sector SPDR Fund' },
  { ticker: 'XLP', tags: ['etf', 'sector', 'staples'], section: 'Sectors', subtitle: 'Staples', name: 'Consumer Staples Select Sector SPDR Fund' },
  { ticker: 'XLRE', tags: ['etf', 'sector', 'real-estate'], section: 'Sectors', subtitle: 'Real Estate', name: 'Real Estate Select Sector SPDR Fund' },
  { ticker: 'XLU', tags: ['etf', 'sector', 'utilities'], section: 'Sectors', subtitle: 'Utilities', name: 'Utilities Select Sector SPDR Fund' },
  { ticker: 'XLV', tags: ['etf', 'sector', 'healthcare'], section: 'Sectors', subtitle: 'Health Care', name: 'Health Care Select Sector SPDR Fund' },
  { ticker: 'XLY', tags: ['etf', 'sector', 'discretionary'], section: 'Sectors', subtitle: 'Discretionary', name: 'Consumer Discretionary Select Sector SPDR Fund' },
];

/**
 * US Equity Factors deck (10 tickers)
 */
const US_FACTORS_UNIVERSE: TrendUniverse = [
  { ticker: 'IWB', tags: ['etf', 'factor', 'us', 'broad'], section: 'Size', subtitle: 'Large Cap', name: 'iShares Russell 1000 ETF' },
  { ticker: 'IWD', tags: ['etf', 'factor', 'us', 'value'], section: 'Style', subtitle: 'Value', name: 'iShares Russell 1000 Value ETF' },
  { ticker: 'IWF', tags: ['etf', 'factor', 'us', 'growth'], section: 'Style', subtitle: 'Growth', name: 'iShares Russell 1000 Growth ETF' },
  { ticker: 'IWM', tags: ['etf', 'factor', 'us', 'smallcap'], section: 'Size', subtitle: 'Small Cap', name: 'iShares Russell 2000 ETF' },
  { ticker: 'IWR', tags: ['etf', 'factor', 'us', 'midcap'], section: 'Size', subtitle: 'Mid Cap', name: 'iShares Russell Mid-Cap ETF' },
  { ticker: 'MTUM', tags: ['etf', 'factor', 'us', 'momentum'], section: 'Momentum', subtitle: 'Momentum', name: 'iShares MSCI USA Momentum Factor ETF' },
  { ticker: 'QQQ', tags: ['etf', 'factor', 'us', 'nasdaq100'], section: 'Size', subtitle: 'Nasdaq 100', name: 'Invesco QQQ Trust' },
  { ticker: 'QUAL', tags: ['etf', 'factor', 'us', 'quality'], section: 'Quality/LowVol', subtitle: 'Quality', name: 'iShares MSCI USA Quality Factor ETF' },
  { ticker: 'SPHD', tags: ['etf', 'factor', 'us', 'dividend'], section: 'Quality/LowVol', subtitle: 'HiDiv LowVol', name: 'Invesco S&P 500 High Dividend Low Volatility ETF' },
  { ticker: 'SPLV', tags: ['etf', 'factor', 'us', 'low-vol'], section: 'Quality/LowVol', subtitle: 'Low Vol', name: 'Invesco S&P 500 Low Volatility ETF' },
];

/**
 * Global Equities deck (11 tickers)
 */
const GLOBAL_EQUITIES_UNIVERSE: TrendUniverse = [
  { ticker: 'ACWX', tags: ['etf', 'global', 'ex-us'], section: 'Global ex-US', subtitle: 'ACWI ex-US', name: 'iShares MSCI ACWI ex US ETF' },
  { ticker: 'EEM', tags: ['etf', 'global', 'emerging'], section: 'Emerging', subtitle: 'Emerging', name: 'iShares MSCI Emerging Markets ETF' },
  { ticker: 'EWA', tags: ['etf', 'global', 'australia'], section: 'Developed', subtitle: 'Australia', name: 'iShares MSCI Australia ETF' },
  { ticker: 'EWC', tags: ['etf', 'global', 'canada'], section: 'Developed', subtitle: 'Canada', name: 'iShares MSCI Canada ETF' },
  { ticker: 'EWJ', tags: ['etf', 'global', 'japan'], section: 'Developed', subtitle: 'Japan', name: 'iShares MSCI Japan ETF' },
  { ticker: 'EWU', tags: ['etf', 'global', 'uk'], section: 'Developed', subtitle: 'UK', name: 'iShares MSCI United Kingdom ETF' },
  { ticker: 'EWZ', tags: ['etf', 'global', 'brazil'], section: 'Emerging', subtitle: 'Brazil', name: 'iShares MSCI Brazil ETF' },
  { ticker: 'EZU', tags: ['etf', 'global', 'europe'], section: 'Developed', subtitle: 'Eurozone', name: 'iShares MSCI Eurozone ETF' },
  { ticker: 'FXI', tags: ['etf', 'global', 'china'], section: 'Emerging', subtitle: 'China LC', name: 'iShares China Large-Cap ETF' },
  { ticker: 'GNR', tags: ['etf', 'global', 'natural-resources'], section: 'Commodities/Resources', subtitle: 'Nat Resources', name: 'SPDR S&P Global Natural Resources ETF' },
  { ticker: 'INDA', tags: ['etf', 'global', 'india'], section: 'Emerging', subtitle: 'India', name: 'iShares MSCI India ETF' },
];

/**
 * Fixed Income Sectors deck (18 tickers)
 */
const FIXED_INCOME_UNIVERSE: TrendUniverse = [
  { ticker: 'AGG', tags: ['etf', 'rates', 'aggregate'], section: 'Rates', subtitle: 'Agg Bond', name: 'iShares Core U.S. Aggregate Bond ETF' },
  { ticker: 'BILS', tags: ['etf', 'rates', 'short-term'], section: 'Cash', subtitle: 'T-Bills', name: 'SPDR Bloomberg 3-12 Month T-Bill ETF' },
  { ticker: 'BIZD', tags: ['etf', 'credit', 'business-dev'], section: 'Loans/BDC', subtitle: 'BDCs', name: 'VanEck Business Development Company ETF' },
  { ticker: 'BKLN', tags: ['etf', 'credit', 'bank-loan'], section: 'Loans/BDC', subtitle: 'Bank Loans', name: 'Invesco Senior Loan ETF' },
  { ticker: 'BNDX', tags: ['etf', 'rates', 'international'], section: 'Rates', subtitle: 'Intl Bond', name: 'Vanguard Total International Bond ETF' },
  { ticker: 'BWX', tags: ['etf', 'rates', 'international'], section: 'Rates', subtitle: 'Intl Corp', name: 'SPDR Bloomberg International Corporate Bond ETF' },
  { ticker: 'CWB', tags: ['etf', 'credit', 'convertible'], section: 'Credit', subtitle: 'Convertibles', name: 'SPDR Bloomberg Convertible Securities ETF' },
  { ticker: 'EMB', tags: ['etf', 'credit', 'emerging'], section: 'EM Debt', subtitle: 'EM USD Debt', name: 'iShares J.P. Morgan USD Emerging Markets Bond ETF' },
  { ticker: 'EMLC', tags: ['etf', 'credit', 'emerging-local'], section: 'EM Debt', subtitle: 'EM Local', name: 'VanEck J.P. Morgan EM Local Currency Bond ETF' },
  { ticker: 'HYG', tags: ['etf', 'credit', 'high-yield'], section: 'Credit', subtitle: 'High Yield', name: 'iShares iBoxx $ High Yield Corporate Bond ETF' },
  { ticker: 'IEF', tags: ['etf', 'rates', 'intermediate'], section: 'Rates', subtitle: '7–10y Tsy', name: 'iShares 7-10 Year Treasury Bond ETF' },
  { ticker: 'LQD', tags: ['etf', 'credit', 'investment-grade'], section: 'Credit', subtitle: 'IG Credit', name: 'iShares iBoxx $ Investment Grade Corporate Bond ETF' },
  { ticker: 'MBB', tags: ['etf', 'rates', 'mortgage'], section: 'Securitized', subtitle: 'MBS', name: 'iShares MBS ETF' },
  { ticker: 'PFF', tags: ['etf', 'credit', 'preferred'], section: 'Preferreds', subtitle: 'Preferreds', name: 'iShares Preferred & Income Securities ETF' },
  { ticker: 'SHY', tags: ['etf', 'rates', 'short-term'], section: 'Rates', subtitle: '1–3y Tsy', name: 'iShares 1-3 Year Treasury Bond ETF' },
  { ticker: 'STIP', tags: ['etf', 'rates', 'tips'], section: 'Rates', subtitle: 'Short TIPS', name: 'iShares 0-5 Year TIPS Bond ETF' },
  { ticker: 'TIP', tags: ['etf', 'rates', 'tips'], section: 'Rates', subtitle: 'TIPS', name: 'iShares TIPS Bond ETF' },
  { ticker: 'TLT', tags: ['etf', 'rates', 'long-term'], section: 'Rates', subtitle: '20y+ Tsy', name: 'iShares 20+ Year Treasury Bond ETF' },
];

/**
 * Macro Exposure deck (15 tickers + 2 crypto placeholders)
 */
const MACRO_UNIVERSE: TrendUniverse = [
  // Commodities
  { ticker: 'DBA', tags: ['etf', 'commodities', 'agriculture'], section: 'Commodities', subtitle: 'Agriculture', name: 'Invesco DB Agriculture Fund' },
  { ticker: 'DBB', tags: ['etf', 'commodities', 'metals'], section: 'Commodities', subtitle: 'Base Metals', name: 'Invesco DB Base Metals Fund' },
  { ticker: 'PDBC', tags: ['etf', 'commodities', 'diversified'], section: 'Commodities', subtitle: 'Commodities', name: 'Invesco Optimum Yield Diversified Commodity Strategy No K-1 ETF' },
  { ticker: 'USO', tags: ['etf', 'commodities', 'energy', 'oil'], section: 'Energy', subtitle: 'Oil', name: 'United States Oil Fund LP' },
  // FX
  { ticker: 'FXA', tags: ['etf', 'fx', 'australia'], section: 'FX', subtitle: 'AUD', name: 'Invesco CurrencyShares Australian Dollar Trust' },
  { ticker: 'FXB', tags: ['etf', 'fx', 'uk'], section: 'FX', subtitle: 'GBP', name: 'Invesco CurrencyShares British Pound Sterling Trust' },
  { ticker: 'FXC', tags: ['etf', 'fx', 'canada'], section: 'FX', subtitle: 'CAD', name: 'Invesco CurrencyShares Canadian Dollar Trust' },
  { ticker: 'FXE', tags: ['etf', 'fx', 'euro'], section: 'FX', subtitle: 'EUR', name: 'Invesco CurrencyShares Euro Trust' },
  { ticker: 'FXY', tags: ['etf', 'fx', 'japan'], section: 'FX', subtitle: 'JPY', name: 'Invesco CurrencyShares Japanese Yen Trust' },
  { ticker: 'UUP', tags: ['etf', 'fx', 'dollar'], section: 'Dollar', subtitle: 'Dollar', name: 'Invesco DB US Dollar Index Bullish Fund' },
  // Metals
  { ticker: 'GDX', tags: ['etf', 'metals', 'gold-miners'], section: 'Metals', subtitle: 'Gold Miners', name: 'VanEck Gold Miners ETF' },
  { ticker: 'GLDM', tags: ['etf', 'metals', 'gold'], section: 'Metals', subtitle: 'Gold', name: 'SPDR Gold MiniShares Trust' },
  { ticker: 'SIL', tags: ['etf', 'metals', 'silver-miners'], section: 'Metals', subtitle: 'Silver Miners', name: 'Global X Silver Miners ETF' },
  { ticker: 'SLV', tags: ['etf', 'metals', 'silver'], section: 'Metals', subtitle: 'Silver', name: 'iShares Silver Trust' },
  // Uranium
  { ticker: 'SRUUF', tags: ['etf', 'uranium', 'energy'], section: 'Uranium', subtitle: 'Uranium', name: 'Sprott Physical Uranium Trust' },
  // Crypto (using spot ETF proxies for Marketstack EOD compatibility)
  { ticker: 'Bitcoin', tags: ['crypto'], section: 'Crypto', providerTicker: 'FBTC', subtitle: 'FBTC', name: 'Fidelity Wise Origin Bitcoin Fund' },
  { ticker: 'Ethereum', tags: ['crypto'], section: 'Crypto', providerTicker: 'FETH', subtitle: 'FETH', name: 'Fidelity Ethereum Fund' },
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
