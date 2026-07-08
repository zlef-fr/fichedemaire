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
  function srRow(m) {
    const debt = m.fin && m.fin.dettePerHab != null ? STD.fmt(m.fin.dettePerHab) + " €/hab" : "";
    return `<a href="/maire/${esc(m.slug)}" data-link>
      <span class="sr-ic">⌂</span>
      <span class="sr-body">
        <span class="sr-nm">${esc(m.commune)} <span class="muted" style="font-weight:500">(${esc(m.dep)})</span></span>
        <span class="sr-sub">${esc(t("search.mayor"))} : ${esc(STD.mayorName(m))}${m.pop != null ? " · " + fmt(m.pop) + " " + t("search.hab") : ""}</span>
      </span>
      ${debt ? `<span class="sr-val">${esc(debt)}</span>` : ""}
    </a>`;
  }
  function wireSearch(root) {
    const inp = root.querySelector("#q");
    const box = root.querySelector("#sr");
    if (!inp) return;
    let timer, active = -1, items = [];
    const close = () => { box.hidden = true; active = -1; };
    const run = async (q) => {
      if (!q.trim()) { close(); return; }
      try {
        const { results } = await STD.getJSON(`/api/search?q=${encodeURIComponent(q)}`);
        items = results;
        box.innerHTML = results.length ? results.map(srRow).join("") : `<div class="sr-none">${esc(t("search.none"))}</div>`;
        box.hidden = false; active = -1;
      } catch { close(); }
    };
    inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => run(inp.value), 140); });
    inp.addEventListener("keydown", (e) => {
      const links = [...box.querySelectorAll("a")];
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, links.length - 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); }
      else if (e.key === "Enter") { if (links[active]) { e.preventDefault(); STD.go(links[active].getAttribute("href")); } else if (items[0]) { e.preventDefault(); STD.go(`/maire/${items[0].slug}`); } return; }
      else if (e.key === "Escape") { close(); return; }
      links.forEach((l, i) => l.classList.toggle("sr-active", i === active));
    });
    document.addEventListener("click", (e) => { if (!root.contains(e.target) || !e.target.closest(".searchbox")) close(); });
    setTimeout(() => inp.focus(), 60);
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
        const c = communes[Math.floor(Math.random() * communes.length)]; STD.go(`/maire/${c.slug}`);
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
    return `<a class="com-row" href="/maire/${esc(m.slug)}" data-link>
      <span class="cbody">
        <span class="cn">${esc(m.commune)}</span>
        <span class="cs">${esc(t("search.mayor"))} : ${esc(STD.mayorName(m))}${m.pop != null ? " · " + fmt(m.pop) + " " + t("search.hab") : ""}</span>
      </span>
      <span class="cmetrics">
        <span class="com-metric">${t("fiche.dettehab")}<b>${f.dettePerHab != null ? fmt(f.dettePerHab) + " €" : "—"}</b></span>
        <span class="com-metric">${t("fiche.epargne")}<b>${f.tauxEpargne != null ? f.tauxEpargne + " %" : "—"}</b></span>
      </span>
    </a>`;
  }

  // ── FICHE ─────────────────────────────────────────────────────────────────
  V.fiche = async (root, mm) => {
    const slug = decodeURIComponent(mm[1]);
    const f = await STD.getJSON(`/api/fiche/${encodeURIComponent(slug)}`);
    const fin = f.finances;
    const r = fin && fin.ratios;

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
        ${ratio("neutral", t("fiche.perso"), r.partPerso != null ? r.partPerso : "—", r.partPerso != null ? "%" : "", "")}
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
      chartsHtml = `<div class="panel"><h2>${esc(t("fiche.trendTitle"))}</h2><div class="psub">${esc(t("fiche.trendSub", { from: yFrom, to: yTo }))}</div>
        ${s.dette ? block(t("chart.dette"), "", STD.lineChart(s.dette, "#c9302c")) : ""}
        ${s.eb ? block(t("chart.epargne"), "", STD.barChart(s.eb, "#18753c")) : ""}
        ${s.rf && s.df ? block(t("chart.fonct"), `<span style="color:#000091">■</span> ${t("legend.rf")}  <span style="color:#9a9aa6">┄</span> ${t("legend.df")}`, STD.dualLine(s.rf, s.df, "#000091", "#8a8a94")) : ""}
        ${s.equip ? block(t("chart.equip"), "", STD.lineChart(s.equip, "#b8860b")) : ""}
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

    // cumul
    const cumulHtml = f.cumul && f.cumul.length ? `<div class="panel side-card"><h3>${esc(t("fiche.cumul"))}</h3>
      <div class="mandates">${f.cumul.map((c) => `<div class="mandate"><span class="mi">▪</span><span>${esc(c.label)}</span></div>`).join("")}</div></div>` : "";

    // HATVP
    let hatvpHtml = "";
    if (f.hatvp) {
      const h = f.hatvp;
      const flag = (on, lbl) => on ? `<span class="chip blue">✓ ${esc(lbl)}</span>` : "";
      hatvpHtml = `<div class="panel side-card"><h3>${esc(t("fiche.hatvp"))}</h3>
        <p class="psub" style="margin-bottom:12px">${esc(t("fiche.hatvpSub"))}</p>
        <div class="hatvp-counts">
          <div class="hatvp-count"><b>${h.activitesProf}</b><span>${esc(t("hatvp.actProf"))}</span></div>
          <div class="hatvp-count"><b>${h.participationsFinancieres}</b><span>${esc(t("hatvp.partFin"))}</span></div>
          <div class="hatvp-count"><b>${h.participationsDirigeant}</b><span>${esc(t("hatvp.dirig"))}</span></div>
        </div>
        <div class="hatvp-flags">${flag(h.consultant, t("hatvp.consultant"))}${flag(h.activiteConjoint, t("hatvp.conjoint"))}${flag(h.benevole, t("hatvp.benevole"))}</div>
        ${h.dateDepot ? `<p class="psub">${esc(t("hatvp.filed", { date: h.dateDepot }))}</p>` : ""}
        <div class="link-row"><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(t("hatvp.link"))}</a></div></div>`;
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
      ${meta.epci ? `<div class="kv"><span class="k">${esc(t("fiche.epci"))}</span><span class="v">${esc(meta.epci)}</span></div>` : ""}
      ${tags.length ? `<div class="fiche-badges" style="margin-top:12px">${tags.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : ""}</div>`;

    // identity card
    const idHtml = `<div class="panel side-card"><h3>${esc(t("fiche.identity"))}</h3>
      <div class="kv"><span class="k">${esc(t("fiche.civ"))}</span><span class="v">${esc(STD.civ(f))} ${esc(STD.mayorName(f))}</span></div>
      ${f.age != null ? `<div class="kv"><span class="k">${esc(t("fiche.age"))}</span><span class="v">${f.age} ${t("cl.ans")}</span></div>` : ""}
      ${f.cspLabel ? `<div class="kv"><span class="k">${esc(t("fiche.job"))}</span><span class="v">${esc(f.cspLabel)}</span></div>` : ""}
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
              ${f.cspLabel ? `<span class="chip">${esc(f.cspLabel)}</span>` : ""}
              ${f.age != null ? `<span class="chip">${f.age} ${t("cl.ans")}</span>` : ""}
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
        </div>
        <div>
          ${idHtml}
          ${cumulHtml}
          ${hatvpHtml}
          ${communeHtml}
          <div class="panel side-card"><h3>${esc(t("fiche.sources"))}</h3>
            <div class="link-row">
              <a href="https://www.data.gouv.fr/fr/datasets/repertoire-national-des-elus-1/" target="_blank" rel="noopener">▪ ${esc(t("src.rne"))}</a>
              <a href="https://data.ofgl.fr/explore/dataset/ofgl-base-communes/" target="_blank" rel="noopener">▪ ${esc(t("src.ofgl"))}</a>
            </div></div>
        </div>
      </div>
    </div>`;

    const share = root.querySelector("#share");
    share && share.addEventListener("click", async () => {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: f.commune + " — FicheDeMaire.fr", url });
        else { await navigator.clipboard.writeText(url); STD.toast(t("share.copied")); }
      } catch {}
    });
  };

  function dateFmt(iso) {
    try { const d = new Date(iso); return d.toLocaleDateString(STD.loc(), { year: "numeric", month: "long" }); } catch { return iso; }
  }

  // ── CLASSEMENTS ───────────────────────────────────────────────────────────
  const BOARDS = [
    { key: "dettePlus", ic: "💶", unit: "€", suf: "cl.perhab" },
    { key: "detteMoins", ic: "🪙", unit: "€", suf: "cl.perhab" },
    { key: "epargneTop", ic: "🐖", unit: "%", suf: null },
    { key: "desendetTendu", ic: "⚠️", unit: "cl.years", suf: null },
    { key: "villes", ic: "🏙️", unit: "cl.hab", suf: null },
    { key: "jeunes", ic: "🎂", unit: "cl.ans", suf: null },
    { key: "doyens", ic: "🎖️", unit: "cl.ans", suf: null },
  ];
  V.classements = async (root) => {
    const b = await STD.getJSON("/api/boards");
    root.innerHTML = `<section class="block"><div class="wrap">
      <div class="sec-head"><h1>${esc(t("cl.h1"))}</h1></div>
      <p class="lead" style="margin-bottom:14px">${esc(t("cl.lead"))}</p>
      <p class="board-note">${esc(t("cl.floor", { n: fmt(b.popFloor || 10000) }))}</p>
      <div class="tabs" id="tabs">${BOARDS.map((x, i) => `<button class="tab${i === 0 ? " active" : ""}" data-b="${x.key}">${x.ic} ${esc(t("cl." + x.key))}</button>`).join("")}</div>
      <div class="card rank-card" id="board"></div>
    </div></section>`;
    const render = (key) => {
      const cfg = BOARDS.find((x) => x.key === key);
      const rows = (b[key] || []).map((m, i) => {
        let val;
        if (cfg.unit === "%") val = m.value + " %";
        else if (cfg.unit === "€") val = fmt(m.value) + " €";
        else if (cfg.unit === "cl.hab") val = fmt(m.value) + " " + t("cl.hab");
        else if (cfg.unit === "cl.ans") val = m.value + " " + t("cl.ans");
        else if (cfg.unit === "cl.years") val = m.value + " " + t("cl.years");
        else val = fmt(m.value);
        return `<a class="rank-row" href="/maire/${esc(m.slug)}" data-link>
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
})();
