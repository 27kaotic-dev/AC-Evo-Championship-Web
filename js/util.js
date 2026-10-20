"use strict";
/* Small helpers shared by the viewer: DOM building, time / points formatting, CSV and image download.
   Everything that comes from a data file goes in with textContent, never innerHTML. */

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === undefined || kid === null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* Python's round(): halves go to the even number, so times print exactly as in the desktop program */
function pyRound(x) {
  const f = Math.floor(x), d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

function fmtTime(ms) {
  if (ms === null || ms === undefined || ms <= 0) return "-";
  ms = pyRound(ms);
  const hh = Math.floor(ms / 3600000); let rem = ms % 3600000;
  const m = Math.floor(rem / 60000); rem %= 60000;
  const s = Math.floor(rem / 1000), milli = rem % 1000;
  const p2 = (n) => String(n).padStart(2, "0");
  return (hh ? `${hh}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`) + "." + String(milli).padStart(3, "0");
}

function fmtGap(ms) {
  if (ms <= 0) return "-";
  ms = pyRound(ms);
  const m = Math.floor(ms / 60000), rem = ms % 60000;
  const s = Math.floor(rem / 1000), milli = String(rem % 1000).padStart(3, "0");
  return m ? `+${m}:${String(s).padStart(2, "0")}.${milli}` : `+${s}.${milli}`;
}

function fmtPts(x) {
  if (x === null || x === undefined) return "";
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return x.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function ordinal(n) {
  if (n === null || n === undefined) return "-";
  const r = n % 100, suf = (r >= 10 && r <= 20) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
  return n + suf;
}

/* colours from the data file are only ever used if they look like #rrggbb */
function safeColor(c) { return /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#8a92a8"; }

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function medalColor(pos) { return { 1: cssVar("--gold"), 2: cssVar("--silver"), 3: cssVar("--bronze") }[pos] || null; }
function medalClass(pos) { return { 1: "m1", 2: "m2", 3: "m3" }[pos] || ""; }

function slug(text) { return String(text).replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "export"; }

function download(name, blob) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* a table element -> CSV text (cells keep their visible text; colour swatch columns have no text) */
function tableToCsv(table) {
  const rows = [];
  for (const tr of table.querySelectorAll("tr")) {
    const cells = [...tr.children].map((c) => (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim());
    if (cells.some((c) => c !== "")) rows.push(cells);
  }
  const q = (v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

function downloadCsv(name, table) { download(name + ".csv", new Blob([tableToCsv(table)], { type: "text/csv;charset=utf-8" })); }

function option(value, text, selected) { return h("option", { value, text, selected: selected || false }); }

/* A table taller than the screen scrolls inside the page, so its sideways scroll bar is always in view (no need to scroll
   to the bottom of a long table first).  The height is what is left of the window below the top of the table. */
let fitQueued = false;
function fitTables() {
  fitQueued = false;
  document.querySelectorAll(".tablewrap").forEach((w) => {
    if (!w.offsetParent) return;                                   // on a tab that is not showing
    const top = w.getBoundingClientRect().top + window.scrollY;
    const want = Math.max(280, Math.floor(window.innerHeight - top - 24)) + "px";
    if (w.style.maxHeight !== want) w.style.maxHeight = want;
  });
}
function queueFit() { if (!fitQueued) { fitQueued = true; setTimeout(fitTables, 30); } }
window.addEventListener("resize", queueFit);
window.addEventListener("load", queueFit);
if (window.MutationObserver) new MutationObserver(queueFit).observe(document.documentElement, { childList: true, subtree: true });
if (window.ResizeObserver) new ResizeObserver(queueFit).observe(document.documentElement);

/* a label and its control kept together when the toolbar wraps */
function field(text, ...controls) { return h("span", { class: "field" }, h("label", { text }), controls); }
