const assert = require('node:assert');
const L = require('./logic.js');

assert.strictEqual(L.fmt(0), '0:00');
assert.strictEqual(L.fmt(65.9), '1:05');
assert.strictEqual(L.fmt(NaN), '0:00');
assert.strictEqual(L.fmt(3600), '60:00');

assert.deepStrictEqual(L.makeOrder(4, false, 2), [0, 1, 2, 3]);
const shuffled = L.makeOrder(10, true, 7);
assert.strictEqual(shuffled[0], 7);
assert.deepStrictEqual([...shuffled].sort((a, b) => a - b), [...Array(10).keys()]);

const order = [0, 1, 2];
assert.strictEqual(L.step(order, 0, 1, 'off'), 1);
assert.strictEqual(L.step(order, 2, 1, 'off'), -1);
assert.strictEqual(L.step(order, 2, 1, 'all'), 0);
assert.strictEqual(L.step(order, 0, -1, 'all'), 2);
assert.strictEqual(L.step(order, 0, -1, 'one'), -1);
assert.strictEqual(L.step([2, 0, 1], 2, 1, 'off'), 0);
assert.strictEqual(L.step([], 0, 1, 'all'), -1);

// 1024 bins at 48 kHz = 23.4 Hz each; a peak at 60 Hz (bin 2) lands in band 0, 1 kHz (bin 43) in a mid band.
const bins = new Uint8Array(1024);
bins[2] = 255;
assert.deepStrictEqual(L.bands(bins, 48000, 10).map((v) => +v.toFixed(2)), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
bins[2] = 0; bins[43] = 255;
const mid = L.bands(bins, 48000, 10);
assert.strictEqual(mid[0] + mid[1], 0);
assert.strictEqual(mid.filter((v) => v === 1).length, 1);

console.log('logic ok');
