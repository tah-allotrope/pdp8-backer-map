/* PDP8 backer map — data from build_map_data.py (geo.json, data.json), logos from fetch_logos.py, strings in i18n.js */
(() => {
  "use strict";
  const MERGED = {
    "Tuyên Quang": ["Hà Giang"], "Lào Cai": ["Yên Bái"], "Thái Nguyên": ["Bắc Kạn"], "Phú Thọ": ["Vĩnh Phúc", "Hòa Bình"],
    "Bắc Ninh": ["Bắc Giang"], "Hưng Yên": ["Thái Bình"], "Hải Phòng": ["Hải Dương"], "Ninh Bình": ["Hà Nam", "Nam Định"],
    "Quảng Trị": ["Quảng Bình"], "Đà Nẵng": ["Quảng Nam"], "Quảng Ngãi": ["Kon Tum"], "Gia Lai": ["Bình Định"],
    "Khánh Hòa": ["Ninh Thuận"], "Lâm Đồng": ["Đắk Nông", "Bình Thuận"], "Đắk Lắk": ["Phú Yên"],
    "TP. Hồ Chí Minh": ["Bình Dương", "Bà Rịa - Vũng Tàu"], "Đồng Nai": ["Bình Phước"], "Tây Ninh": ["Long An"],
    "Cần Thơ": ["Sóc Trăng", "Hậu Giang"], "Vĩnh Long": ["Bến Tre", "Trà Vinh"], "Đồng Tháp": ["Tiền Giang"],
    "Cà Mau": ["Bạc Liêu"], "An Giang": ["Kiên Giang"],
  };
  // approximate positions of the main islands (lon, lat, marker radius)
  const ISL = {
    HS: [[112.33, 16.83, 2.4], [112.27, 16.98, 1.6], [112.73, 16.67, 1.8], [111.6, 16.53, 1.8], [111.71, 16.45, 1.6],
      [111.77, 16.55, 1.4], [111.2, 15.78, 1.8], [112.5, 16.05, 1.4], [112.65, 16.95, 1.4]],
    TS: [[111.92, 8.65, 2.2], [114.33, 11.43, 1.8], [114.28, 11.05, 1.6], [114.36, 10.38, 1.8], [114.48, 10.38, 1.4],
      [114.37, 10.18, 1.6], [114.33, 9.88, 1.6], [113.67, 8.97, 1.4], [112.92, 7.87, 1.4], [112.9, 8.84, 1.4], [114.65, 11.1, 1.2]],
  };
  const STAGES = ["OPERATING", "UNDER-CONSTRUCTION", "APPROVED", "INVESTOR-SELECTED", "PROPOSED", "LISTED-ONLY", "STALLED", "STALLED/CANCELLED"];
  const LABELS = ["VERIFIED", "PARTIAL", "CLAIMED", "UNVERIFIED", "NOT FOUND"];
  const BTYPES = ["VN-PRIVATE", "VN-LISTED", "VN-STATE", "FOREIGN", "JV-FOREIGN-VN", "JV-FOREIGN", "UNKNOWN"];
  const MONO = { "VN-PRIVATE": "var(--teal)", "VN-LISTED": "var(--deep)", "VN-STATE": "var(--red)", "FOREIGN": "var(--wind)",
    "JV-FOREIGN-VN": "#7A5BA6", "JV-FOREIGN": "#7A5BA6" };
  const Q_COL = ["var(--line)", "var(--mint)", "var(--c3)", "var(--c4)", "var(--c5)"]; // year-only, Q1..Q4

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = d3.format(",");
  const mwTxt = (v) => (v >= 1000 ? d3.format(",.1f")(v / 1000) + " GW" : fmt(Math.round(v)) + " MW");
  const sum = (a) => d3.sum(a, (p) => p.mw);
  const lc = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

  /* ---------- language ---------- */
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
  let lang = (new URLSearchParams(location.search).get("lang") || store.get("pdp8-lang")) === "vi" ? "vi" : "en", L = I18N[lang];
  const t = (k, vars) => String(L[k] ?? I18N.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => (vars && vars[v] != null ? vars[v] : ""));
  const tr = (map, v) => (v == null ? "" : (L[map] && L[map][v]) || I18N.en[map][v] || v);
  const REG = (r) => t(r);
  if (lang === "vi") d3.formatDefaultLocale({ decimal: ",", thousands: ".", grouping: [3], currency: ["", "₫"] });

  const S = { tech: "all", fit: "", stage: "", label: "", btype: "", cody: "", codq: "", shade: "density",
    region: null, prov: null, project: null, backer: null, showAll: false, own: "group", view: "map" };
  const FKEYS = ["fit", "stage", "label", "btype", "cody", "codq"];
  let D, G, P, LOGO = {}, provById, projById, zoom, gRoot, gProv, gPts, gFx, gLab, curK = 1, pts;
  // phones get a tall viewBox so Vietnam's S-shape fills the screen; desktop stays near-square
  const MQ = matchMedia("(max-width: 640px)"), TOUCH = matchMedia("(hover: none)");
  let W = 800, H = 820;
  const narrow = () => MQ.matches;
  const sheetOn = () => narrow() && !!(S.prov || S.backer || S.project);
  // backer key: ultimate group (default) or direct investor (project company owner)
  const GK = () => (S.own === "inv" ? "inv" : "group");
  const HOOKS = (window.PDP8_HOOKS = []); // fusion.js adds the lede, table, tour and COD player here

  Promise.all([fetch("geo.json").then((r) => r.json()), fetch("data.json").then((r) => r.json()),
    fetch("logos/logos.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))])
    .then(([geo, data, logos]) => { G = geo; D = data; LOGO = logos; init(); })
    .catch((e) => { $("#panel").innerHTML = `<h2>${t("load_err")}</h2><p class="sub">${esc(e.message)}. ${t("reload")}</p>`; });

  function init() {
    P = D.projects;
    provById = new Map(G.features.map((f) => [f.id, f]));
    P.forEach((p) => { p.region = provById.get(p.prov).properties.region; p._s = lc([p.name, p.inv, p.parent, p.ult, p.group, p.id, p.pre, p.prov].join(" ")); });
    projById = new Map(P.map((p) => [p.id, p]));
    applyStatic();
    buildFilters();
    readURL();
    buildMap();
    wire();
    renderFoot();
    window.PDP8 = { S, P, D, lang, t, tr, esc, fmt, mwTxt, sum, logo, filtered, inScope, GK, LABELS, REG,
      update: () => update(), selectProject: (id) => selectProject(id), frame: () => frame() };
    HOOKS.forEach((h) => h.init && h.init(window.PDP8));
    update(true);
  }

  // static page text carries data-i18n (text), data-i18n-ph (placeholder) or data-i18n-al (aria-label)
  function applyStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll("[data-i18n-al]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAl)); });
    document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  }
  function setLang(l) {
    if (l === lang) return;
    store.set("pdp8-lang", l); location.reload(); // number formats are fixed at load, so reload is the clean switch
  }

  /* ---------- logos ---------- */
  const typeOf = (g) => (D.backers.find((b) => b.group === g) || {}).type;
  function logo(g, big) {
    if (!g) return "";
    const cls = `lg${big ? " big" : ""}`;
    if (LOGO[g]) return `<span class="${cls}"><img src="logos/${esc(LOGO[g])}" alt="" loading="lazy"></span>`;
    const words = g.replace(/\(.*?\)/g, "").replace(/^(Liên danh|CTCP|Công ty( Cổ phần| TNHH)?( Đầu tư)?)\s+/i, "").split(/[\s/]+/).filter((w) => /\p{L}/u.test(w));
    const ini = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
    return `<span class="${cls} mono" style="background:${MONO[typeOf(g)] || "var(--muted)"}" aria-hidden="true">${esc(ini)}</span>`;
  }

  /* ---------- filters ---------- */
  function opt(sel, items) {
    const el = $(sel), keep = el.value;
    el.innerHTML = `<option value="">${t("all")}</option>` + items.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
    el.value = keep;
  }
  function buildFilters() {
    opt("#f-fit", [...new Set(P.map((p) => p.fit))].map((f) => [f, tr("fit", f)]));
    opt("#f-stage", STAGES.filter((s) => P.some((p) => p.stage === s)).map((s) => [s, tr("stage", s)]));
    opt("#f-label", LABELS.map((l) => [l, tr("label", l)]));
    opt("#f-btype", BTYPES.map((k) => [k, tr("btype", k)]));
    const years = [...new Set(P.map((p) => p.codY).filter(Boolean))].sort();
    opt("#f-cody", [...years.map((y) => [String(y), String(y)]), ["none", t("nocod")]]);
    opt("#f-codq", [...[1, 2, 3, 4].map((q) => [String(q), t("q", { q })]), ["y", t("yearonly")]]);
  }
  const passCod = (p) => (!S.cody || (S.cody === "none" ? !p.codY : p.codY === +S.cody))
    && (!S.codq || (S.codq === "y" ? !!p.codY && !p.codQ : p.codQ === +S.codq));
  const pass = (p) => (S.tech === "all" || p.tech === S.tech) && (!S.fit || p.fit === S.fit) && (!S.stage || p.stage === S.stage)
    && (!S.label || p.label === S.label) && (!S.btype || p.btype === S.btype) && passCod(p);
  const filtered = () => P.filter(pass);
  const inScope = (p) => (!S.prov || p.prov === S.prov) && (!S.region || p.region === S.region);

  /* ---------- map ---------- */
  let proj, path;
  function buildMap() {
    const isl = { type: "Feature", geometry: { type: "MultiPoint", coordinates: [...ISL.HS, ...ISL.TS].map((d) => [d[0], d[1]]) } };
    const fc = { type: "FeatureCollection", features: [...G.features, isl] };
    // fit to width, then size the height to the country so there is no empty band
    W = narrow() ? 400 : 800;
    const pad = narrow() ? 10 : 16;
    proj = d3.geoMercator().fitWidth(W - 2 * pad, fc);
    path = d3.geoPath(proj);
    const b0 = path.bounds(fc);
    const padB = pad; // the legend sits below the map, so nothing covers Cà Mau
    H = Math.ceil(b0[1][1] - b0[0][1] + pad + padB);
    proj.fitExtent([[pad, pad], [W - pad, H - padB]], fc);
    const svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`).style("aspect-ratio", `${W} / ${H}`);
    svg.selectAll("*").remove(); svg.on(".zoom", null); curK = 1;
    gRoot = svg.append("g");
    gProv = gRoot.append("g");
    const lat = (f) => f.properties.lab[1];
    gProv.selectAll("path").data(G.features).join("path")
      .attr("class", "prov").attr("d", path)
      .style("opacity", 0.25)
      .on("mousemove", (ev, f) => tipProv(ev, f)).on("mouseleave", hideTip)
      .on("click", (ev, f) => { ev.stopPropagation(); const hit = nearest(ev); if (hit) selectProject(hit.id); else selectProv(f.id); })
      .transition().delay((f) => (23.4 - lat(f)) * 70).duration(600).style("opacity", 1);
    const lab = gRoot.append("g");
    const at = (lon, la) => proj([lon, la]);
    // archipelagos are not in the boundary file: draw the main islands as markers
    [...ISL.HS, ...ISL.TS].forEach(([x, y, r]) => { const [px, py] = at(x, y);
      lab.append("circle").attr("class", "isl").attr("cx", px).attr("cy", py).attr("r", r); });
    [["Q.Đ. HOÀNG SA", 111.95, 17.35], ["Q.Đ. TRƯỜNG SA", 113.1, 11.95]].forEach(([s, x, y]) => {
      const [px, py] = at(x, y); lab.append("text").attr("class", "isllab").attr("x", px).attr("y", py).attr("text-anchor", "middle").text(s);
    });
    const [sx, sy] = at(112.6, 14.2);
    lab.append("text").attr("class", "sealab").attr("x", sx).attr("y", sy).attr("text-anchor", "middle").text("BIỂN ĐÔNG");
    gFx = gRoot.append("g");
    gPts = gRoot.append("g");
    const rk = narrow() ? 0.62 : 1;
    P.forEach((p) => { [p.px, p.py] = proj(p.xy); p.r0 = Math.max(1.8, Math.sqrt(p.mw) * 0.42 * rk); });
    pts = gPts.selectAll("circle").data(d3.sort(P, (a, b) => b.mw - a.mw)).join("circle")
      .attr("class", (p) => `pt ${p.tech === "Wind" ? "w" : "s"}${p.inv || p.group ? "" : " nf"}`)
      .attr("cx", (p) => p.px).attr("cy", (p) => p.py).attr("r", 0)
      .on("mousemove", (ev, p) => tipProj(ev, p)).on("mouseleave", hideTip)
      .on("click", (ev, p) => { ev.stopPropagation(); selectProject(p.id); });
    pts.transition().delay((p) => 500 + (23.4 - p.xy[1]) * 60 + Math.random() * 200).duration(500).ease(d3.easeBackOut).attr("r", (p) => p.r0);
    gLab = gRoot.append("g");
    gLab.selectAll("text").data(G.features).join("text").attr("class", "plab")
      .attr("x", (f) => proj(f.properties.lab)[0]).attr("y", (f) => proj(f.properties.lab)[1])
      .attr("text-anchor", "middle").text((f) => f.id).style("display", "none");
    // mouse notches (|deltaY| ~100) zoom ~1.3x each; a trackpad pinch sends small ctrl deltas, so those step faster
    const wheelDelta = (ev) => -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : ev.deltaMode ? 1 : Math.abs(ev.deltaY) < 50 ? 0.02 : 0.003);
    zoom = d3.zoom().wheelDelta(wheelDelta).scaleExtent([1, 14]).translateExtent([[-100, -100], [W + 100, H + 100]]).on("zoom", (ev) => {
      gRoot.attr("transform", ev.transform); curK = ev.transform.k; rescale();
      // at full view one finger scrolls the page; once zoomed in it pans the map
      svg.style("touch-action", curK > 1.01 ? "none" : "pan-y");
    }).filter((ev) => (ev.type === "touchstart" ? (ev.touches.length > 1 || curK > 1.01)
      : ev.type === "wheel" ? ev.ctrlKey || ev.metaKey : !ev.ctrlKey && !ev.button));
    let wt; // plain wheel over the map scrolls the page; flash how to zoom instead
    svg.on("wheel.hint", (ev) => { if (ev.ctrlKey || ev.metaKey) return; $("#wheelhint").classList.add("on");
      clearTimeout(wt); wt = setTimeout(() => $("#wheelhint").classList.remove("on"), 1100); }, { passive: true });
    svg.call(zoom).on("dblclick.zoom", null).style("touch-action", "pan-y").on("click", (ev) => {
      const hit = nearest(ev); if (hit) { selectProject(hit.id); return; }
      if (S.project || S.backer) { S.project = null; S.backer = null; update(); } });
    $("#zin").onclick = () => svg.transition().duration(400).call(zoom.scaleBy, 1.6);
    $("#zout").onclick = () => svg.transition().duration(400).call(zoom.scaleBy, 1 / 1.6);
    $("#zhome").onclick = () => setScope(null, null);
    const dot = (fill, extra = "") => `<svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="${fill}" ${extra}/></svg>`;
    $("#legend").innerHTML = `<div class="row"><span class="sw">${dot("var(--wind)")}${t("wind")}</span><span class="sw">${dot("var(--solar)")}${t("solar")}</span>
      <span class="sw">${dot("var(--muted)", 'fill-opacity=".35" stroke="var(--muted)" stroke-dasharray="2 1.5"')}${t("noinv")}</span></div>
      <div class="row"><span>${t("dotarea")}</span><span class="sw"><svg width="40" height="22"><circle cx="8" cy="15" r="${Math.sqrt(100) * 0.42}" fill="none" stroke="var(--muted)"/><circle cx="28" cy="11" r="${Math.sqrt(500) * 0.42}" fill="none" stroke="var(--muted)"/></svg>100 · 500 MW</span></div>
      <div class="row"><label class="shade">${t("shade")} <select id="shade">${["density", "inv", "total"].map((k) => `<option value="${k}"${S.shade === k ? " selected" : ""}>${t("sh_" + k)}</option>`).join("")}</select></label></div>
      <div class="row"><span class="ramp">${[0, 1, 2, 3, 4, 5].map((i) => `<i style="background:var(--c${i})"></i>`).join("")}</span><span class="num" id="rampmax"></span></div>
      <div class="row" style="color:var(--muted)">${t("dotnote")}</div>`;
    $("#regions").innerHTML = `<button type="button" class="home-btn" data-home="1" aria-pressed="true"><b>${t("VN")}</b><small></small></button>`
      + ["N", "C", "S"].map((r) => `<button type="button" data-r="${r}" aria-pressed="false"><b>${REG(r)}</b><small></small></button>`).join("");
  }
  // touch: snap a tap to the closest visible dot within ~16 screen px
  function nearest(ev) {
    if (!TOUCH.matches) return null;
    const [x, y] = d3.pointer(ev, gRoot.node());
    const px = W / $("#map").clientWidth, lim = (16 * px) / curK;
    let best = null, bd = lim;
    pts.each(function (p) { if (this.classList.contains("off")) return;
      const d = Math.hypot(p.px - x, p.py - y); if (d < bd) { bd = d; best = p; } });
    return best;
  }
  function rescale() {
    const f = Math.pow(curK, -0.62);
    pts.attr("r", (p) => p.r0 * f * (p.id === S.project ? 1.5 : 1));
    gFx.selectAll(".ring").attr("stroke-width", 2);
    gLab.selectAll("text").style("font-size", `${11 / curK}px`).style("stroke-width", `${3 / curK}px`)
      .style("display", (f) => (curK >= 2.1 && (!S.region || f.properties.region === S.region) ? null : "none"));
  }
  function zoomToBounds(b, maxK = 9, dur = 950) {
    const [[x0, y0], [x1, y1]] = b;
    const k = Math.min(maxK, 0.88 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    // with the phone sheet open, centre the target in the upper part of the map
    const cy = sheetOn() ? H * 0.3 : H / 2;
    const tf = d3.zoomIdentity.translate(W / 2, cy).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    d3.select("#map").transition().duration(dur).ease(d3.easeCubicInOut).call(zoom.transform, tf);
  }
  function mainlandBounds(features) {
    // ignore far-offshore archipelagos so region zooms frame the mainland
    const fc = { type: "FeatureCollection", features: features.map((f) => ({ type: "Feature", geometry: {
      type: "MultiPolygon", coordinates: f.geometry.coordinates.filter((poly) => d3.geoCentroid({ type: "Polygon", coordinates: poly })[0] < 110.6) } })) };
    return path.bounds(fc);
  }
  function frame() {
    if (S.project) { const p = projById.get(S.project); const r = 34; zoomToBounds([[p.px - r, p.py - r], [p.px + r, p.py + r]], 7); return; }
    if (S.backer) { const ps = P.filter((p) => p[GK()] === S.backer && pass(p)); if (ps.length) {
      const xs = ps.map((p) => p.px), ys = ps.map((p) => p.py), pad = 40;
      zoomToBounds([[d3.min(xs) - pad, d3.min(ys) - pad], [d3.max(xs) + pad, d3.max(ys) + pad]], 6); return; } }
    if (S.prov) return zoomToBounds(mainlandBounds([provById.get(S.prov)]), 8);
    if (S.region) return zoomToBounds(mainlandBounds(G.features.filter((f) => f.properties.region === S.region)), 5);
    d3.select("#map").transition().duration(950).ease(d3.easeCubicInOut).call(zoom.transform, d3.zoomIdentity);
  }
  // province value for the choropleth: totals belong on the dots, so the default shade is normalised by area
  function provValue(ps, f) {
    const mw = sum(ps);
    if (!ps.length) return null;
    if (S.shade === "density") return (mw / f.properties.km2) * 1000;
    if (S.shade === "inv") return mw ? (sum(ps.filter((p) => p.inv)) / mw) * 100 : 0;
    return mw;
  }
  const shadeTxt = (v) => (S.shade === "density" ? `${d3.format(",.0f")(v)} ${t("sh_density")}` : S.shade === "inv" ? `${Math.round(v)}%` : mwTxt(v));
  function paintMap(F) {
    const byProv = d3.group(F, (p) => p.prov);
    const val = new Map(G.features.map((f) => [f.id, provValue(byProv.get(f.id) || [], f)]));
    const mx = S.shade === "inv" ? 100 : d3.max(val.values()) || 1;
    const breaks = (S.shade === "inv" ? [0.2, 0.4, 0.6, 0.8] : [0.12, 0.28, 0.5, 0.75]).map((x) => x * mx);
    const cls = (v) => (v == null ? 0 : 1 + breaks.filter((b) => v >= b).length);
    gProv.selectAll("path")
      .style("fill", (f) => `var(--c${cls(val.get(f.id))})`)
      .classed("dim", (f) => !!S.region && f.properties.region !== S.region)
      .classed("sel", (f) => f.id === S.prov);
    $("#rampmax").textContent = `0 – ${shadeTxt(mx)}`;
    const show = new Set(F.map((p) => p.id));
    pts.classed("off", (p) => !show.has(p.id))
      .classed("fade", (p) => (S.backer ? p[GK()] !== S.backer : (S.prov ? p.prov !== S.prov : (S.region ? p.region !== S.region : false))))
      .classed("hot", (p) => p.id === S.project || (S.backer && p[GK()] === S.backer));
    // backer constellation / project ring
    gFx.selectAll("*").interrupt().remove();
    if (S.backer) {
      const ps = F.filter((p) => p[GK()] === S.backer).sort((a, b) => b.xy[1] - a.xy[1]);
      if (ps.length > 1) {
        const ln = gFx.append("path").attr("class", "link")
          .attr("d", d3.line().x((p) => p.px).y((p) => p.py).curve(d3.curveCatmullRom.alpha(0.6))(ps));
        const len = ln.node().getTotalLength();
        ln.attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len).transition().duration(1400).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0)
          .on("end", function () { d3.select(this).attr("stroke-dasharray", "3 4"); });
      }
      ps.forEach((p, i) => pulse(p, i * 90));
    }
    if (S.project) pulse(projById.get(S.project), 0, true);
    rescale();
  }
  function pulse(p, delay, loop) {
    const c = gFx.append("circle").attr("class", "ring").attr("cx", p.px).attr("cy", p.py);
    const go = () => c.attr("r", (p.r0 * Math.pow(curK, -0.62))).attr("opacity", 0.9)
      .transition().delay(delay).duration(1300).ease(d3.easeCubicOut).attr("r", (p.r0 + 16) * Math.pow(curK, -0.62)).attr("opacity", 0)
      .on("end", () => { delay = 200; if (loop) go(); });
    go();
  }

  /* ---------- tooltips ---------- */
  const tip = $("#tip");
  function placeTip(ev) {
    if (TOUCH.matches) return; // taps open the sheet instead
    const box = $(".mapcard").getBoundingClientRect();
    let x = ev.clientX - box.left + 14, y = ev.clientY - box.top + 14;
    if (x + 290 > box.width) x = ev.clientX - box.left - 290;
    if (y + 170 > box.height) y = ev.clientY - box.top - 170;
    tip.style.left = Math.max(4, x) + "px"; tip.style.top = Math.max(4, y) + "px"; tip.classList.add("on");
  }
  function tipProv(ev, f) {
    const ps = filtered().filter((p) => p.prov === f.id);
    const w = sum(ps.filter((p) => p.tech === "Wind")), s = sum(ps.filter((p) => p.tech === "Solar"));
    const top = d3.rollups(ps.filter((p) => p.group), (v) => sum(v), (p) => p.group).sort((a, b) => b[1] - a[1])[0];
    const v = provValue(ps, f);
    tip.innerHTML = `<h4>${esc(f.id)}</h4><div class="k">${REG(f.properties.region)}${MERGED[f.id] ? " · " + t("with") + " " + esc(MERGED[f.id].join(", ")) : ""}</div>
      <div class="num">${t("n_proj", { n: ps.length })} · ${mwTxt(w + s)}</div><div class="num k">${t("wind")} ${fmt(Math.round(w))} · ${t("solar")} ${fmt(Math.round(s))} MW</div>
      ${v != null && S.shade !== "total" ? `<div class="num k">${S.shade === "inv" ? t("sh_inv") + ": " : ""}${shadeTxt(v)}</div>` : ""}
      ${top ? `<div class="tiprow">${logo(top[0])}<span>${t("largest")}: <b>${esc(top[0])}</b> <span class="num k">${mwTxt(top[1])}</span></span></div>` : ""}`;
    placeTip(ev);
  }
  function tipProj(ev, p) {
    tip.innerHTML = `<h4>${esc(p.name)}</h4><div class="num k">${p.id} · ${t(p.tech)} · ${fmt(p.mw)} MW${p.cod ? " · COD " + esc(p.cod) : ""}</div>
      <div class="tiprow">${logo(p.group)}<span>${esc(p.group || p.inv || t("noinv"))}</span></div><div class="k">${esc(tr("stage", p.stage))}${p.syear ? " " + p.syear : ""} · ${esc(tr("label", p.label))}</div>`;
    placeTip(ev);
  }
  const hideTip = () => tip.classList.remove("on");

  /* ---------- selection ---------- */
  function setScope(region, prov) { S.region = region; S.prov = prov; S.project = null; S.backer = null; S.showAll = false; update(); frame(); showMap(); }
  // phone: picking something from the lists below brings the map back into view
  function showMap() {
    if (!narrow()) return;
    const r = $(".mapcard").getBoundingClientRect();
    if (r.top < -40 || r.top > innerHeight * 0.4) $(".mapcard").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  function selectProv(id) { const r = provById.get(id).properties.region; setScope(r, id); }
  function selectProject(id) { const p = projById.get(id); S.project = id; S.prov = p.prov; S.region = p.region; S.backer = null; update(); frame(); showMap(); }
  function selectBacker(g) { S.backer = g; S.project = null; S.showAll = false; update(); frame(); showMap(); }

  /* ---------- render ---------- */
  // shareable view: filters + selection live in the query string (GitHub Pages; the claude.ai sandbox ignores it)
  const UKEYS = ["tech", ...FKEYS, "shade", "region", "prov", "project", "backer", "own", "view"];
  function readURL() {
    let q; try { q = new URLSearchParams(location.search); } catch { return; }
    UKEYS.forEach((k) => { const v = q.get(k); if (v) S[k] = v; });
    if (S.project && !projById.has(S.project)) S.project = null;
    if (S.prov && !provById.has(S.prov)) S.prov = S.region = null;
    if (S.own !== "inv") S.own = "group";
    if (S.view !== "table") S.view = "map";
    FKEYS.forEach((k) => { $("#f-" + k).value = S[k]; });
    document.querySelectorAll("#tech button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === S.tech)));
  }
  function writeURL() {
    try {
      const q = new URLSearchParams();
      UKEYS.forEach((k) => { const v = S[k]; if (v && !(k === "tech" && v === "all") && !(k === "shade" && v === "density") && !(k === "own" && v === "group") && !(k === "view" && v === "map")) q.set(k, v); });
      if (lang === "vi") q.set("lang", "vi");
      const qs = q.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    } catch { /* sandboxed frame: state stays in the page */ }
  }
  function update() {
    writeURL();
    const F = filtered();
    const scoped = F.filter(inScope);
    paintMap(F);
    renderKPIs(S.backer ? F.filter((p) => p[GK()] === S.backer) : scoped);
    renderRegionButtons(F);
    renderPanel(F, scoped);
    renderBackers(scoped);
    renderRegions(F);
    renderStages(scoped);
    renderCod(scoped);
    renderWall(F);
    HOOKS.forEach((h) => h.update && h.update(F, scoped));
    document.querySelectorAll("#tech button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === S.tech)));
  }
  function tweenNum(el, to, f) {
    const from = +el.dataset.v || 0; el.dataset.v = to;
    d3.select(el).transition().duration(700).tween("t", () => { const i = d3.interpolateNumber(from, to); return (x) => { el.textContent = f(i(x)); }; });
  }
  function renderKPIs(ps) {
    const mw = sum(ps), inv = ps.filter((p) => p.inv), w = sum(ps.filter((p) => p.tech === "Wind"));
    const groups = new Set(ps.map((p) => p.group).filter(Boolean));
    const committed = ps.filter((p) => (p.rev2 || "").startsWith("Committed"));
    const el = $("#kpis");
    if (!el.children.length) {
      el.innerHTML = ["k_proj", "k_cap", "k_inv", "k_grp", "k_com"].map((k, i) =>
        `<div class="kpi"><span>${t(k)}</span><b id="k${i}">0</b><small id="ks${i}"></small>${i === 1 || i === 2 ? `<div class="bar" id="kb${i}"></div>` : ""}</div>`).join("");
    }
    tweenNum($("#k0"), ps.length, (v) => fmt(Math.round(v)));
    $("#ks0").textContent = t("ks_proj", { w: ps.filter((p) => p.tech === "Wind").length, s: ps.filter((p) => p.tech === "Solar").length });
    tweenNum($("#k1"), mw, (v) => mwTxt(v));
    $("#ks1").textContent = t("ks_cap", { w: mwTxt(w), s: mwTxt(mw - w) });
    $("#kb1").innerHTML = `<i style="width:${mw ? (w / mw) * 100 : 0}%;background:var(--wind)"></i><i style="width:${mw ? ((mw - w) / mw) * 100 : 0}%;background:var(--solar)"></i>`;
    tweenNum($("#k2"), mw ? (sum(inv) / mw) * 100 : 0, (v) => t("kv_inv", { p: Math.round(v) }));
    $("#ks2").textContent = t("ks_inv", { n: inv.length, mw: mwTxt(sum(inv)) });
    $("#kb2").innerHTML = `<i style="width:${mw ? (sum(inv) / mw) * 100 : 0}%;background:var(--teal)"></i>`;
    tweenNum($("#k3"), groups.size, (v) => fmt(Math.round(v)));
    $("#ks3").textContent = t("ks_grp", { mw: mwTxt(sum(ps.filter((p) => p.group))) });
    tweenNum($("#k4"), committed.length, (v) => fmt(Math.round(v)));
    $("#ks4").textContent = t("ks_com", { mw: mwTxt(sum(committed)) });
  }
  function renderRegionButtons(F) {
    document.querySelectorAll("#regions button").forEach((b) => {
      const ps = b.dataset.home ? F : F.filter((p) => p.region === b.dataset.r);
      b.querySelector("small").textContent = `${ps.length} · ${mwTxt(sum(ps))}`;
      b.setAttribute("aria-pressed", String(b.dataset.home ? !S.region : S.region === b.dataset.r));
    });
  }
  function crumbs() {
    const c = [`<button type="button" data-c="nation">${t("VN")}</button>`];
    if (S.region) c.push(`<button type="button" data-c="region">${REG(S.region)}</button>`);
    if (S.prov) c.push(`<button type="button" data-c="prov">${esc(S.prov)}</button>`);
    if (S.backer) c.push(`<span>${esc(S.backer)}</span>`);
    if (S.project) c.push(`<span>${esc(S.project)}</span>`);
    return `<nav class="crumbs" aria-label="Where you are">${c.join('<span class="sep">›</span>')}</nav>`;
  }
  function splitBar(ps) {
    const w = sum(ps.filter((p) => p.tech === "Wind")), s = sum(ps.filter((p) => p.tech === "Solar")), tt = w + s || 1;
    return `<div class="split"><i style="width:${(w / tt) * 100}%;background:var(--wind)"></i><i style="width:${(s / tt) * 100}%;background:var(--solar)"></i></div>
      <div class="splitlab num"><span>${t("wind")} ${fmt(Math.round(w))} MW</span><span>${t("solar")} ${fmt(Math.round(s))} MW</span></div>`;
  }
  function stats(items) { return `<div class="stats">${items.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("")}</div>`; }
  function barRows(rows, attr, max, withLogo) {
    return `<div class="rows">${rows.map((r) => `<button type="button" class="rowb" data-${attr}="${esc(r.key)}"><span class="nm">${withLogo ? logo(r.key) : ""}${esc(r.key)}</span><span class="v">${r.v}</span>
      <span class="track"><i style="width:${(r.w / max) * 100}%;background:var(--wind)"></i><i style="width:${(r.s / max) * 100}%;background:var(--solar)"></i></span></button>`).join("")}</div>`;
  }
  function groupRows(ps, key, n) {
    const rows = d3.rollups(ps.filter((p) => p[key]), (v) => ({ w: sum(v.filter((p) => p.tech === "Wind")), s: sum(v.filter((p) => p.tech === "Solar")), n: v.length }), (p) => p[key])
      .map(([k, o]) => ({ key: k, ...o, t: o.w + o.s, v: `${o.n} · ${mwTxt(o.w + o.s)}` })).sort((a, b) => b.t - a.t);
    return { rows: n ? rows.slice(0, n) : rows, all: rows.length, max: d3.max(rows, (r) => r.t) || 1 };
  }
  function projList(ps, limit) {
    const list = d3.sort(ps, (a, b) => b.mw - a.mw);
    const shown = S.showAll ? list : list.slice(0, limit);
    return `<div class="rows plist">${shown.map((p) => `<button type="button" class="rowb" data-p="${p.id}"><span class="nm"><i class="tdot ${p.tech === "Wind" ? "w" : "s"}"></i>${esc(p.name)}<small>${esc(p.group || p.inv || t("noinv_l"))}${p.cod ? " · COD " + esc(p.cod) : ""}</small></span><span class="v">${fmt(p.mw)} MW</span></button>`).join("")}</div>
      ${list.length > shown.length ? `<button type="button" class="more" data-more="1">${t("show_projs", { n: list.length })}</button>` : ""}`;
  }
  function renderPanel(F, scoped) {
    const el = $("#panel"), sh = $("#sheet");
    let d = "";
    if (S.project) d = projectView(projById.get(S.project));
    else if (S.backer) d = backerView(F.filter((p) => p[GK()] === S.backer));
    else if (S.prov) d = provView(scoped);
    if (sheetOn()) {
      // phone: detail rides in a bottom sheet over the map; the inline panel keeps the region overview
      $("#sheet-body").innerHTML = crumbs() + d;
      $("#sheet-body").scrollTop = 0;
      if (!sh.classList.contains("open")) sh.classList.remove("full");
      sh.classList.add("open"); sh.setAttribute("aria-hidden", "false");
      el.innerHTML = overView(F.filter((p) => !S.region || p.region === S.region));
    } else {
      sh.classList.remove("open", "full"); sh.setAttribute("aria-hidden", "true");
      el.innerHTML = crumbs() + (d || overView(scoped));
      el.scrollTop = 0;
    }
  }
  function sheetState(state) {
    if (state === "close") { setScope(S.region, null); return; }
    $("#sheet").classList.toggle("full", state === "full");
  }
  const invShare = (ps) => (ps.length ? Math.round((ps.filter((p) => p.inv).length / ps.length) * 100) + "%" : "–");
  function overView(ps) {
    const title = S.region ? REG(S.region) : t("VN");
    const provs = G.features.filter((f) => !S.region || f.properties.region === S.region);
    const pr = groupRows(ps, "prov", S.showAll ? 0 : 12), bk = groupRows(ps, GK(), 8);
    return `<h2>${title}</h2><p class="sub">${t("provs_sub", { a: provs.length, b: pr.all })}</p>
      ${stats([[fmt(ps.length), t("projects")], [mwTxt(sum(ps)), t("capacity")], [invShare(ps), t("inv_share")]])}
      ${splitBar(ps)}
      <h3>${t("by_prov")}</h3>${barRows(pr.rows, "prov", pr.max)}
      ${pr.all > pr.rows.length ? `<button type="button" class="more" data-more="1">${t("show_provs", { n: pr.all })}</button>` : ""}
      <h3>${t("top_here")}</h3>${bk.rows.length ? barRows(bk.rows, "backer", bk.max, true) : `<p class="sub">${t("no_group")}</p>`}`;
  }
  function provView(ps) {
    const f = provById.get(S.prov);
    const pre = groupRows(ps, "pre", 0), bk = groupRows(ps, GK(), 8);
    return `<h2>${esc(S.prov)}</h2><p class="sub">${REG(f.properties.region)} · ${MERGED[S.prov] ? t("merged", { x: esc(MERGED[S.prov].join(", ")) }) : t("unchanged")} · ${fmt(f.properties.km2)} km²</p>
      ${stats([[fmt(ps.length), t("projects")], [mwTxt(sum(ps)), t("capacity")], [invShare(ps), t("inv_share")]])}
      ${ps.length ? splitBar(ps) : `<p class="sub" style="margin-top:12px">${t("no_match")}</p>`}
      ${pre.rows.length > 1 ? `<h3>${t("by_pre")}</h3>${barRows(pre.rows, "x", pre.max)}` : ""}
      ${bk.rows.length ? `<h3>${t("groups")}</h3>${barRows(bk.rows, "backer", bk.max, true)}` : ""}
      ${ps.length ? `<h3>${t("plist")}</h3>${projList(ps, 12)}` : ""}`;
  }
  function backerView(ps) {
    const b = D.backers.find((x) => x.group === S.backer) || {};
    const pr = groupRows(ps, "prov", 0);
    const all = P.filter((p) => p[GK()] === S.backer);
    return `<h2 class="bh">${logo(S.backer, true)}<span>${esc(S.backer)}</span></h2><p class="sub">${esc(tr("btype", b.type))}${b.basis ? " · " + esc(b.basis) : ""}</p>
      ${stats([[fmt(ps.length), ps.length === all.length ? t("projects") : t("of_n", { n: all.length })], [mwTxt(sum(ps)), t("capacity")], [pr.all, t("provinces")]])}
      ${splitBar(ps)}
      <h3>${t("where")}</h3>${barRows(pr.rows, "prov", pr.max)}
      <h3>${t("plist")}</h3>${projList(ps, 15)}`;
  }
  const chip = (l) => `<span class="chip l-${(l || "").replace(/\s/g, "")}">${esc(tr("label", l) || "–")}</span>`;
  function projectView(p) {
    const nf = `<div class="t" style="color:var(--muted)">${t("notfound")}</div>`;
    const link = (n, k, v, extra) => `<div class="lk"><span class="nd">${n}</span><div><div class="k">${k}</div>${v ? `<div class="t">${esc(v)}</div>` : nf}${extra || ""}</div></div>`;
    const srcRow = (id) => { const s = D.sources[id]; return s ? `<span class="m">${esc(s[0])} · ${esc(s[2] || "")} · <a href="${esc(s[3])}" target="_blank" rel="noopener">${id}</a></span>` : `<span class="m">${esc(id)}</span>`; };
    // per-hop evidence: best label among the claims behind that link, plus its sources
    const hop = (claims) => { const es = p.ev.filter((e) => claims.includes(e[0])); if (!es.length) return `<div class="hop"><span class="chip l-NOTFOUND">${t("hop_none")}</span></div>`;
      const best = LABELS.find((l) => es.some((e) => e[3] === l));
      return `<div class="hop">${chip(best)}${[...new Set(es.map((e) => e[4]))].slice(0, 3).map((id) => { const s = D.sources[id];
        return s ? `<a href="${esc(s[3])}" target="_blank" rel="noopener" title="${esc(s[0])} · ${esc(s[2] || "")}">${esc(s[0])}</a>` : `<span>${esc(id)}</span>`; }).join("")}</div>`; };
    const stakes = [...new Set(((p.inv || "") + " | " + (p.notes || "")).match(/[^.;|]{0,56}\b\d{1,3}(?:[.,]\d+)?\s?%[^.;|]{0,32}/g) || [])].slice(0, 4);
    const codTxt = p.cod ? `${esc(p.cod)} <span class="sub">(${esc(tr("codType", p.codType))}${p.codLabel ? ", " + esc(tr("label", p.codLabel)) : ""})</span>` : t("notfound");
    return `<h2>${esc(p.name)}</h2>
      <p class="sub num">${p.id} · ${esc(p.tbl)} · ${esc(p.pre)}${p.pre !== p.prov ? " → " + esc(p.prov) : ""} · ${REG(p.region)}</p>
      <div class="chips" style="margin-top:10px"><span class="chip"><i class="tdot ${p.tech === "Wind" ? "w" : "s"}"></i>${t(p.tech)}</span><span class="chip num">${fmt(p.mw)} MW</span>
        <span class="chip st">${esc(p.status)}</span>${chip(p.label)}${(p.fit || "").startsWith("Stalled") ? `<span class="chip bad">${t("stalled")}</span>` : ""}</div>
      <h3>${t("chain")}</h3><div class="chain">
        ${link(1, t("c_inv"), p.inv, (p.ent ? `<div class="k num" style="text-transform:none">${t("ent")} ${esc(p.ent)}</div>` : "") + hop(["investor_spv", "enterprise_code"]))}
        ${link(2, t("c_par"), p.parent, hop(["direct_parent"]))}
        ${link(3, t("c_ult"), p.ult, (p.country ? `<div class="k" style="text-transform:none">${esc(p.country)} · ${esc(tr("btype", p.btype))}</div>` : "") + hop(["ultimate_backer", "backer_country"]))}
        <div class="lk top"><span class="nd">G</span><div><div class="k">${t("c_grp")}</div>${p.group ? `<button type="button" class="t grp" data-backer="${esc(p.group)}">${logo(p.group)}${esc(p.group)} →</button>` : `<div class="t" style="color:var(--muted)">${t("c_stop")}</div>`}</div></div>
      </div>
      ${stakes.length ? `<div class="stakes"><div class="k">${t("stakes")}</div>${stakes.map((x) => `<div>…${esc(x.trim()).replace(/(\d{1,3}(?:[.,]\d+)?\s?%)/g, "<b class=\"num\">$1</b>")}…</div>`).join("")}</div>` : ""}
      <h3>${t("timing")}</h3><dl class="kv">
        <dt>${t("t_status")}</dt><dd>${esc(tr("stage", p.stage))}${p.syear ? ", " + p.syear : ""}</dd>
        <dt>${t("t_period")}</dt><dd>${esc(p.period || t("notfound"))}</dd>
        <dt>${t("t_cod")}</dt><dd>${codTxt}</dd>
        <dt>${t("t_fit")}</dt><dd>${esc(tr("fit", p.fit))}</dd>
        <dt>${t("t_rev2")}</dt><dd>${esc(tr("rev2", p.rev2))}</dd>
        ${p.offtake ? `<dt>${t("t_off")}</dt><dd>${esc(p.offtake)}</dd>` : ""}
        <dt>${t("t_change")}</dt><dd>${esc(p.change)}${p.found ? ` <span class="sub">(${t("found_in")} ${esc(p.found)})</span>` : ""}</dd>
      </dl>
      ${p.notes ? `<h3>${t("notes")}${t("notes_lang")}</h3><div class="note">${esc(p.notes)}</div>` : ""}
      <h3>${t("evidence")} (${p.ev.length})</h3>
      ${p.ev.length ? p.ev.map((e) => `<div class="ev"><div><b>${esc(tr("claim", e[0]))}</b> ${chip(e[3])}</div><div>${esc(e[1])}</div>${e[2] ? `<q>${esc(e[2])}</q>` : ""}${srcRow(e[4])}</div>`).join("")
        : `<p class="sub">${t("no_ev")} ${p.src.length ? p.src.map(srcRow).join(", ") : t("none")}</p>`}
      ${p.ver.length ? `<h3>${t("recheck")} (${p.ver.length})</h3>${p.ver.map((v) => `<div class="ev"><div class="m num">${esc(v[0])} · ${esc(tr("claim", v[1]))}</div><div>${t("verifier")}: ${chip(v[2])} → ${t("now")} ${chip(v[3])}</div>${v[4] ? `<div class="m">${esc(v[4])}</div>` : ""}</div>`).join("")}` : ""}`;
  }
  function renderBackers(ps) {
    const bk = groupRows(ps, GK(), 18);
    $("#bk-title").textContent = t("bk_title", { w: S.prov || (S.region ? REG(S.region) : t("VN")) });
    $("#backers").innerHTML = bk.rows.length ? bk.rows.map((r, i) => `<button type="button" class="bk${r.key === S.backer ? " on" : ""}" data-backer="${esc(r.key)}">
        <span class="nm">${logo(r.key)}<span class="tx">${esc(r.key)}<span class="tchip">${esc(tr("btype", typeOf(r.key)))}</span></span></span>
        <span class="tr"><i style="width:${(r.w / bk.max) * 100}%;background:var(--wind);animation-delay:${i * 30}ms"></i><i style="width:${(r.s / bk.max) * 100}%;background:var(--solar);animation-delay:${i * 30}ms"></i></span>
        <span class="v">${mwTxt(r.t)}</span></button>`).join("")
      + (bk.all > bk.rows.length ? `<p class="hint" style="margin-top:8px">${t("bk_more", { n: bk.all - bk.rows.length })}</p>` : "")
      : `<p class="hint">${t("no_group")}</p>`;
  }
  function renderRegions(F) {
    const rs = ["N", "C", "S"].map((r) => { const ps = F.filter((p) => p.region === r);
      return { r, n: ps.length, w: sum(ps.filter((p) => p.tech === "Wind")), s: sum(ps.filter((p) => p.tech === "Solar")),
        g: new Set(ps.map((p) => p.group).filter(Boolean)).size }; });
    const mx = d3.max(rs, (o) => o.w + o.s) || 1;
    $("#regchart").innerHTML = rs.map((o, i) => `<button type="button" class="rg" data-r="${o.r}" ${S.region === o.r ? 'style="background:var(--paper-2)"' : ""}><b>${REG(o.r)}</b><span class="bars">
      <span class="tr"><i style="width:${(o.w / mx) * 100}%;background:var(--wind);animation-delay:${i * 80}ms"></i><i style="width:${(o.s / mx) * 100}%;background:var(--solar);animation-delay:${i * 80}ms"></i></span>
      <span class="lab">${t("reg_lab", { n: o.n, mw: mwTxt(o.w + o.s), g: o.g })}</span></span></button>`).join("");
  }
  function renderStages(ps) {
    const rows = STAGES.map((s) => { const v = ps.filter((p) => p.stage === s); return { s, n: v.length, mw: sum(v) }; }).filter((o) => o.n);
    const mx = d3.max(rows, (o) => o.mw) || 1;
    $("#stages").innerHTML = rows.map((o, i) => `<div class="stage"><span>${tr("stage", o.s)} <span class="sub num">(${o.n})</span></span>
      <span class="tr"><i style="width:${(o.mw / mx) * 100}%;animation-delay:${i * 50}ms;${o.s.startsWith("STALLED") ? "background:var(--red)" : o.s === "OPERATING" ? "background:var(--green)" : ""}"></i></span><span class="num" style="text-align:right">${mwTxt(o.mw)}</span></div>`).join("");
  }
  // COD by year, each bar split by quarter (grey = year only); a year button sets the COD year filter
  function renderCod(ps) {
    const withCod = ps.filter((p) => p.codY), none = ps.filter((p) => !p.codY);
    const years = d3.rollups(withCod, (v) => [0, 1, 2, 3, 4].map((q) => sum(v.filter((p) => (p.codQ || 0) === q))), (p) => p.codY).sort((a, b) => a[0] - b[0]);
    const mx = d3.max(years, ([, qs]) => d3.sum(qs)) || 1;
    const sw = (c, l) => `<span class="sw"><i style="background:${c}"></i>${l}</span>`;
    $("#codleg").innerHTML = [1, 2, 3, 4].map((q) => sw(Q_COL[q], t("q", { q }))).join("") + sw(Q_COL[0], t("yr_only"));
    $("#codchart").innerHTML = years.map(([y, qs], i) => `<button type="button" class="cy${S.cody === String(y) ? " on" : ""}" data-cody="${y}" aria-pressed="${S.cody === String(y)}">
      <b class="num">${y}</b><span class="tr">${[1, 2, 3, 4, 0].map((q) => (qs[q] ? `<i title="${t("q", { q })}: ${mwTxt(qs[q])}" style="width:${(qs[q] / mx) * 100}%;background:${Q_COL[q]};animation-delay:${i * 40}ms"></i>` : "")).join("")}</span>
      <span class="num v">${mwTxt(d3.sum(qs))}</span></button>`).join("")
      + `<p class="hint" style="margin-top:8px">${t("cod_none", { n: none.length, mw: mwTxt(sum(none)) })}</p>`;
  }
  // logo strip of the largest groups nationally under the current filters; a tile selects the backer
  function renderWall(F) {
    const bk = groupRows(F, GK(), 12);
    const own = ["group", "inv"].map((k) => `<button type="button" data-own="${k}" aria-pressed="${S.own === k}">${t("own_" + k)}</button>`).join("");
    $("#wall").innerHTML = `<div class="wall-h"><b>${t(S.own === "inv" ? "wall_inv" : "wall")}</b><span>${t("wall_hint")}</span>
      <div class="seg own" role="group" aria-label="${t("own_al")}">${own}</div></div>
      <div class="wall-row">${bk.rows.map((r, i) => `<button type="button" class="wt${r.key === S.backer ? " on" : ""}" data-backer="${esc(r.key)}" style="animation-delay:${i * 35}ms">
        ${logo(r.key, true)}<span class="wn">${esc(r.key.replace(/\s*\((?:incl\.|HOSE).*?\)/, ""))}</span><span class="wv num">${mwTxt(r.t)}</span></button>`).join("")}</div>`;
  }
  function renderFoot() {
    const m = D.meta;
    $("#meta").textContent = t("meta", { v: m.version, d: m.compiled, n: P.length, src: m.source });
    const link = `<a href="https://github.com/ThangLeQuoc/vietnamese-provinces-database" target="_blank" rel="noopener">vietnamese-provinces-database</a>`;
    $("#foot").innerHTML = L.foot.map((s) => `<div>${s.replace(/\{v\}/g, esc(m.version)).replace(/\{rows\}/g, esc(m.konTumRows.join(", "))).replace(/\{link\}/g, link)}</div>`).join("");
  }

  /* ---------- events ---------- */
  function wire() {
    const fcount = () => { const n = FKEYS.filter((k) => S[k]).length; $("#ftoggle").textContent = n ? t("filters_n", { n }) : t("filters"); };
    document.addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.closest("#lang")) { setLang(b.dataset.lang); return; }
      if (b.dataset.own) { S.own = b.dataset.own; S.backer = null; update(); frame(); return; }
      if (b.closest("#tech")) { S.tech = b.dataset.v; S.project = null; update(); return; }
      if (b.dataset.cody) { S.cody = S.cody === b.dataset.cody ? "" : b.dataset.cody; $("#f-cody").value = S.cody; S.project = null; update(); fcount(); return; }
      if (b.dataset.r) { setScope(S.region === b.dataset.r && !S.prov ? null : b.dataset.r, null); return; }
      if (b.dataset.prov) { selectProv(b.dataset.prov); return; }
      if (b.dataset.backer) { selectBacker(b.dataset.backer); return; }
      if (b.dataset.p) { selectProject(b.dataset.p); return; }
      if (b.dataset.more) { S.showAll = true; renderPanel(filtered(), filtered().filter(inScope)); return; }
      if (b.dataset.home) { setScope(null, null); return; }
      if (b.dataset.c === "nation") setScope(null, null);
      else if (b.dataset.c === "region") setScope(S.region, null);
      else if (b.dataset.c === "prov") setScope(S.region, S.prov);
    });
    FKEYS.forEach((k) => $("#f-" + k).addEventListener("change", (e) => { S[k] = e.target.value; S.project = null; update(); fcount(); }));
    $("#legend").addEventListener("change", (e) => { if (e.target.id === "shade") { S.shade = e.target.value; paintMap(filtered()); } });
    // phone: filters fold behind one button that shows how many are set
    $("#ftoggle").onclick = () => { const f = $(".filters"); const o = !f.classList.contains("fopen");
      f.classList.toggle("fopen", o); $("#ftoggle").setAttribute("aria-expanded", String(o)); };
    // bottom sheet: tap the handle to expand/collapse, drag it up or down, × closes
    const handle = $("#sheet-handle"); let y0 = null, moved = false;
    handle.addEventListener("pointerdown", (e) => { y0 = e.clientY; moved = false; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener("pointermove", (e) => { if (y0 !== null && Math.abs(e.clientY - y0) > 8) moved = true; });
    handle.addEventListener("pointerup", (e) => {
      const dy = y0 === null ? 0 : e.clientY - y0; y0 = null; const full = $("#sheet").classList.contains("full");
      if (!moved) sheetState(full ? "peek" : "full");
      else if (dy < -40) sheetState("full");
      else if (dy > 60) sheetState(full ? "peek" : "close");
    });
    $("#sheet-close").onclick = () => sheetState("close");
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetOn()) sheetState("close"); });
    MQ.addEventListener("change", () => { buildMap(); update(); frame(); });
    fcount();
    $("#reset").onclick = () => { Object.assign(S, { tech: "all" }); FKEYS.forEach((k) => { S[k] = ""; $("#f-" + k).value = ""; }); fcount(); setScope(null, null); };
    const q = $("#q"), hits = $("#hits"); let found = [], idx = 0;
    const draw = () => {
      hits.innerHTML = found.map((h, i) => `<button type="button" class="${i === idx ? "on" : ""}" data-hit="${i}"><span>${h.kind === "b" ? logo(h.key) : ""}${esc(h.label)}</span><em>${esc(h.meta)}</em></button>`).join("");
      hits.hidden = !found.length;
    };
    q.addEventListener("input", () => {
      const s = lc(q.value.trim()); idx = 0;
      if (s.length < 2) { found = []; draw(); return; }
      const gs = D.backers.filter((b) => lc(b.group).includes(s)).slice(0, 4).map((b) => ({ kind: "b", key: b.group, label: b.group, meta: `${t("groups")} · ${mwTxt(b.mw)}` }));
      const pv = G.features.filter((f) => lc(f.id).includes(s)).slice(0, 3).map((f) => ({ kind: "v", key: f.id, label: f.id, meta: REG(f.properties.region) }));
      const ps = P.filter((p) => p._s.includes(s)).sort((a, b) => b.mw - a.mw).slice(0, 10).map((p) => ({ kind: "p", key: p.id, label: p.name, meta: `${p.id} · ${fmt(p.mw)} MW` }));
      found = [...gs, ...pv, ...ps]; draw();
    });
    const go = (h) => { hits.hidden = true; q.value = ""; found = [];
      if (h.kind === "b") selectBacker(h.key); else if (h.kind === "v") selectProv(h.key);
      else { const p = projById.get(h.key); if (!pass(p)) { $("#reset").click(); } selectProject(h.key); } };
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { idx = Math.min(found.length - 1, idx + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter" && found[idx]) go(found[idx]);
      else if (e.key === "Escape") { hits.hidden = true; }
    });
    hits.addEventListener("click", (e) => { const b = e.target.closest("[data-hit]"); if (b) { e.stopPropagation(); go(found[+b.dataset.hit]); } });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) hits.hidden = true; });
  }
})();
