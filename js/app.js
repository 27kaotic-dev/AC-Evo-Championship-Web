"use strict";
/* AC EVO Championship Viewer: loads a championship exported from the desktop program (File > Export for the web
   viewer) and shows it.  Read-only: all editing happens in the desktop program. */

const S = { data: null, drv: {}, races: {}, mode: "drivers", tab: "standings", sel: null, focus: null, prog: { by: "points", top: 16 }, library: [] };
const VIEW_TABS = [["standings", "Standings"], ["progress", "Points progression"], ["races", "Race results"]];
/* the Champ Library tab (when there is more than one championship to choose from) and, once one is open, its pages */
function tabList() { return [...(S.library.length > 1 ? [["library", "Champ Library"]] : []), ...(S.data ? VIEW_TABS : [])]; }

/* ---------------------------------------------------------------- theme */
function getTheme() {
  try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") return t; } catch (e) { /* storage blocked */ }
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (e) { /* storage blocked */ }
}
function toggleTheme() { setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); renderAll(); }

const ICON_SUN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></g></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z" fill="currentColor"/></svg>';

function themeToggle() {
  const dark = document.documentElement.dataset.theme === "dark";
  const b = h("button", { class: "theme", type: "button", "aria-label": dark ? "Switch to light mode" : "Switch to dark mode",
    title: dark ? "Switch to light mode" : "Switch to dark mode", onclick: toggleTheme });
  b.append(h("span", { class: "slot" }), h("span", { class: "slot" }), h("span", { class: "knob" }));
  b.children[0].innerHTML = ICON_SUN;       // fixed markup, no data in it
  b.children[1].innerHTML = ICON_MOON;
  return b;
}

/* ---------------------------------------------------------------- shell */
function renderAll() {
  const app = document.getElementById("app");
  clear(app);
  const d = S.data;
  const file = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; } });
  const bar = h("header", { class: "top" },
    h("div", { class: "brand" }, h("img", { src: "icon.svg", alt: "", width: 30, height: 30 }), h("div", null, h("div", { class: "app", text: "AC EVO Championship Viewer" }), h("div", { class: "cname", text: d ? d.name : "" }))),
    h("div", { class: "grow" }), h("button", { class: "btn", type: "button", text: "Open file…", title: "Show a championship file exported from the desktop program", onclick: () => file.click() }), file, themeToggle());
  const tabs = tabList();
  const nav = h("nav", { class: "tabs", role: "tablist" }, tabs.map(([id, label]) => h("button", { class: "tab" + (S.tab === id ? " on" : ""), type: "button", role: "tab",
    "aria-selected": S.tab === id, onclick: () => setTab(id), text: label })));
  const main = h("main", { id: "view" });
  app.append(bar, tabs.length ? nav : null, main, h("footer", { class: "foot" }, "Read-only viewer. Made with the AC EVO Championship Manager."));
  if (tabs.length) renderView(); else main.append(emptyState());
}

function renderView() {
  const main = document.getElementById("view");
  clear(main);
  const ids = tabList().map((t) => t[0]);
  if (!ids.includes(S.tab)) S.tab = ids[0];
  main.append(S.tab === "library" ? viewLibrary() : S.tab === "progress" ? viewProgress() : S.tab === "races" ? viewRaces() : viewStandings());
  document.querySelectorAll(".tabs .tab").forEach((b, i) => { const on = ids[i] === S.tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
}

function setTab(id) { S.tab = id; renderView(); window.scrollTo({ top: 0 }); }

function emptyState(msg) {
  return h("div", { class: "empty big" }, h("p", { text: msg || "No championship loaded." }),
    h("p", { class: "dim", text: "Use “Open file…” (or drop a file here) to show a championship exported from the desktop program." }));
}

/* ---------------------------------------------------------------- loading */
function useData(data, name) {
  if (!data || data.format !== 1 || !Array.isArray(data.rounds) || !data.standings) throw new Error("This is not a championship file exported for the web viewer (File > Export for the web viewer in the desktop program).");
  S.data = data;
  S.drv = Object.fromEntries(data.drivers.map((x) => [x.id, x]));
  S.races = Object.fromEntries(data.races.map((r) => [r.id, r]));
  S.sel = null; S.focus = null; S.mode = "drivers"; S.tab = "standings";
  document.title = `${data.name} · AC EVO Championship Viewer`;
  renderAll();
}

/* a card of the library: open that championship (or just go back to the one that is already open) */
function openChampionship(c) {
  if (S.data && S.current === c.file) setTab("standings"); else loadUrl(c.file);
}

async function loadUrl(url) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    S.current = url;
    useData(await res.json());
  } catch (e) { showError(e); }
}

function loadFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let data;
    try { data = JSON.parse(rd.result); } catch (e) { return showError(new Error("That file is not valid JSON.")); }
    try { S.current = null; useData(data); } catch (e) { showError(e); }
  };
  rd.onerror = () => showError(new Error("Could not read that file."));
  rd.readAsText(file);
}

function showError(e) {
  const main = document.getElementById("view");
  const box = h("div", { class: "error", role: "alert", text: e.message || String(e) });
  if (main) main.prepend(box); else document.getElementById("app").append(box);
  setTimeout(() => box.remove(), 9000);
}

async function boot() {
  setTheme(getTheme());
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
  renderAll();
  let list = [];
  try {
    const r = await fetch("data/index.json", { cache: "no-cache" });
    if (r.ok) list = await r.json();
  } catch (e) { /* no index: fall back below */ }
  S.library = (Array.isArray(list) ? list : []).filter((c) => c && typeof c.file === "string" && typeof c.name === "string"
    && /^[\w./ -]+\.json$/.test(c.file) && !c.file.includes(".."));
  const want = new URLSearchParams(location.search).get("c");
  const wanted = S.library.find((c) => c.file === want || c.file.split("/").pop() === want);
  if (wanted) await loadUrl(wanted.file);                 // a link to one championship
  else if (S.library.length === 1) await loadUrl(S.library[0].file);   // nothing to choose from
  else { S.tab = "library"; renderAll(); }                // the library
}
boot();
