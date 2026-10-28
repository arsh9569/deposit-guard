import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const app = await readFile(new URL('../src/pages/App.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const demo = await readFile(new URL('../src/features/demo-data.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const provider = await readFile(new URL('../../server/src/services/verification-provider.ts', import.meta.url), 'utf8');

test('production API traffic is rewritten to Render before the SPA fallback', () => {
  assert.deepEqual(vercel.rewrites[0], {
    source: '/api/(.*)',
    destination: 'https://nidhikosh.onrender.com/api/$1',
  });
  assert.equal(vercel.rewrites[1].destination, '/index.html');
});

test('API client rejects non-JSON responses with a safe routing error before parsing', () => {
  assert.match(api, /async function apiFetch\(/);
  assert.match(api, /response\.headers\.get\('content-type'\)/);
  assert.match(api, /unexpectedApiResponseMessage/);
  assert.equal([...api.matchAll(/\bfetch\(/g)].length, 1, 'API calls should pass through the response guard');
  assert.match(api, /apiFetch\('\/api\/auth\/login',\s*\{\s*method: 'POST'/);
});

test('OTP send uses the same-origin API with credentials and a bounded request timeout', () => {
  assert.match(api, /apiFetch\('\/api\/auth\/otp\/send'/);
  assert.match(api, /credentials: 'include'/);
  assert.match(api, /'x-csrf-token': csrfToken/);
  assert.match(api, /setTimeout\(\(\) => controller\.abort\(\), 25_000\)/);
  assert.match(api, /result = \(await response\.json\(\)\)[\s\S]*?finally \{\s*clearTimeout\(timeout\)/);
  assert.match(api, /clearTimeout\(timeout\)/);
});

test('mobile layout has tablet and phone breakpoints that collapse the sidebar and columns', () => {
  assert.match(styles, /@media\s*\(max-width:\s*900px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*640px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.page-shell\s*\{[^}]*width:\s*100%/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.sidebar\s*\{[^}]*transform:\s*translateX\(-102%\)/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.registration-grid\s*\{\s*grid-template-columns:\s*1fr/);
});

test('dashboard exposes loading, empty, error, and permission-denied messages to assistive technology', () => {
  assert.match(app, /Loading institution metrics/);
  assert.match(app, /No FDR records yet/);
  assert.match(app, /Dashboard unavailable/);
  assert.match(app, /Dashboard access denied/);
  assert.match(app, /role="status"/);
  assert.match(app, /role="alert"/);
});

test('forms associate visible labels with controls and navigation has a label', () => {
  assert.match(app, /<label htmlFor=\{fieldId\}>/);
  assert.match(app, /cloneElement\([\s\S]{0,150}id:\s*fieldId/);
  assert.match(app, /<nav aria-label="Main navigation">/);
  assert.doesNotMatch(app, /role="button"/);
  assert.doesNotMatch(app, /tabIndex=\{-1\}/);
});

test('keyboard focus remains visible on native controls', () => {
  assert.match(styles, /button:focus-visible,[\s\S]*?input:focus-visible,[\s\S]*?select:focus-visible,[\s\S]*?textarea:focus-visible\s*\{[^}]*outline:\s*3px/s);
});

test('synthetic seed contains every requested walkthrough scenario and preserves predecessor linkage', () => {
  for (const reference of ['FDR-2026-018', 'FDR-2026-003', 'FDR-2024-106', 'FDR-2025-042', 'FDR-2024-220', 'FDR-2026-021', 'FDR-2026-022', 'RR-2026-004']) {
    assert.ok(demo.includes(reference), `missing seeded scenario ${reference}`);
  }
  assert.match(demo, /supersedes: 'FDR-2024-106'/);
  assert.match(demo, /simulated_match/);
  assert.match(demo, /simulated_mismatch/);
  assert.match(demo, /₹24,50,000 against submitted ₹25,00,000/);
});

test('verification UI reads recorded outcomes without the demo banner and keeps non-confirmation visible', () => {
  assert.doesNotMatch(app, /SIMULATED PROVIDER RESPONSES — NOT BANK CONFIRMED/);
  assert.match(app, /attempt\.label/);
  assert.match(app, /A simulated match is not genuine bank verification/);
  assert.match(app, /No bank was contacted/);
  for (const outcome of ['match', 'mismatch', 'not_found', 'unavailable']) assert.ok(provider.includes(`status: '${outcome}'`));
});
