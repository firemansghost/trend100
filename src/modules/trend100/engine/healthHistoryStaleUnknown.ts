/**
 * Detect MACRO-variant UNKNOWN rows that already meet current eligibility rules
 * (stale points from the pre-2026-02-15 uncapped minEligible=10 policy).
 */
export const MACRO_VARIANT_MIN_ELIGIBLE_CAP = 10;
export const MACRO_MIN_KNOWN_PCT = 0.7;

export type StaleUnknownCounts = {
  regimeLabel?: string;
  knownCount?: number;
  eligibleCount?: number;
  totalTickers?: number;
};

export function isPolicyImpossibleStaleUnknown(point: StaleUnknownCounts): boolean {
  if (point.regimeLabel !== 'UNKNOWN') return false;
  const eligible = point.eligibleCount;
  const known = point.knownCount;
  const sectionSize = point.totalTickers;
  if (
    eligible == null ||
    known == null ||
    sectionSize == null ||
    !Number.isFinite(eligible) ||
    !Number.isFinite(known) ||
    !Number.isFinite(sectionSize)
  ) {
    return false;
  }
  if (eligible <= 0) return false;
  const requiredEligible = Math.min(MACRO_VARIANT_MIN_ELIGIBLE_CAP, sectionSize);
  if (eligible < requiredEligible) return false;
  const knownPct = known / eligible;
  return knownPct >= MACRO_MIN_KNOWN_PCT;
}
