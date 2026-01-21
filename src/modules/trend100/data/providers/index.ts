/**
 * Data provider abstraction
 * 
 * Returns the appropriate provider based on environment configuration.
 */

import { fetchEodSeries as marketstackFetchEodSeries } from './marketstack';
import type { EodBar, FetchEodSeriesOptions } from './marketstack';

export type DataProvider = 'mock' | 'marketstack';

/**
 * Get the current data provider from environment
 */
export function getProvider(): DataProvider {
  const provider = process.env.DATA_PROVIDER;
  if (provider === 'marketstack') {
    return 'marketstack';
  }
  return 'mock';
}

/**
 * Fetch EOD series using the configured provider
 * 
 * @param symbol Stock symbol
 * @param options Fetch options
 * @returns Array of EOD bars
 */
export async function fetchEodSeries(
  symbol: string,
  options: FetchEodSeriesOptions = {}
): Promise<EodBar[]> {
  const provider = getProvider();

  if (provider === 'marketstack') {
    return marketstackFetchEodSeries(symbol, options);
  }

  // Mock provider - return empty array (should not be used in production scripts)
  throw new Error(
    'fetchEodSeries called with mock provider. Use marketstack provider for real data.'
  );
}
