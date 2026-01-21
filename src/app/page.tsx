import { getLatestSnapshot, getHealthHistory, getDeck, type TrendDeckId } from '@/modules/trend100/data';
import { Trend100Dashboard } from '@/modules/trend100/ui';

interface HomeProps {
  searchParams: { deck?: string };
}

export default function Home({ searchParams }: HomeProps) {
  // Validate deckId from search params, fallback to LEADERSHIP
  const deckParam = searchParams.deck?.toUpperCase();
  const validDeckIds: TrendDeckId[] = [
    'LEADERSHIP',
    'US_SECTORS',
    'US_FACTORS',
    'GLOBAL_EQUITIES',
    'FIXED_INCOME',
    'MACRO',
  ];
  const deckId: TrendDeckId = validDeckIds.includes(deckParam as TrendDeckId)
    ? (deckParam as TrendDeckId)
    : 'LEADERSHIP';

  const deck = getDeck(deckId);
  const snapshot = getLatestSnapshot(deckId);
  const history = getHealthHistory(deckId);

  // Check if we're in demo/mock mode
  const dataProvider =
    process.env.NEXT_PUBLIC_DATA_PROVIDER || process.env.DATA_PROVIDER;
  const isDemoMode = dataProvider === 'mock' || !dataProvider;

  return (
    <Trend100Dashboard
      snapshot={snapshot}
      history={history}
      deckId={deckId}
      deckLabel={deck.label}
      isDemoMode={isDemoMode}
    />
  );
}
