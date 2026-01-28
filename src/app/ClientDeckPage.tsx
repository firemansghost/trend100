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
  const debug = searchParams.get('debug') === '1';

  // Resolve deckId
  const deckId: TrendDeckId = isDeckId(rawDeck) ? rawDeck : 'LEADERSHIP';
  const deck = getDeck(deckId);

  // Resolve group filter (valid values: 'metals', 'miners', 'all', or null for all)
  const groupFilter: string | null = rawGroup && ['metals', 'miners', 'all'].includes(rawGroup.toLowerCase())
    ? rawGroup.toUpperCase() === 'METALS' ? 'METALS' : rawGroup.toUpperCase() === 'MINERS' ? 'MINERS' : null
    : null;

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

  // Load history when deckId changes
  useEffect(() => {
    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const fileName = `health-history.${deckId}.json`;
        const res = await fetch(`/${fileName}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('File not found');
        }
        const data = (await res.json()) as TrendHealthHistoryPoint[];
        // Validate it's an array
        if (Array.isArray(data)) {
          // Sort by date ascending
          const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
          setHistory(sorted);
          setHistorySource('file');
        } else {
          throw new Error('Invalid data format');
        }
      } catch (error) {
        // Fallback to mock history
        const mockHistory = buildMockHealthHistory({
          deckId,
          days: 730,
        });
        setHistory(mockHistory);
        setHistorySource('mock');
      } finally {
        setHistoryLoading(false);
      }
    }

    loadHistory();
  }, [deckId]);

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
