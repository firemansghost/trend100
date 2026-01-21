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
  isDemoMode?: boolean;
}

function ClientDeckPageContent({ isDemoMode = false }: ClientDeckPageProps) {
  const searchParams = useSearchParams();
  const rawDeck = searchParams.get('deck');
  const debug = searchParams.get('debug') === '1';

  // Resolve deckId
  const deckId: TrendDeckId = isDeckId(rawDeck) ? rawDeck : 'LEADERSHIP';
  const deck = getDeck(deckId);

  // Compute snapshot client-side (memoized per deckId)
  const snapshot = useMemo(() => getLatestSnapshot(deckId), [deckId]);

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
          <span>universeSize={snapshot.universeSize}</span>
          <span>historySource={historySource}</span>
          <span>historyLoading={historyLoading ? 'true' : 'false'}</span>
          <span>allowed={getAllDeckIds().join(',')}</span>
        </div>
      </div>
    </div>
  );

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
        isDemoMode={isDemoMode}
      />
    </>
  );
}

export function ClientDeckPage({ isDemoMode = false }: ClientDeckPageProps) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">Loading...</div>}>
      <ClientDeckPageContent isDemoMode={isDemoMode} />
    </Suspense>
  );
}
