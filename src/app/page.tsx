import { ClientDeckPage } from './ClientDeckPage';

export default function Home() {
  // Demo mode is determined by ClientDeckPage based on snapshot source (file vs mock)
  // Do not use env vars for UI mode decisions - env is only for the snapshot generation script
  return <ClientDeckPage />;
}
