import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('dashboard cannot open the retired VTpass data preview', async () => {
  const html = await readFile(new URL('../dashboard.html', import.meta.url), 'utf8');
  assert.match(html, /function legacyDataPreviewDisabled\(\)/);
  assert.match(html, /function buyData\(\) \{\s*alert\("Data plans are still loading/);
  assert.match(html, /<script src="data-client\.js\?v=20261122-fast-purchase"><\/script>/);
});
