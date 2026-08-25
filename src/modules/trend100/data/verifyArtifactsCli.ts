/** CLI for scripts/verify-artifacts.ts */
export type VerifyArtifactsMode = {
  healthHistoryOnly: boolean;
};

export function parseVerifyArtifactsCli(argv: string[]): VerifyArtifactsMode {
  let healthHistoryOnly = false;
  for (const arg of argv) {
    if (arg === '--health-history-only') {
      healthHistoryOnly = true;
      continue;
    }
    if (arg === '--') continue;
    throw new Error(`Unknown verify-artifacts argument: ${arg}`);
  }
  return { healthHistoryOnly };
}
