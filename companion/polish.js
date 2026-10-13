(() => {
  "use strict";

  const DEFAULTS = {
    hudAutoHide: true,
    hudAutoHideSeconds: 5,
    touchMode: true,
    hideOverlaysFullscreen: false,
    sleepTimerMinutes: 0,
    sessionStats: true,
    diagnosticsEnabled: true,
    timelineEnabled: true,
    historyLimit: 100,
    showSessionPill: false,
    showHealthBadge: false
  };

  let cfg = { ...DEFAULTS };
  let state = null;
  let video = null;
  let hideTimer = null;
  let sleepTimer = null;
  let session = null;
  let lastEpisodeKey = null;
  let stateSeenAt = 0;

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const syncGet = obj => new Promise(r => chrome.storage.sync.get(obj, r));
  const localGet = obj => new Promise(r => chrome.storage.local.get(obj, r));
  const localSet = obj => new Promise(r => chrome.storage.local.set(obj, r));

  function fmt(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = sec%60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
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

  function episodeKey() {
    const m = state?.meta || {};
    return `${state?.siteKey || "generic"}:${m.slug || m.title || "content"}:${m.episode || "?"}`;
  }

  async function loadCfg() {
    cfg = { ...DEFAULTS, ...(await syncGet(DEFAULTS)) };
  }

  function injectStyle() {
    if ($("#aniflow-polish-style")) return;
    const s = document.createElement("style");
    s.id = "aniflow-polish-style";
    s.textContent = `
      #aniflow-hud{transition:opacity .22s ease,transform .22s ease;max-width:270px!important}
      #aniflow-hud .af-chip{display:none!important}
      #aniflow-hud .af-head{padding-right:12px!important}
      #aniflow-hud .af-sub{opacity:.52!important}
      #aniflow-hud .af-body{padding-top:8px!important}
      #aniflow-hud .af-row{font-size:11px!important}
      #aniflow-hud .af-times{font-size:9.5px!important;opacity:.66!important}
      #aniflow-hud.af5-hidden{opacity:.08;transform:translateX(18px);pointer-events:none}
      #aniflow-session-pill{
        position:fixed;left:14px;top:14px;z-index:2147483646;
        border:1px solid rgba(255,255,255,.13);border-radius:999px;
        padding:6px 9px;background:rgba(10,12,16,.9);backdrop-filter:blur(10px);
        color:#fff;font:700 10px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.28)
      }
      #aniflow-health{
        position:fixed;left:14px;top:48px;z-index:2147483645;
        border-radius:999px;padding:4px 7px;background:rgba(10,12,16,.86);
        border:1px solid rgba(255,255,255,.10);color:#bec6d2;font:650 9px system-ui
      }
      #aniflow-mini-timeline{height:5px;background:#242a33;border-radius:999px;overflow:hidden;margin-top:7px;position:relative}
      #aniflow-mini-timeline .seg{position:absolute;top:0;bottom:0;border-radius:999px;background:var(--aniflow-accent,#28b6ff);opacity:.9}
      #aniflow-sleep-toast{
        position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
        z-index:2147483647;background:rgba(9,11,15,.96);color:#fff;
        border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:18px 20px;
        font:600 13px system-ui;box-shadow:0 16px 50px rgba(0,0,0,.45);display:none
      }
      @media (pointer:coarse){
        #aniflow-hud button,#aniflow-countdown button,#aniflow-learn button{min-height:42px;padding:10px 12px!important}
        #aniflow-hud{font-size:13px!important}
        #aniflow-countdown{bottom:110px!important}
      }
    `;
    document.documentElement.appendChild(s);
  }

  function scheduleHudHide() {
    clearTimeout(hideTimer);
    const hud = $("#aniflow-hud");
    if (!hud || !cfg.hudAutoHide || !video || video.paused) {
      hud?.classList.remove("af5-hidden");
      return;
    }
    hud.classList.remove("af5-hidden");
    hideTimer = setTimeout(() => hud.classList.add("af5-hidden"),
      Math.max(2, Number(cfg.hudAutoHideSeconds || 5)) * 1000);
  }

  function bindHudAutohide() {
    document.addEventListener("mousemove", scheduleHudHide, { passive:true });
    document.addEventListener("touchstart", scheduleHudHide, { passive:true });
  }

  function updateTimeline() {
    if (!cfg.timelineEnabled || !state?.ranges?.length || !video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const hud = $("#aniflow-hud .af-body");
    if (!hud) return;
    let tl = $("#aniflow-mini-timeline");
    if (!tl) {
      tl = document.createElement("div");
      tl.id = "aniflow-mini-timeline";
      tl.title = "Tramos detectados";
      hud.appendChild(tl);
    }
    tl.innerHTML = "";
    const d = video.duration;
    for (const r of state.ranges) {
      const seg = document.createElement("span");
      seg.className = "seg";
      seg.style.left = `${Math.max(0, Math.min(100, r.start/d*100))}%`;
      seg.style.width = `${Math.max(.6, Math.min(100, (r.end-r.start)/d*100))}%`;
      seg.title = `${r.type}: ${Math.round(r.start)}–${Math.round(r.end)} s`;
      tl.appendChild(seg);
    }
  }

  async function loadSession() {
    const d = await localGet({"session:current":null});
    session = d["session:current"];
    const now = Date.now();
    if (!session || !session.startedAt || now - Number(session.lastSeenAt || 0) > 4*60*60*1000) {
      session = {id:`s-${now}`,startedAt:now,lastSeenAt:now,episodes:[],savedSeconds:0,skips:0};
    }
    await saveSession();
  }

  async function saveSession() {
    if (!session || !cfg.sessionStats) return;
    session.lastSeenAt = Date.now();
    await localSet({"session:current":session});
    renderSession();
  }

  function renderSession() {
    let p = $("#aniflow-session-pill");
    if (!cfg.showSessionPill) { p?.remove(); return; }
    if (!p) {
      p = document.createElement("div");
      p.id = "aniflow-session-pill";
      document.documentElement.appendChild(p);
    }
    p.textContent = `▶ Sesión · ${session?.episodes?.length || 0} ep · ${fmt(session?.savedSeconds || 0)} ahorrados`;
  }

  async function trackEpisode() {
    if (!cfg.sessionStats || !state?.meta) return;
    const key = episodeKey();
    if (key === lastEpisodeKey) return;
    lastEpisodeKey = key;
    if (!session) await loadSession();
    if (!session.episodes.includes(key)) {
      session.episodes.push(key);
      session.episodes = session.episodes.slice(-50);
      await saveSession();
    }
  }

  async function addSessionSkip(detail) {
    if (!cfg.sessionStats || !detail) return;
    if (!session) await loadSession();
    session.savedSeconds = Number(session.savedSeconds || 0) + Math.max(0, Number(detail.savedSeconds || 0));
    session.skips = Number(session.skips || 0) + 1;
    await saveSession();
  }

  async function cleanupHistory() {
    const limit = Math.max(20, Number(cfg.historyLimit || 100));
    const all = await new Promise(r => chrome.storage.local.get(null, r));
    const entries = Object.entries(all)
      .filter(([k]) => k.startsWith("history:"))
      .map(([key,v]) => ({key, updatedAt:Number(v?.updatedAt || 0)}))
      .sort((a,b) => b.updatedAt - a.updatedAt);
    const excess = entries.slice(limit).map(x => x.key);
    if (excess.length) chrome.storage.local.remove(excess);
  }

  function renderHealth() {
    let h = $("#aniflow-health");
    if (!cfg.showHealthBadge) { h?.remove(); return; }
    if (!h) {
      h = document.createElement("div");
      h.id = "aniflow-health";
      document.documentElement.appendChild(h);
    }
    const checks = {
      state: !!state,
      video: !!video,
      timings: !!(state?.ranges?.length || state?.timingSource === "Controles nativos"),
      recent: Date.now() - stateSeenAt < 15000
    };
    const okCount = Object.values(checks).filter(Boolean).length;
    h.textContent = okCount === 4 ? "● Skipper OK" : okCount >= 2 ? "● Skipper parcial" : "● Revisar Skipper";
    h.style.opacity = okCount === 4 ? "0.72" : "1";

    if (cfg.diagnosticsEnabled) {
      localSet({"health:last":{
        time:Date.now(),url:location.href,siteKey:state?.siteKey||null,
        title:state?.meta?.title||null,episode:state?.meta?.episode||null,
        timingSource:state?.timingSource||null,rangeCount:state?.ranges?.length||0,
        videoFound:!!video,checks
      }});
    }
  }

  function configureSleepTimer() {
    clearTimeout(sleepTimer);
    sleepTimer = null;
    const mins = Number(cfg.sleepTimerMinutes || 0);
    if (!mins) return;
    sleepTimer = setTimeout(() => {
      try { findVideo()?.pause(); } catch (_) {}
      const toast = $("#aniflow-sleep-toast");
      if (toast) {
        toast.textContent = `😴 Skipper pausó la reproducción tras ${mins} min`;
        toast.style.display = "block";
        setTimeout(() => toast.style.display = "none", 5000);
      }
      chrome.storage.sync.set({sleepTimerMinutes:0});
    }, mins*60*1000);
  }

  function injectSleepToast() {
    if ($("#aniflow-sleep-toast")) return;
    const t = document.createElement("div");
    t.id = "aniflow-sleep-toast";
    document.documentElement.appendChild(t);
  }

  function fullscreenOverlayPolicy() {
    const fs = !!document.fullscreenElement;
    for (const id of ["#aniflow-hud","#aniflow-countdown","#aniflow-learn","#aniflow-session-pill","#aniflow-health"]) {
      const el = $(id);
      if (!el) continue;
      if (cfg.hideOverlaysFullscreen && fs) {
        if (!el.dataset.afPrevDisplay) el.dataset.afPrevDisplay = el.style.display || "__default__";
        el.style.display = "none";
      } else if (el.dataset.afPrevDisplay) {
        el.style.display = el.dataset.afPrevDisplay === "__default__" ? "" : el.dataset.afPrevDisplay;
        delete el.dataset.afPrevDisplay;
      }
    }
  }

  function maybeBindVideo() {
    const v = findVideo();
    if (!v || v === video) return;
    video = v;
    video.addEventListener("play", scheduleHudHide);
    video.addEventListener("pause", () => $("#aniflow-hud")?.classList.remove("af5-hidden"));
    video.addEventListener("loadedmetadata", updateTimeline);
    video.addEventListener("durationchange", updateTimeline);
    scheduleHudHide();
    updateTimeline();
  }

  window.addEventListener("aniflow:state", e => {
    state = e.detail || null;
    stateSeenAt = Date.now();
    trackEpisode();
    updateTimeline();
    renderHealth();
  });

  window.addEventListener("aniflow:skip", e => addSessionSkip(e.detail));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    let changed = false;
    for (const [k,v] of Object.entries(changes)) {
      if (k in DEFAULTS) { cfg[k] = v.newValue; changed = true; }
    }
    if (changed) {
      configureSleepTimer();
      scheduleHudHide();
      renderSession();
      renderHealth();
      fullscreenOverlayPolicy();
    }
  });

  document.addEventListener("fullscreenchange", fullscreenOverlayPolicy);

  async function boot() {
    await loadCfg();
    injectStyle();
    injectSleepToast();
    bindHudAutohide();
    await loadSession();
    await cleanupHistory();
    configureSleepTimer();
    setInterval(() => {
      maybeBindVideo();
      renderHealth();
    }, 900);
    window.dispatchEvent(new CustomEvent("aniflow:request-state"));
  }

  boot();
})();
