/**
 * Stable, filesystem/URL-safe key for deck sections.
 * Used by writers (health-history filenames) and UI (section= query param).
 *
 * Rules: lower-case, trim, replace & with and, replace / and whitespace with -,
 * remove any non [a-z0-9-], collapse multiple -.
 *
 * Examples:
 * - "Quality/LowVol" -> "quality-lowvol"
 * - "Global ex-US" -> "global-ex-us"
 * - "Loans/BDC" -> "loans-bdc"
 * - "EM Debt" -> "em-debt"
 * - "Commodities/Resources" -> "commodities-resources"
 */
export function toSectionKey(label: string): string {
  let s = String(label).trim().toLowerCase();
  s = s.replace(/&/g, 'and');
  s = s.replace(/[/\s]+/g, '-');
  s = s.replace(/[^a-z0-9-]/g, '');
  s = s.replace(/-+/g, '-');
  return s.replace(/^-|-$/g, '') || 'all';
}
