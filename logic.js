// Pure player logic, shared by the renderer (as a plain script) and test.js (as CommonJS).
const Logic = {
  fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },

  // Play order: identity, or a shuffle that starts with the current track.
  makeOrder(n, shuffle, cur, rand = Math.random) {
    const order = [...Array(n).keys()];
    if (!shuffle) return order;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const at = order.indexOf(cur);
    if (at > 0) [order[0], order[at]] = [order[at], order[0]];
    return order;
  },

  // Spectrum bins -> `count` log-spaced bands from 40 Hz to 16 kHz, each 0..1 (peak in band).
  // Bands 0-1 cover roughly 40-130 Hz: the bass the speakers pump to.
  bands(bins, sampleRate, count) {
    const hz = sampleRate / 2 / bins.length;
    return Array.from({ length: count }, (_, k) => {
      const lo = Math.floor(40 * 400 ** (k / count) / hz);
      const hi = Math.max(lo + 1, Math.floor(40 * 400 ** ((k + 1) / count) / hz));
      let peak = 0;
      for (let i = lo; i < hi && i < bins.length; i++) peak = Math.max(peak, bins[i]);
      return peak / 255;
    });
  },

  // Next/previous track index in play order, or -1 when the end is reached without repeat-all.
  step(order, cur, dir, repeat) {
    const n = order.length;
    if (!n) return -1;
    let pos = order.indexOf(cur) + dir;
    if (pos >= n || pos < 0) {
      if (repeat !== 'all') return -1;
      pos = (pos + n) % n;
    }
    return order[pos];
  },
};

if (typeof module !== 'undefined') module.exports = Logic;
