import { describe, expect, it } from 'vitest';
import {
  buildTurbulenceGatePoints,
  computeSpxDmaByDate,
} from './turbulenceGates';

describe('computeSpxDmaByDate', () => {
  it('uses every SPX close, including dates with no VIX observation', () => {
    const spxByDate = new Map<string, number>([
      ['2020-01-02', 10],
      ['2020-01-03', 20],
      ['2020-01-06', 90], // SPX-only — must still enter the 3-session window
      ['2020-01-07', 40],
    ]);
    const dma = computeSpxDmaByDate(spxByDate, 3);
    expect(dma.get('2020-01-02')).toBeUndefined();
    expect(dma.get('2020-01-03')).toBeUndefined();
    expect(dma.get('2020-01-06')).toBe((10 + 20 + 90) / 3);
    expect(dma.get('2020-01-07')).toBe((20 + 90 + 40) / 3);
  });
});

describe('buildTurbulenceGatePoints', () => {
  it('restricts output to common dates but does not drop SPX-only closes from the DMA', () => {
    const spxByDate = new Map<string, number>([
      ['2020-01-02', 10],
      ['2020-01-03', 20],
      ['2020-01-06', 90], // SPX trading day with no VIX
      ['2020-01-07', 40],
    ]);
    const vixByDate = new Map<string, number>([
      ['2020-01-02', 12],
      ['2020-01-03', 12],
      ['2020-01-07', 12],
    ]);

    const rows = buildTurbulenceGatePoints(spxByDate, vixByDate, 3);
    expect(rows.map((r) => r.date)).toEqual(['2020-01-02', '2020-01-03', '2020-01-07']);

    const last = rows[2]!;
    const fullSpxDma = (20 + 90 + 40) / 3;
    const commonDatesOnlyDma = (10 + 20 + 40) / 3;
    expect(last.spx50dma).toBe(fullSpxDma);
    expect(last.spx50dma).not.toBe(commonDatesOnlyDma);
    expect(last.spxAbove50dma).toBe(40 > fullSpxDma);
    expect(last.vixBelow25).toBe(true);
  });
});
