import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmDialog, promptDialog } from '../src/utils/dialogs';

// With no <DialogHost /> mounted (tests, very early start-up) the old browser boxes are used,
// so a confirmation is never silently skipped.
test('confirmDialog without a host and without a browser answers "no" (never silently yes)', async () => {
  const w = (globalThis as any).window;
  delete (globalThis as any).window;
  try {
    assert.equal(await confirmDialog({ title: 'Delete?' }), false);
    assert.equal(await promptDialog({ title: 'Why?' }), null);
  } finally {
    if (w) (globalThis as any).window = w;
  }
});

test('confirmDialog without a host falls back to window.confirm with the title, message and details', async () => {
  let shown = '';
  (globalThis as any).window = { confirm: (t: string) => { shown = t; return true; }, prompt: (t: string, d: string) => `${d}!` };
  try {
    assert.equal(await confirmDialog({ title: 'Reset?', message: 'All data', details: ['5 bills'] }), true);
    assert.match(shown, /Reset\?/);
    assert.match(shown, /All data/);
    assert.match(shown, /5 bills/);
    assert.equal(await promptDialog({ title: 'Reason', defaultValue: 'x' }), 'x!');
  } finally {
    delete (globalThis as any).window;
  }
});
