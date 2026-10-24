import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const app = await readFile(new URL('../src/pages/App.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const demo = await readFile(new URL('../src/features/demo-data.ts', import.meta.url), 'utf8');
const provider = await readFile(new URL('../../server/src/services/verification-provider.ts', import.meta.url), 'utf8');

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

test('verification UI reads recorded outcomes and keeps Not Bank Confirmed visible', () => {
  assert.match(app, /SIMULATED PROVIDER RESPONSES — NOT BANK CONFIRMED/);
  assert.match(app, /attempt\.label/);
  assert.match(app, /A simulated match is not genuine bank verification/);
  assert.match(app, /No bank was contacted/);
  for (const outcome of ['match', 'mismatch', 'not_found', 'unavailable']) assert.ok(provider.includes(`status: '${outcome}'`));
});
