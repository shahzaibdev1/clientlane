import { Layers } from 'lucide-react';
import '@/components/workspace/workspace.css';
export default function Loading() {
  return (
    <main id="main" className="ws-loading">
      <Layers size={35} />
      <h1>Opening your workspace…</h1>
      <p>Your next steps are on their way.</p>
    </main>
  );
}
