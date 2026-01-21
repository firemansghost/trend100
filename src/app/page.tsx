import { ClientDeckPage } from './ClientDeckPage';

export default function Home() {
  // Check if we're in demo/mock mode
  const dataProvider =
    process.env.NEXT_PUBLIC_DATA_PROVIDER || process.env.DATA_PROVIDER;
  const isDemoMode = dataProvider === 'mock' || !dataProvider;

  return <ClientDeckPage isDemoMode={isDemoMode} />;
}
