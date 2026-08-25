/**
 * Turbulence gates: SPX 50-DMA and common-date row assembly.
 *
 * 50-DMA is computed on the full ordered SPX close series. Output rows are
 * emitted only on dates that have both SPX and VIX closes.
 */

export const SPX_DMA_WINDOW = 50;
export const VIX_GATE_THRESHOLD = 25;

export interface TurbulenceGatePoint {
  date: string;
  spx: number | null;
  spx50dma: number | null;
  spxAbove50dma: boolean | null;
  vix: number | null;
  vixBelow25: boolean | null;
}

/** Simple moving average of SPX closes over `window` SPX trading sessions. */
export function computeSpxDmaByDate(
  spxByDate: Map<string, number>,
  window: number = SPX_DMA_WINDOW
): Map<string, number> {
  const result = new Map<string, number>();
  if (window < 1) return result;

  const sortedDates = [...spxByDate.keys()].sort();
  const validSpx: { date: string; value: number }[] = [];

  for (const date of sortedDates) {
    const spx = spxByDate.get(date);
    if (spx === undefined || !Number.isFinite(spx)) continue;
    validSpx.push({ date, value: spx });

    if (validSpx.length >= window) {
      const slice = validSpx.slice(-window);
      const avg = slice.reduce((s, p) => s + p.value, 0) / window;
      result.set(date, avg);
    }
  }
  return result;
}

export function commonTradingDates(
  spxByDate: Map<string, number>,
  vixByDate: Map<string, number>
): string[] {
  return [...spxByDate.keys()].filter((d) => vixByDate.has(d)).sort();
}

/**
 * Gate rows on common SPX/VIX dates. SPX DMA uses every SPX close, including
 * dates that have no VIX observation.
 */
export function buildTurbulenceGatePoints(
  spxByDate: Map<string, number>,
  vixByDate: Map<string, number>,
  dmaWindow: number = SPX_DMA_WINDOW
): TurbulenceGatePoint[] {
  const spx50dmaByDate = computeSpxDmaByDate(spxByDate, dmaWindow);
  const dates = commonTradingDates(spxByDate, vixByDate);

  return dates.map((date) => {
    const spx = spxByDate.get(date) ?? null;
    const spx50dma = spx50dmaByDate.get(date) ?? null;
    const vix = vixByDate.get(date) ?? null;
    const spxAbove50dma =
      spx !== null && spx50dma !== null ? spx > spx50dma : null;
    const vixBelow25 = vix !== null ? vix < VIX_GATE_THRESHOLD : null;
    return { date, spx, spx50dma, spxAbove50dma, vix, vixBelow25 };
  });
}
