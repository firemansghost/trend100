import { describe, expect, it } from 'vitest';
import { classifyTrend } from './classifyTrend';

describe('classifyTrend', () => {
  const base = { price: 100, sma200: 90, sma50w: 95, ema50w: 98 };

  it('returns UNKNOWN when sma200 is missing', () => {
    expect(classifyTrend({ ...base, sma200: undefined })).toBe('UNKNOWN');
  });

  it('returns UNKNOWN when sma50w is missing', () => {
    expect(classifyTrend({ ...base, sma50w: undefined })).toBe('UNKNOWN');
  });

  it('returns UNKNOWN when ema50w is missing', () => {
    expect(classifyTrend({ ...base, ema50w: undefined })).toBe('UNKNOWN');
  });

  it('returns RED when price is below 200d SMA', () => {
    expect(classifyTrend({ ...base, price: 80, sma200: 90 })).toBe('RED');
  });

  it('returns GREEN when price is above 200d SMA and above upper band', () => {
    expect(classifyTrend({ price: 110, sma200: 90, sma50w: 95, ema50w: 100 })).toBe('GREEN');
  });

  it('uses max(sma50w, ema50w) as upper band', () => {
    expect(
      classifyTrend({ price: 101, sma200: 90, sma50w: 95, ema50w: 100 })
    ).toBe('GREEN');
    expect(
      classifyTrend({ price: 99, sma200: 90, sma50w: 95, ema50w: 100 })
    ).toBe('YELLOW');
  });

  it('returns YELLOW when price is above 200d SMA but at or below upper band', () => {
    expect(classifyTrend({ price: 97, sma200: 90, sma50w: 95, ema50w: 98 })).toBe('YELLOW');
    expect(classifyTrend({ price: 98, sma200: 90, sma50w: 95, ema50w: 98 })).toBe('YELLOW');
  });
});
