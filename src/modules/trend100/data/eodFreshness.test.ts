import { describe, expect, it } from 'vitest';
import { evaluateSpyEodFreshness } from './eodFreshness';

describe('evaluateSpyEodFreshness', () => {
  it('accepts a SPY tip within 10 calendar days', () => {
    expect(evaluateSpyEodFreshness('2026-08-24', '2026-08-25', 10)).toEqual({
      ok: true,
      lastDate: '2026-08-24',
      ageDays: 1,
    });
  });

  it('rejects a SPY tip older than 10 calendar days', () => {
    const r = evaluateSpyEodFreshness('2026-03-13', '2026-08-25', 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/calendar days/);
  });
});
