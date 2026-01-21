import { getLatestSnapshot } from '@/modules/trend100/data';
import { Trend100Dashboard } from '@/modules/trend100/ui';

export default function Home() {
  const snapshot = getLatestSnapshot();
  // Check if we're in demo/mock mode
  // Use NEXT_PUBLIC_ prefix for client-side access, or fallback to server-side check
  const dataProvider =
    process.env.NEXT_PUBLIC_DATA_PROVIDER || process.env.DATA_PROVIDER;
  const isDemoMode = dataProvider === 'mock' || !dataProvider;

  return <Trend100Dashboard snapshot={snapshot} isDemoMode={isDemoMode} />;
}
