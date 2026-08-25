export function shouldFailIntegrityReport(
  suspiciousTotal: number,
  failOnSuspicious: boolean
): boolean {
  return failOnSuspicious && suspiciousTotal > 0;
}

export function parseIntegrityReportCli(argv: string[]): { failOnSuspicious: boolean } {
  let failOnSuspicious = false;
  for (const arg of argv) {
    if (arg === '--fail-on-suspicious') {
      failOnSuspicious = true;
      continue;
    }
    if (arg === '--') continue;
    throw new Error(`Unknown report-health-history-integrity argument: ${arg}`);
  }
  return { failOnSuspicious };
}
