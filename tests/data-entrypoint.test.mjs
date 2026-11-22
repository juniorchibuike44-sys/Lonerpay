import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from "node:vm";
import {readFile} from 'node:fs/promises';

test('dashboard cannot open the retired VTpass data preview', async () => {
  const html = await readFile(new URL('../dashboard.html', import.meta.url), 'utf8');
  assert.match(html, /function legacyDataPreviewDisabled\(\)/);
  assert.match(html, /function buyData\(\)[\s\S]*window\.buyData !== loadingFallback/);
  assert.match(html, /<script src="data-client\.js\?v=20261122-auto-data-status" defer><\/script>/);
  assert.doesNotMatch(html, /Data plans are still loading\. Please wait a moment/);
});

test('the Data button client script parses', async () => {
  const source = await readFile(new URL('../data-client.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Script(source));
});
