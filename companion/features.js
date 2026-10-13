(() => {
  "use strict";

  const FDEFAULTS = {
    marathonMode: false,
    countdownEnabled: true,
    countdownSeconds: 3,
    hotkeysEnabled: true,
    cinemaMode: false,
    smartFullscreen: false,
    smartSkipLearning: true,
    statsEnabled: true,
    compatibilityMode: false,
    skipPreview: false,
    previewLeadSeconds: 12,
    accentColor: "#28b6ff",
    smartSkipConfirmations: 2,
    respectManualRewind: true
  };

  let cfg = { ...FDEFAULTS };
  let coreState = null;
  let video = null;
  let countdownRangeId = null;
  let suppressedForEpisode = new Set();
  let recentCoreSkipAt = 0;
  let internalSeekUntil = 0;
  let lastStableTime = 0;
  let seekFrom = 0;
  let learnedRange = null;
  let cinemaSnapshot = null;
  let cinemaContainer = null;
  let featureTimer = null;

  const $ = (s, r=document) => r.querySelector(s);

  const syncGet = obj => new Promise(resolve => chrome.storage.sync.get(obj, resolve));
  const syncSet = obj => new Promise(resolve => chrome.storage.sync.set(obj, resolve));
  const localGet = obj => new Promise(resolve => chrome.storage.local.get(obj, resolve));
  const localSet = obj => new Promise(resolve => chrome.storage.local.set(obj, resolve));

  function slugKey() {
    const m = coreState?.meta || {};
    return `${coreState?.siteKey || "generic"}:${m.slug || String(m.title || "content").toLowerCase().replace(/[^a-z0-9]+/g,"-")}`;
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2,"0");
    return h ? `${h}:${String(m).padStart(2,"0")}:${s}` : `${m}:${s}`;
  }

  function humanSaved(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec/60)}m ${sec%60}s`;
    return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m`;
  }

  async function loadCfg() {
    cfg = { ...FDEFAULTS, ...(await syncGet(FDEFAULTS)) };
    document.documentElement.style.setProperty("--aniflow-accent", cfg.accentColor);
  }

  function findVideo() {
    const direct = document.querySelector("video");
    if (direct) return direct;
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        const v = iframe.contentDocument?.querySelector("video");
        if (v) return v;
      } catch (_) {}
    }
    return null;
  }

  function enabledForType(type) {
    const s = coreState?.settings || {};
    if (["op","mixed-op"].includes(type)) return !!s.skipOP;
    if (type === "recap") return s.skipRecap !== false;
    if (["ed","mixed-ed"].includes(type)) return !!s.skipED;
    return false;
  }

  function nextTimedRange() {
    if (!video || !coreState?.ranges?.length) return null;
    const t = Number(video.currentTime || 0);
    return coreState.ranges.find(r =>
      enabledForType(r.type) &&
      !suppressedForEpisode.has(r.id) &&
      r.start > t &&
      r.start - t <= Number(cfg.countdownSeconds || 3) + 0.35
    ) || null;
  }

  function injectStyle() {
    if ($("#aniflow-feature-style")) return;
    const s = document.createElement("style");
    s.id = "aniflow-feature-style";
    s.textContent = `
      #aniflow-countdown,#aniflow-learn {
        position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);
        background:rgba(10,12,16,.94);color:#fff;border:1px solid rgba(255,255,255,.16);
        box-shadow:0 12px 36px rgba(0,0,0,.42);backdrop-filter:blur(12px);
        font-family:system-ui,-apple-system,Segoe UI,sans-serif
      }
      #aniflow-countdown{bottom:88px;border-radius:14px;padding:10px 12px;display:none;align-items:center;gap:10px}
      #aniflow-countdown .afc-main{font-size:13px;font-weight:750}
      #aniflow-countdown .afc-sub{font-size:10px;opacity:.68;margin-top:2px}
      #aniflow-countdown button,#aniflow-learn button{
        border:0;border-radius:8px;padding:7px 9px;font-weight:750;font-size:11px;cursor:pointer
      }
      #aniflow-countdown .afc-cancel,#aniflow-learn .secondary{background:#2a2f38;color:#fff}
      #aniflow-countdown .afc-skip,#aniflow-learn .primary{background:var(--aniflow-accent,#28b6ff);color:#111}
      #aniflow-learn{bottom:150px;width:min(430px,calc(100vw - 24px));border-radius:14px;padding:12px;display:none}
      #aniflow-learn .title{font-weight:800;font-size:13px}
      #aniflow-learn .copy{font-size:11px;opacity:.72;margin-top:4px}
      #aniflow-learn .actions{display:flex;gap:7px;margin-top:9px}
      #aniflow-marathon-pill{
        position:fixed;left:14px;bottom:14px;z-index:2147483645;
        display:none;padding:6px 9px;border-radius:999px;background:rgba(10,12,16,.9);
        border:1px solid rgba(255,255,255,.12);color:#fff;font:700 10px system-ui;
        box-shadow:0 6px 20px rgba(0,0,0,.3)
      }
    `;
    document.documentElement.appendChild(s);
  }

  function injectUI() {
    injectStyle();

    if (!$("#aniflow-countdown")) {
      const el = document.createElement("div");
      el.id = "aniflow-countdown";
      el.innerHTML = `
        <div style="min-width:150px">
          <div class="afc-main">Opening en 3…</div>
          <div class="afc-sub">Skipper lo saltará automáticamente</div>
        </div>
        <button class="afc-skip">Saltar ya</button>
        <button class="afc-cancel">No saltar esta vez</button>`;
      document.documentElement.appendChild(el);
      $(".afc-skip",el).onclick = () => {
        window.dispatchEvent(new CustomEvent("aniflow:command",{detail:{command:"skip"}}));
        hideCountdown();
      };
      $(".afc-cancel",el).onclick = () => {
        if (countdownRangeId) {
          suppressedForEpisode.add(countdownRangeId);
          window.dispatchEvent(new CustomEvent("aniflow:suppress-range",{detail:{id:countdownRangeId}}));
        }
        hideCountdown();
      };
    }

    if (!$("#aniflow-learn")) {
      const el = document.createElement("div");
      el.id = "aniflow-learn";
      el.innerHTML = `
        <div class="title">🧠 Smart Skip ha detectado un salto manual</div>
        <div class="copy">¿Quieres guardar este tramo como opening para esta serie?</div>
        <div class="actions">
          <button class="primary">Guardar</button>
          <button class="secondary">Ahora no</button>
        </div>`;
      document.documentElement.appendChild(el);
    }

    if (!$("#aniflow-marathon-pill")) {
      const p = document.createElement("div");
      p.id = "aniflow-marathon-pill";
      p.textContent = "🔥 Skipper · Modo Maratón";
      document.documentElement.appendChild(p);
    }

    $("#aniflow-marathon-pill").style.display = (!cfg.compatibilityMode && cfg.marathonMode) ? "block" : "none";
  }

  function hideCountdown() {
    const el = $("#aniflow-countdown");
    if (el) el.style.display = "none";
    countdownRangeId = null;
  }

  function updateCountdown() {
    if (cfg.compatibilityMode || !cfg.countdownEnabled || !video || !coreState?.settings?.enabled) {
      hideCountdown();
      return;
    }

    const r = nextTimedRange();
    if (!r) {
      hideCountdown();
      return;
    }

    const remaining = Math.max(0, Math.ceil(r.start - Number(video.currentTime || 0)));
    const el = $("#aniflow-countdown");
    if (!el) return;

    countdownRangeId = r.id;
    const label = ["ed","mixed-ed"].includes(r.type) ? "Ending" : r.type === "recap" ? "Resumen" : "Opening";
    $(".afc-main",el).textContent = `${label} en ${remaining}…`;
    $(".afc-sub",el).textContent = `Se saltará hasta ${fmt(r.end)}`;
    el.style.display = "flex";
  }

  async function addStats(detail) {
    if (!cfg.statsEnabled || !detail) return;
    const saved = Math.max(0, Math.round(Number(detail.savedSeconds) || 0));
    if (!saved) return;

    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const series = `${detail.siteKey || "generic"}:${detail.meta?.slug || detail.meta?.title || "unknown"}`;

    const keys = {
      "stats:global": { savedSeconds:0, skips:0 },
      [`stats:day:${day}`]: { savedSeconds:0, skips:0 },
      [`stats:series:${series}`]: { savedSeconds:0, skips:0, title:detail.meta?.title || detail.meta?.slug || "Contenido" }
    };
    const current = await localGet(keys);

    for (const [key, def] of Object.entries(keys)) {
      const v = { ...def, ...(current[key] || {}) };
      v.savedSeconds = Number(v.savedSeconds || 0) + saved;
      v.skips = Number(v.skips || 0) + 1;
      v.updatedAt = Date.now();
      if (detail.meta?.title && key.startsWith("stats:series:")) v.title = detail.meta.title;
      await localSet({ [key]: v });
    }
  }

  async function loadLearnedRange() {
    if (!coreState) return;
    const key = `learnedRange:${slugKey()}`;
    const data = await localGet({ [key]: null });
    learnedRange = data[key] || null;
  }

  async function saveLearnedRange(start,end,type="op") {
    if (!coreState) return;
    const key = `learnedRange:${slugKey()}`;
    learnedRange = {
      start: Number(start),
      end: Number(end),
      type,
      title: coreState.meta?.title || "Contenido",
      createdAt: Date.now()
    };
    await localSet({ [key]: learnedRange });
  }

  function maybeApplyLearnedRange() {
    if (cfg.compatibilityMode || !cfg.smartSkipLearning || !learnedRange || learnedRange.bypassForEpisode || !video) return;
    if (learnedRange.type === "recap" ? coreState?.settings?.skipRecap === false : !coreState?.settings?.skipOP) return;
    if (coreState?.timingSource === "AniSkip" && coreState?.ranges?.length) return;

    const t = Number(video.currentTime || 0);
    if (t >= learnedRange.start - 0.15 && t < learnedRange.end - 0.2) {
      internalSeekUntil = Date.now() + 1600;
      const saved = Math.max(0, learnedRange.end - t);
      video.currentTime = learnedRange.end + 0.05;
      addStats({
        savedSeconds: saved,
        siteKey: coreState.siteKey,
        meta: coreState.meta,
        source: "smart-learned"
      });
    }
  }


  function overlapsKnownRange(from, to) {
    const ranges = coreState?.ranges || [];
    return ranges.some(r => {
      const a = Math.max(Number(from), Number(r.start));
      const b = Math.min(Number(to), Number(r.end));
      return b - a >= 8;
    });
  }

  async function registerSmartSkipCandidate(from, to) {
    const key = `smartCandidate:${slugKey()}`;
    const data = await localGet({ [key]: null });
    const prev = data[key];

    const closeEnough = prev &&
      Math.abs(Number(prev.start) - Number(from)) <= 15 &&
      Math.abs(Number(prev.end) - Number(to)) <= 20;

    const next = closeEnough
      ? { ...prev, count: Number(prev.count || 1) + 1, start: from, end: to, updatedAt: Date.now() }
      : { count: 1, start: from, end: to, updatedAt: Date.now() };

    await localSet({ [key]: next });
    return next;
  }

  function attachSmartLearning(v) {
    if (v.dataset.aniflowFeatureAttached === "1") return;
    v.dataset.aniflowFeatureAttached = "1";

    v.addEventListener("timeupdate", () => {
      if (!v.seeking) lastStableTime = Number(v.currentTime || 0);
      maybeApplyLearnedRange();

      if (!cfg.compatibilityMode && cfg.skipPreview &&
          Number.isFinite(v.duration) &&
          v.duration > 0 &&
          v.currentTime >= v.duration - Math.max(3, Number(cfg.previewLeadSeconds || 12)) &&
          !v.ended) {
        window.dispatchEvent(new CustomEvent("aniflow:command",{detail:{command:"next"}}));
      }
    });

    v.addEventListener("seeking", () => {
      seekFrom = lastStableTime;
    });

    v.addEventListener("seeked", async () => {
      const to = Number(v.currentTime || 0);
      const from = Number(seekFrom || 0);
      const delta = to - from;

      if (cfg.respectManualRewind && delta <= -2) {
        for (const r of coreState?.ranges || []) {
          if (Number(r?.end) >= to-.5 && Number(r?.start) <= from+.5) suppressedForEpisode.add(r.id);
        }
        if (learnedRange && Number(learnedRange.end) >= to-.5 && Number(learnedRange.start) <= from+.5) {
          learnedRange = {...learnedRange, bypassForEpisode:true};
        }
        return;
      }

      if (cfg.compatibilityMode || !cfg.smartSkipLearning || Date.now() < internalSeekUntil || Date.now() - recentCoreSkipAt < 2200) return;

      // Smart Skip v0.5:
      // - no aprende si AniSkip ya tiene tiempos;
      // - no aprende saltos que cruzan tramos conocidos;
      // - puede exigir varias coincidencias antes de preguntar.
      if (from < 300 && delta >= 30 && delta <= 190) {
        if (coreState?.timingSource === "AniSkip" || overlapsKnownRange(from, to)) return;

        const learnedType = from <= 20 && to <= 180 ? "recap" : "op";
        const candidate = await registerSmartSkipCandidate(from, to);
        const confirmationsNeeded = learnedType === "recap" ? 1 : Number(cfg.smartSkipConfirmations || 2);
        if (Number(candidate.count || 0) < confirmationsNeeded) return;

        const box = $("#aniflow-learn");
        if (!box) return;
        const learnedLabel = learnedType === "recap" ? "resumen/recap" : "opening";
        $(".copy",box).textContent =
          `Skipper ha visto este salto ${candidate.count} veces: ${fmt(from)} → ${fmt(to)}. ¿Guardarlo como ${learnedLabel} para ${coreState?.meta?.title || "esta serie"}?`;
        box.style.display = "block";

        $(".primary",box).onclick = async () => {
          await saveLearnedRange(from,to,learnedType);
          box.style.display = "none";
        };
        $(".secondary",box).onclick = () => {
          box.style.display = "none";
        };
      }
    });
  }

  function pickCinemaContainer(v) {
    if (!v) return null;
    let el = v.parentElement;
    let fallback = el;
    for (let i=0; el && i<7; i++, el=el.parentElement) {
      const cls = String(el.className || "").toLowerCase();
      const hasControls = el.querySelector?.("button,[role='button']");
      const r = el.getBoundingClientRect();
      if (/player|video-js|plyr|jwplayer|video-container|embed/.test(cls) || (hasControls && r.width > 500 && r.height > 260)) {
        return el;
      }
      if (r.width > 500 && r.height > 260) fallback = el;
    }
    return fallback;
  }

  function enterCinema() {
    if (!video || cinemaContainer) return;
    const c = pickCinemaContainer(video);
    if (!c) return;
    cinemaContainer = c;
    cinemaSnapshot = {
      containerStyle: c.getAttribute("style"),
      videoStyle: video.getAttribute("style")
    };

    Object.assign(c.style, {
      position:"fixed",
      inset:"0",
      width:"100vw",
      height:"100vh",
      zIndex:"2147483000",
      background:"#000",
      margin:"0",
      padding:"0",
      display:"flex",
      alignItems:"center",
      justifyContent:"center"
    });
    Object.assign(video.style, {
      maxWidth:"100vw",
      maxHeight:"100vh"
    });
  }

  function exitCinema() {
    if (!cinemaContainer) return;
    if (cinemaSnapshot?.containerStyle === null) cinemaContainer.removeAttribute("style");
    else cinemaContainer.setAttribute("style", cinemaSnapshot?.containerStyle || "");
    if (video) {
      if (cinemaSnapshot?.videoStyle === null) video.removeAttribute("style");
      else video.setAttribute("style", cinemaSnapshot?.videoStyle || "");
    }
    cinemaContainer = null;
    cinemaSnapshot = null;
  }

  function applyCinema() {
    if (!cfg.compatibilityMode && cfg.cinemaMode) enterCinema();
    else exitCinema();
  }

  function bindFullscreenGesture(v) {
    if (!v || v.dataset.aniflowFullscreenBound === "1") return;
    v.dataset.aniflowFullscreenBound = "1";
    v.addEventListener("click", async () => {
      if (!cfg.smartFullscreen || document.fullscreenElement) return;
      const c = pickCinemaContainer(v) || v;
      try { await c.requestFullscreen?.(); } catch (_) {}
    }, { passive:true });
  }

  function onHotkey(e) {
    if (cfg.compatibilityMode || !cfg.hotkeysEnabled || !e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = e.target?.tagName?.toLowerCase();
    if (["input","textarea","select"].includes(tag) || e.target?.isContentEditable) return;

    const k = e.key.toLowerCase();
    if (!["s","n","p","a"].includes(k)) return;
    e.preventDefault();

    if (k === "s") window.dispatchEvent(new CustomEvent("aniflow:command",{detail:{command:"skip"}}));
    if (k === "n") window.dispatchEvent(new CustomEvent("aniflow:command",{detail:{command:"next"}}));
    if (k === "p") window.dispatchEvent(new CustomEvent("aniflow:command",{detail:{command:"playpause"}}));
    if (k === "a") {
      const newValue = !(coreState?.settings?.enabled ?? true);
      chrome.storage.sync.set({ enabled:newValue });
    }
  }

  async function addRecentAndFavoriteMetadata() {
    if (!coreState?.meta) return;
    const item = {
      siteKey: coreState.siteKey,
      slug: coreState.meta.slug,
      title: coreState.meta.title || coreState.meta.slug || "Contenido",
      episode: coreState.meta.episode,
      maxEpisode: coreState.meta.maxEpisode,
      url: location.href,
      updatedAt: Date.now()
    };
    const data = await localGet({ "recentSeries":[] });
    const arr = Array.isArray(data.recentSeries) ? data.recentSeries : [];
    const key = `${item.siteKey}:${item.slug || item.title}`;
    const next = [item, ...arr.filter(x => `${x.siteKey}:${x.slug || x.title}` !== key)].slice(0,12);
    await localSet({ "recentSeries":next });
  }

  function refreshVideoBinding() {
    const v = findVideo();
    if (v && v !== video) {
      if (cfg.cinemaMode) exitCinema();
      video = v;
      suppressedForEpisode.clear();
      attachSmartLearning(v);
      bindFullscreenGesture(v);
      applyCinema();
    }
  }

  window.addEventListener("aniflow:state", async e => {
    coreState = e.detail || null;
    await loadLearnedRange();
    addRecentAndFavoriteMetadata();
  });

  window.addEventListener("aniflow:skip", e => {
    recentCoreSkipAt = Date.now();
    internalSeekUntil = Date.now() + 1800;
    addStats(e.detail);
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "sync") return;
    let touched = false;
    for (const [k,v] of Object.entries(changes)) {
      if (k in FDEFAULTS) {
        cfg[k] = v.newValue;
        touched = true;
      }
    }
    if (touched) {
      document.documentElement.style.setProperty("--aniflow-accent", cfg.accentColor);
      injectUI();
      applyCinema();
    }
  });

  document.addEventListener("keydown", onHotkey, true);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && cinemaContainer) exitCinema();
  }, true);

  async function boot() {
    await loadCfg();
    injectUI();
    window.dispatchEvent(new CustomEvent("aniflow:request-state"));

    featureTimer = setInterval(() => {
      refreshVideoBinding();
      updateCountdown();
      if ($("#aniflow-marathon-pill")) $("#aniflow-marathon-pill").style.display = (!cfg.compatibilityMode && cfg.marathonMode) ? "block" : "none";
    }, 250);
  }

  boot();
})();
