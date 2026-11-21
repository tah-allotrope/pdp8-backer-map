/* Fusion layer on top of app.js: editorial lede with 2030 target bars, Map/Table view with CSV export,
   copy-link, COD year player and a 3-step tour. Hooks in through window.PDP8_HOOKS; strings live in i18n.js. */
(() => {
  "use strict";
  // Decision 768/QĐ-TTg (Apr 2025), main text III.1.b.i: 2030 capacity ranges in MW (pdt-tprim.md N1, N3)
  const TARGET = { Wind: [26066, 38029], Solar: [46459, 73416] };
  // the claude.ai sandbox blocks downloads and drops query strings, so those tools only show on the public site
  const PUBLIC = /(^|\.)github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
  const SITE = "https://tah-allotrope.github.io/pdp8-backer-map/";
  const $ = (s) => document.querySelector(s);
  const pct = (v) => Math.round(v * 100) + "%";
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
  let A, t, sortK = "mw", sortDir = -1, tbAll = false, play = null;

  window.PDP8_HOOKS.push({ init, update });

  function init(api) {
    A = api; t = api.t;
    const lede = document.createElement("section");
    lede.className = "lede card"; lede.id = "lede"; lede.setAttribute("aria-live", "polite");
    $("#kpis").before(lede);
    const bar = document.createElement("div");
    bar.className = "viewbar";
    bar.innerHTML = `<div class="seg" role="tablist" aria-label="${t("view_al")}" id="viewtabs">
        <button type="button" role="tab" data-view="map">${t("view_map")}</button><button type="button" role="tab" data-view="table">${t("view_table")}</button></div>
      <div class="acts">${PUBLIC ? `<button type="button" class="act" id="copylink">${t("copy")}</button><button type="button" class="act" id="csv">${t("csv")}</button>`
        : `<a class="act" href="${SITE}" target="_blank" rel="noopener">${t("pub_only")} ↗</a>`}<button type="button" class="act" id="tourbtn">${t("tour")}</button></div>`;
    $(".main").before(bar);
    const tc = document.createElement("section");
    tc.className = "card tablecard"; tc.id = "tablecard"; tc.hidden = true;
    $(".main").after(tc);
    $(".codcard h2").insertAdjacentHTML("afterend", `<button type="button" class="act play" id="play" aria-pressed="false"></button>`);
    wire();
    if (!navigator.webdriver && !store.get("pdp8-tour")) setTimeout(() => tour(0), 900);
  }

  function update(F, scoped) {
    const S = A.S;
    renderLede(F);
    document.querySelectorAll("#viewtabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === S.view)));
    $(".main").hidden = S.view === "table";
    $("#tablecard").hidden = S.view !== "table";
    if (S.view === "table") renderTable(rowsOf(F, scoped));
    $("#play").innerHTML = play ? `■ ${t("stop")}` : `▶ ${t("play")}`;
    $("#play").setAttribute("aria-pressed", String(!!play));
  }
  // same set the KPIs describe: the selected backer's projects, else the filtered projects in scope
  const rowsOf = (F, scoped) => (A.S.backer ? F.filter((p) => p[A.GK()] === A.S.backer) : scoped);

  /* ---------- editorial lede + target bars (national, current filters) ---------- */
  function renderLede(F) {
    const S = A.S, mw = (tech) => A.sum(F.filter((p) => p.tech === tech));
    const w = mw("Wind"), s = mw("Solar");
    const line = S.tech === "Wind" ? t("lede_w", { mw: A.mwTxt(w), p: pct(w / TARGET.Wind[1]) })
      : S.tech === "Solar" ? t("lede_s", { mw: A.mwTxt(s), p: pct(s / TARGET.Solar[1]) })
        : t("lede_all", { w: A.mwTxt(w), s: A.mwTxt(s), pw: pct(w / TARGET.Wind[1]), ps: pct(s / TARGET.Solar[1]) });
    const bars = [["Wind", w], ["Solar", s]].filter(([k]) => S.tech === "all" || S.tech === k).map(([k, v]) => {
      const [lo, hi] = TARGET[k], mx = Math.max(hi, v) * 1.04, x = (n) => (n / mx) * 100;
      const cls = k === "Wind" ? "w" : "s";
      return `<div class="tg"><div class="tg-h"><span><i class="tdot ${cls}"></i>${t(k === "Wind" ? "tg_wind" : "tg_solar")}</span>
          <span class="num" title="${t("tg_of", { lo: pct(v / lo), hi: pct(v / hi) })}"><b>${A.mwTxt(v)}</b></span></div>
        <div class="tg-tr" role="img" aria-label="${t(k === "Wind" ? "tg_wind" : "tg_solar")}: ${A.mwTxt(v)}; ${t("tg_range")} ${A.mwTxt(lo)}–${A.mwTxt(hi)}">
          <span class="tg-rng" style="left:${x(lo)}%;width:${x(hi) - x(lo)}%"></span><i class="tg-v ${cls}" style="width:${x(v)}%"></i>
          <span class="tg-tk" style="left:${x(lo)}%"></span><span class="tg-tk" style="left:${x(hi)}%"></span></div>
        <div class="tg-ax num"><span style="left:${x(lo)}%">${t("tg_low")} ${A.mwTxt(lo)}</span><span class="hi" style="left:${x(hi)}%">${t("tg_high")} ${A.mwTxt(hi)}</span></div></div>`;
    }).join("");
    $("#lede").innerHTML = `<div class="lede-txt"><span class="kick">${t("lede_k")}</span><p class="find">${line}</p></div>
      <div class="lede-bars">${bars}</div><details class="lede-note"><summary>${t("tg_about")}</summary>${t("tg_note")}</details>`;
  }

  /* ---------- table view + CSV ---------- */
  const COLS = ["id", "name", "prov", "tech", "mw", "stage", "cod", "inv", "group", "label"];
  const cell = (p, k) => (k === "stage" ? A.tr("stage", p.stage) : k === "tech" ? t(p.tech) : k === "label" ? A.tr("label", p.label) : p[k] ?? "");
  const key = (p, k) => (k === "mw" ? p.mw : k === "cod" ? (p.codY || 9999) * 10 + (p.codQ || 0) : String(cell(p, k)).toLowerCase());
  const sorted = (rows) => rows.slice().sort((a, b) => { const x = key(a, sortK), y = key(b, sortK);
    return (x < y ? -1 : x > y ? 1 : 0) * sortDir || b.mw - a.mw; });
  const chip = (l) => `<span class="chip l-${(l || "").replace(/\s/g, "")}">${A.esc(A.tr("label", l) || "–")}</span>`;
  function renderTable(rows) {
    const list = sorted(rows), shown = tbAll ? list : list.slice(0, 100), esc = A.esc;
    const th = COLS.map((k) => `<th scope="col" aria-sort="${sortK === k ? (sortDir > 0 ? "ascending" : "descending") : "none"}"${k === "mw" ? ' class="r"' : ""}>
      <button type="button" data-sort="${k}" aria-label="${t("tb_sort", { c: t("col_" + k) })}">${t("col_" + k)}${sortK === k ? (sortDir > 0 ? " ↑" : " ↓") : ""}</button></th>`).join("");
    const tr = shown.map((p) => `<tr data-row="${esc(p.id)}" tabindex="0"><td class="num">${esc(p.id)}</td><td class="nm">${esc(p.name)}</td><td>${esc(p.prov)}</td>
      <td><i class="tdot ${p.tech === "Wind" ? "w" : "s"}"></i>${esc(t(p.tech))}</td><td class="num r">${A.fmt(p.mw)}</td><td>${esc(cell(p, "stage"))}</td><td class="num">${esc(p.cod || "–")}</td>
      <td class="nm">${esc(p.inv || "–")}</td><td class="nm">${p.group ? A.logo(p.group) + esc(p.group) : "–"}</td><td>${chip(p.label)}</td></tr>`).join("");
    $("#tablecard").innerHTML = `<div class="tb-h"><b>${t("tb_n", { n: A.fmt(list.length), mw: A.mwTxt(A.sum(list)) })}</b></div>
      <div class="tbwrap"><table class="tb"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>
      ${list.length > shown.length ? `<button type="button" class="more" id="tbmore">${t("tb_more", { n: A.fmt(list.length) })}</button>` : ""}`;
  }
  function csv() {
    const { S, D } = A, F = A.filtered();
    const rows = sorted(rowsOf(F, F.filter(A.inScope)));
    const cols = ["id", "name", "tbl", "prov", "pre", "region", "tech", "mw", "status", "stage", "syear", "cod", "codType", "inv", "ent", "parent", "ult", "group", "btype", "country", "fit", "label", "src"];
    const q = (v) => { v = Array.isArray(v) ? v.map((id) => (D.sources[id] ? `${id} ${D.sources[id][3]}` : id)).join(" | ") : String(v ?? "");
      return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const meta = [`# PDP8 Backer Map ${D.meta.version} (compiled ${D.meta.compiled}); projects named in ${D.meta.source}`,
      `# View: ${location.search || "all projects"} · ${rows.length} rows · exported ${new Date().toISOString().slice(0, 10)}`,
      "# Evidence labels: VERIFIED, PARTIAL, CLAIMED, UNVERIFIED, NOT FOUND. Internal working data: check the sources before reuse."];
    const body = [cols.join(","), ...rows.map((p) => cols.map((c) => q(p[c])).join(","))];
    const blob = new Blob(["﻿" + [...meta, ...body].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `pdp8-backers${S.backer || S.prov ? "-" + (S.prov || "group") : ""}-${rows.length}.csv`;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function copyLink(btn) {
    const done = () => { btn.textContent = t("copied"); setTimeout(() => { btn.textContent = t("copy"); }, 1600); };
    const fallback = () => { const i = document.createElement("input"); i.value = location.href; document.body.append(i); i.select();
      try { document.execCommand("copy"); done(); } catch { /* the address bar still holds the link */ } i.remove(); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, fallback); else fallback();
  }

  /* ---------- COD player: steps the COD-year filter through 2025-2030, then restores it ---------- */
  function togglePlay() {
    const S = A.S;
    if (play) { clearTimeout(play.id); S.cody = play.prev; $("#f-cody").value = S.cody; play = null; A.update(); return; }
    const years = [...new Set(A.P.map((p) => p.codY).filter((y) => y >= 2025 && y <= 2030))].sort();
    play = { prev: S.cody, i: 0 };
    const step = () => {
      if (!play) return;
      if (play.i >= years.length) { togglePlay(); return; }
      S.cody = String(years[play.i++]); S.project = null; $("#f-cody").value = S.cody; A.update();
      play.id = setTimeout(step, 1400);
    };
    step();
  }

  /* ---------- tour ---------- */
  const STEPS = [["#lede", "tour1"], ["#map", "tour2"], ["#wall", "tour3"]];
  function tour(i) {
    document.querySelectorAll(".tour-on").forEach((e) => e.classList.remove("tour-on"));
    $("#tourcard")?.remove();
    if (i >= STEPS.length || i < 0) { store.set("pdp8-tour", "1"); return; }
    if (STEPS[i][0] === "#map" && A.S.view === "table") { A.S.view = "map"; A.update(); }
    const el = $(STEPS[i][0]), [, k] = STEPS[i];
    el.classList.add("tour-on");
    const c = document.createElement("div");
    c.className = "tourcard"; c.id = "tourcard"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", t(k + "_h"));
    c.innerHTML = `<span class="kick num">${i + 1} / ${STEPS.length}</span><h4>${t(k + "_h")}</h4><p>${t(k)}</p>
      <div class="tour-b"><button type="button" class="act" data-tour="skip">${t("skip")}</button><button type="button" class="act pri" data-tour="next">${t(i === STEPS.length - 1 ? "done" : "next")}</button></div>`;
    document.body.append(c);
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const place = () => {
      const r = el.getBoundingClientRect(), cw = Math.min(320, innerWidth - 32);
      const inside = r.height > innerHeight * 0.6; // tall targets (the map) carry the card on their top edge
      const top = inside ? Math.max(r.top, 0) + 64 : (r.bottom + 12 + 190 < innerHeight ? r.bottom + 12 : Math.max(12, r.top - 202));
      c.style.width = cw + "px";
      c.style.left = Math.min(Math.max(16, r.left + (inside ? r.width - cw - 56 : 0)), innerWidth - cw - 16) + "px";
      c.style.top = top + scrollY + "px";
    };
    setTimeout(place, 420); place();
    c.querySelector(".pri").focus({ preventScroll: true });
    c.onclick = (e) => { const b = e.target.closest("[data-tour]"); if (b) tour(b.dataset.tour === "skip" ? -1 : i + 1); };
  }

  function wire() {
    document.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.view) { A.S.view = b.dataset.view; tbAll = false; A.update(); if (b.dataset.view === "map") A.frame(); return; }
      if (b.dataset.sort) { const k = b.dataset.sort; sortDir = sortK === k ? -sortDir : (k === "mw" ? -1 : 1); sortK = k; A.update(); return; }
      if (b.id === "tbmore") { tbAll = true; A.update(); return; }
      if (b.id === "csv") { csv(); return; }
      if (b.id === "copylink") { copyLink(b); return; }
      if (b.id === "play") { togglePlay(); return; }
      if (b.id === "tourbtn") tour(0);
    });
    const open = (row) => { A.S.view = "map"; A.selectProject(row.dataset.row); };
    $("#tablecard").addEventListener("click", (e) => { const r = e.target.closest("tr[data-row]"); if (r) open(r); });
    $("#tablecard").addEventListener("keydown", (e) => { const r = e.target.closest("tr[data-row]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(r); } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#tourcard")) tour(-1); });
  }
})();
