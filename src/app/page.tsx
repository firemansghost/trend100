// Force dynamic rendering to ensure searchParams are reactive
export const dynamic = 'force-dynamic';

import { getLatestSnapshot, getHealthHistory, getDeck, isDeckId } from '@/modules/trend100/data';
import { Trend100Dashboard } from '@/modules/trend100/ui';

interface HomeProps {
  searchParams?: { deck?: string };
}

export default function Home({ searchParams }: HomeProps) {
  // Parse deckParam safely
  const deckParam =
    typeof searchParams?.deck === 'string' ? searchParams.deck.toUpperCase() : undefined;

  // Validate against allowed deck IDs
  const deckId = isDeckId(deckParam) ? deckParam : 'LEADERSHIP';

  const deck = getDeck(deckId);
  const snapshot = getLatestSnapshot(deckId);
  const history = getHealthHistory(deckId);

  // Check if we're in demo/mock mode
  const dataProvider =
    process.env.NEXT_PUBLIC_DATA_PROVIDER || process.env.DATA_PROVIDER;
  const isDemoMode = dataProvider === 'mock' || !dataProvider;

  return (
    <Trend100Dashboard
      key={deckId}
      snapshot={snapshot}
      history={history}
      deckId={deckId}
      deckLabel={deck.label}
      deckDescription={deck.description}
      isDemoMode={isDemoMode}
    />
  );
}
