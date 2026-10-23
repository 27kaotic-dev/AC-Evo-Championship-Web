"use strict";
/* Statistics across championships: tracks raced, track records, all-time drivers, head-to-head.
   The rules are the same as the desktop program's (stats_* functions there); both are checked against each other.
   Everything is worked out from "records": the exports of the championships in the library, turned into plain
   race / driver rows (champRecord).  Drivers are followed from season to season by their `pid`. */

const WEATHER = ["", "Dry", "Damp", "Wet", "Mixed"];

/* tuple comparison like Python's: compares element by element */
function cmpT(a, b) {
  for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; }
  return 0;
}
const lc = (s) => String(s).toLowerCase();

function trackKey(track, layout) { return lc(`${track} ${layout || ""}`).replace(/[^a-z0-9]+/g, " ").trim(); }
function trackLabel(track, layout) { return layout ? `${track} (${layout})` : track; }

/* one exported championship -> a record */
function champRecord(data, cid) {
  const drv = Object.fromEntries(data.drivers.map((d) => [d.id, d]));
  const pidOf = (id) => (drv[id] && drv[id].pid) || "n:" + lc((drv[id] || {}).name || id);   // exports from before pids existed
  const nameOf = (id) => (drv[id] || {}).name || id;
  const races = data.races.map((r) => {
    const rd = data.rounds[r.round], meta = r.meta || {};
    let track = r.track, layout = r.layout;
    if (track === undefined) {                                  // older export: what the game wrote, else the round's name
      if (typeof meta.track === "string" && meta.track.trim()) { track = meta.track.replace(/_/g, " ").trim(); layout = typeof meta.layout === "string" ? meta.layout.replace(/_/g, " ").trim() : ""; }
      else { track = String(rd.track || rd.name || "").trim(); layout = ""; }
    }
    return {
      cid, rid: r.id, champ: data.name, round_key: `${cid}:${rd.id}`, round: r.round + 1, round_name: rd.name, track, layout: layout || "",
      tkey: trackKey(track, layout), date: String(rd.date || meta.date || ""), weather: r.weather || "", race: r.name,
      rows: r.rows.map((w) => ({
        pid: pidOf(w.d), name: nameOf(w.d), car: String(w.car || ""), pos: w.pos, grid: w.grid, status: w.status, laps: w.laps,
        best: w.best, pts: w.pts, led: w.led, fl: !!w.fl, pole: !!w.pole, ml: !!w.ml, L: (w.L || []).map((l) => [l[0], !!l[1]]),
      })),
    };
  });
  const state = data.cols.length && races.length === data.cols.length ? "done" : (races.length ? "live" : "new");
  const standings = data.standings.drivers.map((s) => ({ pid: pidOf(s.id), name: s.name, rank: s.rank, total: s.total, wins: s.wins,
    podiums: s.podiums, poles: s.poles, fls: s.fls, dnfs: s.dnfs, starts: s.starts }));
  const dates = races.map((r) => r.date).filter(Boolean);
  return { cid, name: data.name, state, first: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : "", races, standings, total_races: data.cols.length };
}

function sortChamps(champs) { return [...champs].sort((a, b) => cmpT([a.first || "9999", lc(a.name), a.cid], [b.first || "9999", lc(b.name), b.cid])); }
function allRaces(champs) { return sortChamps(champs).flatMap((c) => c.races); }

function statsTracks(races) {
  const t = new Map();
  for (const r of races) {
    let x = t.get(r.tkey);
    if (!x) { x = { tkey: r.tkey, track: r.track, layout: r.layout, rounds: new Set(), races: 0, champs: new Set(), drivers: new Set(), last: "" }; t.set(r.tkey, x); }
    x.rounds.add(r.round_key); x.races++; x.champs.add(r.cid);
    for (const w of r.rows) if (w.status !== "DNS") x.drivers.add(w.pid);
    if (r.date > x.last) x.last = r.date;
  }
  const out = [...t.values()].map((x) => ({ tkey: x.tkey, track: x.track, layout: x.layout, rounds: x.rounds.size, races: x.races,
    champs: x.champs.size, drivers: x.drivers.size, last: x.last }));
  return out.sort((a, b) => cmpT([-a.rounds, -a.races, lc(a.track), lc(a.layout)], [-b.rounds, -b.races, lc(b.track), lc(b.layout)]));
}

function statsFilters(races) {
  const tracks = new Map(), cars = new Set(), weathers = new Set();
  for (const r of races) {
    if (!tracks.has(r.tkey)) tracks.set(r.tkey, trackLabel(r.track, r.layout));
    weathers.add(r.weather);
    for (const w of r.rows) if (w.car) cars.add(w.car);
  }
  return {
    tracks: [...tracks.entries()].sort((a, b) => (lc(a[1]) < lc(b[1]) ? -1 : lc(a[1]) > lc(b[1]) ? 1 : 0)),
    cars: [...cars].sort((a, b) => (lc(a) < lc(b) ? -1 : lc(a) > lc(b) ? 1 : 0)),
    weathers: [...WEATHER.filter((w) => weathers.has(w)), ...[...weathers].filter((w) => !WEATHER.includes(w)).sort()],
  };
}

/* fastest laps: with a track one row per driver, without one row per track and car.  weather: null = any, "" = not set */
function statsRecords(races, tkey, car, weather) {
  const best = new Map(), starts = new Map();
  for (const r of races) {
    if ((tkey && r.tkey !== tkey) || (weather !== null && weather !== undefined && r.weather !== weather)) continue;
    for (const w of r.rows) {
      if (w.status === "DNS" || w.status === "DSQ" || w.best <= 0 || (car && w.car !== car)) continue;
      const key = tkey ? w.pid : r.tkey + "\u0000" + w.car;
      starts.set(key, (starts.get(key) || 0) + 1);
      const cand = { pid: w.pid, name: w.name, tkey: r.tkey, track: r.track, layout: r.layout, car: w.car, best: w.best, weather: r.weather,
        champ: r.champ, round: r.round, race: r.race, date: r.date, _key: key };
      const cur = best.get(key);
      if (!cur || cand.best < cur.best || (cand.best === cur.best && cand.date && cur.date && cand.date < cur.date)) best.set(key, cand);
    }
  }
  const out = [...best.values()];
  for (const x of out) { x.starts = starts.get(x._key); delete x._key; }
  if (tkey) {
    out.sort((a, b) => cmpT([a.best, a.date, lc(a.name)], [b.best, b.date, lc(b.name)]));
    out.forEach((x, i) => { x.pos = i + 1; x.gap = x.best - out[0].best; });
  } else out.sort((a, b) => cmpT([lc(a.track), lc(a.layout), lc(a.car), a.best], [lc(b.track), lc(b.layout), lc(b.car), b.best]));
  return out;
}

function statsDrivers(champs, races) {
  const d = new Map();
  for (const r of races) {
    for (const w of r.rows) {
      if (w.status === "DNS") continue;
      let a = d.get(w.pid);
      if (!a) {
        a = { pid: w.pid, name: w.name, _date: r.date, races: 0, wins: 0, podiums: 0, poles: 0, fls: 0, mls: 0, dnfs: 0, points: 0, laps: 0, led: 0,
          _fin: [], _grid: [], _champs: new Set(), _tracks: new Set(), titles: 0, seconds: 0, thirds: 0 };
        d.set(w.pid, a);
      } else if (r.date >= a._date) { a.name = w.name; a._date = r.date; }
      a.races++;
      if (w.pos === 1 && w.status !== "DSQ") a.wins++;
      if (w.pos && w.pos <= 3) a.podiums++;
      if (w.pole) a.poles++;
      if (w.fl) a.fls++;
      if (w.ml) a.mls++;
      if (w.status === "DNF") a.dnfs++;
      a.points += w.pts; a.laps += w.laps; a.led += w.led;
      if (w.pos) a._fin.push(w.pos);
      if (w.grid && w.grid > 0) a._grid.push(w.grid);
      a._champs.add(r.cid); a._tracks.add(r.tkey);
    }
  }
  const place = { 1: "titles", 2: "seconds", 3: "thirds" };
  for (const c of champs) {
    if (c.state === "done") for (const s of c.standings) if (place[s.rank] && d.has(s.pid)) d.get(s.pid)[place[s.rank]]++;   // only a finished championship gives a place
  }
  const sum = (v) => v.reduce((x, y) => x + y, 0);
  const out = [...d.values()].map((a) => {
    const o = { ...a, seasons: a._champs.size, tracks: a._tracks.size, avg_finish: a._fin.length ? sum(a._fin) / a._fin.length : 0,
      avg_grid: a._grid.length ? sum(a._grid) / a._grid.length : 0, best_finish: a._fin.length ? Math.min(...a._fin) : 0 };
    delete o._fin; delete o._grid; delete o._champs; delete o._tracks; delete o._date;
    return o;
  });
  return out.sort((a, b) => cmpT([-a.titles, -a.wins, -a.podiums, -a.points, lc(a.name)], [-b.titles, -b.wins, -b.podiums, -b.points, lc(b.name)]));
}

/* one row per championship, oldest first: how far it got and who finished 1st, 2nd and 3rd.  A running championship shows who is there now. */
function statsChampions(champs) {
  return sortChamps(champs).map((c) => {
    const byRank = new Map(c.standings.map((s) => [s.rank, s]));
    const dates = c.races.map((r) => r.date).filter(Boolean).sort();
    return { cid: c.cid, name: c.name, state: c.state, archived: !!c.archived, first: dates.length ? dates[0] : "", last: dates.length ? dates[dates.length - 1] : "",
      races: c.races.length, total_races: c.total_races || c.races.length, drivers: c.standings.length, rounds: new Set(c.races.map((r) => r.round_key || r.round)).size,
      podium: [1, 2, 3].map((k) => (byRank.has(k) ? { pid: byRank.get(k).pid, name: byRank.get(k).name, total: byRank.get(k).total } : null)) };
  });
}

/* Driver ratings (Elo style) from the finishing order of every race, oldest first; the same rules as the desktop program's _rate.
   `since` (a date) only decides which races count for the period figures; the ratings are always worked out from the whole history. */
const RATING = { start: 1000, k: 40, kNew: 60, newStarts: 5, provisional: 3 };
function rateRun(races, since, moves) {
  const d = new Map();
  for (const race of races) {
    const field = race.rows.filter((w) => w.status !== "DNS");
    if (!field.length) continue;
    const counted = since === null || !!(race.date && race.date >= since);
    const place = new Map(field.map((w) => [w.pid, w.pos && w.status !== "DSQ" ? w.pos : 1e6]));
    for (const w of field) {
      let a = d.get(w.pid);
      if (!a) { a = { pid: w.pid, name: w.name, _date: race.date, rating: RATING.start, starts: 0, _ps: null, _pk: null, _pn: 0, _pw: 0, _g: 0, _gn: 0 }; d.set(w.pid, a); }
      else if (race.date >= a._date) { a.name = w.name; a._date = race.date; }
    }
    const pre = new Map(field.map((w) => [w.pid, d.get(w.pid).rating]));
    const n = field.length, delta = new Map();
    for (const w of field) {
      const ri = pre.get(w.pid), pi = place.get(w.pid);
      let s = 0, e = 0, opp = 0;
      for (const o of field) {
        if (o.pid === w.pid) continue;
        const rj = pre.get(o.pid), pj = place.get(o.pid);
        s += pi < pj ? 1 : (pi === pj ? 0.5 : 0);
        e += 1 / (1 + Math.pow(10, (rj - ri) / 400));
        opp += rj;
      }
      const a = d.get(w.pid), k = a.starts < RATING.newStarts ? RATING.kNew : RATING.k;
      delta.set(w.pid, n > 1 ? (k * (s - e)) / (n - 1) : 0);
      if (counted && n > 1) { a._g += opp / (n - 1); a._gn++; }
    }
    for (const w of field) {
      const a = d.get(w.pid), before = a.rating;
      if (counted && a._ps === null) a._ps = before;
      a.rating += delta.get(w.pid); a.starts++;
      if (counted) { a._pn++; if (w.pos === 1 && w.status !== "DSQ") a._pw++; a._pk = a._pk === null ? a.rating : Math.max(a._pk, a.rating); }
      if (moves) {
        const key = `${race.round_key}|${race.rid || race.race}`;
        if (!moves.has(key)) moves.set(key, []);
        moves.get(key).push({ pid: w.pid, name: w.name, pos: w.status === "DSQ" ? null : w.pos, status: w.status, before, after: a.rating, delta: delta.get(w.pid) });
      }
    }
  }
  return d;
}
function statsRatings(races, since = null) {
  return [...rateRun(races, since, null).values()].filter((a) => a._pn > 0).map((a) => ({ pid: a.pid, name: a.name, starts: a._pn, rating: a.rating,
    change: a.rating - a._ps, peak: a._pk, wins: a._pw, grid: a._gn ? a._g / a._gn : 0, provisional: a.starts < RATING.provisional }))
    .sort((a, b) => b.rating - a.rating || b.starts - a.starts || (lc(a.name) < lc(b.name) ? -1 : lc(a.name) > lc(b.name) ? 1 : 0) || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0));
}
/* what each race did to the ratings: "round key|race id" -> rows, in finishing order */
function statsRatingMoves(races) {
  const moves = new Map();
  rateRun(races, null, moves);
  for (const rows of moves.values()) rows.sort((a, b) => ((a.pos === null) - (b.pos === null)) || ((a.pos || 0) - (b.pos || 0)) || (lc(a.name) < lc(b.name) ? -1 : 1));
  return moves;
}
const RATING_PERIODS = [["all", "All Time"], ["3m", "Last 3 months"], ["6m", "Last 6 months"], ["1y", "Last 1 Year"]];
function ratingSince(key) {                  // 3 months = 91 days, 6 months = 182, 1 year = 365
  const days = { "3m": 91, "6m": 182, "1y": 365 }[key];
  if (!days) return null;
  const d = new Date(); d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmtRating = (x) => Math.floor(x + 0.5).toLocaleString("en-US");

function statsCareer(champs, races, pid) {
  const seasons = [];
  for (const c of sortChamps(champs)) {
    const s = c.standings.find((x) => x.pid === pid);
    if (s) seasons.push({ cid: c.cid, champ: c.name, state: c.state, rank: s.rank, of: c.standings.length, total: s.total, wins: s.wins,
      podiums: s.podiums, poles: s.poles, fls: s.fls, dnfs: s.dnfs, starts: s.starts });
  }
  const t = new Map();
  for (const r of races) {
    for (const w of r.rows) {
      if (w.pid !== pid || w.status === "DNS") continue;
      let x = t.get(r.tkey);
      if (!x) { x = { tkey: r.tkey, track: r.track, layout: r.layout, starts: 0, _fin: [], best_finish: 0, best_lap: 0, best_car: "", last: "" }; t.set(r.tkey, x); }
      x.starts++;
      if (w.pos) x._fin.push(w.pos);
      if (w.status !== "DSQ" && w.best > 0 && (!x.best_lap || w.best < x.best_lap)) { x.best_lap = w.best; x.best_car = w.car; }
      if (r.date > x.last) x.last = r.date;
    }
  }
  const tracks = [...t.values()].map((x) => {
    const fin = x._fin; delete x._fin;
    x.best_finish = fin.length ? Math.min(...fin) : 0;
    x.avg_finish = fin.length ? fin.reduce((p, q) => p + q, 0) / fin.length : 0;
    return x;
  }).sort((a, b) => cmpT([-a.starts, lc(a.track), lc(a.layout)], [-b.starts, lc(b.track), lc(b.layout)]));
  return { seasons, tracks };
}

function statsH2h(races, a, b) {
  const rows = [], s = { n: 0, a_ahead: 0, b_ahead: 0, a_pts: 0, b_pts: 0, a_grid: 0, b_grid: 0, a_faster: 0, b_faster: 0 };
  const fa = [], fb = [], gaps = [];
  races.forEach((r, i) => {
    const wa = r.rows.find((w) => w.pid === a && w.status !== "DNS"), wb = r.rows.find((w) => w.pid === b && w.status !== "DNS");
    if (!wa || !wb) return;
    const pa = wa.pos, pb = wb.pos;
    let ahead = "";
    if (pa && pb) ahead = pa < pb ? "a" : (pb < pa ? "b" : "");
    else if (pa) ahead = "a"; else if (pb) ahead = "b";
    s.n++; if (ahead === "a") s.a_ahead++; if (ahead === "b") s.b_ahead++;
    s.a_pts += wa.pts; s.b_pts += wb.pts;
    if (wa.grid > 0 && wb.grid > 0 && wa.grid !== wb.grid) s[wa.grid < wb.grid ? "a_grid" : "b_grid"]++;
    if (wa.best > 0 && wb.best > 0) { if (wa.best !== wb.best) s[wa.best < wb.best ? "a_faster" : "b_faster"]++; gaps.push(wa.best - wb.best); }
    if (pa) fa.push(pa); if (pb) fb.push(pb);
    rows.push({ index: i, champ: r.champ, round: r.round, track: r.track, layout: r.layout, race: r.race, date: r.date, weather: r.weather,
      a_pos: pa, b_pos: pb, a_status: wa.status, b_status: wb.status, a_grid: wa.grid, b_grid: wb.grid, a_best: wa.best, b_best: wb.best,
      a_pts: wa.pts, b_pts: wb.pts, ahead });
  });
  const avg = (v) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0);
  s.a_avg = avg(fa); s.b_avg = avg(fb); s.avg_best_gap = avg(gaps);
  return { summary: s, rows };
}

function h2hSeries(wa, wb) {
  const la = wa.L.map((l) => l[0]), lb = wb.L.map((l) => l[0]);
  const times = [la.map((t, n) => [n + 1, t]), lb.map((t, n) => [n + 1, t])], gap = [];
  if (la.length && lb.length && la.every((t) => t > 0) && lb.every((t) => t > 0)) {
    let ca = 0, cb = 0;
    for (let n = 0; n < Math.min(la.length, lb.length); n++) { ca += la[n]; cb += lb[n]; gap.push([n + 1, (cb - ca) / 1000]); }
  }
  return { times, gap };
}

/* ---------------------------------------------------------------- loading every championship of the library */
async function loadStatsRecords(onProgress) {
  const out = [], seen = new Set();
  const files = S.library.map((c) => c.file);
  let done = 0;
  for (const entry of S.library) {
    const file = entry.file;
    seen.add(file);
    if (!S.recCache[file]) {
      try {
        const res = await fetch(file, { cache: "no-cache" });
        if (res.ok) { const data = await res.json(); if (data && data.format === 1 && data.standings) S.recCache[file] = champRecord(data, file.split("/").pop()); }
      } catch (e) { /* a file that can not be read is left out */ }
    }
    if (S.recCache[file]) out.push({ ...S.recCache[file], archived: !!entry.archived });
    if (onProgress) onProgress(++done, files.length);
  }
  if (S.data && !S.current) out.push(champRecord(S.data, "open file"));        // a file shown with "Open file…"
  return out.filter((c) => c.races.length);
}

/* ---------------------------------------------------------------- the pages */
function viewStats() {
  const root = h("div", { class: "page" });
  const body = h("div");
  root.append(h("div", { class: "toolbar" }, h("div", { class: "grow" }, h("h2", { class: "ph", text: "Stats & Records" }),
    h("div", { class: "sub", id: "stats-sub", text: "Loading…" }))), body);
  const note = h("div", { class: "empty", text: "Loading the championships…" });
  body.append(note);
  loadStatsRecords((n, total) => { note.textContent = `Loading the championships… ${n} of ${total}`; }).then((records) => {
    if (!root.isConnected && !document.body.contains(root)) return;
    S.stats = { all: sortChamps(records), sel: null };
    fillStats(root, body);
  });
  return root;
}

function fillStats(root, body) {
  const st = S.stats;
  clear(body);
  const sub = root.querySelector("#stats-sub");
  if (!st.all.length) { sub.textContent = ""; body.append(h("div", { class: "empty", text: "No race results in the library yet." })); return; }
  const champs = st.all.filter((c) => !st.sel || st.sel.has(c.cid)), races = allRaces(champs);
  const nDrv = new Set(races.flatMap((r) => r.rows.filter((w) => w.status !== "DNS").map((w) => w.pid))).size;
  const nArch = champs.filter((c) => c.archived).length;
  sub.textContent = `${champs.length} championship${champs.length !== 1 ? "s" : ""}` + (nArch ? ` (${nArch} archived)` : "") + `  ·  ${races.length} races  ·  ${nDrv} drivers` + (st.sel ? "  (filtered)" : "");
  // which championships to include
  const menu = h("details", { class: "picker" }, h("summary", { class: "btn", text: "Championships ▾" }),
    h("div", { class: "picker-box" }, st.all.map((c) => h("label", { class: "check" },
      h("input", { type: "checkbox", checked: !st.sel || st.sel.has(c.cid), onchange: (e) => {
        const cur = st.sel ? new Set(st.sel) : new Set(st.all.map((x) => x.cid));
        if (e.target.checked) cur.add(c.cid); else cur.delete(c.cid);
        st.sel = cur.size === st.all.length || cur.size === 0 ? null : cur;
        fillStats(root, body);
      } }), c.name + (c.archived ? " (archived)" : "")))));
  const keep = S.statsTab || 0;
  const tabs = tabset([
    { title: "Hall Of Fame", make: () => statsChampionsPage(champs, races) },
    { title: "Tracks raced", make: () => statsTracksPage(races) },
    { title: "Track records", make: () => statsRecordsPage(races) },
    { title: "Drivers (all-time)", make: () => statsDriversPage(champs, races) },
    { title: "Ratings", make: () => statsRatingsPage(races, champs) },
    { title: "Head-to-head", make: () => statsH2hPage(champs, races) },
  ], keep);
  body.append(h("div", { class: "toolbar" }, h("span", { class: "grow" }), menu,
    h("button", { class: "btn", type: "button", text: "Export CSV", onclick: () => {
      const t = tabs.el.querySelector(".pane:not([hidden]) table");
      if (t) downloadCsv(slug(STATS_NAMES[tabs.index] || "stats"), t);
    } })), tabs.el);
  tabs.el.addEventListener("click", () => { S.statsTab = tabs.index; });
}
const STATS_NAMES = ["champions", "tracks_raced", "track_records", "drivers_all_time", "ratings", "head_to_head"];

function statsRatingsPage(races, champs) {
  let all = statsRatings(races);
  const HEADS = [["#", null], ["Driver", "name"], ["Rating", "rating"], ["Change", "change"], ["Peak", "peak"], ["Grid rating", "grid"]];
  let key = "rating", desc = true;
  const period = h("select", { "aria-label": "Period", onchange: () => { all = statsRatings(races, ratingSince(period.value)); draw(); } },
    RATING_PERIODS.map(([v, t]) => option(v, t)));
  const search = h("input", { type: "search", placeholder: "Find a driver…", "aria-label": "Find a driver", oninput: () => draw() });
  const holder = h("div");
  function draw() {
    const q = lc(search.value.trim());
    const rows = all.filter((r) => lc(r.name).includes(q));
    if (key === "name") rows.sort((a, b) => (lc(a.name) < lc(b.name) ? -1 : 1) * (desc ? -1 : 1));
    else if (key) rows.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (desc ? -1 : 1));
    const trs = rows.map((r, i) => {
      const ch = Math.floor(Math.abs(r.change) + 0.5);
      return h("tr", { class: "link", onclick: () => openCareer(champs, races, r.pid) }, td(i + 1, "c dim"), td(r.name, "b"),
        h("td", { class: "c b" + (r.provisional ? " dim" : ""), title: r.provisional ? "Provisional: fewer than 3 starts" : null, text: fmtRating(r.rating) }),
        h("td", { class: "c " + (!ch ? "dim" : r.change > 0 ? "green" : "bad"), title: "How much the rating moved over the period", text: ch ? (r.change > 0 ? "▲ " : "▼ ") + ch : "-" }),
        td(fmtRating(r.peak), "c dim"), td(r.grid ? fmtRating(r.grid) : "-", "c dim"));
    });
    const t = table(HEADS.map((x) => x[0]), trs);
    t.querySelectorAll("th").forEach((th, c) => {
      if (HEADS[c][1] === null) return;
      th.classList.add("sortable");
      th.addEventListener("click", () => {
        const k = HEADS[c][1];
        if (key === k) desc = !desc; else { key = k; desc = k !== "name"; }
        draw();
      });
    });
    clear(holder).append(t);
  }
  draw();
  return h("div", null, h("div", { class: "toolbar" }, field("Period:", period), search, h("span", { class: "grow" }),
    h("span", { class: "hint", text: "Click a heading to sort · click a driver for their career · everyone starts on 1,000; fewer than 3 starts is provisional (grey)" })), holder);
}

function statsChampionsPage(champs, races) {
  const rows = statsChampions(champs);
  const order = h("select", { "aria-label": "Order", onchange: () => draw() }, option("new", "Newest first"), option("old", "Oldest first"));
  const chips = h("div", { class: "chips" }), holder = h("div");
  const gold = cssVar("--gold");
  function draw() {
    const list = order.value === "new" ? [...rows].reverse() : rows, done = rows.filter((x) => x.state === "done");
    const titles = new Map(), lastName = new Map();
    for (const x of done) { const p = x.podium[0]; if (p) { titles.set(p.pid, (titles.get(p.pid) || 0) + 1); lastName.set(p.pid, p.name); } }
    clear(chips).append(chip("Championships", rows.length), chip("Finished", done.length, done.length ? gold : null), chip("Different champions", titles.size));
    if (titles.size) {
      let best = null;                                          // most titles; a tie goes to the larger id, so it is always the same one
      for (const [k, n] of titles) if (best === null || n > titles.get(best) || (n === titles.get(best) && k > best)) best = k;
      chips.append(chip("Most titles", `${lastName.get(best)}  (${titles.get(best)})`, gold));
    }
    const cards = list.map((x) => {
      const fin = x.state === "done", color = cssVar(fin ? "--gold" : "--green");
      const dates = x.first && x.last !== x.first ? `${x.first}  →  ${x.last}` : (x.first || "no dates");
      const rounds = `${x.rounds} round${x.rounds === 1 ? "" : "s"}` + (fin ? "" : " so far");
      const top = x.podium.map((p, k) => (p ? h("div", { class: "lc-top" },
        h("span", { class: "rk-n", style: { color: medalColor(k + 1) || cssVar("--text") }, text: String(k + 1) }),
        h("span", { class: "link", title: "Click for this driver's career", onclick: () => openCareer(champs, races, p.pid), text: p.name }),
        h("span", { class: "dim", text: `${fmtPts(p.total)} pts` })) : null));
      return h("div", { class: "libcard champcard" }, h("span", { class: "stripe", style: { background: color } }),
        h("div", { class: "lc-main" },
          h("div", { class: "lc-head" }, h("span", { class: "lc-name", text: x.name }), h("span", { class: "badge", style: { color, borderColor: color }, text: fin ? "COMPLETE" : "LIVE" }),
            x.archived ? h("span", { class: "badge", style: { color: cssVar("--dim"), borderColor: cssVar("--dim") }, text: "ARCHIVED" }) : null),
          h("div", { class: "dim small", text: dates }),
          h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: { width: (x.total_races ? Math.min(100, (100 * x.races) / x.total_races) : 0) + "%", background: color } })),
          h("div", { class: "dim", text: `${x.races} of ${x.total_races} races  ·  ${rounds}  ·  ${x.drivers} drivers` })),
        h("div", { class: "lc-right" }, h("div", { class: "lc-t", text: fin ? "FINAL STANDINGS" : "STANDINGS" }), top.some(Boolean) ? top : h("div", { class: "dim", text: "no results yet" })));
    });
    clear(holder).append(h("div", { class: "liblist two" }, cards));
  }
  draw();
  return h("div", null, h("div", { class: "toolbar" }, field("Order:", order), h("span", { class: "grow" }),
    h("span", { class: "hint", text: "Click a name for that driver's career · a championship that is still running shows who is there now" })), chips, holder);
}

function statsTracksPage(races) {
  const rows = statsTracks(races);
  const kind = h("select", { "aria-label": "Chart", onchange: () => draw() }, option("pie", "Pie"), option("bars", "Bars"));
  const top = h("select", { "aria-label": "Show", onchange: () => draw() },
    [["Top 8", 8], ["Top 12", 12], ["Top 20", 20], ["All tracks", 0]].map(([l, n]) => option(String(n), l, n === 12)));
  const metric = h("select", { "aria-label": "Count", onchange: () => draw() }, option("rounds", "Rounds held"), option("races", "Races held"));
  const pie = pieBox(), bars = barBox();
  const pieWrap = h("div", { class: "chartwrap" }, pie.cv), barsWrap = h("div", { class: "chartwrap", hidden: true }, bars.cv);
  const accent = cssVar("--accent"), grey = cssVar("--edge-hi");

  /* the most raced tracks and, when the list is cut, one 'Other' slice for the rest */
  function items() {
    const key = metric.value, n = +top.value;
    const sorted = [...rows].sort((a, b) => cmpT([-a[key], -a.rounds, -a.races, lc(a.track), lc(a.layout)], [-b[key], -b.rounds, -b.races, lc(b.track), lc(b.layout)]));
    const total = sorted.reduce((s, x) => s + x[key], 0) || 1;
    const shown = n ? sorted.slice(0, n) : sorted, rest = n ? sorted.slice(n) : [];
    const out = shown.map((x, i) => ({ label: trackLabel(x.track, x.layout), value: x[key], color: sliceColor(i),
      tip: [trackLabel(x.track, x.layout), `${x[key]} ${key}  (${((100 * x[key]) / total).toFixed(1)}%)`,
        `${x.rounds} rounds · ${x.races} races · ${x.champs} championships · ${x.drivers} drivers`, `Last raced ${x.last || "-"}`] }));
    if (rest.length) {
      const v = rest.reduce((s, x) => s + x[key], 0);
      out.push({ label: `Other (${rest.length} tracks)`, value: v, color: grey,
        tip: [`${rest.length} other tracks`, `${v} ${key}  (${((100 * v) / total).toFixed(1)}%)`,
          ...rest.slice(0, 10).map((x) => `${trackLabel(x.track, x.layout)}: ${x[key]}`), ...(rest.length > 10 ? ["…"] : [])] });
    }
    return { out, total, key, hasOther: rest.length > 0 };
  }

  function draw() {
    const { out, total, key, hasOther } = items(), isPie = kind.value === "pie";
    pieWrap.hidden = !isPie; barsWrap.hidden = isPie;
    pie.chart.setData(out, [String(total), key], "No races yet.");
    bars.chart.setData(out.map((it, i) => ({ ...it, color: hasOther && i === out.length - 1 ? grey : accent })), "No races yet.");
  }
  draw();
  const trs = rows.map((x) => h("tr", null, td(x.track, "b"), td(x.layout, "dim"), td(x.rounds, "c"), td(x.races, "c"), td(x.champs, "c"), td(x.drivers, "c"), td(x.last, "c dim")));
  return h("div", null, h("div", { class: "toolbar" }, field("Chart:", kind), field("Show:", top), field("Count:", metric), h("span", { class: "grow" }),
    h("span", { class: "hint", text: "The table below always lists every track" })), pieWrap, barsWrap,
  h("div", { style: { height: "12px" } }), table(["Track", "Layout", "Rounds", "Races", "Championships", "Drivers", "Last raced"], trs));
}

function statsRecordsPage(races) {
  const f = statsFilters(races);
  const selTrack = h("select", { "aria-label": "Track", onchange: () => draw() }, option("*", "All tracks (the records)"), f.tracks.map(([k, l]) => option(k, l)));
  const selCar = h("select", { "aria-label": "Car", onchange: () => draw() }, option("*", "All cars"), f.cars.map((c) => option(c, c)));
  const selWx = h("select", { "aria-label": "Weather", onchange: () => draw() }, option("*", "Any weather"), f.weathers.map((w) => option(w, w || "Not set")));
  const info = h("div", { class: "hint" }), holder = h("div");
  function draw() {
    const tk = selTrack.value === "*" ? null : selTrack.value, car = selCar.value === "*" ? null : selCar.value, wx = selWx.value === "*" ? null : selWx.value;
    const rows = statsRecords(races, tk, car, wx);
    info.textContent = tk ? "Every driver's best lap at this track." : "The fastest lap ever set on each track, for each car. Pick a track to see every driver's best there.";
    const trs = rows.map((x) => {
      const rr = `R${x.round}  ${x.race}`;
      return tk ? h("tr", null, td(x.pos, "c b " + medalClass(x.pos)), td(x.name, "b"), td(fmtTime(x.best), "r " + (x.pos === 1 ? "purple b" : "")),
        td(x.gap ? fmtGap(x.gap) : "", "r dim"), td(x.car, "dim"), td(x.weather || "-", "c dim"), td(x.champ, "dim"), td(rr, "dim"), td(x.date, "c dim"), td(x.starts, "c dim"))
        : h("tr", null, td(trackLabel(x.track, x.layout), "b"), td(x.car, "dim"), td(fmtTime(x.best), "r purple b"), td(x.name, "b"), td(x.weather || "-", "c dim"),
          td(x.champ, "dim"), td(rr, "dim"), td(x.date, "c dim"));
    });
    clear(holder).append(table(tk ? ["Pos", "Driver", "Best lap", "Gap", "Car", "Weather", "Championship", "Round / race", "Date", "Races"]
      : ["Track", "Car", "Record", "Driver", "Weather", "Championship", "Round / race", "Date"], trs));
  }
  draw();
  return h("div", null, h("div", { class: "toolbar" }, field("Track:", selTrack), field("Car:", selCar), field("Weather:", selWx)), info, holder);
}

function statsDriversPage(champs, races) {
  const all = statsDrivers(champs, races);
  const HEADS = [["#", null], ["Driver", "name"], ["Seasons", "seasons"], ["Titles", "titles"], ["Runner-up", "seconds"], ["3rd place", "thirds"], ["Races", "races"], ["Wins", "wins"], ["Podiums", "podiums"],
    ["Poles", "poles"], ["FL", "fls"], ["ML", "mls"], ["DNFs", "dnfs"], ["Points", "points"], ["Avg finish", "avg_finish"], ["Best", "best_finish"], ["Laps", "laps"], ["Laps led", "led"]];
  let key = null, desc = true;
  const search = h("input", { type: "search", placeholder: "Find a driver…", "aria-label": "Find a driver", oninput: () => draw() });
  const holder = h("div");
  function draw() {
    const q = lc(search.value.trim());
    const rows = all.filter((r) => lc(r.name).includes(q));
    if (key === "name") rows.sort((a, b) => (lc(a.name) < lc(b.name) ? -1 : 1) * (desc ? -1 : 1));
    else if (key === "avg_finish" || key === "best_finish") rows.sort((a, b) => cmpT([a[key] === 0, desc ? -a[key] : a[key]], [b[key] === 0, desc ? -b[key] : b[key]]));
    else if (key) rows.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (desc ? -1 : 1));
    const trs = rows.map((r, i) => {
      const cells = [r.seasons, r.titles, r.seconds, r.thirds, r.races, r.wins, r.podiums, r.poles, r.fls, r.mls, r.dnfs, fmtPts(r.points), r.avg_finish ? r.avg_finish.toFixed(1) : "-",
        r.best_finish ? `P${r.best_finish}` : "-", r.laps, r.led];
      return h("tr", { class: "link", onclick: () => openCareer(champs, races, r.pid) }, td(i + 1, "c dim"), td(r.name, "b"),
        cells.map((v, c) => td(v, "c " + (v && c === 1 ? "m1" : v && c === 2 ? "m2" : v && c === 3 ? "m3" : ((v === 0 || v === "-" || v === "0") ? "dim" : "")) + ([1, 5, 11].includes(c) ? " b" : ""))));
    });
    const t = table(HEADS.map((x) => x[0]), trs);
    t.querySelectorAll("th").forEach((th, c) => {
      if (HEADS[c][1] === null) return;
      th.classList.add("sortable");
      th.addEventListener("click", () => {
        const k = HEADS[c][1];
        if (key === k) desc = !desc; else { key = k; desc = !["name", "avg_finish", "best_finish"].includes(k); }
        draw();
      });
    });
    clear(holder).append(t);
  }
  draw();
  return h("div", null, h("div", { class: "toolbar" }, search, h("span", { class: "grow" }), h("span", { class: "hint", text: "Click a heading to sort · click a driver for their career" })), holder);
}

function ratingChip(races, pid) {
  const rt = statsRatings(races).find((x) => x.pid === pid);
  return rt ? chip("Rating", fmtRating(rt.rating) + (rt.provisional ? "?" : ""), cssVar("--blue")) : null;
}

function openCareer(champs, races, pid) {
  const me = statsDrivers(champs, races).find((d) => d.pid === pid), info = statsCareer(champs, races, pid);
  if (!me) return;
  const chips = h("div", { class: "chips" }, chip("Titles", me.titles, me.titles ? cssVar("--gold") : null),
    chip("Runner-up / 3rd", `${me.seconds} / ${me.thirds}`, me.seconds || me.thirds ? cssVar("--silver") : null), chip("Wins", me.wins, me.wins ? cssVar("--gold") : null),
    chip("Podiums", me.podiums), chip("Poles", me.poles, me.poles ? cssVar("--blue") : null), chip("Fastest laps", me.fls, me.fls ? cssVar("--purple") : null),
    chip("Points", fmtPts(me.points), cssVar("--accent")), ratingChip(races, pid), chip("Avg finish", me.avg_finish ? me.avg_finish.toFixed(1) : "-"), chip("DNFs", me.dnfs));
  const seasons = info.seasons.map((s) => h("tr", null, td(s.champ, "b"),
    td(`${ordinal(s.rank)} of ${s.of}` + (s.rank === 1 && s.state === "done" ? "  (title)" : (s.state !== "done" ? "  (so far)" : "")), "c " + (s.state === "done" ? medalClass(s.rank) : "") + (s.rank <= 3 ? " b" : "")),
    td(fmtPts(s.total), "c"), td(s.wins, "c"), td(s.podiums, "c"), td(s.poles, "c"), td(s.fls, "c"), td(s.dnfs, "c"), td(s.starts, "c")));
  const tracks = info.tracks.map((x) => h("tr", null, td(trackLabel(x.track, x.layout), "b"), td(x.starts, "c"),
    td(x.best_finish ? `P${x.best_finish}` : "-", "c " + medalClass(x.best_finish)), td(x.avg_finish ? x.avg_finish.toFixed(1) : "-", "c dim"),
    td(fmtTime(x.best_lap), "r"), td(x.best_car, "dim"), td(x.last, "c dim")));
  const tabs = tabset([
    { title: "Seasons", make: () => table(["Championship", "Result", "Points", "Wins", "Podiums", "Poles", "FL", "DNFs", "Races"], seasons) },
    { title: "Tracks", make: () => table(["Track", "Starts", "Best finish", "Avg finish", "Best lap", "Car", "Last raced"], tracks) },
    { title: "Points per season", make: () => {
      const { cv, chart } = barBox();
      chart.setData(info.seasons.map((s) => ({ label: s.champ, value: s.total, color: cssVar("--accent"), tip: [s.champ, `${fmtPts(s.total)} points  ·  ${ordinal(s.rank)} of ${s.of}`] })), "No seasons yet");
      return h("div", { class: "chartwrap" }, cv);
    } },
  ]);
  showModal(h("div", { class: "drvhead" }, h("h2", { class: "ph", text: me.name }),
    h("div", { class: "sub", text: `${me.seasons} season${me.seasons !== 1 ? "s" : ""}  ·  ${me.races} races  ·  ${me.tracks} tracks` })), chips, tabs.el);
}

function statsH2hPage(champs, races) {
  const ranked = statsDrivers(champs, races), byName = [...ranked].sort((a, b) => (lc(a.name) < lc(b.name) ? -1 : lc(a.name) > lc(b.name) ? 1 : 0));
  if (ranked.length < 2) return h("div", { class: "empty", text: "Head-to-head needs at least two drivers." });
  const mk = (sel) => h("select", { "aria-label": "Driver", onchange: () => draw() }, byName.map((d) => option(d.pid, d.name, d.pid === sel)));
  const a = mk(ranked[0].pid), b = mk(ranked[1].pid);
  const swap = h("button", { class: "btn sq", type: "button", title: "Swap the two drivers", "aria-label": "Swap", text: "⇄", onclick: () => { const t = a.value; a.value = b.value; b.value = t; draw(); } });
  const chips = h("div", { class: "chips" }), holder = h("div"), charts = h("div");
  function draw() {
    clear(chips); clear(holder); clear(charts);
    if (a.value === b.value) { holder.append(h("div", { class: "empty", text: "Pick two different drivers." })); return; }
    const na = a.options[a.selectedIndex].text, nb = b.options[b.selectedIndex].text, res = statsH2h(races, a.value, b.value), s = res.summary;
    if (!s.n) { holder.append(h("div", { class: "empty", text: `${na} and ${nb} have not raced in the same race yet.` })); return; }
    chips.append(chip("Races together", s.n), chip("Finished ahead", `${s.a_ahead} - ${s.b_ahead}`, cssVar("--gold")), chip("Points", `${fmtPts(s.a_pts)} - ${fmtPts(s.b_pts)}`, cssVar("--accent")),
      chip("Avg finish", s.a_avg && s.b_avg ? `${s.a_avg.toFixed(1)} - ${s.b_avg.toFixed(1)}` : "-"), chip("Started ahead", `${s.a_grid} - ${s.b_grid}`, cssVar("--blue")),
      chip("Faster best lap", `${s.a_faster} - ${s.b_faster}`, cssVar("--purple")));
    if (s.avg_best_gap) chips.append(chip("Avg best-lap gap", `${s.avg_best_gap < 0 ? na : nb} by ${(Math.abs(s.avg_best_gap) / 1000).toFixed(3)}s`));
    const trs = res.rows.map((x, i) => {
      const fa = x.a_pos ? `P${x.a_pos}` : x.a_status, fb = x.b_pos ? `P${x.b_pos}` : x.b_status, both = x.a_best && x.b_best;
      return h("tr", { class: "link", onclick: () => pick(i), id: "h2h-" + i }, td(x.champ, "dim"), td(x.round, "c"), td(trackLabel(x.track, x.layout), "b"), td(x.race), td(x.weather || "-", "c dim"),
        td(x.a_grid || "-", "c"), td(x.b_grid || "-", "c"), td(fa, "c " + (x.ahead === "a" ? "green b" : "")), td(fb, "c " + (x.ahead === "b" ? "green b" : "")),
        td(fmtTime(x.a_best), "r " + (both && x.a_best < x.b_best ? "purple" : "")), td(fmtTime(x.b_best), "r " + (both && x.b_best < x.a_best ? "purple" : "")),
        td(x.ahead === "a" ? na : (x.ahead === "b" ? nb : "-"), "c b"));
    });
    holder.append(table(["Championship", "Round", "Track", "Race", "Weather", "A grid", "B grid", "A finish", "B finish", "A best lap", "B best lap", "Ahead"], trs));
    function pick(i) {
      holder.querySelectorAll("tbody tr").forEach((tr, k) => tr.classList.toggle("focus", k === i));
      const race = races[res.rows[i].index], wa = race.rows.find((w) => w.pid === a.value && w.status !== "DNS"), wb = race.rows.find((w) => w.pid === b.value && w.status !== "DNS");
      const { times, gap } = h2hSeries(wa, wb);
      const A = chartBox(300), B = chartBox(300);
      A.chart.setData([{ label: na, color: "#ff3d4f", pts: times[0] }, { label: nb, color: "#4da3ff", pts: times[1] }],
        { clip: true, integer: true, unit: 1000, yfmt: (v) => (pyRound(v) % 1000 === 0 ? fmtTime(v).slice(0, -4) : fmtTime(v)) });
      B.chart.setData(gap.length ? [{ label: na, color: "#ff3d4f", pts: gap.map(([n]) => [n, 0]) }, { label: nb, color: "#4da3ff", pts: gap }] : [], { yfmt: (v) => (v < 0 ? "-" : "+") + Math.abs(v).toFixed(1) + "s" });
      clear(charts).append(tabset([{ title: "Lap times", make: () => h("div", { class: "chartwrap" }, A.cv) }, { title: "Gap over the race", make: () => h("div", { class: "chartwrap" }, B.cv,
        h("div", { class: "hint", text: "Above zero: the first driver is ahead. Needs every lap time of both drivers." })) }]).el);
    }
    pick(res.rows.length - 1);
  }
  draw();
  return h("div", null, h("div", { class: "toolbar" }, field("A:", a), field("vs  B:", b), swap), chips, holder, charts);
}
