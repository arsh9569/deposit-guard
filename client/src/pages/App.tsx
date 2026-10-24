import { useEffect, useState } from 'react';
import { getHealth, type HealthResponse } from '../lib/api';

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Unable to reach the API');
      });
  }, []);

  return (
    <main className="shell">
      <section className="card" aria-labelledby="title">
        <div className="eyebrow">AICTE PS 26265 · SIH 2026</div>
        <h1 id="title">DepositGuard AI</h1>
        <p className="intro">Security deposit and fixed deposit receipt workflow portal.</p>
        <div className="status" role="status" aria-live="polite">
          <span className={`indicator ${health?.status === 'ok' ? 'connected' : ''}`} />
          {error
            ? `API unavailable: ${error}`
            : health
              ? `API ${health.status} · database ${health.database}`
              : 'Connecting to API…'}
        </div>
        <p className="note">
          Starter foundation. Demo verification results, when added, must be clearly labeled as
          simulated.
        </p>
      </section>
    </main>
  );
}
