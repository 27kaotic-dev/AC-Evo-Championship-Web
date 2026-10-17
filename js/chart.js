"use strict";
/* Interactive line chart on a canvas: a port of the desktop program's LineChart.
   Hover a line (or a name in the key) to highlight it and fade the others; a box shows the value at the point
   you are on.  series = [{ label, color, pts: [[x, y], ...] }] */

function niceStep(span, target = 6, integer = false) {
  if (span <= 0) return 1;
  const raw = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const cands = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = (cands.map((m) => m * mag).find((v) => v >= raw - 1e-12)) ?? 10 * mag;
  return integer ? Math.max(1, pyRound(step)) : step;
}

function niceTicks(lo, hi, step, anchor = null) {
  const base = anchor !== null ? anchor : 0;
  const out = [];
  for (let n = Math.ceil((lo - base) / step - 1e-9); base + n * step <= hi + 1e-9 && out.length <= 200; n++) out.push(base + n * step);
  return out;
}

class LineChart {
  constructor(canvas) {
    this.cv = canvas;
    canvas._chart = this;                       // lets tests and the console reach the chart
    this.series = []; this.xlabels = {};
    this.opt = { invert: false, clip: false, integer: false, zero: false, unit: 1, yfmt: (v) => fmtPts(v) };
    this.hover = null; this.hoverPt = null; this.geo = null;
    this.legendRows = [];
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerdown", (e) => this.onMove(e));
    canvas.addEventListener("pointerleave", () => this.setHover(null, null));
    canvas.style.touchAction = "pan-y";
    if (window.ResizeObserver) new ResizeObserver(() => this.draw()).observe(canvas);
    this.draw();
  }

  setData(series, opt = {}) {
    this.series = series;
    this.xlabels = opt.xlabels || {};
    this.opt = Object.assign({ invert: false, clip: false, integer: false, zero: false, unit: 1, yfmt: (v) => fmtPts(v) }, opt);
    this.opt.unit = this.opt.unit || 1;
    this.hover = null; this.hoverPt = null;
    this.draw();
  }

  yAxis(ymin, ymax, height) {
    const o = this.opt, u = o.unit;
    const target = Math.max(3, Math.floor(height / 50));
    if (o.invert) {                                         // places: P1 at the top, every tick a whole place
      const lo = Math.floor(ymin), hi = Math.ceil(ymax);
      const step = niceStep(hi - lo, Math.max(3, Math.floor(height / 24)), true);
      return [lo - 0.5, hi + 0.5, niceTicks(lo, hi, step, lo)];
    }
    if (o.zero && ymin >= 0) ymin = 0;
    const span = Math.max(ymax - ymin, o.integer ? u : 1e-9);
    const step = niceStep(span / u, target, o.integer) * u;
    let lo, hi;
    if (o.zero || o.integer) {
      lo = Math.floor(ymin / step + 1e-9) * step;
      hi = Math.ceil(ymax / step - 1e-9) * step;
      if (hi <= lo) hi = lo + step;
    } else {
      const pad = span * 0.06;
      lo = ymin - pad; hi = ymax + pad;
    }
    return [lo, hi, niceTicks(lo, hi, step)];
  }

  draw() {
    const cv = this.cv, dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const C = { panel: cssVar("--panel"), panel2: cssVar("--panel2"), border: cssVar("--border"), text: cssVar("--text"), dim: cssVar("--dim"), hi: cssVar("--hi"), tip: cssVar("--tip-bg") };
    g.fillStyle = C.panel; g.fillRect(0, 0, W, H);
    const o = this.opt;
    const pts = this.series.flatMap((s) => s.pts);
    this.legendRows = []; this.geo = null;
    if (!pts.length) {
      g.fillStyle = C.dim; g.font = "13px 'Segoe UI', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("No data available", W / 2, H / 2); return;
    }
    const narrow = W < 640;
    const legendW = narrow ? 112 : 170;
    const l = narrow ? 46 : 62, t = 16, r = legendW + 16, b = 38;
    const plot = { left: l, top: t, w: Math.max(50, W - l - r), h: Math.max(50, H - t - b) };
    plot.right = plot.left + plot.w; plot.bottom = plot.top + plot.h;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const xmin = Math.min(...xs); let xmax = Math.max(...xs);
    if (xmax === xmin) xmax = xmin + 1;
    let ymin = Math.min(...ys), ymax = Math.max(...ys);
    if (o.clip) {
      const sy = [...ys].sort((a, b2) => a - b2), med = sy[Math.floor(sy.length / 2)];
      ymax = Math.min(ymax, med * 1.08); ymin = Math.min(ymin, ymax);
    }
    const [ylo, yhi, yticks] = this.yAxis(ymin, ymax, plot.h);
    const mx = (x) => plot.left + ((x - xmin) / (xmax - xmin)) * plot.w;
    const my = (y) => {
      y = Math.max(ylo, Math.min(yhi, y));
      const f = (y - ylo) / (yhi - ylo);
      return plot.top + (o.invert ? f : 1 - f) * plot.h;
    };
    g.font = "11px 'Segoe UI', system-ui, sans-serif";
    for (let v of yticks) {
      if (o.integer || o.invert) v = o.unit !== 1 ? pyRound(v / o.unit) * o.unit : pyRound(v);
      const yy = my(v);
      g.strokeStyle = C.border; g.lineWidth = 1; g.beginPath(); g.moveTo(plot.left, yy); g.lineTo(plot.right, yy); g.stroke();
      g.fillStyle = C.dim; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(o.yfmt(v), l - 8, yy);
    }
    const xticks = [...new Set(xs)].sort((a, b2) => a - b2);
    const xstep = Math.max(1, Math.floor(xticks.length / (narrow ? 8 : 14)));
    xticks.forEach((xv, i) => {
      if (i % xstep) return;
      const xx = mx(xv);
      g.strokeStyle = C.border; g.beginPath(); g.moveTo(xx, plot.top); g.lineTo(xx, plot.bottom); g.stroke();
      const lab = this.xlabels[xv] ?? (Number.isInteger(xv) ? String(xv) : String(xv));
      g.fillStyle = C.dim; g.textAlign = "center"; g.textBaseline = "top"; g.fillText(lab, xx, plot.bottom + 8);
    });
    this.geo = { plot, mx, my, xmin, xmax };
    const hov = this.hover !== null && this.hover < this.series.length ? this.hover : null;
    const order = this.series.map((_, k) => k).filter((k) => k !== hov);
    if (hov !== null) order.push(hov);                     // the hovered line is drawn last so it sits on top
    g.lineJoin = "round"; g.lineCap = hov !== null ? "round" : "butt";
    for (const i of order) {
      const s = this.series[i];
      if (!s.pts.length) continue;
      const col = safeColor(s.color);
      g.globalAlpha = hov !== null && i !== hov ? 0.59 : 1;
      g.strokeStyle = col; g.lineWidth = hov === null ? 2.2 : (i === hov ? 3.6 : 1.8);
      g.beginPath();
      s.pts.forEach(([x, y], j) => (j ? g.lineTo(mx(x), my(y)) : g.moveTo(mx(x), my(y))));
      g.stroke();
      if ((hov === null && s.pts.length <= 40) || i === hov) {
        g.fillStyle = col;
        const rad = i === hov ? 4.8 : 3;
        for (const [x, y] of s.pts) { g.beginPath(); g.arc(mx(x), my(y), rad, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
    }
    // key, in the order of the last value; hovering a name highlights its line
    let ly = t;
    const byValue = this.series.map((_, k) => k).sort((a, b2) => {
      const va = !o.invert && this.series[a].pts.length ? -this.series[a].pts[this.series[a].pts.length - 1][1] : 0;
      const vb = !o.invert && this.series[b2].pts.length ? -this.series[b2].pts[this.series[b2].pts.length - 1][1] : 0;
      return va - vb;
    });
    for (const i of byValue) {
      if (ly > H - 24) break;
      const s = this.series[i];
      const row = { x: W - legendW, y: ly - 1, w: legendW - 4, h: 18 };
      this.legendRows.push([i, row]);
      const dim = hov !== null && i !== hov;
      if (i === hov) { g.fillStyle = C.panel2; g.beginPath(); g.roundRect(row.x, row.y, row.w, row.h, 5); g.fill(); }
      g.globalAlpha = dim ? 0.59 : 1;
      g.fillStyle = safeColor(s.color); g.beginPath(); g.roundRect(W - legendW + 4, ly + 4, 12, 4, 2); g.fill();
      g.globalAlpha = dim ? 0.63 : 1;
      g.fillStyle = i === hov ? C.hi : C.text; g.textAlign = "left"; g.textBaseline = "middle";
      g.font = `${i === hov ? "bold " : ""}11px 'Segoe UI', system-ui, sans-serif`;
      g.fillText(this.elide(g, s.label, legendW - 30), W - legendW + 22, ly + 8);
      g.globalAlpha = 1;
      ly += 18;
    }
    g.font = "11px 'Segoe UI', system-ui, sans-serif";
    // the value at the point nearest the mouse
    if (hov !== null && this.hoverPt) {
      const [x, y] = this.hoverPt, px = mx(x), py = my(y);
      const s = this.series[hov], col = safeColor(s.color);
      const xl = this.xlabels[x] ?? String(x);
      const line2 = `${xl}   ${o.yfmt(y)}`;
      g.font = "bold 11px 'Segoe UI', system-ui, sans-serif"; const w1 = g.measureText(s.label).width;
      g.font = "11px 'Segoe UI', system-ui, sans-serif"; const w2 = g.measureText(line2).width;
      const bw = Math.max(w1, w2) + 20, bh = 40;
      const bx = px + 14 + bw < plot.right ? px + 14 : px - 14 - bw;
      const by = py - bh - 10 > plot.top ? py - bh - 10 : py + 12;
      g.strokeStyle = col; g.lineWidth = 1.4; g.fillStyle = C.tip; g.beginPath(); g.roundRect(bx, by, bw, bh, 7); g.fill(); g.stroke();
      g.strokeStyle = C.hi; g.lineWidth = 1.6; g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.stroke();
      g.textAlign = "left"; g.textBaseline = "middle";
      g.font = "bold 11px 'Segoe UI', system-ui, sans-serif"; g.fillStyle = col; g.fillText(s.label, bx + 10, by + 12);
      g.font = "11px 'Segoe UI', system-ui, sans-serif"; g.fillStyle = C.text; g.fillText(line2, bx + 10, by + 28);
    }
  }

  elide(g, text, maxW) {
    if (g.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && g.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }

  static segDist(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.hypot(px - a[0], py - a[1]);
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }

  /* -> [series index, [x, y] of its nearest point] for what is under (px, py); [null, null] if nothing */
  hit(px, py) {
    const g = this.geo;
    if (!g) return [null, null];
    for (const [idx, r] of this.legendRows) if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return [idx, null];
    const p = g.plot;
    if (px < p.left - 6 || px > p.right + 6 || py < p.top - 6 || py > p.bottom + 6) return [null, null];
    let best = 9, found = null;
    this.series.forEach((s, i) => {
      const q = s.pts.map(([x, y]) => [g.mx(x), g.my(y)]);
      const segs = q.length > 1 ? q.slice(1).map((b, k) => [q[k], b]) : q.map((a) => [a, a]);
      for (const [a, b] of segs) {
        const d = LineChart.segDist(px, py, a, b);
        if (d < best) { best = d; found = i; }
      }
    });
    if (found === null) return [null, null];
    const near = this.series[found].pts.reduce((m, q) => (Math.abs(g.mx(q[0]) - px) < Math.abs(g.mx(m[0]) - px) ? q : m));
    return [found, near];
  }

  setHover(idx, pt) {
    if (idx !== this.hover || pt !== this.hoverPt) { this.hover = idx; this.hoverPt = pt; this.draw(); }
    this.cv.style.cursor = idx !== null ? "pointer" : "default";
  }

  onMove(e) {
    const r = this.cv.getBoundingClientRect();
    const [i, pt] = this.hit(e.clientX - r.left, e.clientY - r.top);
    this.setHover(i, pt);
  }

  /* a PNG with a title band on top, like the desktop program's Export image */
  png(title, sub) {
    const src = this.cv, dpr = window.devicePixelRatio || 1, band = 58 * dpr;
    const out = document.createElement("canvas");
    out.width = src.width; out.height = src.height + band;
    const g = out.getContext("2d");
    g.fillStyle = cssVar("--bg"); g.fillRect(0, 0, out.width, out.height);
    g.textBaseline = "middle"; g.textAlign = "left";
    g.fillStyle = cssVar("--text"); g.font = `bold ${16 * dpr}px 'Segoe UI', system-ui, sans-serif`; g.fillText(title, 14 * dpr, 20 * dpr);
    g.fillStyle = cssVar("--dim"); g.font = `${12 * dpr}px 'Segoe UI', system-ui, sans-serif`; g.fillText(sub || "", 14 * dpr, 42 * dpr);
    g.drawImage(src, 0, band);
    return new Promise((res) => out.toBlob(res, "image/png"));
  }
}

/* a canvas with its chart, sized to fill its box */
function chartBox(height = 460) {
  const cv = h("canvas", { class: "chart", style: { height: height + "px" } });
  return { cv, chart: new LineChart(cv) };
}
