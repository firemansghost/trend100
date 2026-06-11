/** Stooq sometimes returns an API-key / captcha HTML page instead of CSV (no Date/Close header). */
export function isLikelyStooqAuthOrBlockPage(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.includes('get_apikey')) return true;
  if (t.includes('get your api')) return true;
  if (t.includes('captcha')) return true;
  const head = t.slice(0, 1200);
  if (head.includes('<!doctype html') || head.includes('<html')) return true;
  return false;
}
