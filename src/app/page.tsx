// Force dynamic rendering to ensure searchParams are reactive
export const dynamic = 'force-dynamic';

import { getLatestSnapshot, getHealthHistory, getDeck, isDeckId, getAllDeckIds } from '@/modules/trend100/data';
import { Trend100Dashboard } from '@/modules/trend100/ui';

interface HomeProps {
  searchParams?: { deck?: string | string[]; debug?: string | string[] };
}

export default function Home({ searchParams }: HomeProps) {
  // Parse deckParam safely (handle string | string[] | undefined)
  const rawDeck = Array.isArray(searchParams?.deck)
    ? searchParams.deck[0]
    : searchParams?.deck;
  const deckParam = typeof rawDeck === 'string' ? rawDeck.toUpperCase() : undefined;

  // Resolve deckId using isDeckId validation
  const resolvedDeckId = isDeckId(deckParam) ? deckParam : 'LEADERSHIP';

  // Parse debug flag
  const debugParam = Array.isArray(searchParams?.debug)
    ? searchParams.debug[0]
    : searchParams?.debug;
  const debug = debugParam === '1';

  const deck = getDeck(resolvedDeckId);
  const snapshot = getLatestSnapshot(resolvedDeckId);
  const history = getHealthHistory(resolvedDeckId);

  // Check if we're in demo/mock mode
  const dataProvider =
    process.env.NEXT_PUBLIC_DATA_PROVIDER || process.env.DATA_PROVIDER;
  const isDemoMode = dataProvider === 'mock' || !dataProvider;

  return (
    <>
      {debug && (
        <div className="bg-amber-900/30 border-b border-amber-700/50 px-4 py-2 text-xs font-mono text-amber-200">
          <div className="container mx-auto">
            <div className="flex flex-wrap gap-4">
              <span>rawDeck={rawDeck ?? 'undefined'}</span>
              <span>resolvedDeckId={resolvedDeckId}</span>
              <span>allowed={getAllDeckIds().join(',')}</span>
              <span>deckLabel={deck.label}</span>
              <span>universeSize={snapshot.universeSize}</span>
            </div>
          </div>
        </div>
      )}
      <Trend100Dashboard
        key={resolvedDeckId}
        snapshot={snapshot}
        history={history}
        deckId={resolvedDeckId}
        deckLabel={deck.label}
        deckDescription={deck.description}
        isDemoMode={isDemoMode}
      />
    </>
  );
}
