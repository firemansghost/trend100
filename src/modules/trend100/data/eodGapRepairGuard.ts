export const REPAIR_CONFIRMATION_TOKEN = 'REPAIR';

export type RepairQuotaGuardInput = {
  repair: boolean;
  confirmRepair: string;
  maxTickerUnitsRaw: string;
  candidateCount: number;
};

export type RepairQuotaGuardResult =
  | { ok: true; maxTickerUnits: number }
  | { ok: false; reason: string };

export function evaluateRepairQuotaGuard(input: RepairQuotaGuardInput): RepairQuotaGuardResult {
  if (!input.repair) {
    return { ok: true, maxTickerUnits: 0 };
  }
  if (input.confirmRepair !== REPAIR_CONFIRMATION_TOKEN) {
    return {
      ok: false,
      reason:
        'repair=true requires confirm_repair=REPAIR exactly. Refusing before any Marketstack call.',
    };
  }
  const max = Number.parseInt(String(input.maxTickerUnitsRaw ?? '').trim(), 10);
  if (!Number.isFinite(max) || max < 1) {
    return {
      ok: false,
      reason: 'repair=true requires max_ticker_units to be a positive integer. Refusing before any Marketstack call.',
    };
  }
  if (input.candidateCount > max) {
    return {
      ok: false,
      reason: `candidateCount ${input.candidateCount} exceeds max_ticker_units ${max}. Refusing before any Marketstack call.`,
    };
  }
  return { ok: true, maxTickerUnits: max };
}
