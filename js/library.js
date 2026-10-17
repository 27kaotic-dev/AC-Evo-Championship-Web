"use strict";
/* The Champ Library page: one card per championship listed in data/index.json (built by tools/make_index.py),
   like the library of the desktop program.  Click a card to open it. */

const STATE_BADGE = { live: ["LIVE", "--green"], new: ["NOT STARTED", "--blue"], done: ["COMPLETE", "--gold"] };

function libCard(c) {
  const [text, colorVar] = STATE_BADGE[c.state] || ["", "--dim"];
  const color = cssVar(colorVar);
  const current = S.data && S.current === c.file;
  const small = (title, txt, date) => h("div", { class: "lc-block" }, h("div", { class: "lc-t", text: title }),
    h("div", null, txt ? [txt, date ? h("span", { class: "dim", text: "  " + date }) : null] : h("span", { class: "dim", text: "-" })));
  const hasInfo = typeof c.races === "number";
  const top = (c.top || []).map(([who, pts], i) => h("div", { class: "lc-top" },
    h("span", { class: "rk-n", style: { color: medalColor(i + 1) || cssVar("--text") }, text: String(i + 1) }), h("span", { text: who }), h("span", { class: "dim", text: `${fmtPts(pts)} pts` })));
  const open = (e) => { if (e) e.preventDefault(); openChampionship(c); };
  return h("a", { class: "libcard", href: "?c=" + encodeURIComponent(c.file.split("/").pop()), onclick: open, "aria-label": `Open ${c.name}` },
    h("span", { class: "stripe", style: { background: color } }),
    h("div", { class: "lc-main" },
      h("div", { class: "lc-head" }, h("span", { class: "lc-name", text: c.name }),
        text ? h("span", { class: "badge", style: { color, borderColor: color }, text }) : null),
      h("div", { class: "dim small", text: c.file.split("/").pop() + (current ? "   ·   open now" : "") + (c.updated ? "   ·   updated " + c.updated : "") }),
      hasInfo ? [h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: { width: (c.races ? (100 * c.done) / c.races : 0) + "%", background: color } })),
        h("div", { class: "dim", text: `${c.done} of ${c.races} races  ·  ${c.rounds} rounds  ·  ${c.drivers} drivers` })] : null),
    hasInfo ? h("div", { class: "lc-mid" }, small("LAST RACE", c.last, c.last_date), small("NEXT RACE", c.next, c.next_date)) : null,
    hasInfo ? h("div", { class: "lc-right" }, h("div", { class: "lc-t", text: "STANDINGS" }), top.length ? top : h("div", { class: "dim", text: "no results yet" })) : null,
    h("span", { class: "btn" + (current ? " primary" : ""), text: current ? "Continue" : "Open" }));
}

function viewLibrary() {
  const root = h("div", { class: "page" });
  const all = S.library;
  let showDone = true;
  try { showDone = localStorage.getItem("show_finished") !== "0"; } catch (e) { /* storage blocked */ }
  const n = (k) => all.filter((c) => c.state === k).length;
  const chk = h("input", { type: "checkbox", checked: showDone, onchange: () => { try { localStorage.setItem("show_finished", chk.checked ? "1" : "0"); } catch (e) { /* ignore */ } fill(); } });
  const sub = h("div", { class: "sub" });
  const list = h("div", { class: "liblist" });
  root.append(h("div", { class: "toolbar" }, h("div", { class: "grow" }, h("h2", { class: "ph", text: "Champ Library" }), sub),
    h("label", { class: "check" }, chk, "Show finished championships")), list,
    h("div", { class: "hint", text: "Click a championship to open it. Past seasons stay here: each one is a file in the site's data folder." }));
  function fill() {
    const shown = all.filter((c) => chk.checked || c.state !== "done");
    const bits = [`${n("live")} live`];
    if (n("new")) bits.push(`${n("new")} not started`);
    bits.push(`${n("done")} finished` + (chk.checked || !n("done") ? "" : " (hidden)"));
    sub.textContent = bits.join("  ·  ");
    clear(list);
    if (!shown.length) list.append(h("div", { class: "empty", text: all.length ? "Everything is finished. Tick “Show finished championships” to see them." : "No championships yet." }));
    shown.forEach((c) => list.append(libCard(c)));
  }
  fill();
  return root;
}
