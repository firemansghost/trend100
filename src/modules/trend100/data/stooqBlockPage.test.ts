import { describe, expect, it } from 'vitest';
import { isLikelyStooqAuthOrBlockPage } from './stooqBlockPage';

describe('isLikelyStooqAuthOrBlockPage', () => {
  it('returns false for a normal CSV header', () => {
    expect(isLikelyStooqAuthOrBlockPage('Date,Open,High,Low,Close,Volume\n2024-01-02,1,2,3,4,5')).toBe(
      false
    );
  });

  it('returns false for whitespace-only input', () => {
    expect(isLikelyStooqAuthOrBlockPage('   \n  ')).toBe(false);
  });

  it('detects get_apikey text', () => {
    expect(isLikelyStooqAuthOrBlockPage('Get_APIKEY required')).toBe(true);
  });

  it('detects get your api text', () => {
    expect(isLikelyStooqAuthOrBlockPage('Get your API key to continue')).toBe(true);
  });

  it('detects captcha text', () => {
    expect(isLikelyStooqAuthOrBlockPage('Please complete the captcha')).toBe(true);
  });

  it('detects HTML doctype in the first 1200 chars', () => {
    expect(isLikelyStooqAuthOrBlockPage('<!DOCTYPE HTML><html><body>blocked</body></html>')).toBe(
      true
    );
  });

  it('detects html tag in the first 1200 chars', () => {
    expect(isLikelyStooqAuthOrBlockPage('<html><head></head><body></body></html>')).toBe(true);
  });
});
