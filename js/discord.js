"use strict";
/* "Copy for Discord": the standings, a race, a round or the licence points as text for a chat message.
   Same layout as the desktop program's text_* functions. */

const padL = (s, n) => String(s).padStart(n);
const padR = (s, n) => String(s).padEnd(n);
const fit = (s, n) => { s = String(s); return s.length <= n ? s : s.slice(0, n - 1) + "…"; };
const block = (head, lines, more) => head + "\n```\n" + lines.concat(more ? [`... and ${more} more`] : []).join("\n") + "\n```";

function textStandings(data, mode, limit = 25) {
  const rows = data.standings[mode], team = mode === "teams";
  const head = `**${data.name}** - ${team ? "team " : ""}standings after ${data.scored.length} of ${data.cols.length} races`;
  for (;;) {
    const shown = rows.slice(0, limit), nw = Math.max(6, ...shown.map((r) => fit(r.name, 22).length));
    const lines = [`${padL("Pos", 3)}  ${padR(team ? "Team" : "Driver", nw)}  ${padL("Pts", 6)}  ${padL("W", 2)}  ${padL("Pod", 3)}`,
      ...shown.map((r) => `${padL(r.rank, 3)}  ${padR(fit(r.name, 22), nw)}  ${padL(fmtPts(r.total), 6)}  ${padL(r.wins, 2)}  ${padL(r.podiums, 3)}`)];
    const text = block(head, lines, rows.length - shown.length);
    if (text.length <= 1900 || limit <= 3) return text;
    limit = Math.max(3, limit - 3);
  }
}

function textRace(race, limit = 25) {
  const rd = roundOf(race);
  const head = `**R${race.round + 1} ${trackLabel(race.track, race.layout)} - ${race.name}**` + (race.weather ? ` (${race.weather})` : "");
  for (;;) {
    const shown = race.rows.slice(0, limit), nw = Math.max(6, ...shown.map((r) => fit(driverName(r.d), 22).length));
    const lines = [`${padL("Pos", 3)}  ${padR("Driver", nw)}  ${padL("Time / gap", 11)}  ${padL("Pts", 7)}`];
    for (const r of shown) {
      const tg = r.pos ? (r.gap === "Leader" ? fmtTime(r.adj) : r.gap) : "";
      const tags = (r.fl ? " FL" : "") + (r.pole ? " PP" : "") + (r.ml ? " ML" : "");
      lines.push(`${padL(r.pos || r.status, 3)}  ${padR(fit(driverName(r.d), 22), nw)}  ${padL(tg, 11)}  ${padL(fmtPts(r.pts) + tags, 7)}`);
    }
    const text = block(head, lines, race.rows.length - shown.length);
    if (text.length <= 1900 || limit <= 3) return text;
    limit = Math.max(3, limit - 3);
  }
}

function textRound(rdIndex, limit = 25) {
  const rd = S.data.rounds[rdIndex], { races, list } = roundData(rd);
  const head = `**R${rdIndex + 1} ${rd.track || rd.name} - round summary**`;
  for (;;) {
    const shown = list.slice(0, limit), nw = Math.max(6, ...shown.map((a) => fit(driverName(a.d), 22).length));
    const lines = [`${padL("Pos", 3)}  ${padR("Driver", nw)}  ` + races.map((r) => padL(fit(r.name, 7), 7)).join("  ") + `  ${padL("Total", 6)}`];
    shown.forEach((a, i) => {
      const cells = races.map((_, n) => (a.cells[n] ? fmtPts(a.cells[n].pts) : "-"));
      lines.push(`${padL(i + 1, 3)}  ${padR(fit(driverName(a.d), 22), nw)}  ` + cells.map((c) => padL(c, 7)).join("  ") + `  ${padL(fmtPts(a.pts), 6)}`);
    });
    const text = block(head, lines, list.length - shown.length);
    if (text.length <= 1900 || limit <= 3) return text;
    limit = Math.max(3, limit - 3);
  }
}

function textLicence(data) {
  const rows = licenceRows(data).filter((r) => r.points > 0);
  const head = `**${data.name}** - licence points`;
  const nw = Math.max(6, ...rows.map((r) => fit(driverName(r.d), 22).length));
  const lines = [`${padR("Driver", nw)}  ${padL("Pts", 3)}`, ...rows.map((r) => `${padR(fit(driverName(r.d), 22), nw)}  ${padL(r.points, 3)}`)];
  return block(head, rows.length ? lines : ["nobody has licence points"]);
}

/* a small message at the bottom of the page */
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = h("div", { id: "toast", class: "toast", role: "status" }); document.body.append(t); }
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("on"), 4500);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {                                                  // no clipboard permission: the old way
    const ta = h("textarea", { style: { position: "fixed", opacity: 0 } }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand("copy"); } finally { ta.remove(); }
  }
  toast(`Copied ${text.length} characters - paste them into Discord.`);
}

function discordButton(getText) {
  return h("button", { class: "btn", type: "button", text: "Copy for Discord", title: "Copy this page as text, ready to paste into Discord",
    onclick: () => { const t = getText(); if (t) copyText(t); else toast("Nothing to copy on this page."); } });
}
