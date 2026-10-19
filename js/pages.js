"use strict";
/* The Licence page of a championship: the points of every driver who has some, as added and taken off by hand in the
   desktop program (worked out there and stored in the export). */

function noData(msg) { return h("div", { class: "page" }, h("div", { class: "empty", text: msg })); }

/* the drivers who have points, most first; an export from before licence points were kept by hand has the old layout
   (an `enabled` flag, a status, and `lic` / `race` on every item), which still shows its points */
function licenceRows(data) {
  const l = data.licence;
  if (!l || l.enabled === false) return [];
  return l.rows || [];            // every driver of the championship (an export from before that only lists those with points)
}
function licenceChange(x) { const n = x.points !== undefined ? x.points : x.lic; return `${n > 0 ? "+" : ""}${n} ${x.reason || x.race || ""}`.trim(); }

function viewLicence() {
  if (!S.data.licence) return noData("This export has no licence data. Export the championship again from the desktop program.");
  const root = h("div", { class: "page" }), rows = licenceRows(S.data);
  root.append(h("div", { class: "toolbar" }, h("div", { class: "grow" }, h("h2", { class: "ph", text: S.data.name }), h("div", { class: "sub", text: "Licence points" })),
    discordButton(() => textLicence(S.data)),
    h("button", { class: "btn", type: "button", text: "Export CSV", onclick: () => { const t = root.querySelector("table"); if (t) downloadCsv(slug(S.data.name + "_licence_points"), t); } })));
  if (!rows.length) {
    root.append(h("div", { class: "note", text: "No drivers in this championship yet." }));
    return root;
  }
  const trs = rows.map((r) => {
    const changes = (r.items || []).map(licenceChange);
    return h("tr", null, nameTd(driverName(r.d), driverColor(r.d)), td(r.points || "-", r.points ? "c b bad" : "c dim"), h("td", { class: "dim", title: changes.join("\n"), style: { whiteSpace: "pre-wrap" } }, changes.join("   ")));
  });
  root.append(table(["Driver", "Points", "Changes (newest first)"], trs),
    h("div", { class: "hint", text: "Licence points are added and taken off by hand in the desktop program. They do not change the points or the finishing order." }));
  return root;
}
