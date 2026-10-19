"use strict";
/* The Standings page and the Points progression page. */

function standingsSub(st, team) {
  const d = S.data;
  const done = d.scored.length, all = d.cols.length;
  const drop = d.drop_worst ? `  ·  best results count (worst ${d.drop_worst} dropped)` : "";
  const best = team && d.team_best_n ? `  ·  the best ${d.team_best_n} drivers of a team score in each race` : "";
  return `${done} of ${all} races completed  ·  ${st.length} ${team ? "teams" : "drivers"}${drop}${best}`;
}

function resultCell(c, onclick) {
  if (!c) return h("td", { class: "rc" });
  const cls = ["cell"];
  const mc = c.pos && c.status !== "DSQ" ? medalClass(c.pos) : "";
  if (mc) cls.push(mc);
  else if (c.status === "DNF") cls.push("dnf");
  else if (c.status === "DSQ" || c.status === "DNS") cls.push("dsq");
  else if (c.pts > 0) cls.push("pts");
  if (c.dropped) cls.push("dropped");
  const statusOnly = ["DNF", "DSQ", "DNS"].includes(c.status) && c.pts === 0;
  const main = statusOnly ? h("div", { class: "cs " + (c.status === "DNS" ? "dim" : "bad"), text: c.status }) : h("div", { class: "cp", text: fmtPts(c.pts) });
  const tags = h("div", { class: "tags" });
  if (c.fl) tags.append(h("span", { class: "purple", text: "FL" }));
  if (c.pole) tags.append(h("span", { class: "blue", text: "PP" }));
  if (c.ml) tags.append(h("span", { class: "green", text: "ML" }));
  const cell = h("div", { class: cls.join(" ") }, c.pos ? h("div", { class: "pn", text: `P${c.pos}` }) : null, main, tags);
  return h("td", { class: "rc" + (onclick ? " link" : ""), onclick }, cell);
}

function viewStandings() {
  const d = S.data, team = S.mode === "teams", st = d.standings[S.mode];
  const root = h("div", { class: "page" });
  const modeSel = h("select", { "aria-label": "View", onchange: () => { S.mode = modeSel.value; render(); } },
    option("drivers", "Drivers", !team), option("teams", "Teams", team));
  const holder = h("div");
  const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
  let hideStats = pref("hide_stats", "0") === "1", raceW = Math.min(130, Math.max(64, +pref("race_col_w", 96) || 96));
  const statsToggle = h("button", { class: "btn", type: "button", title: "Hide the Wins, Podiums, Poles, FL and ML columns to make room for more races", onclick: () => {
    hideStats = !hideStats; setPref("hide_stats", hideStats ? "1" : "0"); applyLayout(); } });
  const widthSlider = h("input", { type: "range", min: 64, max: 130, value: raceW, "aria-label": "Race column width", title: "Width of every race column", oninput: () => {
    raceW = +widthSlider.value; setPref("race_col_w", String(raceW)); applyLayout(); } });
  let nameW = +pref("name_col_w", 0) || 0;       // 0 = the default width of the Driver column
  function nameResizer() {                   // drag the right edge of the Driver heading; double-click puts it back
    const grip = h("span", { class: "grip", title: "Drag to change the width of this column (double-click: back to normal)",
      ondblclick: () => { nameW = 0; setPref("name_col_w", "0"); applyLayout(); } });
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId);
      const x0 = e.clientX, w0 = grip.parentElement.getBoundingClientRect().width;
      const move = (ev) => { nameW = Math.round(Math.min(420, Math.max(110, w0 + ev.clientX - x0))); applyLayout(); };
      const up = () => { grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); setPref("name_col_w", String(nameW)); };
      grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up);
    });
    return grip;
  }
  function applyLayout() {                    // one width for every race column, and the stats columns on or off
    statsToggle.textContent = hideStats ? "Show stats columns" : "Hide stats columns";
    holder.style.setProperty("--rw", raceW + "px");
    if (nameW) holder.style.setProperty("--dw", nameW + "px"); else holder.style.removeProperty("--dw");
    holder.classList.toggle("nostats", hideStats);
  }
  root.append(h("div", { class: "toolbar" }, h("div", { class: "grow" }, h("h2", { class: "ph", text: d.name }), h("div", { class: "sub", text: standingsSub(st, team) })),
    field("View:", modeSel), statsToggle, field("Race width:", widthSlider), h("button", { class: "btn", type: "button", text: "Export CSV", onclick: () => exportStandingsCsv() }),
    discordButton(() => textStandings(S.data, S.mode))), holder,
    h("div", { class: "hint", text: "Click the round name (top of a column) for the round summary  ·  click a race name for that race's full results  ·  click a driver for their profile  ·  click a result cell for that driver's race.   FL = fastest lap   PP = pole position   ML = most laps led   LP = licence points" }));

  function render() {
    const t = S.mode === "teams", rows = d.standings[S.mode];
    root.querySelector(".sub").textContent = standingsSub(rows, t);
    clear(holder);
    if (!d.cols.length) { holder.append(h("div", { class: "empty", text: "This championship has no rounds yet." })); return; }
    // header: round groups over the race columns
    const groups = [];
    d.cols.forEach((c, ci) => {
      const g = groups[groups.length - 1];
      if (g && g.round === c.round) g.cols.push(ci); else groups.push({ round: c.round, cols: [ci] });
    });
    const roundDone = (g) => g.cols.some((ci) => d.cols[ci].done);
    const r1 = h("tr", null, h("th", { rowspan: 2, class: "sticky c0", text: "Pos" }), h("th", { rowspan: 2, class: "sticky c1" }, t ? "Team" : "Driver", nameResizer()),
      groups.map((g) => {
        const rd = d.rounds[g.round], act = roundDone(g);
        return h("th", { colspan: g.cols.length, class: "rh" + (act ? " act" : ""), title: act ? "Open the round summary" : "",
          onclick: act ? () => openRound(g.round) : null }, h("div", { class: "rno", text: `R${g.round + 1}` }), h("div", { text: roundTrack(rd) }));
      }),
      h("th", { rowspan: 2, class: "tot", text: "Points" }), ["Wins", "Podiums", "Poles", "FL", "ML"].map((x) => h("th", { rowspan: 2, class: "stat", text: x })));
    const r2 = h("tr", null, d.cols.map((c) => h("th", { class: "rn" + (c.done ? " act" : ""), title: c.done ? "Open this race's results" : "",
      onclick: c.done ? () => openRace(c.race) : null, text: c.name })));
    const lp = {};
    if (!t) for (const x of licenceRows(d)) if (x.points > 0) lp[x.d] = x.points;
    const body = rows.map((r) => {
      const sub = t ? (r.members || []).join(", ") : [r.number ? "#" + r.number : "", r.team].filter(Boolean).join(" ");
      const mc = medalClass(r.rank);
      return h("tr", null,
        h("td", { class: "sticky c0 rank" }, h("span", { class: "rk " + mc, text: String(r.rank) })),
        h("td", { class: "sticky c1 nm" + (t ? "" : " link"), onclick: t ? null : () => openDriver(r.id) },
          h("span", { class: "bar big", style: { background: safeColor(r.color) } }), h("span", { class: "nt" }, h("b", { text: r.name }), sub ? h("small", { text: sub }) : null),
          lp[r.id] ? h("span", { class: "lp", title: "Licence points", text: `LP ${lp[r.id]}` }) : null),
        d.cols.map((c, ci) => resultCell(r.cells[String(ci)], c.done && r.cells[String(ci)] ? () => openRace(c.race, t ? null : r.id) : null)),
        h("td", { class: "tot" }, h("div", { class: "total", title: r.cpen ? `Includes ${fmtPts(r.cpen)} pts championship penalty` : null, text: fmtPts(r.total) })),
        ["wins", "podiums", "poles", "fls", "mls"].map((k) => h("td", { class: "stat " + (r[k] ? "" : "dim"), text: r[k] ? String(r[k]) : "-" })));
    });
    holder.append(h("div", { class: "tablewrap standings" }, h("table", { class: "st" }, h("thead", null, r1, r2), h("tbody", null, body))));
    applyLayout();
  }
  S.renderStandings = render;
  render();
  return root;
}

function openRound(roundIndex) {
  const rd = S.data.rounds[roundIndex];
  const done = rd.races.map((id) => S.races[id]).filter(Boolean);
  if (rd.races.length > 1 && done.length) { S.sel = "round:" + roundIndex; S.focus = null; setTab("races"); }
  else if (done.length) openRace(done[0].id);
}

function exportStandingsCsv() {
  const d = S.data, team = S.mode === "teams", st = d.standings[S.mode];
  const head = ["Pos", "Name", "Team", ...d.cols.map((c) => `${roundTrack(d.rounds[c.round])} ${c.name}`), "Points", "Wins", "Podiums", "Poles", "Fastest laps", "Most laps led"];
  const out = [head];
  for (const r of st) {
    const row = [r.rank, r.name, team ? "" : r.team];
    d.cols.forEach((c, ci) => {
      const x = r.cells[String(ci)];
      row.push(!x ? "" : (x.pos ? `P${x.pos} / ${fmtPts(x.pts)}` : `${x.status} / ${fmtPts(x.pts)}`));
    });
    out.push([...row, fmtPts(r.total), r.wins, r.podiums, r.poles, r.fls, r.mls || 0]);
  }
  const q = (v) => { v = String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  download(slug(d.name + (team ? "_team_standings" : "_standings")) + ".csv", new Blob(["﻿" + out.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
}

/* ---------------------------------------------------------------- points progression */
function viewProgress() {
  const d = S.data, team = S.mode === "teams";
  const root = h("div", { class: "page" });
  const by = h("select", { "aria-label": "Show", onchange: () => { S.prog.by = by.value; draw(); } },
    option("points", "Championship points", S.prog.by === "points"), option("place", "Championship position", S.prog.by === "place"));
  const top = h("select", { "aria-label": "Lines for", onchange: () => { S.prog.top = +top.value; draw(); } },
    [["Top 10", 10], ["Top 16", 16], ["Everyone", 0]].map(([l, n]) => option(String(n), l, S.prog.top === n)));
  const mode = h("select", { "aria-label": "View", onchange: () => { S.mode = mode.value; draw(); } },
    option("drivers", "Drivers", !team), option("teams", "Teams", team));
  const { cv, chart } = chartBox(520);
  root.append(h("div", { class: "toolbar" }, field("Show:", by), field("Lines for:", top), field("View:", mode),
    h("span", { class: "grow" }), h("button", { class: "btn", type: "button", text: "Save image", onclick: async () => {
      const place = S.prog.by === "place";
      const blob = await chart.png(d.name, `${place ? "Championship position" : "Championship points"} after each race  ·  ${top.options[top.selectedIndex].text.toLowerCase()}`);
      download(slug(place ? "championship_position" : "points_progression") + ".png", blob);
    } })), h("div", { class: "chartwrap" }, cv),
    h("div", { class: "hint", text: "Hover a line, or a name in the key, to highlight it and fade the rest." }));
  function draw() {
    const t = S.mode === "teams", rows = d.standings[S.mode], pg = d.progression[S.mode];
    const n = S.prog.top, use = n ? rows.slice(0, n) : rows, place = S.prog.by === "place";
    const series = [];
    for (const r of use) {
      const s = place ? pg.place[r.id] : [[0, 0], ...pg.pts[r.id]];
      if (s && s.length) series.push({ label: r.name, color: r.color, pts: s });
    }
    const labels = place ? {} : { 0: "Start" };
    pg.scored.forEach((ci, k) => {
      const c = d.cols[ci], rd = d.rounds[c.round];
      labels[k + 1] = `R${c.round + 1}` + (rd.races.length > 1 ? `.${c.name.slice(-1)}` : "");
    });
    if (place) chart.setData(series, { xlabels: labels, invert: true, integer: true, yfmt: (v) => `P${pyRound(v)}` });
    else chart.setData(series, { xlabels: labels, integer: true, zero: true });
  }
  draw();
  return root;
}
