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
    return `<a href="/maire/${esc(m.path)}" data-link>
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
      else if (e.key === "Enter") { if (links[active]) { e.preventDefault(); STD.go(links[active].getAttribute("href")); } else if (items[0]) { e.preventDefault(); STD.go(`/maire/${items[0].path}`); } return; }
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
          ${decpHtml}
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
              ${f.decp && f.decp.count ? `<a href="https://data.economie.gouv.fr/explore/dataset/decp-2022-marches-valides/" target="_blank" rel="noopener">▪ ${esc(t("decp.src"))}</a>` : ""}
            </div></div>
        </div>
      </div>
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
