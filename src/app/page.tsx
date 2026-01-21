import { getLatestSnapshot } from '@/modules/trend100/data';
import { Trend100Dashboard } from '@/modules/trend100/ui';

export default function Home() {
  const snapshot = getLatestSnapshot();

  return <Trend100Dashboard snapshot={snapshot} />;
}
