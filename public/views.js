// FicheDeMaire.fr — view renderers. Each returns into #app; all data fields are
// escaped (STD.esc) before insertion.
(function () {
  const V = (STD.views = {});
  const t = STD.t, esc = STD.esc, fmt = STD.fmt;

  // ── shared: live search widget ────────────────────────────────────────────
  function searchWidget(big) {
    return `<div class="searchbox${big ? " big" : ""}">
      <span class="ico">⌕</span>
      <input type="search" id="q" autocomplete="off" spellcheck="false" placeholder="${esc(t("home.search"))}" aria-label="${esc(t("home.search"))}">
      <div class="search-results" id="sr" hidden></div>
    </div>`;
  }
  function srRow(m, pick) {
    const debt = m.fin && m.fin.dettePerHab != null ? STD.fmt(m.fin.dettePerHab) + " €/hab" : "";
    return `<a href="/maire/${esc(m.path)}"${pick ? "" : " data-link"} data-insee="${esc(m.insee)}">
      <span class="sr-ic">⌂</span>
      <span class="sr-body">
        <span class="sr-nm">${esc(m.commune)} <span class="muted" style="font-weight:500">(${esc(m.dep)})</span></span>
        <span class="sr-sub">${esc(t("search.mayor"))} : ${esc(STD.mayorName(m))}${m.pop != null ? " · " + fmt(m.pop) + " " + t("search.hab") : ""}</span>
      </span>
      ${debt ? `<span class="sr-val">${esc(debt)}</span>` : ""}
    </a>`;
  }
  // `onPick(item)` — when supplied, selecting a result invokes the callback with
  // the chosen commune instead of navigating to its fiche (used by the comparator).
  function wireSearch(root, onPick) {
    const inp = root.querySelector("#q");
    const box = root.querySelector("#sr");
    if (!inp) return;
    let timer, active = -1, items = [];
    const close = () => { box.hidden = true; active = -1; };
    const choose = (item) => { if (!item) return; close(); inp.value = ""; onPick(item); };
    const run = async (q) => {
      if (!q.trim()) { close(); return; }
      try {
        const { results } = await STD.getJSON(`/api/search?q=${encodeURIComponent(q)}`);
        items = results;
        box.innerHTML = results.length ? results.map((m) => srRow(m, !!onPick)).join("") : `<div class="sr-none">${esc(t("search.none"))}</div>`;
        box.hidden = false; active = -1;
      } catch { close(); }
    };
    inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => run(inp.value), 140); });
    inp.addEventListener("keydown", (e) => {
      const links = [...box.querySelectorAll("a")];
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, links.length - 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); }
      else if (e.key === "Enter") {
        const idx = active >= 0 ? active : 0;
        if (!items[idx]) return;
        e.preventDefault();
        if (onPick) choose(items[idx]); else STD.go(`/maire/${items[idx].path}`);
        return;
      }
      else if (e.key === "Escape") { close(); return; }
      links.forEach((l, i) => l.classList.toggle("sr-active", i === active));
    });
    if (onPick) box.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-insee]");
      if (!a) return;
      e.preventDefault();
      choose(items.find((x) => x.insee === a.dataset.insee));
    });
    document.addEventListener("click", (e) => { if (!root.contains(e.target) || !e.target.closest(".searchbox")) close(); });
    setTimeout(() => inp.focus(), 60);
  }

  // ── shared comparator bits (used by /comparateur and the fiche panel) ───────
  // A donut ring showing a 0–100 similarity score.
  function scoreRing(pct, size) {
    const p = Math.max(0, Math.min(100, pct | 0));
    return `<span class="cmp-ring" style="--p:${p};--rs:${size || 46}px" role="img" aria-label="${p}% ${esc(t("cmp.match"))}"><span class="cmp-ring-n">${p}<i>%</i></span></span>`;
  }
  const AXBADGE = { demo: "cmp.badgeDemo", fin: "cmp.badgeFin", geo: "cmp.badgeGeo" };
  function cmpBadges(groups) {
    return ["demo", "fin", "geo"].filter((k) => groups && groups[k] != null)
      .map((k) => `<span class="cmp-badge cmp-b-${k}">${esc(t(AXBADGE[k]))} ${groups[k]}</span>`).join("");
  }
  // One similar-commune row (used in the comparator list and the fiche panel).
  function cmpItem(r) {
    const f = r.fin || {};
    const sub = [
      r.pop != null ? fmt(r.pop) + " " + t("search.hab") : null,
      f.dette != null ? fmt(f.dette) + " €/hab" : null,
      r.reg || r.depNom,
    ].filter(Boolean).join(" · ");
    return `<a class="cmp-item" href="/maire/${esc(r.path)}" data-link>
      ${scoreRing(r.score)}
      <span class="cmp-item-body">
        <span class="cmp-item-n">${esc(r.commune)} <em>(${esc(r.dep)})</em></span>
        <span class="cmp-item-sub">${esc(sub)}</span>
        <span class="cmp-badges">${cmpBadges(r.groups)}${r.km != null ? `<span class="cmp-badge cmp-b-km">↦ ${fmt(r.km)} km</span>` : ""}</span>
      </span>
      <span class="cmp-item-go" aria-hidden="true">›</span>
    </a>`;
  }

  function footerCredit() {
    return ""; // credit lives in the static footer
  }

  // ── HOME ──────────────────────────────────────────────────────────────────
  V.home = async (root) => {
    const stats = await STD.getJSON("/api/stats").catch(() => ({}));
    const st = (n, l) => `<div class="stat"><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`;
    root.innerHTML = `
    <section class="hero"><div class="wrap">
      <span class="eyebrow"><span class="echarpe"><i></i><i></i><i></i></span> FicheDeMaire.fr</span>
      <h1>${esc(t("home.h1"))}</h1>
      <p class="lead">${esc(t("home.lead"))}</p>
      ${searchWidget(true)}
      <p class="search-hint">${esc(t("home.searchHint"))} · <a href="#" id="rand">${esc(t("home.random"))} →</a></p>
      <div class="stats">
        ${st(fmt(stats.count || 34637), t("stat.communes"))}
        ${st((stats.womenPct != null ? stats.womenPct : 22.8) + " %", t("stat.femmes"))}
        ${st((stats.ageAvg != null ? stats.ageAvg : 59.4).toLocaleString(STD.loc()) + " " + t("cl.ans"), t("stat.age"))}
        ${st(fmt(34562), t("stat.suivi"))}
      </div>
    </div></section>

    <section class="block"><div class="wrap">
      <div class="sec-head"><h2>${esc(t("home.boardsTitle"))}</h2><a href="/classements" data-link>${esc(t("home.boardsCta"))}</a></div>
      <div class="tiles" id="home-tiles"><div class="skel" style="height:110px"></div><div class="skel" style="height:110px"></div><div class="skel" style="height:110px"></div></div>
    </div></section>

    <section class="block"><div class="wrap">
      <div class="sec-head"><h2>${esc(t("home.browseTitle"))}</h2><a href="/communes" data-link>${esc(t("home.browseCta"))}</a></div>
      <div class="dep-grid" id="home-deps"><div class="skel" style="height:76px"></div><div class="skel" style="height:76px"></div><div class="skel" style="height:76px"></div><div class="skel" style="height:76px"></div></div>
    </div></section>`;

    wireSearch(root);
    root.querySelector("#rand").addEventListener("click", async (e) => {
      e.preventDefault();
      try { const { deps } = await STD.getJSON("/api/deps"); const d = deps[Math.floor(Math.random() * deps.length)];
        const { communes } = await STD.getJSON(`/api/dep?dep=${encodeURIComponent(d.dep)}`);
        const c = communes[Math.floor(Math.random() * communes.length)]; STD.go(`/maire/${c.path}`);
      } catch {}
    });

    // boards teaser
    STD.getJSON("/api/boards").then((b) => {
      const tile = (href, ic, tt, ts) => `<a class="tile" href="${href}" data-link><div class="ti">${ic}</div><div class="tt">${esc(tt)}</div><div class="ts">${esc(ts)}</div></a>`;
      const top = b.dettePlus && b.dettePlus[0], sav = b.epargneTop && b.epargneTop[0], j = b.jeunes && b.jeunes[0];
      root.querySelector("#home-tiles").innerHTML =
        tile("/classements", "💶", t("cl.dettePlus"), top ? `${top.commune} · ${fmt(top.value)} €/hab` : "") +
        tile("/classements", "🐖", t("cl.epargneTop"), sav ? `${sav.commune} · ${sav.value} %` : "") +
        tile("/classements", "🎂", t("cl.jeunes"), j ? `${j.commune} · ${j.value} ${t("cl.ans")}` : "");
    }).catch(() => {});
    // department grid (first 12 by number)
    STD.getJSON("/api/deps").then(({ deps }) => {
      root.querySelector("#home-deps").innerHTML = deps.slice(0, 12).map(depCard).join("");
    }).catch(() => {});
  };

  function depCard(d) {
    return `<a class="dep-card" href="/communes?dep=${encodeURIComponent(d.dep)}" data-link>
      <span class="dep-code">${esc(d.dep)}</span>
      <span class="meta"><span class="nm">${esc(d.depNom)}</span><span class="sub">${fmt(d.count)} ${t("cl.hab").replace("hab.","communes")}</span></span>
    </a>`;
  }

  // ── COMMUNES (browse) ─────────────────────────────────────────────────────
  V.communes = async (root, m) => {
    const params = new URLSearchParams(location.search);
    const dep = params.get("dep");
    root.innerHTML = `<section class="block"><div class="wrap">
      <div class="sec-head"><h1>${esc(t("communes.h1"))}</h1></div>
      <p class="lead" style="margin-bottom:22px">${esc(t("communes.lead"))}</p>
      ${searchWidget(false)}
      <div id="browse" style="margin-top:26px"></div>
    </div></section>`;
    wireSearch(root);
    // deep-link search: /communes?q=… (used by the WebSite SearchAction JSON-LD)
    const q0 = params.get("q");
    if (q0) { const inp = root.querySelector("#q"); if (inp) { inp.value = q0; inp.dispatchEvent(new Event("input")); } }
    const browse = root.querySelector("#browse");
    if (dep) {
      browse.innerHTML = `<div class="spinner"></div>`;
      const { communes } = await STD.getJSON(`/api/dep?dep=${encodeURIComponent(dep)}`);
      const depNom = communes[0] ? communes[0].depNom : dep;
      browse.innerHTML = `<div class="sec-head" style="margin-top:6px"><h2>${esc(dep)} · ${esc(depNom)}</h2><a href="/communes" data-link>${esc(t("communes.back"))}</a></div>
        <p class="board-note">${esc(t("communes.count", { n: fmt(communes.length) }))}</p>
        <div class="com-list fade-in">${communes.map(comRow).join("")}</div>`;
    } else {
      browse.innerHTML = `<div class="sec-head" style="margin-top:6px"><h2>${esc(t("communes.pickDep"))}</h2></div><div class="dep-grid" id="deps"><div class="skel" style="height:76px"></div></div>`;
      const { deps } = await STD.getJSON("/api/deps");
      browse.querySelector("#deps").innerHTML = deps.map(depCard).join("");
    }
  };

  function comRow(m) {
    const f = m.fin || {};
    const dc = STD.desendetClass(f.desendet, f.epargneNegative);
    return `<a class="com-row" href="/maire/${esc(m.path)}" data-link>
      <span class="cbody">
        <span class="cn">${esc(m.commune)}</span>
        <span class="cs">${esc(t("search.mayor"))} : ${esc(STD.mayorName(m))}${m.pop != null ? " · " + fmt(m.pop) + " " + t("search.hab") : ""}</span>
      </span>
      <span class="cmetrics">
        <span class="com-metric com-dette"><span class="cm-l">${t("fiche.dettehab")}</span><span class="cm-l-s">${t("com.detteShort")}</span><b>${f.dettePerHab != null ? fmt(f.dettePerHab) + " €" : "—"}</b></span>
        <span class="com-metric com-ep"><span class="cm-l">${t("fiche.epargne")}</span><b>${f.tauxEpargne != null ? f.tauxEpargne + " %" : "—"}</b></span>
      </span>
    </a>`;
  }

  // ── COMPARATEUR ───────────────────────────────────────────────────────────
  // ── comparator indicator catalogue (client mirror of lib/similar.js IND) ────
  // Each axis groups a few atomic indicators; extended settings let the visitor
  // enable any subset instead of whole axes.
  const AXIS_INDS = { demo: ["pop", "age"], fin: ["dette", "ep", "des", "df", "perso"], geo: ["geo"] };
  const IND_AXIS = { pop: "demo", age: "demo", dette: "fin", ep: "fin", des: "fin", df: "fin", perso: "fin", geo: "geo" };
  const ALL_INDS = ["pop", "age", "dette", "ep", "des", "df", "perso", "geo"];
  const IND_LABEL = { pop: "cmp.indPop", age: "cmp.indAge", dette: "cmp.indDette", ep: "cmp.indEp", des: "cmp.indDes", df: "cmp.indDf", perso: "cmp.indPerso", geo: "cmp.indGeo" };
  const AXIS_LABEL = { demo: "cmp.axisDemo", fin: "cmp.axisFin", geo: "cmp.axisGeo" };

  V.comparateur = async (root) => {
    const params = new URLSearchParams(location.search);
    let refInsee = params.get("insee") || null;
    const SCOPES = ["france", "region", "dep", "metro", "radius"];
    const KM_STEPS = [10, 25, 50, 100];
    let scope = SCOPES.includes(params.get("scope")) ? params.get("scope") : "france";
    let radiusKm = KM_STEPS.includes(+params.get("radius")) ? +params.get("radius") : 25;

    // enabled indicators (extended settings). Default = every indicator; a custom
    // subset comes from ?inds= and auto-opens the advanced panel.
    let sel = new Set(ALL_INDS);
    const indsP = params.get("inds");
    if (indsP) { const s = indsP.split(",").filter((k) => IND_AXIS[k]); if (s.length) sel = new Set(s); }
    let advOpen = !!indsP;
    let lastData = null;

    root.innerHTML = `<section class="block"><div class="wrap">
      <div class="sec-head"><h1>${esc(t("cmp.h1"))}</h1></div>
      <p class="lead" style="margin-bottom:22px">${esc(t("cmp.lead"))}</p>
      <div id="cmp-pick"></div>
      <div id="cmp-body"></div>
    </div></section>`;
    const pickEl = root.querySelector("#cmp-pick");
    const bodyEl = root.querySelector("#cmp-body");

    // shareable URL without a full re-render
    const syncUrl = () => {
      const q = [];
      if (refInsee) q.push("insee=" + refInsee);
      if (sel.size < ALL_INDS.length) q.push("inds=" + ALL_INDS.filter((k) => sel.has(k)).join(","));
      if (sel.has("geo") && scope !== "france") { q.push("scope=" + scope); if (scope === "radius") q.push("radius=" + radiusKm); }
      history.replaceState({}, "", STD.localized("/comparateur" + (q.length ? "?" + q.join("&") : ""), STD.lang));
    };

    async function pickRandom() {
      try {
        const { deps } = await STD.getJSON("/api/deps");
        const d = deps[Math.floor(Math.random() * deps.length)];
        const { communes } = await STD.getJSON(`/api/dep?dep=${encodeURIComponent(d.dep)}`);
        const c = communes[Math.floor(Math.random() * communes.length)];
        selectRef(c.insee);
      } catch {}
    }
    function renderPicker() {
      pickEl.innerHTML = `<div class="cmp-picker">
        <div class="cmp-pick-h">${esc(t("cmp.pick"))}</div>
        <p class="muted" style="margin:2px 0 14px;font-size:14px">${esc(t("cmp.pickSub"))}</p>
        ${searchWidget(false)}
        <p class="search-hint"><a href="#" id="cmp-rand">${esc(t("cmp.random"))} →</a></p>
      </div>`;
      wireSearch(pickEl, (item) => selectRef(item.insee));
      pickEl.querySelector("#cmp-rand").addEventListener("click", (e) => { e.preventDefault(); pickRandom(); });
    }
    function selectRef(insee) { refInsee = insee; syncUrl(); renderResults(); }

    // Master axis toggle. Reflects the current indicator selection: fully on (✓),
    // partial (–, some but not all of its indicators enabled) or off. Disabled when
    // the reference supports none of the axis's indicators (e.g. no OFGL finances).
    function axisToggle(key, avail) {
      const map = { demo: ["cmp.axisDemo", "cmp.axisDemoSub"], fin: ["cmp.axisFin", "cmp.axisFinSub"], geo: ["cmp.axisGeo", "cmp.axisGeoSub"] };
      const [lab, sub] = map[key];
      const usable = AXIS_INDS[key].filter((k) => avail[k]);
      const disabled = usable.length === 0;
      const on = usable.filter((k) => sel.has(k));
      const someOn = on.length > 0, allOn = usable.length > 0 && on.length === usable.length;
      const mark = disabled ? "" : allOn ? "✓" : someOn ? "–" : "";
      return `<button class="cmp-toggle cmp-t-${key}${someOn ? " on" : ""}${someOn && !allOn ? " partial" : ""}${disabled ? " disabled" : ""}" data-ax="${key}"${disabled ? " disabled" : ""} aria-pressed="${someOn}">
        <span class="cmp-tk"><span class="cmp-tick">${mark}</span>${esc(t(lab))}</span>
        <span class="cmp-ts">${esc(t(sub))}</span>
      </button>`;
    }

    // Extended settings — per-indicator chips, grouped by axis. A chip is disabled
    // when the reference lacks that indicator (its feature is missing).
    function advPanel(avail) {
      const group = (ax) => {
        const chips = AXIS_INDS[ax].map((k) => {
          const dis = !avail[k], on = sel.has(k) && !dis;
          return `<button class="cmp-chip cmp-c-${ax}${on ? " on" : ""}${dis ? " disabled" : ""}" data-ind="${k}"${dis ? " disabled" : ""} aria-pressed="${on}"><span class="cmp-chip-tick">${on ? "✓" : ""}</span>${esc(t(IND_LABEL[k]))}</button>`;
        }).join("");
        return `<div class="cmp-ind-group cmp-g-${ax}"><span class="cmp-ind-h">${esc(t(AXIS_LABEL[ax]))}</span><div class="cmp-chips">${chips}</div></div>`;
      };
      return `<div class="cmp-adv fade-in"><p class="cmp-adv-sub">${esc(t("cmp.advSub"))}</p>${group("demo")}${group("fin")}${group("geo")}</div>`;
    }

    // Geographic amplitude — the sub-parameter of the "geography" axis. Restricts
    // the candidate pool to a scope around the reference (region / department /
    // métropole / X-km radius). `data.scope` is the server's EFFECTIVE scope (may
    // have fallen back to france if unavailable), `data.scopeAvail` gates options.
    function scopeControl(data) {
      const av = data.scopeAvail || {};
      const segs = [["france", "cmp.scopeFrance"], ["region", "cmp.scopeRegion"], ["dep", "cmp.scopeDep"], ["metro", "cmp.scopeMetro"], ["radius", "cmp.scopeRadius"]]
        .map(([k, lab]) => {
          const dis = av[k] === false;
          return `<button class="cmp-seg${data.scope === k ? " on" : ""}${dis ? " disabled" : ""}" data-scope="${k}"${dis ? " disabled" : ""}>${esc(t(lab))}</button>`;
        }).join("");
      const km = `<div class="cmp-radius"${data.scope === "radius" ? "" : " hidden"}>${KM_STEPS.map((k) => `<button class="cmp-km${radiusKm === k ? " on" : ""}" data-km="${k}">${k} km</button>`).join("")}</div>`;
      const count = `<p class="cmp-scope-count">${esc(t("cmp.inScope", { n: fmt(data.inScopeCount) }))}</p>`;
      return `<div class="cmp-scope">
        <span class="cmp-scope-h">${esc(t("cmp.scopeTitle"))}</span>
        <div class="cmp-seg-row">${segs}</div>
        ${km}
        ${count}
      </div>`;
    }

    // Fetch the ranking for the current selection, then paint. `refetch:false`
    // repaints from the cached last response (used when only toggling the advanced
    // panel open/closed — no selection change, so no network round-trip / spinner).
    async function renderResults(o = {}) {
      if (!refInsee) { renderPicker(); bodyEl.innerHTML = ""; return; }
      pickEl.innerHTML = "";
      let data = lastData;
      if (o.refetch !== false || !data) {
        bodyEl.innerHTML = `<div class="wrap" style="padding:30px 0"><div class="spinner"></div></div>`;
        const enabled = ALL_INDS.filter((k) => sel.has(k));
        const scopeQ = sel.has("geo") && scope !== "france" ? `&scope=${scope}${scope === "radius" ? `&radius=${radiusKm}` : ""}` : "";
        try { data = await STD.getJSON(`/api/similar?insee=${encodeURIComponent(refInsee)}&inds=${enabled.join(",") || "pop"}&limit=12${scopeQ}`); }
        catch { bodyEl.innerHTML = `<p class="board-note">${esc(t("cmp.empty"))}</p>`; return; }
        lastData = data;
        scope = data.scope; // adopt the server's effective scope (handles fallback)
      }
      paint(data);
    }

    function paint(data) {
      const ref = data.ref, avail = data.indsAvail || {}, eff = data.axes, refHasFin = !!(ref.fin);

      const refSub = [
        ref.pop != null ? fmt(ref.pop) + " " + t("search.hab") : null,
        ref.fin && ref.fin.dette != null ? fmt(ref.fin.dette) + " €/hab" : null,
        ref.reg || ref.depNom,
      ].filter(Boolean).join(" · ");

      bodyEl.innerHTML = `
      <div class="cmp-ref fade-in">
        <div class="cmp-ref-l">
          <span class="cmp-ref-k">${esc(t("cmp.refTitle"))}</span>
          <span class="cmp-ref-n">${esc(ref.commune)} <em>(${esc(ref.dep)})</em></span>
          <span class="cmp-ref-sub">${esc(refSub)}</span>
        </div>
        <button class="btn btn-ghost" id="cmp-change">↺ ${esc(t("cmp.change"))}</button>
      </div>

      <div class="cmp-axes">
        <div class="cmp-axes-top">
          <span class="cmp-axes-h">${esc(t("cmp.axesTitle"))}</span>
          <button class="cmp-adv-toggle${advOpen ? " open" : ""}" id="cmp-adv-btn" aria-expanded="${advOpen}">⚙ ${esc(t(advOpen ? "cmp.advClose" : "cmp.advOpen"))}</button>
        </div>
        <div class="cmp-toggles">
          ${axisToggle("demo", avail)}
          ${axisToggle("fin", avail)}
          ${axisToggle("geo", avail)}
        </div>
        ${advOpen ? advPanel(avail) : ""}
        ${eff.geo ? scopeControl(data) : ""}
      </div>
      ${!refHasFin ? `<div class="note" style="margin-top:12px"><span class="ni">ⓘ</span><span>${esc(t("cmp.noFinNote"))}</span></div>` : ""}

      <div class="sec-head" style="margin-top:26px"><h2>${esc(t("cmp.resultsTitle"))}</h2></div>
      <p class="board-note">${esc(t("cmp.resultsSub", { n: data.results.length }))}</p>
      <div class="cmp-results fade-in">${data.results.length ? data.results.map(cmpItem).join("") : `<p class="board-note">${esc(t("cmp.empty"))}</p>`}</div>

      ${data.results.length ? comparisonTable(ref, data.results.slice(0, 6)) : ""}

      <div class="note cmp-note"><span class="ni">ⓘ</span><span>${esc(t("cmp.note"))}</span></div>`;

      bodyEl.querySelector("#cmp-change").addEventListener("click", () => { refInsee = null; lastData = null; syncUrl(); bodyEl.innerHTML = ""; renderPicker(); window.scrollTo({ top: 0, behavior: "smooth" }); });

      // advanced panel is purely presentational — toggle without refetching
      bodyEl.querySelector("#cmp-adv-btn").addEventListener("click", () => { advOpen = !advOpen; renderResults({ refetch: false }); });

      // master axis toggle → flip every usable indicator of that axis at once
      bodyEl.querySelectorAll(".cmp-toggle:not(.disabled)").forEach((b) => b.addEventListener("click", () => {
        const ax = b.dataset.ax;
        const usable = AXIS_INDS[ax].filter((k) => avail[k]);
        const anyOn = usable.some((k) => sel.has(k));
        const next = new Set(sel);
        usable.forEach((k) => (anyOn ? next.delete(k) : next.add(k)));
        if (next.size === 0) return;               // never zero criteria
        sel = next;
        if (!sel.has("geo")) scope = "france";      // amplitude is a geography sub-parameter
        syncUrl(); renderResults();
      }));

      // per-indicator chip → flip a single indicator
      bodyEl.querySelectorAll(".cmp-chip:not(.disabled)").forEach((b) => b.addEventListener("click", () => {
        const k = b.dataset.ind;
        const next = new Set(sel);
        next.has(k) ? next.delete(k) : next.add(k);
        if (next.size === 0) return;               // never zero criteria
        sel = next;
        if (!sel.has("geo")) scope = "france";
        syncUrl(); renderResults();
      }));

      bodyEl.querySelectorAll(".cmp-seg:not(.disabled)").forEach((b) => b.addEventListener("click", () => {
        scope = b.dataset.scope; syncUrl(); renderResults();
      }));
      bodyEl.querySelectorAll(".cmp-km").forEach((b) => b.addEventListener("click", () => {
        radiusKm = +b.dataset.km; scope = "radius"; syncUrl(); renderResults();
      }));
    }

    renderResults();
  };

  // Side-by-side comparison grid: reference row (highlighted) + closest peers.
  // Wrapped in an overflow-x container so the wide grid scrolls on narrow screens.
  function comparisonTable(ref, results) {
    const money = (v) => (v != null ? fmt(v) + " €" : "—");
    const epCell = (f) => {
      if (!f || f.ep == null) return "—";
      const c = STD.epargneClass(f.ep);
      return `<b class="cmp-v-${c.cls}">${f.ep} %</b>`;
    };
    const desCell = (f) => {
      if (!f) return "—";
      const c = STD.desendetClass(f.des, f.epn);
      const val = f.epn ? t("fiche.negEp") : (f.des != null ? f.des + " " + t("cl.years") : "—");
      return `<b class="cmp-v-${c.cls}">${esc(val)}</b>`;
    };
    const row = (r, isRef) => {
      const f = r.fin || {};
      return `<tr class="${isRef ? "cmp-row-ref" : ""}">
        <td class="cmp-td-name">${isRef ? "" : `<a href="/maire/${esc(r.path)}" data-link>`}<span class="cmp-tn">${esc(r.commune)} <em>(${esc(r.dep)})</em></span>${isRef ? `<span class="cmp-tref-tag">${esc(t("cmp.ref"))}</span>` : ""}${isRef ? "" : "</a>"}</td>
        <td class="cmp-td-num">${isRef ? "—" : `<span class="cmp-mini">${r.score}<i>%</i></span>`}</td>
        <td class="cmp-td-num">${isRef ? "—" : (r.km != null ? fmt(r.km) + " km" : "—")}</td>
        <td class="cmp-td-num">${r.pop != null ? fmt(r.pop) : "—"}</td>
        <td class="cmp-td-num">${money(f.dette)}</td>
        <td class="cmp-td-num">${epCell(f)}</td>
        <td class="cmp-td-num">${desCell(f)}</td>
        <td class="cmp-td-reg">${esc(r.reg || r.depNom || "—")}</td>
      </tr>`;
    };
    const th = (k, cls) => `<th class="${cls || ""}">${esc(t(k))}</th>`;
    return `<div class="panel cmp-table-panel">
      <h2>${esc(t("cmp.tableTitle"))}</h2>
      <div class="psub">${esc(t("cmp.tableSub"))}</div>
      <div class="cmp-table-wrap">
        <table class="cmp-table">
          <thead><tr>
            ${th("cmp.colCommune", "cmp-td-name")}${th("cmp.match", "cmp-td-num")}${th("cmp.colDist", "cmp-td-num")}${th("cmp.colPop", "cmp-td-num")}
            ${th("cmp.colDette", "cmp-td-num")}${th("cmp.colEpargne", "cmp-td-num")}${th("cmp.colDesendet", "cmp-td-num")}${th("cmp.colReg", "cmp-td-reg")}
          </tr></thead>
          <tbody>${row(ref, true)}${results.map((r) => row(r, false)).join("")}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ── FICHE ─────────────────────────────────────────────────────────────────
  V.fiche = async (root, mm) => {
    const key = mm[2] ? `${mm[1]}/${mm[2]}` : mm[1];
    const f = await STD.getJSON(`/api/fiche/${key}`);
    const fin = f.finances;
    const r = fin && fin.ratios;

    // mandate history (renewal + previous holders) — see lib/history.json
    const H = f.hist || {};
    const renewed = !!H.renewed;
    const sinceISO = H.since || f.foncStart;                 // best "maire depuis"
    const veteran = !!(sinceISO && sinceISO.slice(0, 4) < "2026");

    // ratio badges
    let ratiosHtml = "";
    if (r) {
      const dc = STD.desendetClass(r.desendet, r.epargneNegative);
      const ec = STD.epargneClass(r.tauxEpargne);
      const ratio = (cls, label, value, unit, tag, sub) => `<div class="ratio ${cls}">
        <div class="rl">${esc(label)}</div>
        <div class="rv">${value}${unit ? `<small> ${esc(unit)}</small>` : ""}</div>
        ${tag ? `<span class="rtag">${esc(tag)}</span>` : ""}
      </div>`;
      const desVal = r.epargneNegative ? "—" : (r.desendet != null ? r.desendet.toLocaleString(STD.loc()) : "—");
      ratiosHtml = `<div class="ratios">
        ${ratio(dc.cls, t("fiche.desendet"), desVal, r.epargneNegative ? "" : t("fiche.years"), dc.tag)}
        ${ratio(ec.cls, t("fiche.epargne"), r.tauxEpargne != null ? r.tauxEpargne : "—", r.tauxEpargne != null ? "%" : "", ec.tag)}
        ${ratio("neutral", t("fiche.dettehab"), r.dettePerHab != null ? fmt(r.dettePerHab) : "—", "€", "")}
        ${(() => { const pc = STD.persoClass(r.partPerso, f.pop); return ratio(pc.cls, t("fiche.perso"), r.partPerso != null ? r.partPerso : "—", r.partPerso != null ? "%" : "", pc.tag); })()}
      </div>`;
    }

    // charts
    let chartsHtml = "";
    if (fin && fin.series) {
      const s = fin.series;
      const years = (s.dette || s.eb || s.rf || []);
      const yFrom = years.length ? years[0].y : "", yTo = years.length ? years[years.length - 1].y : "";
      // `sub` is app-controlled static HTML (a small legend) — safe to inline.
      const block = (title, sub, svg) => `<div class="chart-block"><div class="chart-title"><span class="ct">${esc(title)}</span><span class="cv">${sub || ""}</span></div>${svg}</div>`;
      // "Qui gouvernait ?" — the holder of each municipal term behind these accounts
      const msRow = (per, name, meta, cls = "") => `<div class="ms-row ${cls}">
        <span class="ms-per">${esc(per)}</span>
        <span class="ms-body"><span class="ms-who${name ? "" : " none"}">${esc(name || t("mnd.unknown"))}</span>${meta ? `<span class="ms-meta">${esc(meta)}</span>` : ""}</span></div>`;
      const stripHtml = `<div class="mnd-strip"><div class="ms-h">${esc(t("mnd.stripTitle"))}</div>
        ${msRow("2014–2020", H.t2014 && H.t2014.name, H.t2014 ? t("mnd.viaWikidata") : "")}
        ${msRow("2020–2026", H.t2020 && H.t2020.name, renewed ? t("mnd.renewed2026") : "")}
        ${msRow(t("mnd.current"), STD.mayorName(f), t("fiche.mandat").toLowerCase() + " " + dateFmt(f.foncStart), "cur")}</div>`;
      chartsHtml = `<div class="panel"><h2>${esc(t("fiche.trendTitle"))}</h2><div class="psub">${esc(t("fiche.trendSub", { from: yFrom, to: yTo }))}</div>
        ${stripHtml}
        <div class="mnd-key"><span class="mk-sw"></span><span>${esc(t("mnd.legend"))}</span></div>
        ${s.dette ? block(t("chart.dette"), "", STD.lineChart(s.dette, "#c9302c")) : ""}
        ${s.eb ? block(t("chart.epargne"), "", STD.barChart(s.eb, "#18753c")) : ""}
        ${s.rf && s.df ? block(t("chart.fonct"), `<span class="lg"><i style="background:#000091"></i>${t("legend.rf")}</span><span class="lg"><i style="background:repeating-linear-gradient(90deg,#8a8a94 0 4px,transparent 4px 7px)"></i>${t("legend.df")}</span>`, STD.dualLine(s.rf, s.df, "#000091", "#8a8a94")) : ""}
        ${s.equip ? block(t("chart.equip"), "", STD.lineChart(s.equip, "#b8860b")) : ""}
        <div class="note mnd-note"><span class="ni">ⓘ</span><span>${esc(t("mnd.note"))}</span></div>
      </div>`;
    }

    // ── DECP (v2) — "Où va l'argent ?" money-trail panel (self-contained) ──
    let decpHtml = "";
    if (f.decp && f.decp.count) {
      const dp = f.decp;
      const plur = (n) => (STD.lang === "fr" ? (n > 1 ? "s" : "") : (n === 1 ? "" : "s"));
      const period = dp.years ? " · " + t("decp.period", { from: dp.years[0], to: dp.years[1] }) : "";
      const supRows = (dp.suppliers || []).map((s, i) => `
        <div class="rank-row">
          <span class="pos">${i + 1}</span>
          <span class="who"><span class="nm">${esc(s.name)}</span>
            <span class="sub">${esc(t("decp.contracts", { n: fmt(s.count), s: plur(s.count) }))}</span></span>
          <span class="val">${esc(STD.euro(s.total))}</span>
        </div>`).join("");
      const marRows = (dp.marches || []).map((mo) => `
        <div class="decp-marche">
          <div class="dm-top"><span class="dm-obj">${esc(mo.objet)}</span><span class="dm-amt">${esc(STD.euro(mo.montant))}</span></div>
          <div class="dm-sub">${esc(mo.titulaire)}${mo.date ? " · " + esc(dateFmt(mo.date)) : ""}</div>
        </div>`).join("");
      decpHtml = `<div class="panel decp-panel">
        <h2>${esc(t("decp.title"))}</h2>
        <div class="psub">${esc(t("decp.sub"))}</div>
        <div class="metric-grid">
          <div class="metric"><div class="ml">${esc(t("decp.total"))}${esc(period)}</div><div class="mv">${fmt(dp.total)}<small> €</small></div></div>
          <div class="metric"><div class="ml">${esc(t("decp.marches"))}</div><div class="mv">${fmt(dp.count)}</div></div>
        </div>
        ${supRows ? `<div class="decp-sec">${esc(t("decp.suppliers"))} <span>${esc(t("decp.suppliersSub"))}</span></div>
        <div class="decp-suppliers">${supRows}</div>` : ""}
        ${marRows ? `<div class="decp-sec">${esc(t("decp.biggest"))} <span>${esc(t("decp.biggestSub"))}</span></div>
        <div class="decp-marches">${marRows}</div>` : ""}
        <div class="note"><span class="ni">ⓘ</span><span>${esc(t("decp.note"))}</span></div>
      </div>`;
    }

    // finances panel: title + per-hab metric grid
    let metricHtml = "";
    if (r) {
      const met = (l, v) => `<div class="metric"><div class="ml">${esc(l)}</div><div class="mv">${v != null ? fmt(v) : "—"}<small> €</small></div></div>`;
      metricHtml = `<div class="panel"><h2>${esc(t("fiche.finTitle"))}</h2>
        <div class="psub">${esc(t("fiche.finSub", { year: fin.latest }))}</div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">${esc(t("fiche.perhab", { year: fin.latest }))}</div>
        <div class="metric-grid">
          ${met(t("m.rf"), r.rfPerHab)}${met(t("m.df"), r.dfPerHab)}${met(t("m.eb"), r.ebPerHab)}
          ${met(t("m.equip"), r.equipPerHab)}${met(t("m.perso"), r.persoPerHab)}${met(t("m.dette"), r.dettePerHab)}
        </div></div>`;
    }

    // ── Responsabilités & rattachements (advanced view) ─────────────────────
    // Consolidates elective mandates (RNE), the commune's intercommunality
    // (BANATIC) and — where the mayor files with HATVP — the seats they declare
    // on external bodies (SEM/SPL/EPIC/offices/associations). Factual, sourced.
    const perFmt = (p) => {
      if (!p) return "";
      if (p.deb && p.fin) return `${esc(p.deb)} → ${esc(p.fin)}`;
      if (p.deb) return esc(t("resp.since", { d: p.deb }));
      if (p.fin) return `→ ${esc(p.fin)}`;
      return "";
    };
    const respRow = (main, sub, per) =>
      `<div class="resp-item"><span class="resp-mk">▪</span><span class="resp-lbl">${main}${sub ? `<span class="resp-sub">${sub}</span>` : ""}</span>${per ? `<span class="resp-per">${per}</span>` : ""}</div>`;
    const respSec = (title, sub, body, src) =>
      `<div class="resp-sec"><div class="resp-sech">${esc(title)}</div>${sub ? `<p class="resp-secsub">${esc(sub)}</p>` : ""}<div class="resp-list">${body}</div>${src ? `<div class="resp-src">${esc(src)}</div>` : ""}</div>`;

    const hv = f.hatvp;
    const sieges = (hv && hv.sieges) || [];
    const benevole = (hv && hv.benevoleList) || [];
    const activites = (hv && hv.activitesList) || [];
    const hasResp = (f.cumul && f.cumul.length) || f.epci || sieges.length || benevole.length || activites.length || hv;

    let respBody = "";
    if (f.cumul && f.cumul.length)
      respBody += respSec(t("resp.mandates"), null,
        f.cumul.map((c) => respRow(esc(c.label))).join(""), t("resp.mandatesSrc"));
    if (f.epci)
      respBody += respSec(t("resp.inter"), t("resp.interSub"),
        respRow(esc(f.epci.nom), esc(f.epci.natureLabel)));
    if (sieges.length)
      respBody += respSec(t("resp.sieges"), t("resp.siegesSub"),
        sieges.map((s) => respRow(esc(s.soc || s.act), (s.soc && s.act) ? esc(s.act) : "", perFmt(s))).join(""));
    if (benevole.length)
      respBody += respSec(t("resp.benevole"), null,
        benevole.map((s) => respRow(esc(s.soc || s.act), (s.soc && s.act) ? esc(s.act) : "")).join(""));
    if (activites.length)
      respBody += respSec(t("resp.activites"), null,
        activites.map((s) => respRow(esc(s.act || s.soc), (s.act && s.soc) ? esc(s.soc) : "", perFmt(s))).join(""));

    const hatvpFoot = hv ? `<div class="resp-foot">
      <p class="resp-cov"><span class="ni">ⓘ</span> ${esc(t("resp.coverage"))}</p>
      <div class="resp-footrow">${hv.dateDepot ? `<span class="resp-filed">${esc(t("hatvp.filed", { date: hv.dateDepot }))}</span>` : "<span></span>"}
        <a href="${esc(hv.url)}" target="_blank" rel="noopener">${esc(t("hatvp.link"))}</a></div></div>` : "";

    const respHtml = hasResp ? `<div class="panel resp-panel">
      <h2>${esc(t("resp.title"))}</h2>
      <p class="psub" style="margin-bottom:18px">${esc(t("resp.sub"))}</p>
      ${respBody || `<p class="resp-empty">${esc(t("resp.empty"))}</p>`}
      ${hatvpFoot}</div>` : "";

    // ── L'élection municipale 2026 (participation + liste arrivée en tête) ───
    // Ministère de l'Intérieur per-commune results. Turnout is near-universal;
    // the political nuance is only attributed to list-scrutin communes (≥ 1 000
    // hab.) — its absence is declared per fiche with the reason.
    const pctT = (v) => (v == null ? "—" : v.toLocaleString(STD.loc(), { maximumFractionDigits: 1 }) + " %");
    let electionHtml = "";
    {
      const e = f.election;
      if (e) {
        const tiles = `<div class="metric-grid">
          <div class="metric"><div class="ml">${esc(t("elec.turnout"))}</div><div class="mv">${pctT(e.votantsPct)}</div></div>
          <div class="metric"><div class="ml">${esc(t("elec.abstention"))}</div><div class="mv">${pctT(e.abstentionPct)}</div></div>
          <div class="metric"><div class="ml">${esc(t("elec.registered"))}</div><div class="mv">${fmt(e.inscrits)}</div></div>
        </div>`;
        let leadHtml = "";
        if (e.listLabel) {
          const bits = [];
          if (e.pctExp != null) bits.push(t("elec.ofExpressed", { pct: pctT(e.pctExp) }));
          if (e.seats != null && e.totalSeats != null) bits.push(t("elec.seatsWon", { n: e.seats, total: e.totalSeats }));
          if (e.marginPts != null) bits.push(t("elec.margin", { pts: e.marginPts.toLocaleString(STD.loc(), { maximumFractionDigits: 1 }) }));
          leadHtml = `<div class="elec-lead">
            <div class="elec-lead-h">${esc(t("elec.leadTitle"))}</div>
            <div class="elec-list">${esc(e.listLabel)}${e.nuanceLabel ? ` <span class="chip nuance-chip">${esc(e.nuanceLabel)}</span>` : ""}</div>
            ${bits.length ? `<div class="elec-meta">${bits.map((b) => `<span>${esc(b)}</span>`).join('<span class="sep">·</span>')}</div>` : ""}
          </div>`;
        }
        let nuanceNote = "";
        if (!e.nuance) {
          const small = (f.pop != null && f.pop < 1000);
          nuanceNote = `<p class="resp-cov"><span class="ni">ⓘ</span> ${esc(small ? t("elec.noNuanceSmall") : t("elec.noNuanceOther"))}</p>`;
        }
        const roundStr = e.tour === 2 ? t("elec.round2") : t("elec.round1");
        electionHtml = `<div class="panel elec-panel">
          <h2>${esc(t("elec.title"))}</h2>
          <p class="psub" style="margin-bottom:16px">${esc(t("elec.sub", { round: roundStr }))}</p>
          ${tiles}
          ${leadHtml}
          ${nuanceNote}
          <div class="resp-src">${esc(t("elec.src"))}</div>
        </div>`;
      } else {
        electionHtml = `<div class="panel elec-panel">
          <h2>${esc(t("elec.title"))}</h2>
          <p class="resp-cov"><span class="ni">ⓘ</span> ${esc(t("elec.none"))}</p>
        </div>`;
      }
    }

    // ── Le conseil municipal (composition — RNE conseillers municipaux) ──────
    // Full-coverage register: council size, women/men balance, age structure and
    // number of deputy mayors of the team installed after the 2026 election.
    let councilHtml = "";
    {
      const c = f.council;
      if (c) {
        const tiles = `<div class="metric-grid">
          <div class="metric"><div class="ml">${esc(t("council.size"))}</div><div class="mv">${fmt(c.size)}</div></div>
          <div class="metric"><div class="ml">${esc(t("council.adjoints"))}</div><div class="mv">${fmt(c.adjoints)}</div></div>
          <div class="metric"><div class="ml">${esc(t("council.ageAvg"))}</div><div class="mv">${c.ageAvg != null ? c.ageAvg.toLocaleString(STD.loc()) : "—"}<small> ${esc(t("cl.ans"))}</small></div></div>
        </div>`;
        let parity = "";
        if (c.womenPct != null) {
          const wp = c.womenPct;
          parity = `<div class="council-parity">
            <div class="cp-h">${esc(t("council.parity"))}</div>
            <div class="cp-bar"><div class="cp-women" style="width:${wp}%"></div><div class="cp-men" style="width:${(100 - wp)}%"></div></div>
            <div class="cp-legend"><span><i class="cp-dot cp-dw"></i>${esc(t("council.women"))} · ${fmt(c.women)} (${pctT(wp)})</span><span><i class="cp-dot cp-dm"></i>${esc(t("council.men"))} · ${fmt(c.men)} (${pctT(100 - wp)})</span></div>
          </div>`;
        }
        const ageRange = (c.ageMin != null && c.ageMax != null)
          ? `<div class="council-agerange">${esc(t("council.ageRange", { min: c.ageMin, max: c.ageMax }))}</div>` : "";
        councilHtml = `<div class="panel council-panel">
          <h2>${esc(t("council.title"))}</h2>
          <p class="psub" style="margin-bottom:16px">${esc(t("council.sub"))}</p>
          ${tiles}
          ${parity}
          ${ageRange}
          <div class="resp-src">${esc(t("council.src"))}</div>
        </div>`;
      } else {
        councilHtml = `<div class="panel council-panel">
          <h2>${esc(t("council.title"))}</h2>
          <p class="resp-cov"><span class="ni">ⓘ</span> ${esc(t("council.none"))}</p>
        </div>`;
      }
    }

    // commune context
    const meta = fin ? fin.meta : {};
    const tags = [];
    if (meta.rural) tags.push(t("tag.rural"));
    if (meta.touristique) tags.push(t("tag.touristique"));
    if (meta.montagne) tags.push(t("tag.montagne"));
    const communeHtml = `<div class="panel side-card"><h3>${esc(t("fiche.commune"))}</h3>
      <div class="kv"><span class="k">${esc(t("fiche.pop"))}</span><span class="v">${f.pop != null ? fmt(f.pop) : "—"}</span></div>
      <div class="kv"><span class="k">${esc(t("fiche.dep"))}</span><span class="v">${esc(f.dep)} · ${esc(f.depNom)}</span></div>
      ${meta.reg ? `<div class="kv"><span class="k">${esc(t("fiche.reg"))}</span><span class="v">${esc(meta.reg)}</span></div>` : ""}
      ${f.epci ? `<div class="kv"><span class="k">${esc(t("fiche.epci"))}</span><span class="v">${esc(f.epci.nom)}</span></div>` : (meta.epci ? `<div class="kv"><span class="k">${esc(t("fiche.epci"))}</span><span class="v">${esc(meta.epci)}</span></div>` : "")}
      ${tags.length ? `<div class="fiche-badges" style="margin-top:12px">${tags.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : ""}</div>`;

    // identity card
    const idHtml = `<div class="panel side-card"><h3>${esc(t("fiche.identity"))}</h3>
      <div class="kv"><span class="k">${esc(t("fiche.civ"))}</span><span class="v">${esc(STD.civ(f))} ${esc(STD.mayorName(f))}</span></div>
      ${f.age != null ? `<div class="kv"><span class="k">${esc(t("fiche.age"))}</span><span class="v">${f.age} ${t("cl.ans")}</span></div>` : ""}
      ${f.cspLabel ? `<div class="kv"><span class="k">${esc(t("fiche.job"))}</span><span class="v">${esc(f.cspLabel)}</span></div>` : ""}
      ${veteran ? `<div class="kv"><span class="k">${esc(t("fiche.mayorSince"))}</span><span class="v">${esc(dateFmt(sinceISO))}</span></div>` : ""}
      ${f.foncStart ? `<div class="kv"><span class="k">${esc(t("fiche.mandat"))}</span><span class="v">${esc(dateFmt(f.foncStart))}</span></div>` : ""}</div>`;

    root.innerHTML = `<div class="wrap">
      <div style="margin:14px 0 -2px"><a href="/communes?dep=${encodeURIComponent(f.dep)}" data-link class="muted" style="font-size:13.5px">${esc(t("fiche.back"))}</a></div>
      <div class="fiche-hero fade-in">
        <div class="sash-band"></div>
        <div class="fiche-top">
          <div class="id">
            <div class="kicker">${esc(t("fiche.kicker"))}</div>
            <h1>${esc(f.commune)}</h1>
            <div class="place">${esc(f.dep)} · ${esc(f.depNom)}${f.pop != null ? " — " + fmt(f.pop) + " " + t("search.hab") : ""}</div>
            <div class="mayor-line">
              <div class="mayor-av">${esc(STD.initials(f))}</div>
              <div class="mayor-meta"><div class="mm-role">${esc(t("fiche.mayorRole"))}</div><div class="mm-name">${esc(STD.mayorName(f))}</div></div>
            </div>
            <div class="fiche-badges">
              ${f.cspLabel ? `<span class="chip chip-job" title="${esc(f.cspLabel)}">${esc(f.cspLabel)}</span>` : ""}
              ${f.age != null ? `<span class="chip">${f.age} ${t("cl.ans")}</span>` : ""}
              ${veteran ? `<span class="chip blue">${esc(t("mnd.mayorSinceChip", { year: sinceISO.slice(0, 4) }))}</span>` : ""}
              ${f.cumul && f.cumul.length ? `<span class="chip gold">＋ ${f.cumul.length} ${esc(t("fiche.cumul").toLowerCase())}</span>` : ""}
            </div>
          </div>
          <button class="btn btn-ghost" id="share">⇪ ${esc(t("src.share"))}</button>
        </div>
        <div class="note"><span class="ni">ⓘ</span><span>${esc(t("fiche.newMayorNote"))}</span></div>
        ${r ? ratiosHtml : (fin ? "" : `<div class="note" style="background:var(--bg-2);color:var(--muted);border-color:var(--line)"><span class="ni">—</span><span>${esc(t("fiche.noFin"))}</span></div>`)}
      </div>

      <div class="fiche-cols">
        <div>
          ${metricHtml}
          ${chartsHtml}
          ${respHtml}
          ${electionHtml}
          ${councilHtml}
          ${decpHtml}
        </div>
        <div>
          ${idHtml}
          ${communeHtml}
          <div class="panel side-card"><h3>${esc(t("fiche.sources"))}</h3>
            <div class="link-row">
              <a href="https://www.data.gouv.fr/fr/datasets/repertoire-national-des-elus-1/" target="_blank" rel="noopener">▪ ${esc(t("src.rne"))}</a>
              <a href="https://data.ofgl.fr/explore/dataset/ofgl-base-communes/" target="_blank" rel="noopener">▪ ${esc(t("src.ofgl"))}</a>
              ${f.decp && f.decp.count ? `<a href="https://data.economie.gouv.fr/explore/dataset/decp-2022-marches-valides/" target="_blank" rel="noopener">▪ ${esc(t("decp.src"))}</a>` : ""}
            </div></div>
        </div>
      </div>
      <section class="cmp-fiche panel" id="cmp-fiche" aria-label="${esc(t("fiche.similarTitle"))}">
        <div class="sec-head"><h2>${esc(t("fiche.similarTitle"))}</h2><a href="/comparateur?insee=${encodeURIComponent(f.insee)}" data-link>${esc(t("fiche.similarCta"))}</a></div>
        <p class="psub">${esc(t("fiche.similarSub"))}</p>
        <div class="cmp-fiche-list" id="cmp-fiche-list">${`<div class="skel" style="height:66px"></div>`.repeat(4)}</div>
      </section>
      ${f.related && f.related.length ? `<nav class="related-panel" aria-label="${esc(t("fiche.related", { dep: f.depNom }))}">
        <h3>${esc(t("fiche.related", { dep: f.depNom }))}</h3>
        <div class="related-grid">
          ${f.related.map((r) => `<a href="/maire/${esc(r.path)}" data-link class="related-link"><span class="rl-c">${esc(r.commune)}</span><span class="rl-m">${esc(STD.mayorName(r))}</span></a>`).join("")}
        </div>
        <a href="/communes?dep=${encodeURIComponent(f.dep)}" data-link class="related-all">${esc(t("fiche.relatedAll", { dep: f.depNom }))} →</a>
      </nav>` : ""}
    </div>`;

    const share = root.querySelector("#share");
    share && share.addEventListener("click", async () => {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: f.commune + " — FicheDeMaire.fr", url });
        else { await navigator.clipboard.writeText(url); STD.toast(t("share.copied")); }
      } catch {}
    });

    // lazy-load the "communes comparables" panel (all three axes, top 6)
    const cmpList = root.querySelector("#cmp-fiche-list");
    if (cmpList) STD.getJSON(`/api/similar?insee=${encodeURIComponent(f.insee)}&limit=6`).then((d) => {
      cmpList.innerHTML = d.results && d.results.length
        ? d.results.map(cmpItem).join("")
        : `<p class="board-note" style="margin:0">${esc(t("cmp.empty"))}</p>`;
    }).catch(() => { const s = root.querySelector("#cmp-fiche"); if (s) s.remove(); });
  };

  function dateFmt(iso) {
    try { const d = new Date(iso); return d.toLocaleDateString(STD.loc(), { year: "numeric", month: "long" }); } catch { return iso; }
  }

  // ── CLASSEMENTS ───────────────────────────────────────────────────────────
  // Each board is a top-25 slice of a full ranking. `sluice` deep-links the rest
  // into the open-data explorer at sluice.zlef.fr/d/fichedemaire-communes (all
  // 34,637 communes, sortable/filterable) — so a capped board is never a dead end.
  // Finance boards replay their population floor via min.pop so the full list matches.
  const SLUICE_BASE = "https://sluice.zlef.fr/d/fichedemaire-communes";
  const BOARDS = [
    { key: "dettePlus", ic: "💶", unit: "€", suf: "cl.perhab", sluice: "?view=table&sort=-fin.dette&min.pop=10000" },
    { key: "detteMoins", ic: "🪙", unit: "€", suf: "cl.perhab", sluice: "?view=table&sort=fin.dette&min.pop=10000" },
    { key: "epargneTop", ic: "🐖", unit: "%", suf: null, sluice: "?view=table&sort=-fin.ep&min.pop=10000" },
    { key: "desendetTendu", ic: "⚠️", unit: "cl.years", suf: null, sluice: "?view=table&sort=-fin.des&min.pop=10000" },
    { key: "villes", ic: "🏙️", unit: "cl.hab", suf: null, sluice: "?view=table&sort=-pop" },
    { key: "jeunes", ic: "🎂", unit: "cl.ans", suf: null, sluice: "?view=table&sort=age" },
    { key: "doyens", ic: "🎖️", unit: "cl.ans", suf: null, sluice: "?view=table&sort=-age" },
  ];
  V.classements = async (root) => {
    const b = await STD.getJSON("/api/boards");
    root.innerHTML = `<section class="block"><div class="wrap">
      <div class="sec-head"><h1>${esc(t("cl.h1"))}</h1></div>
      <p class="lead" style="margin-bottom:14px">${esc(t("cl.lead"))}</p>
      <p class="board-note">${esc(t("cl.floor", { n: fmt(b.popFloor || 10000) }))}</p>
      <div class="tabs" id="tabs">${BOARDS.map((x, i) => `<button class="tab${i === 0 ? " active" : ""}" data-b="${x.key}">${x.ic} ${esc(t("cl." + x.key))}</button>`).join("")}</div>
      <div class="card rank-card" id="board"></div>
      <a class="rank-more" id="board-more" target="_blank" rel="noopener"></a>
    </div></section>`;
    const render = (key) => {
      const cfg = BOARDS.find((x) => x.key === key);
      const more = root.querySelector("#board-more");
      more.href = SLUICE_BASE + cfg.sluice;
      more.innerHTML = `${esc(t("cl.fullData"))} <span class="rm-src">sluice.zlef.fr</span> →`;
      const rows = (b[key] || []).map((m, i) => {
        let val;
        if (cfg.unit === "%") val = m.value + " %";
        else if (cfg.unit === "€") val = fmt(m.value) + " €";
        else if (cfg.unit === "cl.hab") val = fmt(m.value) + " " + t("cl.hab");
        else if (cfg.unit === "cl.ans") val = m.value + " " + t("cl.ans");
        else if (cfg.unit === "cl.years") val = m.value + " " + t("cl.years");
        else val = fmt(m.value);
        return `<a class="rank-row" href="/maire/${esc(m.path)}" data-link>
          <span class="pos">${i + 1}</span>
          <span class="who"><span class="nm">${esc(m.commune)} <span class="muted" style="font-weight:500">(${esc(m.dep)})</span></span>
            <span class="sub">${esc(STD.mayorName(m))}${m.pop != null ? " · " + fmt(m.pop) + " " + t("cl.hab") : ""}</span></span>
          <span class="val">${esc(val)}</span></a>`;
      }).join("");
      root.querySelector("#board").innerHTML = rows || `<div class="sr-none">—</div>`;
    };
    root.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
      root.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      tab.classList.add("active"); render(tab.dataset.b);
    }));
    render("dettePlus");
  };

  // ── METHODE ───────────────────────────────────────────────────────────────
  V.methode = async (root) => {
    const [faq, stats] = await Promise.all([STD.getJSON("/api/faq"), STD.getJSON("/api/stats").catch(() => ({}))]);
    const list = faq[STD.lang] || faq.fr;
    const src = (ic, tt, sd) => `<div class="src"><span class="si">${ic}</span><div><div class="st">${esc(tt)}</div><div class="sd">${esc(sd)}</div></div></div>`;
    root.innerHTML = `<section class="block"><div class="wrap">
      <div class="prose">
        <h1>${esc(t("me.h1"))}</h1>
        <p>${esc(t("me.lead"))}</p>
        <div class="src-list">
          ${src("🏛️", "Répertoire national des élus (RNE)", STD.lang === "en" ? "Identity of every mayor — data.gouv.fr" : "Identité de chaque maire — data.gouv.fr")}
          ${src("📊", "OFGL", STD.lang === "en" ? "Town accounts 2017–2024 — Observatory of Local Public Finances" : "Comptes des communes 2017–2024 — Observatoire des finances locales")}
          ${src("⚖️", "HATVP", STD.lang === "en" ? "Declarations of interests — High Authority for Transparency" : "Déclarations d'intérêts — Haute Autorité pour la transparence")}
        </div>
        <div class="faq">
          ${list.map((x) => `<details class="faq-item"><summary>${esc(x.q)}</summary><div class="faq-a">${x.a}</div></details>`).join("")}
        </div>
        ${stats.generatedAt ? `<p class="muted" style="font-size:13px;margin-top:18px">${esc(t("me.updated", { date: dateFmt(stats.generatedAt) }))}</p>` : ""}
      </div>
    </div></section>`;
  };

  // ── PRESSE / MEDIA KIT ─────────────────────────────────────────────────────
  V.presse = async (root) => {
    const en = STD.lang === "en";
    const stats = await STD.getJSON("/api/stats").catch(() => ({}));
    const P = {
      title: en ? "Media kit" : "Kit média",
      lead: en
        ? "Everything you need to write about FicheDeMaire.fr — logos, colours, screenshots and a ready-to-use description. Free to use with attribution."
        : "Tout pour parler de FicheDeMaire.fr — logos, couleurs, captures d'écran et une description prête à l'emploi. Libre d'utilisation avec mention de la source.",
      aboutT: en ? "In one sentence" : "En une phrase",
      about: en
        ? "FicheDeMaire.fr is the living record of every French commune and its mayor: who runs it, and how healthy its finances are — 34,637 communes, 100 % from official open data."
        : "FicheDeMaire.fr, c'est la fiche vivante de chaque commune française et de son maire : qui la dirige, et dans quel état sont ses finances — 34 637 communes, 100 % à partir de données publiques officielles.",
      boilerT: en ? "Boilerplate (copy-paste)" : "Descriptif à copier-coller",
      boiler: en
        ? "FicheDeMaire.fr gathers, for each of France's 34,637 communes, the identity of its mayor (from the national register of elected officials) and the health of the town's finances 2017–2024 (from OFGL), alongside declarations of interests (HATVP) and awarded public contracts (DECP). No score, no opinion — only sourced facts. An independent project by zlef.fr."
        : "FicheDeMaire.fr rassemble, pour chacune des 34 637 communes de France, l'identité de son maire (Répertoire national des élus) et la santé financière de la commune 2017–2024 (OFGL), avec les déclarations d'intérêts (HATVP) et les marchés publics attribués (DECP). Aucune note, aucun avis — seulement des faits sourcés. Projet indépendant réalisé par zlef.fr.",
      copy: en ? "Copy" : "Copier",
      copied: en ? "Copied" : "Copié",
      factsT: en ? "Key facts" : "Chiffres clés",
      facts: [
        [fmt(stats.count || 34637), en ? "communes & mayors" : "communes & maires"],
        [fmt(34562), en ? "with published finances" : "avec finances publiées"],
        ["2017–2024", en ? "years of accounts" : "années de comptes"],
        ["RNE · OFGL · HATVP · DECP", en ? "open-data sources" : "sources open-data"],
      ],
      logoT: en ? "Logo" : "Logo",
      logoNote: en
        ? "The logomark is an écharpe tricolore with its gilt fringe — the French mayoral sash. Keep clear space around it; don't recolour, rotate or add effects."
        : "Le logo est une écharpe tricolore à frange dorée — l'écharpe des maires. Gardez une marge autour ; ne le recolorez pas, ne le tournez pas, n'ajoutez pas d'effet.",
      mark: en ? "Logomark" : "Symbole",
      wordmark: en ? "Wordmark" : "Logotype",
      colorsT: en ? "Colours" : "Couleurs",
      colorsNote: en ? "Click a swatch to copy its hex." : "Cliquez sur une couleur pour copier son code hex.",
      typoT: "Typographie",
      typoBody: en
        ? "The interface is set in Inter. Numbers use tabular figures. Headlines are weight 800."
        : "L'interface utilise Inter. Les chiffres sont en chasse fixe (tabular). Les titres sont en graisse 800.",
      shotsT: en ? "Screenshots" : "Captures d'écran",
      shotsNote: en ? "Right-click to save, or download the full kit below." : "Clic droit pour enregistrer, ou téléchargez le kit complet ci-dessous.",
      rulesT: en ? "Usage" : "Utilisation",
      dos: en
        ? ["Use the logo as provided (SVG preferred)", "Credit “FicheDeMaire.fr” and link back", "Screenshots may be published freely"]
        : ["Utilisez le logo tel quel (SVG de préférence)", "Créditez « FicheDeMaire.fr » avec un lien", "Les captures peuvent être publiées librement"],
      donts: en
        ? ["Don't recolour, distort or rotate the logo", "Don't imply an official or governmental endorsement", "Don't present the data as an opinion or a rating"]
        : ["Ne recolorez, ne déformez, ne tournez pas le logo", "Ne suggérez pas un caractère officiel ou gouvernemental", "Ne présentez pas les données comme un avis ou une note"],
      dlAll: en ? "Download the full media kit (.zip)" : "Télécharger le kit média complet (.zip)",
      contactT: "Contact",
      contact: en
        ? "Questions, interviews or data requests:"
        : "Questions, interviews ou demandes de données :",
    };
    const colors = [
      ["Bleu France", "#000091"], ["Rouge Marianne", "#e1000f"],
      [en ? "Gilt (fringe)" : "Or (frange)", "#b08d2e"],
      [en ? "Ivory" : "Ivoire", "#f5f6f2"], [en ? "Ink" : "Encre", "#161616"],
    ];
    const dlBtn = (href, label) => `<a class="kit-dl" href="${href}" download>↓ ${esc(label)}</a>`;

    root.innerHTML = `<section class="block"><div class="wrap presse">
      <div class="prose" style="max-width:760px">
        <span class="eyebrow"><span class="echarpe"><i></i><i></i><i></i></span> FicheDeMaire.fr</span>
        <h1>${esc(P.title)}</h1>
        <p class="lead">${esc(P.lead)}</p>
      </div>

      <div class="kit-card">
        <h2>${esc(P.aboutT)}</h2>
        <p class="kit-about">${esc(P.about)}</p>
      </div>

      <div class="kit-card">
        <h2>${esc(P.factsT)}</h2>
        <div class="kit-facts">
          ${P.facts.map(([n, l]) => `<div class="kit-fact"><div class="kf-n">${esc(n)}</div><div class="kf-l">${esc(l)}</div></div>`).join("")}
        </div>
      </div>

      <div class="kit-card">
        <h2>${esc(P.logoT)}</h2>
        <p class="kit-sub">${esc(P.logoNote)}</p>
        <div class="kit-logos">
          <div class="kit-logo">
            <div class="kit-preview light"><img src="/kit/logomark.svg" alt="${esc(P.mark)}" width="96" height="96"></div>
            <div class="kit-name">${esc(P.mark)}</div>
            <div class="kit-dls">${dlBtn("/kit/logomark.svg", "SVG")}${dlBtn("/kit/logomark-1024.png", "PNG")}</div>
          </div>
          <div class="kit-logo wide">
            <div class="kit-preview light"><img src="/kit/wordmark.svg" alt="${esc(P.wordmark)}" style="max-height:64px"></div>
            <div class="kit-name">${esc(P.wordmark)}</div>
            <div class="kit-dls">${dlBtn("/kit/wordmark.svg", "SVG")}${dlBtn("/kit/wordmark-1520.png", "PNG")}</div>
          </div>
        </div>
      </div>

      <div class="kit-card">
        <h2>${esc(P.colorsT)}</h2>
        <p class="kit-sub">${esc(P.colorsNote)}</p>
        <div class="kit-colors">
          ${colors.map(([n, hex]) => `<button class="kit-swatch" data-hex="${hex}"><span class="ks-chip" style="background:${hex}"></span><span class="ks-n">${esc(n)}</span><span class="ks-h">${hex}</span></button>`).join("")}
        </div>
      </div>

      <div class="kit-card">
        <h2>${esc(P.typoT)}</h2>
        <p class="kit-sub">${esc(P.typoBody)}</p>
        <div class="kit-typo">Aa Bb Cc &nbsp; 0123456789 &nbsp; €%</div>
      </div>

      <div class="kit-card">
        <h2>${esc(P.shotsT)}</h2>
        <p class="kit-sub">${esc(P.shotsNote)}</p>
        <div class="kit-shots">
          <a href="/kit/screen-home.png" target="_blank" rel="noopener"><img src="/kit/screen-home.png" loading="lazy" alt="Accueil"></a>
          <a href="/kit/screen-fiche.png" target="_blank" rel="noopener"><img src="/kit/screen-fiche.png" loading="lazy" alt="Fiche"></a>
          <a href="/kit/screen-classements.png" target="_blank" rel="noopener"><img src="/kit/screen-classements.png" loading="lazy" alt="Classements"></a>
        </div>
      </div>

      <div class="kit-card">
        <h2>${esc(P.rulesT)}</h2>
        <div class="kit-rules">
          <ul class="do">${P.dos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <ul class="dont">${P.donts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>
      </div>

      <div class="kit-card boiler">
        <h2>${esc(P.boilerT)}</h2>
        <div class="kit-boiler"><p id="boiler-text">${esc(P.boiler)}</p><button class="btn btn-ghost" id="copy-boiler">⧉ ${esc(P.copy)}</button></div>
      </div>

      <div class="kit-final">
        <a class="btn btn-primary kit-zip" href="/kit/fichedemaire-media-kit.zip" download>${esc(P.dlAll)}</a>
        <p class="kit-contact">${esc(P.contactT)} — ${esc(P.contact)} <a href="https://zlef.fr">zlef.fr</a></p>
      </div>
    </div></section>`;

    root.querySelectorAll(".kit-swatch").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.hex); STD.toast(P.copied + " · " + b.dataset.hex); } catch {}
    }));
    const cb = root.querySelector("#copy-boiler");
    cb && cb.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(P.boiler); STD.toast(P.copied); } catch {}
    });
  };
})();
