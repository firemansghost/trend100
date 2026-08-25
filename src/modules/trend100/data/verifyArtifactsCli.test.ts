import { describe, expect, it } from 'vitest';
import { parseVerifyArtifactsCli } from './verifyArtifactsCli';

describe('parseVerifyArtifactsCli', () => {
  it('defaults to full verification (not health-history-only)', () => {
    expect(parseVerifyArtifactsCli([])).toEqual({ healthHistoryOnly: false });
  });

  it('enables health-history-only mode', () => {
    expect(parseVerifyArtifactsCli(['--health-history-only'])).toEqual({
      healthHistoryOnly: true,
    });
  });
});
