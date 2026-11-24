/* Nike supplier layer (v0.79): factory triangles, 5/15/30 km rings, and a card ranking factories by eligible MW
   within 15 km with each factory's nearby projects. Data from build_map_data.py (D.factories, D.pairs [code, id, km]).
   Hooks in through window.PDP8_HOOKS; strings live in i18n.js (fac_*). */
(() => {
  "use strict";
  const BANDS = [[5, "b1"], [15, "b2"], [30, "b3"]];
  const ELIG = new Set(["Eligible – open", "Eligible – no investor yet"]);
  const $ = (s) => document.querySelector(s);
  let A, t, F = [], byCode, pairsBy, on = false, sel = null, g, gRing, all = false;
  // distance band of a factory's nearest eligible MW: 0 = ≤5 km (best), 1 = ≤15 km, 2 = ≤30 km, 3 = none
  const band = (f) => f.mw5 > 0 ? 0 : f.mw15 > 0 ? 1 : f.mw30 > 0 ? 2 : 3;
  const bmw = (f) => [f.mw5, f.mw15, f.mw30, 0][band(f)];

  window.PDP8_HOOKS.push({ init, update, rescale });

  function init(api) {
    A = api; t = api.t;
    F = (A.D.factories || []).slice();
    if (!F.length) return;
    byCode = new Map(F.map((f) => [f.code, f]));
    const proj = new Map(A.P.map((p) => [p.id, p]));
    pairsBy = d3.group((A.D.pairs || []).map(([c, id, km]) => ({ c, p: proj.get(id), km })).filter((r) => r.p), (r) => r.c);
    F.sort((a, b) => band(a) - band(b) || bmw(b) - bmw(a) || near(a) - near(b));
    draw();
    card();
    const tb = $("#factog");
    if (tb) { tb.hidden = false; tb.addEventListener("click", () => toggle()); }
  }
  // layer is off by default; the map button and the card button share this state
  function toggle(v = !on) {
    on = v;
    $("#map").classList.toggle("fac-on", on);
    $("#factog")?.setAttribute("aria-pressed", on);
    if (!on && sel) pick(null, false); else render();
  }
  const near = (f) => d3.min(pairsBy.get(f.code) || [], (r) => r.km) ?? 999;

  /* ---------- map layer ---------- */
  function draw() {
    const proj = A.proj(), root = A.root();
    gRing = root.append("g").attr("class", "frings");
    g = root.append("g").attr("class", "facs");
    const tri = d3.symbol(d3.symbolTriangle);
    g.selectAll("path").data(F.filter((f) => !f.nodist)).join("path")
      .attr("class", (f) => `fac${f.mw15 > 0 ? " hit" : ""}`)
      .attr("transform", (f) => { const [x, y] = proj(f.xy); f.px = x; f.py = y; return `translate(${x},${y})`; })
      .attr("d", tri.size(46)).attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", (f) => `${f.name} · ${t("fac_panel")}`)
      .on("click", (ev, f) => { ev.stopPropagation(); pick(f.code, true); })
      .on("keydown", (ev, f) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(f.code, true); } })
      .append("title").text((f) => `${f.name} (${f.sup || ""})`);
    rescale(A.k());
  }
  function rescale(k) {
    if (!g) return;
    const s = Math.pow(k, -0.75), proj = A.proj();
    g.selectAll("path").attr("transform", (f) => `translate(${f.px},${f.py}) scale(${s * (sel === f.code ? 1.6 : 1)})`);
    gRing.selectAll("circle").attr("r", function () { return +this.dataset.km * kmPx(proj); });
  }
  // px per km at the selected factory (Mercator: measure 1 km north)
  function kmPx(proj) {
    const f = byCode.get(sel); if (!f) return 0;
    const a = proj(f.xy), b = proj([f.xy[0], f.xy[1] + 1 / 110.57]);
    return Math.abs(a[1] - b[1]);
  }
  function rings() {
    gRing.selectAll("*").remove();
    const f = byCode.get(sel);
    if (!f || f.nodist) return;
    gRing.selectAll("circle").data(BANDS).join("circle").attr("class", ([, b]) => `fring ${b}`)
      .attr("cx", f.px).attr("cy", f.py).attr("data-km", ([km]) => km);
    rescale(A.k());
  }

  /* ---------- card ---------- */
  function card() {
    const c = document.createElement("section");
    c.className = "card faccard"; c.id = "faccard";
    $(".main").after(c);
    c.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-fac],[data-pid],[data-act]");
      if (!b) return;
      if (b.dataset.fac) pick(b.dataset.fac, false);
      else if (b.dataset.pid) { A.selectProject(b.dataset.pid); $("#map").scrollIntoView({ behavior: "smooth", block: "start" }); }
      else if (b.dataset.act === "all") { all = !all; render(); }
      else if (b.dataset.act === "tog") toggle();
      else if (b.dataset.act === "clear") pick(null, false);
    });
    render();
  }
  function pick(code, fromMap) {
    sel = sel === code ? null : code;
    if (sel && !on) { on = true; $("#map").classList.add("fac-on"); $("#factog")?.setAttribute("aria-pressed", true); }
    rings();
    // frame the 30 km ring so the bands are readable
    const f = byCode.get(sel);
    if (f && !f.nodist) { const r = 30 * kmPx(A.proj()); A.zoomTo([[f.px - r, f.py - r], [f.px + r, f.py + r]], 14); }
    const hot = new Set((pairsBy.get(sel) || []).map((r) => r.p.id));
    d3.selectAll("#map .pt").classed("fnear", (p) => hot.has(p.id));
    $("#map").classList.toggle("fac-sel", !!sel);
    render();
    if (fromMap && sel) $("#faccard").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  const km = (v) => `${A.fmt(Math.round(v * 10) / 10)} km`;
  const ceba = (f) => f.ceba ? `<span class="tag ok">${t("fac_ceba")}</span>` : f.cebaG ? `<span class="tag">${t("fac_ceba_g")}</span>` : "";
  function render() {
    const c = $("#faccard"), esc = A.esc;
    const n15 = F.filter((f) => f.mw15 > 0).length, n5 = F.filter((f) => f.mw5 > 0).length;
    const list = (all ? F : F.filter((f) => band(f) < 2).slice(0, 12));
    const f = byCode.get(sel);
    c.innerHTML = `<div class="fhead"><h2>${t("fac_rank")}</h2>
        <button type="button" class="act" data-act="tog" aria-pressed="${on}">${t("fac_layer")}: ${on ? t("fac_on") : t("fac_off")}</button></div>
      <p class="sub">${t("fac_lede", { n15, n5, n: F.length })} ${t("fac_caveat")}</p>
      <div class="fgrid"><ol class="flist">${list.map((x) => `<li><button type="button" data-fac="${esc(x.code)}" class="${x.code === sel ? "on" : ""}">
          <span class="fn">${esc(x.name)}</span><span class="fs">${esc(x.sup || "")} · ${esc(x.prov || "")} ${ceba(x)}</span>
          <b class="num">${band(x) < 3 ? `<span class="fbt b${band(x) + 1}">${t("fac_b" + (band(x) + 1))}</span> ${A.mwTxt(bmw(x))}` : "–"}</b></button></li>`).join("")
        || `<li class="sub">${t("fac_none")}</li>`}</ol>
        <div class="fdet">${f ? detail(f) : `<p class="sub">${t("fac_pick")}</p>`}</div></div>
      <button type="button" class="more" data-act="all">${all ? t("fac_less") : t("fac_all", { n: F.length })}</button>`;
  }
  function detail(f) {
    const esc = A.esc, rows = (pairsBy.get(f.code) || []).slice().sort((a, b) => a.km - b.km);
    const band = (k) => (BANDS.find(([lim]) => k <= lim) || BANDS[2])[1];
    const prec = (p) => t({ SITE: "fac_p_site", COMMUNE: "fac_p_com", DISTRICT: "fac_p_dist", OFFSHORE: "fac_p_off" }[p.loc] || "fac_p_none");
    return `<h3>${esc(f.name)} <button type="button" class="x" data-act="clear" aria-label="${t("close")}">×</button></h3>
      <dl class="kv"><dt>${t("fac_sup")}</dt><dd>${esc(f.sup || "–")}</dd><dt>${t("fac_tier")}</dt><dd>${esc(f.tier || "–")}</dd>
        <dt>${t("fac_type")}</dt><dd>${esc(f.type || "–")}</dd><dt>${t("fac_workers")}</dt><dd>${A.fmt(f.workers || 0)}</dd>
        <dt>${t("fac_cebat")}</dt><dd>${esc(f.ceba || f.cebaG || "–")}</dd></dl>
      ${f.nodist ? `<p class="sub">${esc(f.note || "")}</p>` : `<div class="fbands">${BANDS.map(([lim, b]) => `<span class="fb ${b}"><i></i>${t("fac_" + b)}</span>`).join("")}</div>
      <h4>${t("fac_near")}</h4>
      ${rows.length ? `<ul class="fpairs">${rows.map((r) => `<li class="${band(r.km)}${ELIG.has(r.p.fit) ? "" : " inel"}"><button type="button" data-pid="${esc(r.p.id)}">
          <span class="num">${km(r.km)}</span><span class="fn">${esc(r.p.name)}</span>
          <span class="fs">${r.p.tech === "Wind" ? t("wind") : t("solar")} · ${A.mwTxt(r.p.mw)} · ${A.tr("stage", r.p.stage)} · ${prec(r.p)}${ELIG.has(r.p.fit) ? "" : " · " + A.tr("fit", r.p.fit)}</span></button></li>`).join("")}</ul>`
        : `<p class="sub">${t("fac_empty")}</p>`}`}`;
  }
  // a new project/province/backer selection elsewhere keeps the factory but refreshes fading
  function update() {
    if (!g) return;
    const hot = new Set((pairsBy.get(sel) || []).map((r) => r.p.id));
    d3.selectAll("#map .pt").classed("fnear", (p) => hot.has(p.id));
  }
})();
