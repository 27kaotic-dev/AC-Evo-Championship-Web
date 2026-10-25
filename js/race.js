"use strict";
/* The race pages: one race (classification, results, laps, charts ...), a round summary, and a driver's profile.
   These mirror the Race results page and the driver dialog of the desktop program. */

/* ---------------------------------------------------------------- small building blocks */
function tabset(items, start = 0) {
  const bar = h("div", { class: "subtabs", role: "tablist" });
  const body = h("div", { class: "subbody" });
  const panes = [], btns = [];
  let cur = -1;
  function show(i) {
    cur = i;
    btns.forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-selected", k === i); });
    items.forEach((it, k) => {
      if (k === i && !panes[k]) { panes[k] = h("div", { class: "pane" }, it.make()); body.append(panes[k]); }
      if (panes[k]) panes[k].hidden = k !== i;
    });
  }
  items.forEach((it, i) => {
    const b = h("button", { class: "subtab", type: "button", role: "tab", onclick: () => show(i) }, it.title);
    btns.push(b); bar.append(b);
  });
  show(Math.max(0, Math.min(start, items.length - 1)));
  return { el: h("div", { class: "tabset" }, bar, body), show, get index() { return cur; } };
}

function chip(title, value, color) {
  return h("div", { class: "chip" }, h("div", { class: "chip-t", text: title.toUpperCase() }),
    h("div", { class: "chip-v", style: color ? { color } : null, text: String(value) }));
}

/* column headings follow their column: centred over centred / number columns, left over names and text */
function table(heads, rows, cls, tips) {
  const first = rows.length ? rows[0].children : [];
  const align = (i) => (first[i] && /(^|\s)[cr](\s|$)/.test(first[i].className) ? "c" : "");
  const tbl = h("table", { class: "dt " + (cls || "") },
    h("thead", null, h("tr", null, heads.map((x, i) => h("th", { class: align(i), title: tips && tips[i] ? tips[i] : null }, x)))), h("tbody", null, rows));
  makeSizeable(tbl, heads.join("|") + "|" + (cls || ""));
  return h("div", { class: "tablewrap" }, tbl);
}

/* every column of a table can be dragged wider or narrower (the right edge of its heading); double-click puts the table back.
   The widths are kept while the page is open, so they are still there when you change race or tab. */
const COL_W = {};
function makeSizeable(tbl, key) {
  const ths = [...tbl.querySelectorAll("thead th")];
  const apply = (w) => {
    ths.forEach((th, i) => { th.style.width = th.style.minWidth = th.style.maxWidth = w[i] + "px"; });
    tbl.style.tableLayout = "fixed"; tbl.style.width = w.reduce((a, b) => a + b, 0) + "px"; tbl.classList.add("sized");
  };
  if (COL_W[key] && COL_W[key].length === ths.length) apply(COL_W[key]);
  ths.forEach((th, i) => {
    const g = h("span", { class: "grip", title: "Drag to change the width of this column (double-click: back to normal)", onclick: (e) => e.stopPropagation(),
      ondblclick: (e) => {
        e.stopPropagation(); delete COL_W[key];
        ths.forEach((t) => { t.style.width = t.style.minWidth = t.style.maxWidth = ""; });
        tbl.style.tableLayout = tbl.style.width = ""; tbl.classList.remove("sized");
      } });
    g.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      try { g.setPointerCapture(e.pointerId); } catch (err) { /* no capture: the move events still arrive while the pointer is over the handle */ }
      const w = COL_W[key] && COL_W[key].length === ths.length ? [...COL_W[key]] : ths.map((t) => Math.round(t.getBoundingClientRect().width));
      const x0 = e.clientX, w0 = w[i];
      const move = (ev) => { w[i] = Math.max(40, Math.round(w0 + ev.clientX - x0)); COL_W[key] = w; apply(w); };
      const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); };
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up);
    });
    th.append(g);
  });
}

function td(content, cls, style) { return h("td", { class: cls || "", style: style || null }, content); }
function nameTd(name, color, onclick) {
  return h("td", { class: "nm" + (onclick ? " link" : ""), onclick }, h("span", { class: "bar", style: { background: safeColor(color) } }), h("span", { text: name }));
}
const pc = (cond, cls) => (cond ? cls : "");

function driverName(id) { return (S.drv[id] || {}).name || id; }
function driverColor(id) { return safeColor((S.drv[id] || {}).color); }
function roundOf(race) { return S.data.rounds[race.round]; }
function roundTrack(rd) { return rd.track || rd.name; }

/* ---------------------------------------------------------------- the analysis of a session */
function sessionView(all, { lead = [], tail = [], result = true, quali = false } = {}) {
  const info = h("span", { class: "dim" });
  const body = h("div");
  const cars = [...new Set(all.map((e) => e.car).filter(Boolean))].sort();
  let cls = "", tabs = null;
  const sel = cars.length > 1 ? h("select", { "aria-label": "Class", onchange: () => { cls = sel.value; rebuild(); } },
    option("", "All classes / cars"), cars.map((c) => option(c, c))) : null;

  function rebuild() {
    const ents = all.filter((e) => !cls || e.car === cls);
    const st = analyse(ents);
    info.textContent = `${ents.length} drivers  ·  ${Math.max(0, ...ents.map((e) => e.laps))} laps`;
    const items = lead.map((x) => ({ title: x.title, make: x.make }));
    if (result) items.push({ title: "Result", make: () => (quali ? tResultQuali(st) : tResult(st)) });          // a championship race has its Classification instead
    const hasLaps = st.some((s) => s.laps.length);
    if (hasLaps) items.push({ title: "Laps", make: () => tLaps(st) });
    if (!quali) items.push({ title: "Best Laps", make: () => tBest(st) });             // qualifying: the Result tab has the best lap gaps and sectors
    if (st.some((s) => s.secbest.length)) items.push({ title: "Ideal Lap", make: () => tSectors(st) });          // next to Best Laps
    if (hasLaps && !quali) items.push({ title: "Consistency", make: () => tCons(st) });
    if (hasLaps) {
      items.push({ title: "Cuts / invalid laps", make: () => tCuts(st) });
      items.push({ title: "Positions graph", make: () => tChart(st, 0) });
      items.push({ title: "Gaps graph", make: () => tChart(st, 1) });
      items.push({ title: "Pace graph", make: () => tChart(st, 2) });
    }
    tail.forEach((x) => items.push({ title: x.title, make: x.make }));
    const keep = tabs ? tabs.index : 0;
    clear(body);
    tabs = tabset(items, keep);
    body.append(tabs.el);
  }
  rebuild();
  return h("div", { class: "session" }, h("div", { class: "sbar" }, sel, info), body);
}

function tResult(st) {
  const gb = Math.min(...st.map((s) => s.best).filter((b) => b > 0), Infinity);
  const lead = st.length ? st[0].e : null;
  const rows = st.map((s, r) => {
    const e = s.e, mc = medalClass(r + 1);
    let tg = "";
    if (r === 0) tg = e.total_ms ? fmtTime(e.total_ms) : "";
    else if (lead && lead.laps > e.laps) { const n = lead.laps - e.laps; tg = `+${n} lap${n > 1 ? "s" : ""}`; }
    else if (lead && lead.total_ms && e.total_ms) tg = fmtGap(e.total_ms - lead.total_ms);
    const isb = !!(s.best && s.best === gb);
    return h("tr", null, td(r + 1, "c b " + mc), nameTd(e.name, e.color), td(e.car, "dim"), td(e.laps, "c"), td(tg, "r"),
      td(fmtTime(s.best), "r " + pc(isb, "purple b")), td(s.best > gb && gb < Infinity ? fmtGap(s.best - gb) : "", "r dim"),
      td(s.cons ? s.cons.toFixed(1) : "", "c dim"), td(s.led || "", "c"), td(s.invalid.length || "", "c bad"),
      td(e.status, "c " + pc(e.status !== "Finished", "bad")));
  });
  return table(["Pos", "Driver", "Car", "Laps", "Time / gap", "Best lap", "Gap to best", "Consistency", "Laps led", "Invalid", "Status"], rows);
}

/* qualifying: the best lap with its gaps and the sectors of that lap (so no Best Laps tab) */
function tResultQuali(st) {
  const gb = Math.min(...st.map((s) => s.best).filter((b) => b > 0), Infinity);
  const bls = st.map((s) => s.laps.find((l) => s.best && l.time_ms === s.best && l.valid));
  const nsec = Math.max(0, ...bls.map((bl) => (bl ? bl.splits.length : 0)));
  const sbest = Array.from({ length: nsec }, (_, k) => {                     // the quickest time shown in each sector, in purple
    const v = bls.filter((bl) => bl && bl.splits.length > k && bl.splits[k] > 0).map((bl) => bl.splits[k]);
    return v.length ? Math.min(...v) : 0;
  });
  let prev = 0;
  const rows = st.map((s, r) => {
    const e = s.e;
    const isb = !!(s.best && s.best === gb);
    const interval = s.best > 0 && prev > 0 && s.best > prev ? fmtGap(s.best - prev) : "";
    if (s.best > 0) prev = s.best;
    const bl = bls[r];
    return h("tr", null, td(r + 1, "c b " + medalClass(r + 1)), nameTd(e.name, e.color), td(e.car, "dim"), td(e.laps, "c"),
      td(fmtTime(s.best), "r " + pc(isb, "purple b")), td(interval, "r dim"),
      Array.from({ length: nsec }, (_, k) => {
        const v = bl && bl.splits.length > k ? bl.splits[k] : 0;
        return td(v ? fmtTime(v) : "", "r " + (v && v === sbest[k] ? "purple b" : "dim"));
      }), td(s.invalid.length || "", "c bad"));
  });
  return table(["Pos", "Driver", "Car", "Laps", "Best lap", "Interval", ...Array.from({ length: nsec }, (_, k) => `S${k + 1}`), "Invalid"], rows);
}

function tLaps(st) {
  const have = st.filter((s) => s.laps.length);
  const nl = Math.max(...have.map((s) => s.laps.length));
  const allbest = Math.min(...have.map((s) => s.best).filter((b) => b > 0), Infinity);
  const rows = [];
  for (let i = 0; i < nl; i++) {
    rows.push(h("tr", null, td(i + 1, "c dim"), have.map((s) => {
      const l = s.laps[i];
      if (!l) return td("");
      const cls = !l.valid ? "bad" : (l.time_ms && l.time_ms === allbest ? "purple b" : (l.time_ms && l.time_ms === s.best ? "green b" : ""));
      return td(fmtTime(l.time_ms), "c " + cls);
    })));
  }
  return table(["Lap", ...have.map((s) => s.e.name)], rows, "laps");
}

function tBest(st) {
  const rk = st.filter((s) => s.best > 0).sort((a, b) => a.best - b.best);
  const bls = rk.map((s) => s.laps.find((l) => l.time_ms === s.best && l.valid));
  const nsec = Math.max(0, ...bls.map((bl) => (bl ? bl.splits.length : 0)));       // the sectors of each driver's best lap, one column each
  const rows = rk.map((s, r) => {
    const bl = bls[r];
    return h("tr", null, td(r + 1, "c b " + medalClass(r + 1)), nameTd(s.e.name, s.e.color), td(s.e.car, "dim"),
      td(fmtTime(s.best), "r " + pc(r === 0, "purple b")), td(s.blap || "", "c dim"),
      td(r ? fmtGap(s.best - rk[0].best) : "", "r dim"), td(r ? fmtGap(s.best - rk[r - 1].best) : "", "r dim"),
      Array.from({ length: nsec }, (_, k) => td(bl && bl.splits.length > k ? fmtTime(bl.splits[k]) : "", "r dim")));
  });
  return h("div", null, table(["Rank", "Driver", "Car", "Best lap", "On lap", "Gap", "Interval", ...Array.from({ length: nsec }, (_, k) => `S${k + 1}`)], rows),
    h("div", { class: "hint", text: "Gap = behind the fastest lap  ·  Interval = behind the driver ranked just above  ·  S1, S2, S3 = the sectors of that lap" }));
}

function tCons(st) {
  const rk = st.filter((s) => s.cons).sort((a, b) => b.cons - a.cons);
  const rows = rk.map((s, r) => h("tr", null, td(r + 1, "c b " + medalClass(r + 1)), nameTd(s.e.name, s.e.color),
    td(s.cons.toFixed(1), "c " + pc(r === 0, "green b")), td(fmtTime(s.avg), "r"), td(fmtTime(s.med), "r dim"),
    td((s.sd / 1000).toFixed(3) + " s", "r dim"), td(s.vt.filter((x) => s.best && x <= s.best * CONS_WINDOW).length, "c dim")));
  return table(["Rank", "Driver", "Consistency", "Average lap", "Median lap", "Std. deviation", "Laps counted"], rows, "", [
    "Position by consistency score", "Driver",
    "Out of 100: 100 minus 10 x the standard deviation as a % of the average lap. Counts valid laps within 10% of the driver's best lap (needs 3 valid laps). Slow laps and mistakes lower it; cut (invalid) laps are not counted.",
    "Average of the counted laps", "The middle lap time of the counted laps",
    "How far the counted laps spread from the average, in seconds. Bigger = less steady",
    "Valid laps within 10% of the driver's best lap"]);
}

function tSectors(st) {
  const nsec = Math.max(...st.map((s) => s.secbest.length));
  const overall = [];
  for (let k = 0; k < nsec; k++) {
    const v = st.filter((s) => s.secbest.length > k && s.secbest[k] > 0).map((s) => s.secbest[k]);
    overall.push(v.length ? Math.min(...v) : 0);
  }
  const rows = st.map((s) => {
    const ideal = s.secbest.length && s.secbest.every((x) => x) ? s.secbest.reduce((a, b) => a + b, 0) : 0;
    const cells = [];
    for (let k = 0; k < nsec; k++) {
      const v = s.secbest.length > k ? s.secbest[k] : 0;
      cells.push(td(fmtTime(v), "r " + pc(v && v === overall[k], "purple b")));
    }
    return h("tr", null, nameTd(s.e.name, s.e.color), cells, td(fmtTime(ideal), "r green"), td(fmtTime(s.best), "r"),
      td(ideal && s.best > ideal ? fmtGap(s.best - ideal) : "", "r dim"));
  });
  return h("div", null, table(["Driver", ...Array.from({ length: nsec }, (_, k) => `Best S${k + 1}`), "Ideal lap", "Best lap", "Potential gain"], rows),
    h("div", { class: "hint", text: "Ideal lap = the best sectors added together  ·  Potential gain = how much faster the best lap could be" }));
}

function tCuts(st) {
  return table(["Driver", "Invalid laps", "Lap numbers"], st.map((s) => h("tr", null, nameTd(s.e.name, s.e.color),
    td(s.invalid.length, "c " + (s.invalid.length ? "bad" : "dim")), td(s.invalid.join(", "), "dim"))));
}

let GAP_CHOICE = "180";            // "Show gaps up to" on the Gaps graph (seconds, or "all"), kept while the page is open

function tChart(st, mode) {
  let gapBar = null;
  const have = st.filter((s) => s.cum.length && s.laps.length);
  const { cv, chart } = chartBox(480);
  if (!have.length) { chart.setData([]); return h("div", { class: "chartwrap" }, cv); }
  const nl = Math.max(...have.map((s) => s.cum.length));
  let series;
  if (mode === 0) {
    const pos = have.map(() => []);
    for (let n = 0; n < nl; n++) {
      have.map((s, k) => [s.cum[n], k]).filter(([c]) => c !== undefined).sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .forEach(([, k], pi) => pos[k].push([n + 1, pi + 1]));
    }
    series = have.map((s, k) => ({ label: s.e.name, color: s.e.color, pts: pos[k] }));
    chart.setData(series, { invert: true, integer: true, yfmt: (v) => `P${Math.trunc(v)}` });
  } else if (mode === 1) {
    const ref = have[0];
    series = have.map((s) => ({ label: s.e.name, color: s.e.color,
      pts: Array.from({ length: Math.min(ref.cum.length, s.cum.length) }, (_, n) => [n + 1, (s.cum[n] - ref.cum[n]) / 1000]) }));
    const draw = () => chart.setData(series, { integer: true, ycap: GAP_CHOICE === "all" ? null : +GAP_CHOICE, yfmt: (v) => (v < 0 ? "-" : "+") + Math.abs(v).toFixed(0) + "s" });
    const sel = h("select", { "aria-label": "Show gaps up to", onchange: () => { GAP_CHOICE = sel.value; draw(); } },
      option("60", "60 s", GAP_CHOICE === "60"), option("120", "120 s", GAP_CHOICE === "120"), option("180", "180 s", GAP_CHOICE === "180"), option("all", "Everyone", GAP_CHOICE === "all"));
    gapBar = h("div", { class: "toolbar" }, field("Show gaps up to:", sel));
    draw();
  } else {
    series = have.map((s) => ({ label: s.e.name, color: s.e.color, pts: s.laps.map((l) => [l.lap, l.time_ms]) }));
    chart.setData(series, { clip: true, integer: true, unit: 1000,
      yfmt: (v) => (pyRound(v) % 1000 === 0 ? fmtTime(v).slice(0, -4) : fmtTime(v)) });
  }
  const note = { 0: "Position after each lap.", 1: `Gap to ${have[0].e.name} after each lap (the leader of the classification).`, 2: "Lap times; the axis is cut off at slow laps (pit stops, crashes)." }[mode];
  return h("div", { class: "chartwrap" }, gapBar, cv, h("div", { class: "hint", text: note + " Hover a line or a name in the key to highlight it." }));
}

/* what this race did to the driver ratings: a promise of name -> move, for the Rating column of the Result tab */
function raceRatingMoves(race) {
  return loadStatsRecords().then((recs) => {
    const cid = S.current ? S.current.split("/").pop() : "open file";                       // as in loadStatsRecords
    const rows = statsRatingMoves(allRaces(recs)).get(`${cid}:${S.data.rounds[race.round].id}|${race.id}`) || [];
    return new Map(rows.map((r) => [r.name, r]));
  }).catch(() => new Map());
}

/* ---------------------------------------------------------------- one race */
function raceEntries(race, skipDns = true) {
  return race.rows.filter((r) => !skipDns || r.status !== "DNS").map((r) => ({
    key: r.d, name: driverName(r.d), color: driverColor(r.d), car: r.car, laps: r.elaps, total_ms: r.etotal, best_ms: r.ebest,
    status: r.status === "DSQ" ? "DSQ" : r.estatus, grid: r.egrid, laps_data: lapList(r.L) }));
}

function raceView(race, focusId) {
  const rd = roundOf(race), calc = race.rows;
  const rowOf = (id) => calc.find((r) => r.d === id);
  const head = h("h2", { class: "ph", text: `Round ${race.round + 1}  ·  ${roundTrack(rd)}  ·  ${race.name}` });
  const bits = [rd.date, race.weather ? `weather: ${race.weather}` : "", `scoring: ${race.preset}`, `source: ${race.source || "manual"}`].filter(Boolean);
  const chips = h("div", { class: "chips" });
  const win = race.leader ? rowOf(race.leader) : null;
  if (win) chips.append(chip("Winner", driverName(race.leader), cssVar("--gold")));
  if (race.pole) chips.append(chip("Pole", driverName(race.pole), cssVar("--blue")));
  if (race.fl) chips.append(chip("Fastest lap", `${driverName(race.fl)}  ${fmtTime(rowOf(race.fl).best)}`, cssVar("--purple")));
  if (race.led) chips.append(chip("Most laps led", `${driverName(race.led)}  ${rowOf(race.led).led}`, cssVar("--green")));
  const nPen = S.data.penalties.filter((p) => p.race === race.id).length;
  chips.append(chip("Laps", win ? win.laps : 0), chip("Classified", race.classified),
    chip("DNF / DSQ", calc.filter((r) => r.status === "DNF" || r.status === "DSQ").length),
    chip("Steward penalties", nPen, nPen ? cssVar("--red") : null));
  const tail = [{ title: "Driver data", make: () => driverData(race, focusId) }];
  if (race.quali && race.quali.entries.length) {
    const q = race.quali.entries.map((e) => ({ name: e.name, color: e.color, car: e.car, laps: e.laps, total_ms: e.total,
      best_ms: e.best, status: e.status, grid: e.grid, laps_data: lapList(e.L) }));
    tail.push({ title: "Qualifying", make: () => sessionView(q, { quali: true }) });
  }
  tail.push({ title: "Session info", make: () => sessionInfo(race) });
  return h("div", { class: "raceview" }, head, h("div", { class: "sub", text: bits.join("  ·  ") }), chips,
    sessionView(raceEntries(race), { lead: [{ title: "Classification / points", make: () => classification(race, focusId) }], tail, result: false }));
}

function classification(race, focusId) {
  const rcells = [];                                                     // the Rating cells, filled in once the stats are worked out
  const rows = race.rows.map((r) => {
    const mc = r.status !== "DSQ" ? medalClass(r.pos) : "";
    const pcg = r.pc;
    const chg = pcg === null || pcg === undefined ? ["-", "dim"] : (pcg > 0 ? [`▲${pcg}`, "green"] : (pcg < 0 ? [`▼${-pcg}`, "bad"] : ["=", "dim"]));
    const tg = r.gap === "Leader" || r.pos === null ? (r.gap === "Leader" ? fmtTime(r.adj) : "") : r.gap;
    const ptxt = fmtPts(r.pts) + (r.fl ? "  FL" : "") + (r.pole ? "  PP" : "") + (r.ml ? "  ML" : "");
    const rc = td("", "c");
    rcells.push([driverName(r.d), rc]);
    const tr = h("tr", { class: pc(r.d === focusId, "focus"), id: "cl-" + r.d },
      td(r.pos || r.status, "c b " + mc), nameTd(driverName(r.d), driverColor(r.d), () => openDriver(r.d)), td(r.team, "dim"), td(r.car, "dim"),
      td(r.grid || "-", "c"), td(chg[0], "c " + chg[1]), rc, td(r.laps, "c"), td(r.led || "-", "c " + pc(!r.led, "dim")), td(tg, "r"),
      td(fmtTime(r.best), "r " + pc(r.fl, "purple b")), td(fmtTime(r.avg), "r dim"), td(r.notes.join(", "), "c bad"),
      td(ptxt, "c b " + pc(!r.pts, "dim")), td(r.status, "c " + pc(r.status !== "Finished", "bad")));
    return tr;
  });
  const tbl = table(["Pos", "Driver", "Team", "Car", "Grid", "+/-", "Rating", "Laps", "Led", "Time / Gap", "Best lap", "Avg lap", "Penalty", "Pts", "Status"], rows);
  raceRatingMoves(race).then((mv) => {
    if (!mv.size) { tbl.querySelectorAll("tr").forEach((tr) => tr.children[6] && tr.children[6].remove()); return; }        // no stats: no Rating column
    rcells.forEach(([name, c]) => {
      const m = mv.get(name);
      if (!m) return;
      const ch = Math.floor(Math.abs(m.delta) + 0.5);
      c.append(`${fmtRating(m.after)} `, h("span", { class: !ch ? "dim" : m.delta > 0 ? "green" : "bad", text: ch ? (m.delta > 0 ? "▲ " : "▼ ") + ch : "-" }));
      c.title = `Rating ${fmtRating(m.before)} → ${fmtRating(m.after)}`;
    });
  });
  return h("div", null, tbl, h("div", { class: "hint", text: "Click a driver for their full profile." }));
}

function driverData(race, focusId) {
  const rows = race.rows;
  const start = Math.max(0, rows.findIndex((r) => r.d === focusId));
  const out = h("div", { class: "drvdata" });
  const sel = h("select", { "aria-label": "Driver", onchange: () => show() }, rows.map((r, i) => option(String(i), `${r.pos || r.status}.  ${driverName(r.d)}`, i === start)));
  const holder = h("div");
  function show() {
    const r = rows[+sel.value], laps = lapList(r.L);
    const best = Math.min(...laps.filter((l) => l.time_ms > 0 && l.valid).map((l) => l.time_ms), Infinity);
    let cum = 0;
    const trs = laps.map((l) => {
      cum += l.time_ms;
      const cls = !l.valid ? "bad" : (l.time_ms && l.time_ms === best ? "purple b" : "");
      return h("tr", null, td(l.lap, "c dim"), td(fmtTime(l.time_ms), "r " + cls), td(l.time_ms > best && best < Infinity ? fmtGap(l.time_ms - best) : "-", "r dim"),
        td(fmtTime(cum), "r dim"), td(l.splits.map(fmtTime).join("   "), "dim"));
    });
    clear(holder).append(table(["Lap", "Time", "Δ best", "Cumulative", "Sectors"], trs));
  }
  out.append(h("div", { class: "sbar" }, h("span", { class: "dim", text: "Driver:" }), sel), holder);
  show();
  return out;
}

function sessionInfo(race) {
  const meta = race.meta || {};
  return table(["Field", "Value"], Object.entries(meta).map(([k, v]) => h("tr", null, td(k, "dim"), td(String(v)))));
}

/* ---------------------------------------------------------------- a round with all its races side by side */
/* the races of a round that have results, and every driver of them with their results and round total */
function roundData(rd) {
  const races = rd.races.map((id) => S.races[id]).filter(Boolean);
  const agg = new Map();
  races.forEach((race, n) => {
    for (const r of race.rows) {
      const a = agg.get(r.d) || { d: r.d, cells: {}, pts: 0, best: 0 };
      a.cells[n] = r; a.pts += r.pts;
      if (r.best > 0 && (!a.best || r.best < a.best)) a.best = r.best;
      agg.set(r.d, a);
    }
  });
  const order = (a) => [-a.pts, Object.values(a.cells).map((r) => r.pos).filter(Boolean).sort((x, y) => x - y), driverName(a.d).toLowerCase()];
  const list = [...agg.values()].sort((a, b) => {
    const A = order(a), B = order(b);
    if (A[0] !== B[0]) return A[0] - B[0];
    const pa = A[1].length ? A[1] : [999], pb = B[1].length ? B[1] : [999];
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if (pa[i] === undefined) return -1;
      if (pb[i] === undefined) return 1;
      if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return A[2] < B[2] ? -1 : A[2] > B[2] ? 1 : 0;
  });
  const gbest = Math.min(...list.map((a) => a.best).filter((b) => b > 0), Infinity);
  return { races, list, gbest };
}

function roundView(rd, rdIndex) {
  const { races, list, gbest } = roundData(rd);
  const presets = [...new Set(races.map((r) => r.preset))].sort();
  const bits = [rd.date, `${races.length} of ${rd.races.length} races`, "scoring: " + presets.join(", ")].filter(Boolean);
  const chips = h("div", { class: "chips" });
  if (list.length) {
    chips.append(chip("Round leader", `${driverName(list[0].d)}  ${fmtPts(list[0].pts)} pts`, cssVar("--gold")));
    const fl = list.find((a) => a.best === gbest);
    if (fl && gbest < Infinity) chips.append(chip("Fastest lap", `${driverName(fl.d)}  ${fmtTime(gbest)}`, cssVar("--purple")));
  }
  for (const race of races) if (race.leader) chips.append(chip(`${race.name} winner`, driverName(race.leader)));
  chips.append(chip("Drivers", list.length));
  const rows = list.map((a, i) => {
    const cells = races.map((race, n) => {
      const r = a.cells[n];
      if (!r) return td("-", "c dim");
      const txt = (r.pos ? `P${r.pos}` : r.status) + "  ·  " + fmtPts(r.pts) + (r.fl ? "  FL" : "") + (r.pole ? "  PP" : "") + (r.ml ? "  ML" : "");
      const cls = r.pos && r.status !== "DSQ" ? medalClass(r.pos) : (r.status !== "Finished" ? "bad" : "");
      return h("td", { class: "c link " + cls + pc(r.pos && r.pos <= 3, " b"), onclick: () => openRace(race.id, a.d) }, txt);
    });
    const isb = !!(a.best && a.best === gbest);
    return h("tr", null, td(i + 1, "c b " + medalClass(i + 1)), nameTd(driverName(a.d), driverColor(a.d), () => openDriver(a.d)), cells,
      td(fmtPts(a.pts), "c b " + pc(!a.pts, "dim")), td(fmtTime(a.best), "r " + pc(isb, "purple b")));
  });
  return h("div", { class: "raceview" }, h("h2", { class: "ph", text: `Round ${rdIndex + 1}  ·  ${roundTrack(rd)}  ·  Round summary` }),
    h("div", { class: "sub", text: bits.join("  ·  ") }), chips,
    table(["Pos", "Driver", ...races.map((r) => r.name), "Round pts", "Best lap"], rows),
    h("div", { class: "hint", text: "Click a race result to open that race with the driver selected  ·  click a name for the driver profile." }));
}

/* ---------------------------------------------------------------- the Race results page */
function raceItems() {
  const out = [];
  S.data.rounds.forEach((rd, i) => {
    const done = rd.races.map((id) => S.races[id]).filter(Boolean);
    if (!done.length) return;
    const track = roundTrack(rd);
    if (rd.races.length > 1) out.push({ label: `R${i + 1}  ${track}  —  Round summary`, value: `round:${i}` });
    done.forEach((r) => out.push({ label: `R${i + 1}  ${track}  —  ${r.name}`, value: `race:${r.id}` }));
  });
  return out;
}

function viewRaces() {
  const items = raceItems();
  const root = h("div", { class: "page" });
  if (!items.length) return root.append(h("div", { class: "empty", text: "No results in this championship yet." })), root;
  if (!items.some((x) => x.value === S.sel)) {
    const last = [...items].reverse().find((x) => x.value.startsWith("race:"));
    S.sel = last ? last.value : items[0].value;
  }
  const holder = h("div");
  const sel = h("select", { class: "wide", "aria-label": "Round or race", onchange: () => { S.sel = sel.value; S.focus = null; render(); } },
    items.map((x) => option(x.value, x.label, x.value === S.sel)));
  const step = (d) => { const i = items.findIndex((x) => x.value === S.sel); S.sel = items[(i + d + items.length) % items.length].value; S.focus = null; sel.value = S.sel; render(); };
  function render() {
    sel.value = S.sel;
    const [kind, ...rest] = S.sel.split(":"), ident = rest.join(":");
    clear(holder);
    if (kind === "race" && S.races[ident]) holder.append(raceView(S.races[ident], S.focus));
    else if (kind === "round") holder.append(roundView(S.data.rounds[+ident], +ident));
    S.focus = null;
  }
  root.append(h("div", { class: "toolbar" }, field("Show:", sel),
    h("button", { class: "btn sq", type: "button", "aria-label": "Previous", onclick: () => step(-1), text: "◀" }),
    h("button", { class: "btn sq", type: "button", "aria-label": "Next", onclick: () => step(1), text: "▶" }),
    h("span", { class: "grow" }),
    h("button", { class: "btn", type: "button", text: "Export CSV", title: "Save the table that is showing as CSV", onclick: () => {
      const t = holder.querySelector(".pane:not([hidden]) table") || holder.querySelector("table");
      if (t) downloadCsv(slug(S.data.name + "_" + sel.options[sel.selectedIndex].text), t);
    } }), discordButton(() => {
      const [kind, ...rest] = S.sel.split(":"), ident = rest.join(":");
      return kind === "race" ? (S.races[ident] ? textRace(S.races[ident]) : "") : textRound(+ident);
    })), holder);
  render();
  return root;
}

function openRace(raceId, focus) {
  S.sel = "race:" + raceId; S.focus = focus || null;
  closeModal();
  setTab("races");
}

/* ---------------------------------------------------------------- driver profile */
function openDriver(id) {
  const d = S.data, drv = S.drv[id];
  if (!drv) return;
  const st = d.standings.drivers, me = st.find((r) => r.id === id);
  const hist = [];
  d.cols.forEach((c, ci) => {
    const race = S.races[c.race];
    const r = race && race.rows.find((x) => x.d === id);
    if (r) hist.push({ ci, race, r });
  });
  const fins = hist.filter((x) => x.r.pos && x.r.status !== "DSQ").map((x) => x.r.pos);
  const grids = hist.filter((x) => x.r.grid).map((x) => x.r.grid);
  const bests = hist.filter((x) => x.r.best > 0).map((x) => x.r.best);
  const chips = h("div", { class: "chips" });
  if (me) {
    chips.append(chip("Championship", ordinal(me.rank), medalColor(me.rank)), chip("Points", fmtPts(me.total), cssVar("--accent")),
      chip("Wins", me.wins, me.wins ? cssVar("--gold") : null), chip("Podiums", me.podiums),
      chip("Poles", me.poles, me.poles ? cssVar("--blue") : null), chip("Fastest laps", me.fls, me.fls ? cssVar("--purple") : null), chip("DNFs", me.dnfs));
  }
  const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "-");
  chips.append(chip("Avg finish", avg(fins)), chip("Avg grid", avg(grids)),
    chip("Best lap", bests.length ? fmtTime(Math.min(...bests)) : "-", cssVar("--purple")), chip("Laps", hist.reduce((a, x) => a + x.r.laps, 0)));

  const byRace = hist.map(({ race, r }) => {
    const rd = roundOf(race), mc = r.status !== "DSQ" ? medalClass(r.pos) : "";
    return h("tr", { class: "link", onclick: () => openRace(race.id, id) }, td(race.round + 1, "c dim"), td(roundTrack(rd), "b"), td(race.name),
      td(r.grid || "-", "c"), td(r.pos ? `P${r.pos}` : r.status, "c b " + mc), td(r.laps, "c"), td(fmtTime(r.adj), "r"),
      td(fmtTime(r.best), "r " + pc(r.fl, "purple b")), td(fmtTime(r.avg), "r dim"), td(r.notes.join(", "), "c bad"),
      td(fmtPts(r.pts) + (r.fl ? "  FL" : "") + (r.pole ? "  PP" : "") + (r.ml ? "  ML" : ""), "c b"),
      td(r.status, "c " + pc(r.status !== "Finished", "bad")));
  });
  const makeCharts = () => {
    const labels = { 0: "Start" };
    const p1 = [[0, 0]], p2 = [];
    let run = 0;
    d.scored.forEach((ci, n) => {
      const cell = me && me.cells[String(ci)];
      run += cell ? cell.pts : 0;
      p1.push([n + 1, run]);
      if (cell && cell.pos) p2.push([n + 1, cell.pos]);
      const col = d.cols[ci], rd = d.rounds[col.round];
      labels[n + 1] = `R${col.round + 1}` + (rd.races.length > 1 ? `.${col.name.slice(-1)}` : "");
    });
    const a = chartBox(300), b = chartBox(300);
    a.chart.setData([{ label: drv.name, color: drv.color, pts: p1 }], { xlabels: labels, integer: true, zero: true });
    b.chart.setData([{ label: "Finish position", color: cssVar("--blue"), pts: p2 }], { xlabels: labels, invert: true, integer: true, yfmt: (v) => `P${pyRound(v)}` });
    return h("div", { class: "chartwrap" }, h("div", { class: "ctitle", text: "Cumulative points" }), a.cv, h("div", { class: "ctitle", text: "Finishing position" }), b.cv);
  };
  const pens = d.penalties.filter((p) => p.d === id);
  const penRows = pens.map((p) => {
    const race = S.races[p.race];
    const rd = race ? roundOf(race) : null;
    return h("tr", null, td(rd ? `R${race.round + 1} ${rd.track || ""}` : "Championship"), td(race ? race.name : "-"), td(p.type, "bad"),
      td(`${fmtPts(p.value)} ${p.unit}`.trim()), td(p.reason || ""));
  });
  const tabs = tabset([
    { title: "Race by race", make: () => table(["Rnd", "Track", "Race", "Grid", "Finish", "Laps", "Race time", "Best lap", "Avg lap", "Penalties", "Pts", "Status"], byRace) },
    { title: "Charts", make: makeCharts },
    { title: `Penalties (${pens.length})`, make: () => table(["Round", "Race", "Type", "Value", "Reason"], penRows) },
  ]);
  showModal(h("div", { class: "drvhead" }, h("h2", { class: "ph", style: { borderLeft: `6px solid ${safeColor(drv.color)}`, paddingLeft: "10px" }, text: drv.name }),
    h("div", { class: "sub", text: `${drv.team || "No team"}   ${drv.number ? "#" + drv.number : ""}` })), chips, tabs.el);
}

/* ---------------------------------------------------------------- modal */
function closeModal() { const m = document.getElementById("modal"); if (m) m.remove(); document.body.classList.remove("modal-open"); }
function showModal(...content) {
  closeModal();
  const m = h("div", { id: "modal", class: "modal", role: "dialog", "aria-modal": "true", onclick: (e) => { if (e.target === m) closeModal(); } },
    h("div", { class: "modal-box" }, h("button", { class: "btn close", type: "button", "aria-label": "Close", text: "✕", onclick: closeModal }), content));
  document.body.append(m); document.body.classList.add("modal-open");
  m.querySelector(".close").focus();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
