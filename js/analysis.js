"use strict";
/* The lap analysis of one session: best laps, consistency, sector bests, laps led, cumulative times.
   A port of SessionView.compute / laps_led in the desktop program; both give the same numbers. */

/* entry: { name, color, car, laps, total_ms, best_ms, status, grid, laps_data: [{lap, time_ms, valid, splits}] } */
function lapsLed(entries) {
  const cums = new Map();
  const hasGrid = entries.some((e) => e.grid);
  entries.forEach((e, i) => {
    if (hasGrid && !e.grid) return;                  // a late joiner has no grid slot and can not be compared
    const ld = e.laps_data || [];
    if (ld.length && ld.every((l) => l.time_ms > 0)) {
      let c = 0;
      cums.set(i, ld.map((l) => (c += l.time_ms)));
    }
  });
  const led = entries.map(() => 0);
  if (cums.size > 1) {
    const n = Math.max(...[...cums.values()].map((s) => s.length));
    for (let k = 0; k < n; k++) {
      let best = null;
      for (const [i, s] of cums) {
        if (s.length > k && (best === null || s[k] < best[0] || (s[k] === best[0] && i < best[1]))) best = [s[k], i];
      }
      if (best) led[best[1]]++;
    }
  }
  return led;
}

const CONS_WINDOW = 1.10, CONS_SCALE = 10;        // a lap counts when it is valid and within 10% of the driver's best; score = 100 - 10 x (standard deviation as a % of the average lap)
const medianOf = (v) => { const s = [...v].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

function analyse(ents) {
  const st = ents.map((e, i) => {
    const laps = e.laps_data || [];
    const vt = laps.filter((l) => l.time_ms > 0 && l.valid).map((l) => l.time_ms);
    const ct = laps.filter((l) => l.time_ms > 0 && l.valid && !l.cut).map((l) => l.time_ms);       // laps counted for consistency: no cut, not invalid
    const best = vt.length ? Math.min(...vt) : (e.best_ms || 0);
    const bl = vt.length ? laps.find((l) => l.time_ms === best && l.valid) : null;
    let cons = 0, avg = 0, sd = 0, med = 0;
    if (ct.length >= 3 && best) {
      const good = ct.filter((t) => t <= best * CONS_WINDOW);
      if (good.length >= 2) {
        avg = good.reduce((a, b) => a + b, 0) / good.length;
        sd = Math.sqrt(good.reduce((a, t) => a + (t - avg) ** 2, 0) / (good.length - 1));
        med = medianOf(good);
        cons = Math.max(0, 100 - CONS_SCALE * (sd / avg * 100));                    // every counted lap, slow ones included
      }
    }
    const invalid = laps.filter((l) => !l.valid).map((l) => l.lap);
    const nsec = Math.max(0, ...laps.map((l) => l.splits.length));
    const secbest = [];
    for (let k = 0; k < nsec; k++) {
      const v = laps.filter((l) => l.splits.length > k && l.splits[k] > 0 && l.valid).map((l) => l.splits[k]);
      secbest.push(v.length ? Math.min(...v) : 0);
    }
    return { e, i, laps, best, blap: bl ? bl.lap : 0, cons, avg, sd, med, invalid, secbest, led: 0, vt, ct, cum: [] };
  });
  for (const s of st) {
    if (s.laps.length && s.laps.every((l) => l.time_ms > 0)) {
      let c = 0;
      for (const l of s.laps) { c += l.time_ms; s.cum.push(c); }
    }
  }
  const led = lapsLed(st.map((s) => s.e));
  st.forEach((s, i) => { s.led = led[i]; });
  return st;
}

/* an export row / quali entry -> the entry shape above */
function lapList(L) { return (L || []).map((l, n) => ({ lap: n + 1, time_ms: l[0], valid: !!l[1], splits: l[2] || [], cut: !!l[3] })); }
