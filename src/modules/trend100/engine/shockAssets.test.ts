import { describe, expect, it } from 'vitest';
import { hasEnoughShockAssets } from './shockAssets';

describe('hasEnoughShockAssets', () => {
  it('rejects 5, 6, and 7 eligible names at target 8', () => {
    expect(hasEnoughShockAssets(5, 8)).toBe(false);
    expect(hasEnoughShockAssets(6, 8)).toBe(false);
    expect(hasEnoughShockAssets(7, 8)).toBe(false);
  });

  it('accepts 8, 9, and 12 eligible names at target 8', () => {
    expect(hasEnoughShockAssets(8, 8)).toBe(true);
    expect(hasEnoughShockAssets(9, 8)).toBe(true);
    expect(hasEnoughShockAssets(12, 8)).toBe(true);
  });

  it('uses the passed target rather than a hard-coded 8', () => {
    expect(hasEnoughShockAssets(7, 8)).toBe(false);
    expect(hasEnoughShockAssets(7, 7)).toBe(true);
    expect(hasEnoughShockAssets(8, 9)).toBe(false);
    expect(hasEnoughShockAssets(9, 9)).toBe(true);
  });
});
