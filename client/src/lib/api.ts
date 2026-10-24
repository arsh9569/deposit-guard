export interface HealthResponse {
  status: 'ok' | 'not_ready';
  service: string;
  database: 'connected' | 'disconnected';
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok && response.status !== 503) {
    throw new Error(`API health request failed (${response.status})`);
  }

  return (await response.json()) as HealthResponse;
}
