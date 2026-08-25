/**
 * Eligible correlation universe for shockRaw.
 * Calendar qualification and shock acceptance both use MIN_ASSETS_TARGET (8).
 * Callers pass the target so this helper does not hard-code 8.
 */
export function hasEnoughShockAssets(validCount: number, target: number): boolean {
  return validCount >= target;
}
