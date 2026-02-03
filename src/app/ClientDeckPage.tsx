/**
 * Client-side deck page wrapper
 * 
 * Handles deck selection, snapshot generation, and history loading on the client.
 * This ensures URL param changes always trigger UI updates.
 */

'use client';

import { useMemo, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TrendHealthHistoryPoint, TrendDeckId } from '@/modules/trend100/types';
import { Trend100Dashboard } from '@/modules/trend100/ui';
import { getLatestSnapshot } from '@/modules/trend100/data/getLatestSnapshot';
import { getDeck, isDeckId, getAllDeckIds } from '@/modules/trend100/data/decks';
import { buildMockHealthHistory } from '@/modules/trend100/data/mockHealthHistory';

interface ClientDeckPageProps {
  // Removed isDemoMode prop - demo mode is determined by snapshotSource only
}

function ClientDeckPageContent() {
  const searchParams = useSearchParams();
  const rawDeck = searchParams.get('deck');
  const rawGroup = searchParams.get('group');
  const rawSection = searchParams.get('section');
  const rawMetric = searchParams.get('metric');
  const debug = searchParams.get('debug') === '1';

  // Resolve deckId
  const deckId: TrendDeckId = isDeckId(rawDeck) ? rawDeck : 'LEADERSHIP';
  const deck = getDeck(deckId);

  // Resolve group filter from URL (grouped decks only: METALS_MINING)
  const rawGroupLower = rawGroup?.toLowerCase() ?? null;
  const groupKeyLower: 'metals' | 'miners' | null =
    rawGroupLower === 'metals' ? 'metals' : rawGroupLower === 'miners' ? 'miners' : null;
  const groupFilter: string | null =
    groupKeyLower === 'metals' ? 'METALS' : groupKeyLower === 'miners' ? 'MINERS' : null;

  // Resolve section filter from URL (non-grouped multi-section decks). section param is sectionKey (e.g. quality-lowvol).
  const sectionKeyFromUrl: string | null =
    rawSection != null && rawSection.trim() !== '' ? rawSection.trim().toLowerCase() : null;

  // Chart history variant: grouped decks use group= only; non-grouped use section= only (ignore group so tag chips etc. don't hijack chart).
  const deckHasGroups = useMemo(
    () => deck.universe.some((item) => item.group != null),
    [deck.universe]
  );
  const historyVariantKey: string | null = deckHasGroups
    ? groupKeyLower
    : sectionKeyFromUrl;

  const metricKey =
    rawMetric === 'heat' || rawMetric === 'upper' || rawMetric === 'stretch' || rawMetric === 'medUpper'
      ? rawMetric
      : 'health';

  // Snapshot state
  const [snapshot, setSnapshot] = useState<ReturnType<typeof getLatestSnapshot> | null>(null);
  const [snapshotSource, setSnapshotSource] = useState<'file' | 'mock'>('mock');
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  // Load snapshot when deckId changes
  useEffect(() => {
    async function loadSnapshot() {
      setSnapshotLoading(true);
      try {
        const fileName = `snapshot.${deckId}.json`;
        const res = await fetch(`/${fileName}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('File not found');
        }
        const data = (await res.json()) as ReturnType<typeof getLatestSnapshot>;
        // Validate it has required fields
        if (data && typeof data === 'object' && 'tickers' in data && 'health' in data) {
          setSnapshot(data);
          setSnapshotSource('file');
        } else {
          throw new Error('Invalid snapshot format');
        }
      } catch (error) {
        // Fallback to mock snapshot
        const mockSnapshot = getLatestSnapshot(deckId);
        setSnapshot(mockSnapshot);
        setSnapshotSource('mock');
      } finally {
        setSnapshotLoading(false);
      }
    }

    loadSnapshot();
  }, [deckId]);

  // History state
  const [history, setHistory] = useState<TrendHealthHistoryPoint[]>([]);
  const [historySource, setHistorySource] = useState<'file' | 'mock'>('mock');
  const [historyLoading, setHistoryLoading] = useState(true);

  // Load history when deckId or variant (group/section) changes. Fall back to base if variant 404s, fails to parse, or is empty.
  useEffect(() => {
    async function loadHistory() {
      setHistoryLoading(true);
      const baseFileName = `health-history.${deckId}.json`;

      async function tryLoad(fileName: string): Promise<TrendHealthHistoryPoint[] | null> {
        try {
          const res = await fetch(`/${fileName}`, { cache: 'no-store' });
          if (!res.ok) return null;
          const data = (await res.json()) as unknown;
          if (!Array.isArray(data) || data.length === 0) return null;
          const points = data as TrendHealthHistoryPoint[];
          return [...points].sort((a, b) => a.date.localeCompare(b.date));
        } catch {
          return null;
        }
      }

      const variantFileName = historyVariantKey ? `health-history.${deckId}.${historyVariantKey}.json` : null;
      let points: TrendHealthHistoryPoint[] | null = null;

      if (variantFileName) {
        points = await tryLoad(variantFileName);
      }
      if (points == null) {
        points = await tryLoad(baseFileName);
      }
      if (points != null) {
        setHistory(points);
        setHistorySource('file');
      } else {
        const mockHistory = buildMockHealthHistory({ deckId, days: 730 });
        setHistory(mockHistory);
        setHistorySource('mock');
      }

      setHistoryLoading(false);
    }

    loadHistory();
  }, [deckId, historyVariantKey]);

  // Debug panel
  const debugPanel = debug && (
    <div className="bg-amber-900/30 border-b border-amber-700/50 px-4 py-2 text-xs font-mono text-amber-200">
      <div className="container mx-auto">
        <div className="flex flex-wrap gap-4">
          <span>rawDeck={rawDeck ?? 'undefined'}</span>
          <span>resolvedDeckId={deckId}</span>
          <span>deckLabel={deck.label}</span>
          <span>universeSize={snapshot?.universeSize ?? 'loading...'}</span>
          <span>snapshotSource={snapshotSource}</span>
          <span>snapshotLoading={snapshotLoading ? 'true' : 'false'}</span>
          <span>asOfDate={snapshot?.asOfDate ?? 'loading...'}</span>
          <span>runDate={snapshot?.runDate ?? 'loading...'}</span>
          <span>historySource={historySource}</span>
          <span>historyLoading={historyLoading ? 'true' : 'false'}</span>
          <span>allowed={getAllDeckIds().join(',')}</span>
        </div>
      </div>
    </div>
  );

  // Show loading state
  if (snapshotLoading || !snapshot) {
    return (
      <>
        {debugPanel}
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          Loading snapshot...
        </div>
      </>
    );
  }

  return (
    <>
      {debugPanel}
      <Trend100Dashboard
        key={deckId}
        snapshot={snapshot}
        history={history}
        deckId={deckId}
        deckLabel={deck.label}
        deckDescription={deck.description}
        deckSections={deck.sections ?? []}
        isDemoMode={snapshotSource === 'mock'}
        initialGroupFilter={groupFilter}
        initialSectionKey={sectionKeyFromUrl}
        initialMetric={metricKey as any}
      />
    </>
  );
}

export function ClientDeckPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">Loading...</div>}>
      <ClientDeckPageContent />
    </Suspense>
  );
}
