(() => {
  "use strict";

  const QA_FIXTURE=location.protocol==="chrome-extension:"&&location.pathname.endsWith("/qa/fixture.html");
  const DEFAULTS = {
    enabled: true,
    skipOP: true,
    skipRecap: true,
    skipED: true,
    autoNext: true,
    autoPlayNext: true,
    fallback90: true,
    fallbackSeconds: 90,
    notifications: true,
    smartDetection: true,
    nativeButtons: true,
    showSkipButton: true,
    showHud: true,
    saveHistory: true,
    respectManualRewind: true,
    resumeBehavior: "continue" // continue | restart | ignore
  };

  // Regla protegida: Bleach conserva el comportamiento que ya sabemos que funciona.
  const KNOWN_ANIME = {
    "bleach": {
      malId: 269,
      maxEpisode: 366,
      title: "Bleach",
      source: "fixed"
    }
  };

  let settings = { ...DEFAULTS };
  let effective = { ...DEFAULTS };
  let siteRules = {};
  let rulesData = null;
  let siteKey = "generic";
  let currentVideo = null;
  let currentVideoAbort = null;
  let lastPageUrl = location.href;
  let ranges = [];
  let skipped = new Set();
  let nextTriggered = false;
  let meta = null;
  let detectionStatus = "Detectando…";
  let timingSource = "—";
  let lastHistorySave = 0;
  let nativeScanLock = false;
  let resumeHandled = false;
  let seekFrom = 0;
  let lastStableTime = 0;

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

  const slugify = s => String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  function sendMessage(msg) {
    return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
  }

  function syncGet(obj) {
    return new Promise(resolve => chrome.storage.sync.get(obj, resolve));
  }

  function syncSet(obj) {
    return new Promise(resolve => chrome.storage.sync.set(obj, resolve));
  }

  function localSet(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
  }

  async function loadRules() {
    try {
      const r = await fetch(chrome.runtime.getURL("rules.json"));
      rulesData = await r.json();
      siteKey = detectSiteKey();
      siteRules = rulesData?.sites?.[siteKey] || {};
    } catch (_) {
      rulesData = { textPatterns: { intro: [], recap: [], next: [], play: [] } };
      siteKey = detectSiteKey();
      siteRules = {};
    }
  }

  function detectSiteKey() {
    const h = location.hostname.toLowerCase().replace(/^www\./, "");
    if (h === "jkanime.net") return "jkanime";
    if (h === "animeflv.net" || h.endsWith(".animeflv.net")) return "animeflv";
    if (h === "tioanime.com") return "tioanime";
    if (h === "animeav1.com") return "animeav1";
    if (h === "animefenix.com" || h === "animefenix2.tv") return "animefenix";
    if (h.endsWith("crunchyroll.com")) return "crunchyroll";
    if (h.endsWith("netflix.com")) return "netflix";
    if (h.endsWith("disneyplus.com")) return "disneyplus";
    if (h.endsWith("primevideo.com") || h.endsWith("amazon.com") || h.endsWith("amazon.es")) return "primevideo";
    if (h.endsWith("hidive.com")) return "hidive";
    if (h.endsWith("max.com") || h.endsWith("hbomax.com")) return "max";
    if (h === "tv.apple.com") return "appletv";
    if (h.endsWith("paramountplus.com")) return "paramount";
    if (h.endsWith("hulu.com")) return "hulu";
    if (h.endsWith("peacocktv.com")) return "peacock";
    if (h.endsWith("skyshowtime.com")) return "skyshowtime";
    if (h.endsWith("movistarplus.es")) return "movistarplus";
    if (h.endsWith("filmin.es")) return "filmin";
    return "generic";
  }

  function cleanEpisodeTitle(text, episode=null) {
    let t = String(text || "")
      .replace(/\s+/g, " ")
      .replace(/\|\s*(jkanime|animeflv|tioanime|animeav1|animefenix).*$/i, "")
      .replace(/-\s*(jkanime|animeflv|tioanime|animeav1|animefenix).*$/i, "")
      .replace(/\b(?:ver|watch|online|sub(?:titulado)?|sub\s*español|sub\s*espanol|hd)\b/ig, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (episode != null) {
      const esc = String(episode).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      t = t
        .replace(new RegExp(`\\b(?:episodio|episode|ep\\.?)\\s*${esc}\\b`, "ig"), " ")
        .replace(new RegExp(`(?:\\s|[-–—])${esc}\\s*$`, "i"), " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (/^(episodio|episode|ep\.?)\s*\d*$/i.test(t)) return "";
    return t;
  }

  function titleFromDocument(episode, slug) {
    const candidates = [];

    if (slug) {
      for (const a of $$("a[href]")) {
        try {
          const u = new URL(a.href, location.href);
          if (u.pathname.replace(/\/+$/, "") === `/media/${slug}`) {
            const txt = a.textContent?.trim();
            if (txt) candidates.push(txt);
          }
        } catch (_) {}
      }
    }

    for (const sel of [
      "h1",
      ".anime__details__title h3",
      ".anime__details__title",
      "[class*='anime-title' i]",
      "[class*='title' i] h1",
      "[class*='title' i] h2",
      "meta[property='og:title']"
    ]) {
      const el = $(sel);
      const txt = el?.getAttribute?.("content") || el?.textContent;
      if (txt?.trim()) candidates.push(txt.trim());
    }
    if (document.title) candidates.push(document.title);

    for (const raw of candidates) {
      const cleaned = cleanEpisodeTitle(raw, episode);
      if (cleaned && cleaned.length >= 2 && !/^(inicio|home)$/i.test(cleaned)) return cleaned;
    }

    return slug ? slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "";
  }

  function parseAnimeSite() {
    const parts = location.pathname.split("/").filter(Boolean);

    if (siteKey === "jkanime") {
      if (parts.length < 2) return null;
      const slug = parts[0].toLowerCase();
      const episode = Number(parts[1]);
      if (!Number.isFinite(episode) || episode < 1) return null;
      return { slug, episode, title: titleFromDocument(episode, slug) || slug.replace(/-/g, " ") };
    }

    if (siteKey === "animeav1") {
      if (parts[0] !== "media" || parts.length < 3) return null;
      const episode = Number(parts[parts.length - 1]);
      const slug = parts[1]?.toLowerCase();
      if (!slug || !Number.isFinite(episode) || episode < 1) return null;
      return { slug, episode, title: titleFromDocument(episode, slug) || slug.replace(/-/g, " ") };
    }

    if (siteKey === "animeflv" || siteKey === "tioanime") {
      if (parts[0] !== "ver" || parts.length < 2) return null;
      const leaf = parts[parts.length - 1];
      const m = leaf.match(/^(.*)-(\d+(?:\.\d+)?)$/);
      if (!m) return null;
      const slug = m[1].toLowerCase();
      const episode = Number(m[2]);
      if (!slug || !Number.isFinite(episode) || episode < 1) return null;
      return { slug, episode, title: titleFromDocument(episode, slug) || slug.replace(/-/g, " ") };
    }

    if (siteKey === "animefenix") {
      const leaf = parts[parts.length - 1] || "";
      let episode = Number(leaf);
      let slug = "";
      if (Number.isFinite(episode) && episode > 0 && parts.length >= 2) slug = parts[parts.length - 2];
      else {
        const m = leaf.match(/^(.*)-(\d+(?:\.\d+)?)$/);
        if (m) { slug = m[1]; episode = Number(m[2]); }
      }
      if (!slug || !Number.isFinite(episode) || episode < 1) return null;
      slug = slug.toLowerCase();
      return { slug, episode, title: titleFromDocument(episode, slug) || slug.replace(/-/g, " ") };
    }

    return null;
  }

  function parseEpisodeFromText(text) {
    const patterns = [
      /(?:episodio|episode|ep\.?)\s*(\d+)/i,
      /\bE(\d{1,4})\b/i
    ];
    for (const re of patterns) {
      const m = String(text || "").match(re);
      if (m) return Number(m[1]);
    }
    return null;
  }

  function crunchyrollSeriesTitle() {
    if (siteKey !== "crunchyroll") return "";
    const candidates = [];
    const add = (txt,score=0) => {
      txt = String(txt || "").replace(/\s+/g," ").trim();
      if (!txt || /^(?:E|Ep\.?|Episode|Episodio|Cap[ií]tulo)\s*\d+/i.test(txt)) return;
      if (/^(Crunchyroll|Inicio|Home|Series|Anime)$/i.test(txt)) return;
      candidates.push({txt,score});
    };
    try {
      for (const a of document.querySelectorAll("a[href*='/series/']")) {
        const r = a.getBoundingClientRect();
        const visible = r.width > 1 && r.height > 1;
        add(a.getAttribute("aria-label") || a.getAttribute("title") || a.textContent, (visible?40:0) + (r.top>=0&&r.top<900?30:0));
      }
    } catch (_) {}
    const dt = String(document.title || "");
    let m = dt.match(/^(.*?)\s*[-–—|·]\s*(?:T\s*\d+\s*)?E\s*\d+\b/i);
    if (m) add(m[1],55);
    m = dt.match(/^(?:T\s*\d+\s*)?E\s*\d+\s*[-–—:]\s*.*?\s*[-–—|·]\s*(.+?)(?:\s*[-–—|·]\s*Crunchyroll)?$/i);
    if (m) add(m[1],45);
    candidates.sort((a,b)=>b.score-a.score || a.txt.length-b.txt.length);
    return candidates[0]?.txt || "";
  }

  function extractGenericTitleEpisode() {
    const texts = [
      document.querySelector("h1")?.textContent,
      document.querySelector("h2")?.textContent,
      document.querySelector("[data-uia*='video-title']")?.textContent,
      document.querySelector("[data-testid*='title']")?.textContent,
      document.title
    ].filter(Boolean).map(x => x.trim());

    const combined = texts.join(" | ");
    const episode = parseEpisodeFromText(combined);

    let title = (siteKey === "crunchyroll" ? crunchyrollSeriesTitle() : "") || texts[0] || document.title || location.hostname;
    title = title
      .replace(/(?:episodio|episode|ep\.?)\s*\d+/ig, "")
      .replace(/\|\s*(netflix|crunchyroll|disney\+|prime video|hidive|jkanime|animeflv|tioanime|animeav1|animefenix).*$/i, "")
      .replace(/-\s*(netflix|crunchyroll|disney\+|prime video|hidive|jkanime|animeflv|tioanime|animeav1|animefenix).*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      slug: slugify(title || location.pathname.split("/").filter(Boolean)[0] || "unknown"),
      episode: episode || 1,
      title: title || "Contenido"
    };
  }

  function pageTitleCandidate() {
    const selectors = ["h1", ".anime__details__title h3", ".anime__details__title", "title"];
    for (const sel of selectors) {
      const el = sel === "title" ? document.querySelector("title") : document.querySelector(sel);
      const txt = el?.textContent?.trim();
      if (!txt) continue;

      const cleaned = txt
        .replace(/episodio\s+\d+/ig, "")
        .replace(/japones|japonés|sub\.?\s*español|español/ig, "")
        .replace(/\|\s*jkanime.*$/i, "")
        .replace(/-\s*jkanime.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();

      if (cleaned.length >= 2) return cleaned;
    }

    return meta?.slug?.replace(/-/g, " ") || document.title;
  }

  async function loadSettings() {
    const s = await syncGet(DEFAULTS);
    settings = { ...DEFAULTS, ...s };
  }

  function profileKey() {
    if (!meta?.slug) return null;
    return `profile:${siteKey}:${meta.slug}`;
  }

  async function applySeriesProfile() {
    effective = { ...settings };
    if(QA_FIXTURE){effective={...effective,enabled:true,saveHistory:true,smartDetection:false,skipOP:false,skipRecap:false,skipED:false,fallback90:false,autoNext:false,autoPlayNext:false};return;}
    const key = profileKey();
    if (!key) return;
    const data = await syncGet({ [key]: null });
    const p = data[key];
    if (p && typeof p === "object") {
      for (const k of ["skipOP","skipRecap","skipED","autoNext","autoPlayNext","fallback90","notifications","nativeButtons","showSkipButton","respectManualRewind"]) {
        if (typeof p[k] === "boolean") effective[k] = p[k];
      }
    }
  }

  async function detectAnime() {
    const basic = parseAnimeSite() || extractGenericTitleEpisode();

    meta = { ...basic, source: "unknown" };
    if(QA_FIXTURE){detectionStatus="Prueba local ficticia";return;}

    // Bleach protegido en JKAnime.
    if (siteKey === "jkanime" && KNOWN_ANIME[basic.slug]) {
      meta = { ...basic, ...KNOWN_ANIME[basic.slug] };
      detectionStatus = "Regla fija protegida";
      return;
    }

    const overrideKey = `animeOverride:${siteKey}:${basic.slug}`;
    const ovData = await syncGet({ [overrideKey]: null });
    const ov = ovData[overrideKey];
    if (ov?.malId) {
      meta = {
        ...basic,
        malId: Number(ov.malId),
        maxEpisode: Number(ov.maxEpisode || 9999),
        title: ov.title || basic.title || pageTitleCandidate(),
        source: "override"
      };
      detectionStatus = "Selección manual";
      return;
    }

    if (QA_FIXTURE || !settings.smartDetection) {
      detectionStatus = "Detección automática desactivada";
      return;
    }

    // En servicios con títulos poco fiables dejamos que los botones nativos sean la capa principal.
    // Si el título/episodio son utilizables, intentamos además AniSkip.
    const cacheKey = `animeCache:${siteKey}:${basic.slug}`;
    const cachedData = await syncGet({ [cacheKey]: null });
    const cached = cachedData[cacheKey];
    if (cached?.malId) {
      meta = { ...basic, ...cached, source: "cache" };
      detectionStatus = "Detectado (caché)";
      return;
    }

    const query = basic.title || pageTitleCandidate();
    if (!query || query.length < 2) {
      detectionStatus = "Sin título detectable";
      return;
    }

    const result = await sendMessage({ type: "JIKAN_SEARCH", query });
    if (!result?.ok || !Array.isArray(result.data?.data) || !result.data.data.length) {
      detectionStatus = "Sin coincidencia automática";
      return;
    }

    const target = slugify(query);
    const pageSlug = slugify(basic.slug);
    const candidates = result.data.data;

    const score = anime => {
      const names = [
        anime.title,
        anime.title_english,
        anime.title_japanese,
        ...(anime.titles || []).map(t => t.title)
      ].filter(Boolean).map(slugify);

      let best = 0;
      for (const n of names) {
        if (n === target || n === pageSlug) best = Math.max(best, 100);
        else if (n.includes(target) || target.includes(n)) best = Math.max(best, 80);
        else if (n.includes(pageSlug) || pageSlug.includes(n)) best = Math.max(best, 72);
      }
      if (anime.type === "TV") best += 4;
      if (anime.episodes) best += 2;
      return best;
    };

    const best = [...candidates].sort((a,b) => score(b) - score(a))[0];
    if (!best?.mal_id || score(best) < 40) {
      detectionStatus = "Coincidencia dudosa";
      return;
    }

    meta = {
      ...basic,
      malId: best.mal_id,
      maxEpisode: best.episodes || 9999,
      title: best.title_english || best.title || query,
      source: "auto"
    };

    await syncSet({
      [cacheKey]: {
        malId: meta.malId,
        maxEpisode: meta.maxEpisode,
        title: meta.title
      }
    });

    detectionStatus = "Detectado automáticamente";
  }

  function findVideo() {
    const direct = $("video");
    if (direct) return direct;

    for (const iframe of $$("iframe")) {
      try {
        const v = iframe.contentDocument?.querySelector("video");
        if (v) return v;
      } catch (_) {}
    }
    return null;
  }

  async function fetchAniSkip(duration) {
    if (!meta?.malId || !meta?.episode) return { ok: false, error: "Sin MAL/episodio" };
    return await sendMessage({
      type: "ANISKIP_FETCH",
      malId: meta.malId,
      episode: meta.episode,
      episodeLength: duration
    });
  }

  function normalize(data, actualDuration) {
    if (!data?.found || !Array.isArray(data.results)) return [];

    return data.results
      .filter(x => x?.interval &&
        Number.isFinite(x.interval.startTime) &&
        Number.isFinite(x.interval.endTime))
      .map(x => {
        let start = x.interval.startTime;
        let end = x.interval.endTime;
        const ref = Number(x.episodeLength);

        if (Number.isFinite(ref) && ref > 0 && actualDuration > 0) {
          const ratio = actualDuration / ref;
          if (ratio > 0.95 && ratio < 1.05) {
            start *= ratio;
            end *= ratio;
          }
        }

        return {
          id: x.id || `${x.skipType}-${start}-${end}`,
          type: x.skipType,
          start,
          end
        };
      })
      .sort((a,b) => a.start - b.start);
  }

  function fallback(duration) {
    const trustedMapping = meta?.source === "fixed" || meta?.source === "override";
    if (!effective.fallback90 || !trustedMapping || !Number.isFinite(duration) || duration < 600) return [];
    return [
      { id:"fallback-op", type:"op", start:0, end:Math.max(30,Math.min(180,Number(effective.fallbackSeconds)||90)) },
      { id:"fallback-ed", type:"ed", start:Math.max(0,duration-Math.max(30,Math.min(180,Number(effective.fallbackSeconds)||90))), end:duration-1 }
    ];
  }

  function typeLabel(type) {
    if (["op","mixed-op"].includes(type)) return "opening";
    if (["ed","mixed-ed"].includes(type)) return "ending";
    if (type === "recap") return "resumen";
    return type;
  }

  function shouldSkip(type) {
    if (["op","mixed-op"].includes(type)) return effective.skipOP;
    if (type === "recap") return effective.skipRecap;
    if (["ed","mixed-ed"].includes(type)) return effective.skipED;
    return false;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(sec/60);
    const s = String(sec%60).padStart(2,"0");
    return `${m}:${s}`;
  }

  function injectStyles() {
    if ($("#aniflow-style")) return;
    const style = document.createElement("style");
    style.id = "aniflow-style";
    style.textContent = `
      #aniflow-hud{position:fixed;right:14px;top:135px;z-index:2147483645;width:290px;background:rgba(13,15,19,.94);
      backdrop-filter:blur(12px);color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:14px;
      box-shadow:0 12px 36px rgba(0,0,0,.35);font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}
      #aniflow-hud .af-head{display:flex;align-items:center;gap:9px;padding:10px 11px;border-bottom:1px solid rgba(255,255,255,.08)}
      #aniflow-hud .af-logo{width:26px;height:26px;border-radius:8px;background:#28b6ff;color:#111;font-weight:900;display:grid;place-items:center}
      #aniflow-hud .af-title{font-weight:750;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #aniflow-hud .af-sub{font-size:10px;opacity:.62;margin-top:1px}
      #aniflow-hud .af-body{padding:9px 11px}
      #aniflow-hud .af-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:3px 0}
      #aniflow-hud .af-chip{padding:2px 6px;border-radius:999px;background:rgba(40,182,255,.15);border:1px solid rgba(40,182,255,.34);color:#aee8ff;font-size:10px}
      #aniflow-hud .af-times{opacity:.78;font-size:10px;margin-top:5px}
      #aniflow-hud .af-actions{display:flex;gap:6px;margin-top:8px}
      #aniflow-hud button,#aniflow-skip-btn{border:0;border-radius:9px;background:#28b6ff;color:#111;font-weight:750;cursor:pointer}
      #aniflow-hud button{padding:6px 8px;font-size:11px}
      #aniflow-hud button.af-secondary{background:#252a33;color:#fff}
      #aniflow-skip-btn{position:fixed;right:24px;bottom:86px;z-index:2147483647;padding:10px 14px;font:600 13px system-ui;
      box-shadow:0 8px 24px rgba(0,0,0,.35);display:none}
      #aniflow-toast{position:fixed;right:16px;bottom:138px;z-index:2147483647;background:rgba(15,15,18,.94);color:#fff;
      padding:10px 14px;border-radius:10px;font:14px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.35);opacity:0;transition:opacity .2s}
    `;
    document.documentElement.appendChild(style);
  }

  function notify(text) {
    if (!effective.notifications) return;
    let box = $("#aniflow-toast");
    if (!box) {
      box = document.createElement("div");
      box.id = "aniflow-toast";
      document.documentElement.appendChild(box);
    }
    box.textContent = text;
    box.style.opacity = "1";
    clearTimeout(box._t);
    box._t = setTimeout(() => box.style.opacity = "0", 1800);
  }

  function injectHud() {
    if (!effective.showHud || $("#aniflow-hud")) return;
    const hud = document.createElement("div");
    hud.id = "aniflow-hud";
    hud.innerHTML = `
      <div class="af-head">
        <div class="af-logo">▶</div>
        <div style="min-width:0;flex:1">
          <div class="af-title">Skipper</div>
          <div class="af-sub">Preparando…</div>
        </div>
        <div class="af-chip">ICE</div>
      </div>
      <div class="af-body">
        <div class="af-row"><span>Estado</span><span class="af-status">Detectando</span></div>
        <div class="af-row"><span>Fuente</span><span class="af-source">—</span></div>
        <div class="af-times">Sin tiempos todavía</div>
        <div class="af-actions">
          <button class="af-skipnow">⏭ Saltar ahora</button>
          <button class="af-secondary af-hide">Ocultar</button>
        </div>
      </div>`;
    document.documentElement.appendChild(hud);

    $(".af-skipnow",hud).addEventListener("click", () => skipCurrentOrNextRange(true));
    $(".af-hide",hud).addEventListener("click", () => { hud.style.display = "none"; });
    refreshHud();
  }

  function injectSkipButton() {
    if (!effective.showSkipButton || $("#aniflow-skip-btn")) return;
    const b = document.createElement("button");
    b.id = "aniflow-skip-btn";
    b.textContent = "⏭ Saltar";
    b.addEventListener("click", () => skipCurrentOrNextRange(true));
    document.documentElement.appendChild(b);
  }


  function emitSkipperState() {
    try {
      window.dispatchEvent(new CustomEvent("aniflow:state", {
        detail: {
          siteKey,
          meta: meta ? { ...meta } : null,
          detectionStatus,
          timingSource,
          settings: { ...effective },
          ranges: ranges.map(r => ({
            id: r.id,
            type: r.type,
            start: Number(r.start),
            end: Number(r.end)
          })),
          currentTime: Number(currentVideo?.currentTime || 0),
          duration: Number(currentVideo?.duration || 0)
        }
      }));
    } catch (_) {}
  }

  function emitSkipEvent(r, fromTime, manual=false, source="timed") {
    try {
      const savedSeconds = Math.max(0, Number(r.end) - Number(fromTime || 0));
      window.dispatchEvent(new CustomEvent("aniflow:skip", {
        detail: {
          siteKey,
          meta: meta ? { ...meta } : null,
          range: { id:r.id, type:r.type, start:Number(r.start), end:Number(r.end) },
          fromTime: Number(fromTime || 0),
          savedSeconds,
          manual,
          source
        }
      }));
    } catch (_) {}
  }

  window.addEventListener("aniflow:request-state", () => emitSkipperState());

  window.addEventListener("aniflow:suppress-range", e => {
    const id = e?.detail?.id;
    if (id) {
      skipped.add(id);
      notify("Skipper: este salto se omite una vez");
      emitSkipperState();
    }
  });

  window.addEventListener("aniflow:command", async e => {
    const cmd = e?.detail?.command;
    if (cmd === "skip") {
      skipCurrentOrNextRange(true);
    } else if (cmd === "next") {
      goNext();
    } else if (cmd === "playpause") {
      if (!currentVideo) return;
      try {
        if (currentVideo.paused) await currentVideo.play();
        else currentVideo.pause();
      } catch (_) {}
    }
  });

  function refreshHud() {
    const hud = $("#aniflow-hud");
    if (!hud || !meta) return;
    $(".af-title",hud).textContent = `${meta.title || "Contenido"} · Ep. ${meta.episode || "?"}`;
    $(".af-sub",hud).textContent = `${siteKey} · ${detectionStatus}`;
    $(".af-status",hud).textContent = effective.enabled ? "Activo" : "Pausado";
    $(".af-source",hud).textContent = timingSource;
    $(".af-times",hud).textContent = ranges.length
      ? ranges.map(r => `${typeLabel(r.type)} ${formatTime(r.start)}–${formatTime(r.end)}`).join(" · ")
      : "Usando controles nativos cuando estén disponibles";
    emitSkipperState();
  }

  function currentRange(t=currentVideo?.currentTime) {
    if (!Number.isFinite(t)) return null;
    return ranges.find(r => t >= r.start - 0.5 && t < r.end - 0.1) || null;
  }

  function nextRange(t=currentVideo?.currentTime) {
    if (!Number.isFinite(t)) return null;
    return ranges.find(r => r.end > t && shouldSkip(r.type)) || null;
  }

  function skipCurrentOrNextRange(manual=false) {
    if (!currentVideo) return;
    const r = currentRange() || nextRange();
    if (!r) {
      notify("Skipper: no hay tramo saltable detectado");
      return;
    }
    const fromTime = Number(currentVideo.currentTime || 0);
    emitSkipEvent(r, fromTime, manual, manual ? "manual-button" : "timed");
    currentVideo.currentTime = Math.min(r.end + 0.08, currentVideo.duration - 0.25);
    skipped.add(r.id);
    const saved = Math.max(0, Math.round(r.end - fromTime));
    notify(`⏭ ${manual ? "Saltado" : "Saltando"} ${typeLabel(r.type)} · +${formatTime(saved)}`);
    emitSkipperState();
  }

  function updateSkipButton() {
    const b = $("#aniflow-skip-btn");
    if (!b || !currentVideo) return;
    const r = currentRange();
    if (r && shouldSkip(r.type)) {
      b.textContent = `⏭ Saltar ${typeLabel(r.type)} · ${Math.max(0, Math.ceil(r.end-currentVideo.currentTime))}s`;
      b.style.display = "block";
    } else {
      b.style.display = "none";
    }
  }

  function textMatches(el, patterns=[]) {
    const txt = (el?.textContent || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || "").trim().toLowerCase();
    return patterns.some(p => txt.includes(String(p).toLowerCase()));
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  }

  function clickEl(el) {
    if (!el) return false;
    try {
      el = el.closest?.("button,[role='button'],a[href],[tabindex],[class*='button' i],[class*='control' i],[class*='skip' i],[class*='next' i]") || el;
      if (!visible(el) || el.disabled || el.getAttribute?.("aria-disabled") === "true") return false;
      el.focus?.({ preventScroll:true });
      if (typeof el.click === "function") el.click();
      else el.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true, view:window }));
      return true;
    } catch (_) { return false; }
  }

  function findBySelectors(selectors=[]) {
    for (const sel of selectors) {
      try {
        const el = $$(sel).find(visible);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function findButtonByText(patterns=[]) {
    const selectors = "button,a,[role='button'],[aria-label],[title],[data-testid],[data-t],[class*='button' i],[class*='control' i],[class*='skip' i],[class*='next' i],span";
    const nodes = $$(selectors);
    for (const raw of nodes) {
      if (!visible(raw) || !textMatches(raw, patterns)) continue;
      const el = raw.closest?.("button,[role='button'],a[href],[tabindex],[class*='button' i],[class*='control' i],[class*='skip' i],[class*='next' i]") || raw;
      if (visible(el) && el.getAttribute?.("aria-disabled") !== "true" && !el.disabled) return el;
    }
    return null;
  }

  function nearEnd() {
    if (!currentVideo || !Number.isFinite(currentVideo.duration) || currentVideo.duration <= 0) return false;
    return currentVideo.ended || currentVideo.currentTime >= currentVideo.duration - 8;
  }

  function handleNativeControls() {
    if (!effective.enabled || !effective.nativeButtons || nativeScanLock) return;

    // Controles nativos: opening y recap se respetan por separado.
    if (effective.skipRecap) {
      const recap = findBySelectors(siteRules.skipRecapSelectors || [])
        || findButtonByText(rulesData?.textPatterns?.recap || []);
      if (recap) {
        nativeScanLock = true;
        if (clickEl(recap)) {
          notify("⏭ Resumen/recap nativo");
          setTimeout(() => { nativeScanLock = false; }, 1200);
          return;
        }
        nativeScanLock = false;
      }
    }

    if (effective.skipOP) {
      const intro = findBySelectors(siteRules.skipIntroSelectors || [])
        || findButtonByText(rulesData?.textPatterns?.intro || []);
      if (intro) {
        nativeScanLock = true;
        if (clickEl(intro)) {
          notify("⏭ Opening/intro nativo");
          setTimeout(() => { nativeScanLock = false; }, 1200);
          return;
        }
        nativeScanLock = false;
      }
    }

    // Siguiente episodio nativo solo cuando estamos al final.
    if (effective.autoNext && nearEnd()) {
      const next = findBySelectors(siteRules.nextSelectors || [])
        || findButtonByText(rulesData?.textPatterns?.next || []);
      if (next) {
        nativeScanLock = true;
        markPendingAutoplay();
        if (clickEl(next)) {
          notify("⏭ Siguiente episodio");
          setTimeout(() => { nativeScanLock = false; }, 1800);
          return;
        }
        nativeScanLock = false;
      }
    }
  }

  function handleResumeDialogs() {
    if (resumeHandled || effective.resumeBehavior === "ignore") return;

    const norm = s => String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[¿?¡!.,:;]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const continueWords = [
      "aceptar","continuar","reanudar","seguir","seguir viendo","retomar",
      "resume","continue","keep watching","resume watching","continue watching"
    ];
    const restartWords = [
      "cancelar","empezar","desde el principio","reiniciar","desde cero",
      "start over","restart","from beginning","from the beginning"
    ];

    const resumePhrases = [
      "parece que anteriormente estabas mirando este video",
      "parece que anteriormente estabas viendo este video",
      "deseas continuar donde te quedaste",
      "quieres continuar donde te quedaste",
      "continuar donde te quedaste",
      "reanudar desde donde lo dejaste",
      "seguir desde donde lo dejaste",
      "retomar donde lo dejaste",
      "continue where you left off",
      "resume where you left off",
      "pick up where you left off",
      "continue watching",
      "resume watching",
      "you left off at"
    ];

    const bodyText = norm(document.body?.innerText || document.body?.textContent || "");
    const phraseHit = resumePhrases.some(p => bodyText.includes(norm(p)));
    if (!phraseHit) return;

    const textOf = el => norm(
      el?.innerText ||
      el?.textContent ||
      el?.value ||
      el?.getAttribute?.("aria-label") ||
      el?.getAttribute?.("title") ||
      ""
    );

    const matchesAny = (el, words) => {
      const t = textOf(el);
      return words.some(w => {
        const n = norm(w);
        return t === n || t.includes(n);
      });
    };

    // 1) JKAnime y otros players: busca directamente botones visibles en TODO el documento.
    // Es más fiable que intentar adivinar la estructura exacta del modal.
    const globalButtons = [
      ...$$("button"),
      ...$$("a"),
      ...$$("[role='button']"),
      ...$$("input[type='button']"),
      ...$$("input[type='submit']")
    ].filter(visible);

    let wanted = effective.resumeBehavior === "restart" ? restartWords : continueWords;
    let btn = globalButtons.find(el => matchesAny(el, wanted));

    // 2) Si no aparece como button/a, algunos players usan div/span clicables.
    if (!btn) {
      const clickable = [
        ...$$("[onclick]"),
        ...$$("[tabindex='0']"),
        ...$$(".btn"),
        ...$$("[class*='button' i]")
      ].filter(visible);
      btn = clickable.find(el => matchesAny(el, wanted));
    }

    // 3) Intenta también dentro de iframes same-origin.
    if (!btn) {
      for (const iframe of $$("iframe")) {
        try {
          const doc = iframe.contentDocument;
          if (!doc) continue;
          const iframeText = norm(doc.body?.innerText || doc.body?.textContent || "");
          if (!resumePhrases.some(p => iframeText.includes(norm(p)))) continue;

          const els = [
            ...doc.querySelectorAll("button,a,[role='button'],input[type='button'],input[type='submit'],[onclick],[tabindex='0']")
          ].filter(el => {
            const r = el.getBoundingClientRect();
            const s = iframe.contentWindow.getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
          });

          btn = els.find(el => {
            const t = norm(el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "");
            return wanted.some(w => t === norm(w) || t.includes(norm(w)));
          });

          if (btn) break;
        } catch (_) {}
      }
    }

    if (!btn) return;

    // Evita disparar varias veces por el escáner periódico.
    resumeHandled = true;

    try {
      btn.focus?.();
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles:true, cancelable:true }));
      btn.dispatchEvent(new MouseEvent("mousedown", { bubbles:true, cancelable:true, view:window }));
      btn.dispatchEvent(new MouseEvent("mouseup", { bubbles:true, cancelable:true, view:window }));
      btn.click();
    } catch (_) {
      try { btn.click(); } catch (_) {
        resumeHandled = false;
        return;
      }
    }

    notify(effective.resumeBehavior === "restart"
      ? "↺ Skipper: empezando desde el principio"
      : "▶ Skipper: continuando donde lo dejaste");

    // El modal puede recrear el player. Reintenta encontrar el vídeo y reproducirlo.
    const retry = (n=0) => {
      const v = findVideo();
      if (v) {
        currentVideo = v;
        try {
          const p = v.play();
          if (p?.catch) p.catch(() => {});
        } catch (_) {}
      }
      if (n < 5) setTimeout(() => retry(n+1), 400);
    };
    setTimeout(() => retry(0), 250);
  }

  function nextEpisodeUrl() {
    if (!meta) return location.href;
    const next = Number(meta.episode || 0) + 1;

    const native = findBySelectors(siteRules.nextSelectors || [])
      || findButtonByText(rulesData?.textPatterns?.next || []);
    if (native?.href) return native.href;

    if (siteKey === "jkanime" && meta.slug) return `${location.origin}/${meta.slug}/${next}/`;
    if ((siteKey === "animeflv" || siteKey === "tioanime") && meta.slug) {
      return `${location.origin}/ver/${meta.slug}-${next}`;
    }
    if (siteKey === "animeav1" && meta.slug) {
      return `${location.origin}/media/${meta.slug}/${next}`;
    }
    return location.href;
  }

  function markPendingAutoplay() {
    if (!effective.autoPlayNext) return;
    try {
      sessionStorage.setItem("aniflow:autoplay-next","1");
      sessionStorage.setItem("aniflow:autoplay-ts",String(Date.now()));
    } catch (_) {}
  }

  function hasPendingAutoplay() {
    if (!effective.autoPlayNext) return false;
    try {
      if (sessionStorage.getItem("aniflow:autoplay-next") !== "1") return false;
      const ts = Number(sessionStorage.getItem("aniflow:autoplay-ts") || 0);
      if (!ts || Date.now() - ts > 30000) {
        clearPendingAutoplay();
        return false;
      }
      return true;
    } catch (_) { return false; }
  }

  function clearPendingAutoplay() {
    try {
      sessionStorage.removeItem("aniflow:autoplay-next");
      sessionStorage.removeItem("aniflow:autoplay-ts");
    } catch (_) {}
  }

  async function tryAutoplay(video) {
    if (!hasPendingAutoplay() || !video) return;
    const playing = () => !video.paused && !video.ended && video.readyState >= 2;

    const attempt = async () => {
      try { await video.play(); } catch (_) {}
      await new Promise(r => setTimeout(r,250));
      return playing();
    };

    if (await attempt()) {
      clearPendingAutoplay();
      notify("▶ Reproduciendo siguiente episodio");
      return;
    }

    await new Promise(r => setTimeout(r,700));
    if (await attempt()) {
      clearPendingAutoplay();
      notify("▶ Reproduciendo siguiente episodio");
      return;
    }

    const selectors = [
      ...(siteRules.playSelectors || []),
      ".vjs-big-play-button",".plyr__control--overlaid",".jw-icon-playback",".jw-display-icon-container",
      ".fp-ui","[aria-label*='Play' i]","[title*='Play' i]",".play-button",".btn-play",".big-play-button",".video-play-button",".play"
    ];

    const btn = findBySelectors(selectors) || findButtonByText(rulesData?.textPatterns?.play || []);
    if (btn && clickEl(btn)) {
      await new Promise(r => setTimeout(r,350));
      if (playing()) {
        clearPendingAutoplay();
        notify("▶ Play automático OK");
        return;
      }
    }

    // JKAnime: el botón naranja está superpuesto al centro del vídeo.
    if (siteKey === "jkanime") {
      try {
        const rect = video.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width/2);
        const y = Math.round(rect.top + rect.height/2);
        const stack = document.elementsFromPoint(x,y);
        for (const el of stack) {
          if (!el || el === video || el === document.body || el === document.documentElement) continue;
          if (!visible(el)) continue;
          if (clickEl(el)) {
            await new Promise(r => setTimeout(r,350));
            if (playing()) {
              clearPendingAutoplay();
              notify("▶ Play automático OK");
              return;
            }
          }
        }
      } catch (_) {}
    }

    const wasMuted = video.muted;
    try {
      video.muted = true;
      await video.play();
      await new Promise(r => setTimeout(r,300));
      if (playing()) {
        setTimeout(() => { try { video.muted = wasMuted; } catch (_) {} },900);
        clearPendingAutoplay();
        notify("▶ Play automático OK");
        return;
      }
    } catch (_) {
      video.muted = wasMuted;
    }

    notify("Skipper: autoplay bloqueado; pulsa Play una vez");
  }

  function goNext() {
    if (!effective.enabled || !effective.autoNext || nextTriggered || !meta) return;
    if (Number.isFinite(meta.maxEpisode) && Number(meta.episode) >= Number(meta.maxEpisode)) return;

    // Prioridad: botón nativo de la plataforma.
    const native = findBySelectors(siteRules.nextSelectors || [])
      || findButtonByText(rulesData?.textPatterns?.next || []);
    if (native) {
      nextTriggered = true;
      markPendingAutoplay();
      clickEl(native);
      notify("Siguiente episodio");
      return;
    }

    if (["jkanime","animeflv","tioanime","animeav1"].includes(siteKey)) {
      const url = nextEpisodeUrl();
      if (!url || url === location.href) return;
      nextTriggered = true;
      markPendingAutoplay();
      notify(`Siguiente episodio: ${Number(meta.episode)+1}`);
      setTimeout(() => { location.href = url; },450);
    }
  }

  async function saveHistory(force=false, playbackAction="progress", snapshot=currentVideo) {
    if (!effective.enabled || !effective.saveHistory || !meta || !snapshot) return;
    const position=Number(snapshot.currentTime),duration=Number(snapshot.duration);
    if(!Number.isFinite(position)||position<0||!Number.isFinite(duration)||duration<=0)return;
    const now = Date.now();
    if (!force && now - lastHistorySave < 10000) return;
    lastHistorySave = now;

    const key = `history:${siteKey}:${meta.slug || slugify(meta.title)}`;
    await localSet({
      [key]: {
        siteKey,
        slug: meta.slug,
        title: meta.title || pageTitleCandidate(),
        episode: meta.episode,
        currentTime: Math.min(position,duration),
        duration,
        season: 1,
        playbackAction,
        url: location.href,
        updatedAt: now
      }
    });
  }

  function onTimeUpdate() {
    if (!effective.enabled || !currentVideo || currentVideo.seeking) return;

    const t = currentVideo.currentTime;
    if (!Number.isFinite(t)) return;
    lastStableTime = t;

    updateSkipButton();
    saveHistory(false);

    for (const r of ranges) {
      if (!shouldSkip(r.type) || skipped.has(r.id)) continue;
      if (t >= r.start - 0.25 && t < r.end - 0.15) {
        skipped.add(r.id);
        emitSkipEvent(r, t, false, "autoskip");
        currentVideo.currentTime = Math.min(r.end + 0.05, currentVideo.duration - 0.25);
        const saved = Math.max(0, Math.round(r.end - t));
        notify(`⏭ Saltando ${typeLabel(r.type)} · +${formatTime(saved)}`);
        emitSkipperState();
        break;
      }
    }

    if (effective.autoNext &&
        Number.isFinite(currentVideo.duration) &&
        currentVideo.duration > 0 &&
        t >= currentVideo.duration - 0.35) {
      goNext();
    }
  }

  async function buildFrameConfig(duration) {
    let frameRanges = [];
    let source = "Controles nativos";

    if (Number.isFinite(duration) && duration > 0) {
      const response = await fetchAniSkip(duration);
      if (response?.ok) {
        const exact = normalize(response.data, duration);
        if (exact.length) {
          frameRanges = exact;
          source = "AniSkip · reproductor embebido";
        } else {
          frameRanges = fallback(duration);
          source = frameRanges.length ? "Fallback 90 s · reproductor embebido" : "Controles nativos";
        }
      } else {
        frameRanges = fallback(duration);
        source = frameRanges.length ? "Fallback 90 s · reproductor embebido" : "Controles nativos";
      }
    }

    timingSource = source;
    refreshHud();
    emitSkipperState();

    return {
      ranges: frameRanges,
      timingSource: source,
      autoplay: !!effective.autoPlayNext,
      trackingPageUrl: location.href,
      settings: {
        enabled: !!effective.enabled,
        skipOP: !!effective.skipOP,
        skipRecap: !!effective.skipRecap,
        skipED: !!effective.skipED,
        autoNext: !!effective.autoNext,
        autoPlayNext: !!effective.autoPlayNext,
        notifications: !!effective.notifications,
        respectManualRewind: !!effective.respectManualRewind
      }
    };
  }

  async function attachVideo(video) {
    if (!video || currentVideo === video) return;

    try { currentVideoAbort?.abort(); } catch (_) {}
    currentVideoAbort = new AbortController();
    const signal = currentVideoAbort.signal;

    currentVideo = video;
    skipped.clear();
    nextTriggered = false;

    const loadData = async () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;

      const response = await fetchAniSkip(duration);
      if (currentVideo !== video || signal.aborted) return;

      if (response?.ok) {
        const exact = normalize(response.data,duration);
        if (exact.length) {
          ranges = exact;
          timingSource = "AniSkip";
        } else {
          ranges = fallback(duration);
          timingSource = ranges.length ? "Fallback 90 s" : "Controles nativos";
        }
      } else {
        ranges = fallback(duration);
        timingSource = ranges.length ? "Fallback 90 s" : "Controles nativos";
      }

      refreshHud();
      emitSkipperState();
      notify(ranges.length ? "Skipper listo" : "Skipper listo · modo nativo");
    };

    video.addEventListener("loadedmetadata", loadData, { once:true, signal });
    if (video.readyState >= 1) loadData();

    const autoplayWhenReady = () => tryAutoplay(video);
    video.addEventListener("canplay", autoplayWhenReady, { once:true, signal });
    if (video.readyState >= 3) autoplayWhenReady();

    video.addEventListener("seeking", () => { seekFrom = Number(lastStableTime || video.currentTime || 0); }, { signal });
    video.addEventListener("seeked", () => {
      if (!effective.respectManualRewind) return;
      const to = Number(video.currentTime || 0), from = Number(seekFrom || 0);
      if (!Number.isFinite(to) || !Number.isFinite(from) || from - to < 2) return;
      // Un retroceso manual significa “quiero volver a verlo”: no volvemos a empujar
      // automáticamente hacia delante dentro de los tramos que el usuario acaba de recuperar.
      for (const r of ranges) {
        const a=Number(r?.start), b=Number(r?.end);
        if (!Number.isFinite(a)||!Number.isFinite(b)) continue;
        if (b >= to - .5 && a <= from + .5) skipped.add(r.id);
      }
      notify("↩ Retroceso manual respetado");
      emitSkipperState();
    }, { signal });
    video.addEventListener("timeupdate", onTimeUpdate, { signal });
    video.addEventListener("playing", () => {void saveHistory(true,"start");}, { signal });
    video.addEventListener("pause", () => {void saveHistory(true,"pause");}, { signal });
    video.addEventListener("ended", async () => {
      await saveHistory(true,"ended");
      goNext();
    }, { signal });
  }

  async function setManualMapping(payload) {
    if (!meta?.slug) return { ok:false };
    const key = `animeOverride:${siteKey}:${meta.slug}`;
    await syncSet({
      [key]: {
        malId: Number(payload.malId),
        maxEpisode: Number(payload.maxEpisode || 9999),
        title: payload.title || meta.title || pageTitleCandidate()
      }
    });
    return { ok:true };
  }

  async function clearManualMapping() {
    if (!meta?.slug) return { ok:false };
    const key = `animeOverride:${siteKey}:${meta.slug}`;
    return new Promise(resolve => chrome.storage.sync.remove(key,() => resolve({ok:true})));
  }

  async function saveSeriesProfile(payload) {
    const key = profileKey();
    if (!key) return {ok:false};
    const profile = {};
    for (const k of ["skipOP","skipRecap","skipED","autoNext","autoPlayNext","fallback90","notifications","nativeButtons","showSkipButton","respectManualRewind"]) {
      if (typeof payload[k] === "boolean") profile[k] = payload[k];
    }
    await syncSet({[key]:profile});
    return {ok:true};
  }

  async function clearSeriesProfile() {
    const key = profileKey();
    if (!key) return {ok:false};
    return new Promise(resolve => chrome.storage.sync.remove(key,() => resolve({ok:true})));
  }

  chrome.runtime.onMessage.addListener((message,sender,sendResponse) => {
    if (message?.type === "ANIFLOW_PLAYER_READY_FORWARD") {
      buildFrameConfig(Number(message.duration || 0)).then(config => {
        sendResponse({ ok:true, config });
      }).catch(() => sendResponse({ ok:false }));
      return true;
    }
    if (message?.type === "ANIFLOW_PLAYER_EVENT_FORWARD") {
      if(["start","progress","pause","ended"].includes(message.event)&&message.pageUrl!==location.href){sendResponse({ok:false,reason:"stale-player-context"});return;}
      if (["start","progress","pause","ended"].includes(message.event)) {
        const write=saveHistory(message.event!=="progress",message.event,{currentTime:message.position,duration:message.duration});
        if(message.event==="ended"&&effective.autoNext)void write.then(()=>goNext());
      }
      if (message.event === "skip") {
        const r = message.range || {};
        const saved = Math.max(0, Math.round(Number(r.end || 0) - Number(message.fromTime || 0)));
        notify(`⏭ Saltando ${typeLabel(r.type)}${saved ? ` · +${formatTime(saved)}` : ""}`);
      }
      sendResponse({ ok:true });
      return;
    }
    if (message?.type === "GET_PAGE_INFO") {
      sendResponse({
        ok:true,
        siteKey,
        meta,
        detectionStatus,
        timingSource,
        settings: effective
      });
      return;
    }
    if (message?.type === "SET_MANUAL_MAPPING") {
      setManualMapping(message).then(sendResponse);
      return true;
    }
    if (message?.type === "CLEAR_MANUAL_MAPPING") {
      clearManualMapping().then(sendResponse);
      return true;
    }
    if (message?.type === "SAVE_SERIES_PROFILE") {
      saveSeriesProfile(message.profile || {}).then(sendResponse);
      return true;
    }
    if (message?.type === "CLEAR_SERIES_PROFILE") {
      clearSeriesProfile().then(sendResponse);
      return true;
    }
  });

  chrome.storage.onChanged.addListener(async (changes,area) => {
    if (area !== "sync") return;
    for (const [key,value] of Object.entries(changes)) {
      if (key in DEFAULTS) settings[key] = value.newValue;
    }
    await applySeriesProfile();
    refreshHud();
  });


  async function refreshPageContextIfNeeded() {
    if (location.href === lastPageUrl) return false;
    lastPageUrl = location.href;

    try { currentVideoAbort?.abort(); } catch (_) {}
    currentVideoAbort = null;
    currentVideo = null;
    ranges = [];
    skipped.clear();
    nextTriggered = false;
    resumeHandled = false;
    detectionStatus = "Detectando…";
    timingSource = "—";

    siteKey = detectSiteKey();
    siteRules = rulesData?.sites?.[siteKey] || {};
    await detectAnime();
    await applySeriesProfile();
    refreshHud();
    emitSkipperState();
    return true;
  }

  async function boot() {
    await loadRules();
    await loadSettings();
    await detectAnime();
    await applySeriesProfile();

    injectStyles();
    injectHud();
    injectSkipButton();
    refreshHud();
    emitSkipperState();

    let tickBusy = false;
    const tick = async () => {
      if (tickBusy) return;
      tickBusy = true;
      try {
        await refreshPageContextIfNeeded();
        const v = findVideo();
        if (v) attachVideo(v);
        handleResumeDialogs();
        handleNativeControls();
        updateSkipButton();
      } finally {
        tickBusy = false;
      }
    };
    const timer = setInterval(() => { void tick(); }, 650);
    void tick();

    window.addEventListener("beforeunload",() => {
      clearInterval(timer);
      saveHistory(true,"stop");
    },{once:true});
  }

  boot();
})();
