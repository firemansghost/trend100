/**
 * Default 100 ticker universe for Trend100
 * 
 * This is the v0 curated list. Easy to edit later.
 * Contains exactly 100 unique tickers with tag taxonomy.
 */

import type { TrendUniverse } from '../types';
import { validateUniverse } from './validateUniverse';

/**
 * Default 100 ticker universe
 * 
 * Breakdown:
 * - ETFs: 20
 * - Tech Mega-caps: 10
 * - Software: 8
 * - Cybersecurity & Networking: 5
 * - Semiconductors: 12
 * - Financials: 8
 * - Consumer Discretionary: 8
 * - Consumer Staples: 3
 * - Healthcare: 9
 * - Industrials: 9
 * - Energy: 6
 * - Real Estate & Utilities: 2
 * Total: 100 unique tickers
 * 
 * Validation: Ensured via validateUniverse() on module load
 */
export const DEFAULT_UNIVERSE: TrendUniverse = [
  // ETFs (20)
  { ticker: 'SPY', tags: ['etf', 'index', 'broad-us'] },
  { ticker: 'QQQ', tags: ['etf', 'index', 'nasdaq100'] },
  { ticker: 'IWM', tags: ['etf', 'index', 'smallcap'] },
  { ticker: 'DIA', tags: ['etf', 'index', 'dow'] },
  { ticker: 'RSP', tags: ['etf', 'index', 'equal-weight'] },
  { ticker: 'XLK', tags: ['etf', 'sector', 'tech'] },
  { ticker: 'XLF', tags: ['etf', 'sector', 'financials'] },
  { ticker: 'XLE', tags: ['etf', 'sector', 'energy'] },
  { ticker: 'XLV', tags: ['etf', 'sector', 'healthcare'] },
  { ticker: 'XLI', tags: ['etf', 'sector', 'industrials'] },
  { ticker: 'XLP', tags: ['etf', 'sector', 'staples'] },
  { ticker: 'XLU', tags: ['etf', 'sector', 'utilities'] },
  { ticker: 'XLY', tags: ['etf', 'sector', 'discretionary'] },
  { ticker: 'XLC', tags: ['etf', 'sector', 'communications'] },
  { ticker: 'XLB', tags: ['etf', 'sector', 'materials'] },
  { ticker: 'XLRE', tags: ['etf', 'sector', 'real-estate'] },
  { ticker: 'SMH', tags: ['etf', 'semis'] },
  { ticker: 'HYG', tags: ['etf', 'credit'] },
  { ticker: 'TLT', tags: ['etf', 'rates'] },
  { ticker: 'GLD', tags: ['etf', 'gold', 'commodity'] },

  // Tech Mega-caps (10)
  { ticker: 'AAPL', tags: ['tech'] },
  { ticker: 'MSFT', tags: ['tech', 'software', 'cloud'] },
  { ticker: 'NVDA', tags: ['semis', 'ai'] },
  { ticker: 'AMZN', tags: ['tech', 'cloud', 'consumer'] },
  { ticker: 'GOOGL', tags: ['tech', 'communications'] },
  { ticker: 'META', tags: ['tech', 'communications'] },
  { ticker: 'TSLA', tags: ['tech', 'consumer'] },
  { ticker: 'NFLX', tags: ['tech', 'communications', 'consumer'] },
  { ticker: 'ORCL', tags: ['tech', 'software', 'cloud'] },
  { ticker: 'ADBE', tags: ['tech', 'software'] },

  // Software (8)
  { ticker: 'CRM', tags: ['software', 'cloud'] },
  { ticker: 'NOW', tags: ['software', 'cloud'] },
  { ticker: 'INTU', tags: ['software', 'payments'] },
  { ticker: 'SHOP', tags: ['software', 'payments'] },
  { ticker: 'SNOW', tags: ['software', 'cloud', 'ai'] },
  { ticker: 'MDB', tags: ['software', 'cloud'] },
  { ticker: 'PLTR', tags: ['software', 'ai'] },
  { ticker: 'PANW', tags: ['cyber'] },

  // Cybersecurity & Networking (4)
  { ticker: 'CRWD', tags: ['cyber'] },
  { ticker: 'ZS', tags: ['cyber', 'networking'] },
  { ticker: 'NET', tags: ['networking', 'cloud'] },
  { ticker: 'DDOG', tags: ['software', 'cloud'] },
  { ticker: 'ANET', tags: ['networking'] },

  // Semiconductors (10)
  { ticker: 'AVGO', tags: ['semis'] },
  { ticker: 'AMD', tags: ['semis', 'ai'] },
  { ticker: 'QCOM', tags: ['semis'] },
  { ticker: 'INTC', tags: ['semis'] },
  { ticker: 'MU', tags: ['semis'] },
  { ticker: 'ASML', tags: ['semis'] },
  { ticker: 'TSM', tags: ['semis'] },
  { ticker: 'ARM', tags: ['semis', 'ai'] },
  { ticker: 'TXN', tags: ['semis'] },
  { ticker: 'AMAT', tags: ['semis'] },
  { ticker: 'LRCX', tags: ['semis'] },
  { ticker: 'KLAC', tags: ['semis'] },

  // Financials (7)
  { ticker: 'BRK.B', tags: ['financials'] },
  { ticker: 'JPM', tags: ['financials', 'banking'] },
  { ticker: 'GS', tags: ['financials', 'banking'] },
  { ticker: 'MS', tags: ['financials', 'banking'] },
  { ticker: 'V', tags: ['financials', 'payments'] },
  { ticker: 'MA', tags: ['financials', 'payments'] },
  { ticker: 'BLK', tags: ['financials', 'asset-mgmt'] },
  { ticker: 'SCHW', tags: ['financials', 'banking'] },

  // Consumer Discretionary (8)
  { ticker: 'COST', tags: ['consumer', 'staples'] },
  { ticker: 'WMT', tags: ['consumer', 'staples'] },
  { ticker: 'HD', tags: ['consumer', 'discretionary'] },
  { ticker: 'LOW', tags: ['consumer', 'discretionary'] },
  { ticker: 'MCD', tags: ['consumer', 'discretionary'] },
  { ticker: 'SBUX', tags: ['consumer', 'discretionary'] },
  { ticker: 'BKNG', tags: ['consumer', 'travel'] },
  { ticker: 'ROST', tags: ['consumer', 'discretionary'] },

  // Consumer Staples (3)
  { ticker: 'PG', tags: ['staples'] },
  { ticker: 'KO', tags: ['staples'] },
  { ticker: 'PEP', tags: ['staples'] },

  // Healthcare (9)
  { ticker: 'UNH', tags: ['healthcare'] },
  { ticker: 'JNJ', tags: ['healthcare'] },
  { ticker: 'MRK', tags: ['healthcare'] },
  { ticker: 'ABBV', tags: ['healthcare'] },
  { ticker: 'LLY', tags: ['healthcare'] },
  { ticker: 'TMO', tags: ['healthcare'] },
  { ticker: 'AMGN', tags: ['healthcare'] },
  { ticker: 'ABT', tags: ['healthcare'] },
  { ticker: 'DHR', tags: ['healthcare'] },

  // Industrials (9)
  { ticker: 'CAT', tags: ['industrials'] },
  { ticker: 'DE', tags: ['industrials'] },
  { ticker: 'GE', tags: ['industrials'] },
  { ticker: 'HON', tags: ['industrials'] },
  { ticker: 'RTX', tags: ['industrials', 'defense'] },
  { ticker: 'LMT', tags: ['industrials', 'defense'] },
  { ticker: 'GD', tags: ['industrials', 'defense'] },
  { ticker: 'NOC', tags: ['industrials', 'defense'] },
  { ticker: 'UNP', tags: ['industrials', 'transport'] },

  // Energy (6)
  { ticker: 'XOM', tags: ['energy'] },
  { ticker: 'CVX', tags: ['energy'] },
  { ticker: 'COP', tags: ['energy'] },
  { ticker: 'SLB', tags: ['energy'] },
  { ticker: 'EOG', tags: ['energy'] },
  { ticker: 'MPC', tags: ['energy'] },

  // Real Estate & Utilities (2)
  { ticker: 'AMT', tags: ['real-estate', 'reits'] },
  { ticker: 'NEE', tags: ['utilities'] },
];

// Validate on module load
validateUniverse(DEFAULT_UNIVERSE);
