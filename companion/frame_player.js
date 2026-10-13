(() => {
  "use strict";

  const PROTECTED_HOSTS = [
    "netflix.com","disneyplus.com","primevideo.com","amazon.com","amazon.es",
    "crunchyroll.com","hidive.com","max.com","hbomax.com","tv.apple.com",
    "paramountplus.com","hulu.com","peacocktv.com","skyshowtime.com",
    "movistarplus.es","filmin.es"
  ];
  const ANIME_PARENT_HOSTS = [
    "jkanime.net","animeflv.net","tioanime.com","animeav1.com","animefenix.com","animefenix2.tv"
  ];

  function contextHaystack() {
    const parts = [location.href, document.referrer || ""];
    try { parts.push(...Array.from(location.ancestorOrigins || [])); } catch (_) {}
    return parts.join(" ").toLowerCase();
  }

  function hasAnyHost(list) {
    const hay = contextHaystack();
    return list.some(h => hay.includes(h));
  }

  if (window === window.top) return;
  if (hasAnyHost(PROTECTED_HOSTS) || !hasAnyHost(ANIME_PARENT_HOSTS)) return;

  // Puente genérico para reproductores embebidos/cross-origin.
  // Controla elementos <video> ya accesibles dentro del frame y coordina
  // continuidad de pantalla completa con el frame principal.

  const DEFAULTS = {
    enabled: true,
    skipOP: true,
    skipRecap: true,
    skipED: true,
    autoNext: true,
    autoPlayNext: true,
    notifications: true,
    respectManualRewind: true
  };

  const FULLSCREEN_ARM_REMAINING = 15;

  let settings = { ...DEFAULTS };
  let trackingPageUrl=null;
  let video = null;
  let ranges = [];
  let skipped = new Set();
  let lastReadyDuration = 0;
  let lastReadyAt = 0;
  let fullscreenArmSent = false;
  let fullscreenRestorePending = false;
  let fullscreenFallback = null;
  let fullscreenFallbackStyle = null;
  let fullscreenVideoStyle = null;
  let fullscreenBodyOverflow = null;
  let promotionBound = false;
  let attachedAbort = null;
  let lastStableTime = 0;
  let seekFrom = 0;

  const shouldSkip = type => {
    if (["op","mixed-op"].includes(type)) return settings.skipOP;
    if (type === "recap") return settings.skipRecap;
    if (["ed","mixed-ed"].includes(type)) return settings.skipED;
    return false;
  };

  const send = msg => new Promise(resolve => {
    try { chrome.runtime.sendMessage(msg, resolve); }
    catch (_) { resolve(null); }
  });

  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  const logDebug = extra => {
    try {
      chrome.storage.local.set({
        "debug:lastPlayerFrame": {
          url: location.href,
          host: location.hostname,
          time: Date.now(),
          hasVideo: !!video,
          duration: Number(video?.duration || 0),
          ranges: ranges.length,
          fullscreen: isFullscreen(),
          fullscreenRestorePending,
          ...extra
        }
      });
    } catch (_) {}
  };

  function pickPlayerContainer(v) {
    if (!v) return null;
    let el = v.parentElement;
    let fallback = el || v;
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      let rect;
      try { rect = el.getBoundingClientRect(); } catch (_) { rect = null; }
      const cls = String(el.className || "").toLowerCase();
      const id = String(el.id || "").toLowerCase();
      const tag = String(el.tagName || "").toLowerCase();
      if (/player|video-js|plyr|jwplayer|vjs|media|embed/.test(`${cls} ${id}`) || tag === "video") return el;
      if (rect && rect.width > 420 && rect.height > 220) fallback = el;
    }
    return fallback || v;
  }

  function enterLocalFallback() {
    if (!video || fullscreenFallback) return;
    const c = pickPlayerContainer(video) || video;
    fullscreenFallback = c;
    fullscreenFallbackStyle = c.getAttribute("style");
    fullscreenVideoStyle = video.getAttribute("style");
    fullscreenBodyOverflow = document.body?.style?.overflow ?? "";

    Object.assign(c.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      maxWidth: "100vw",
      maxHeight: "100vh",
      margin: "0",
      padding: "0",
      zIndex: "2147483647",
      background: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    });
    Object.assign(video.style, {
      width: "100%",
      height: "100%",
      maxWidth: "100vw",
      maxHeight: "100vh",
      objectFit: "contain",
      background: "#000"
    });
    if (document.body) document.body.style.overflow = "hidden";
  }

  function exitLocalFallback() {
    if (!fullscreenFallback) return;
    if (fullscreenFallbackStyle === null) fullscreenFallback.removeAttribute("style");
    else fullscreenFallback.setAttribute("style", fullscreenFallbackStyle || "");
    if (video) {
      if (fullscreenVideoStyle === null) video.removeAttribute("style");
      else video.setAttribute("style", fullscreenVideoStyle || "");
    }
    if (document.body) document.body.style.overflow = fullscreenBodyOverflow || "";
    fullscreenFallback = null;
    fullscreenFallbackStyle = null;
    fullscreenVideoStyle = null;
  }

  async function promoteNativeFullscreen() {
    if (!fullscreenRestorePending || isFullscreen()) return false;
    const target = fullscreenFallback || pickPlayerContainer(video) || video || document.documentElement;
    if (!target) return false;
    try {
      if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: "hide" });
      else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
      else return false;
      if (isFullscreen()) {
        fullscreenRestorePending = false;
        exitLocalFallback();
        await send({ type: "ANIFLOW_FULLSCREEN_NATIVE", host: location.hostname, url: location.href });
        logDebug({ event: "fullscreen-native-restored" });
        return true;
      }
    } catch (_) {}
    return false;
  }

  function bindPromotionGesture() {
    if (promotionBound) return;
    promotionBound = true;
    const promote = () => {
      if (!fullscreenRestorePending || isFullscreen()) return;
      // Debe ejecutarse directamente desde el gesto del usuario para que Chromium lo permita.
      promoteNativeFullscreen();
    };
    document.addEventListener("pointerdown", promote, true);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && fullscreenRestorePending && !isFullscreen()) {
        fullscreenRestorePending = false;
        exitLocalFallback();
        send({ type:"ANIFLOW_FULLSCREEN_CANCEL", host:location.hostname, url:location.href });
        return;
      }
      if (e.key === "F11") return;
      promote();
    }, true);
  }

  function armFullscreenContinuation(reason) {
    if (fullscreenArmSent || !isFullscreen()) return;
    fullscreenArmSent = true;
    send({
      type: "ANIFLOW_FULLSCREEN_ARM",
      host: location.hostname,
      url: location.href,
      reason: reason || "near-end"
    });
    logDebug({ event: "fullscreen-arm", reason });
  }

  function watchFullscreenNearEnd() {
    if (!video || !isFullscreen()) return;
    const duration = Number(video.duration || 0);
    const current = Number(video.currentTime || 0);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return;
    if (duration - current <= FULLSCREEN_ARM_REMAINING && duration - current >= -1) {
      armFullscreenContinuation("near-end");
    }
  }

  async function announceReady(force=false) {
    if (!video) return;
    const duration = Number(video.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;

    const now = Date.now();
    if (!force && Math.abs(duration-lastReadyDuration) < 0.25 && now-lastReadyAt < 4000) return;
    lastReadyDuration = duration;
    lastReadyAt = now;

    const res = await send({
      type: "ANIFLOW_PLAYER_READY",
      duration,
      url: location.href,
      host: location.hostname
    });

    if (res?.ok && res.config) applyConfig(res.config);
    if (res?.fullscreenRestore) enableFullscreenRestore();
    logDebug({ event: "ready", fullscreenRestore: !!res?.fullscreenRestore });
  }

  function enableFullscreenRestore() {
    if (!video || isFullscreen()) return;
    fullscreenRestorePending = true;
    enterLocalFallback();
    bindPromotionGesture();
    // Best effort: algunos players cambian de episodio sin perder activación.
    promoteNativeFullscreen();
  }

  function applyConfig(config) {
    if (!config || typeof config !== "object") return;
    settings = { ...settings, ...(config.settings || {}) };
    trackingPageUrl=typeof config.trackingPageUrl==="string"?config.trackingPageUrl:null;
    ranges = Array.isArray(config.ranges) ? config.ranges : [];
    skipped.clear();
    if (config.fullscreenRestore) enableFullscreenRestore();
    logDebug({ event: "config", timingSource: config.timingSource || "frame-bridge" });
  }

  async function tryAutoplay() {
    if (!settings.enabled || !settings.autoPlayNext || !video || !video.paused) return;
    try { await video.play(); return; } catch (_) {}
    try {
      const wasMuted = video.muted;
      video.muted = true;
      await video.play();
      setTimeout(() => { try { video.muted = wasMuted; } catch (_) {} }, 900);
    } catch (_) {}
  }

  let lastPlaybackReport=0;
  function reportPlayback(event){if(!video||!settings.enabled||!trackingPageUrl)return;const at=Date.now();if(event==="progress"&&at-lastPlaybackReport<10000)return;lastPlaybackReport=at;send({type:"ANIFLOW_PLAYER_EVENT",event,position:Number(video.currentTime),duration:Number(video.duration),pageUrl:trackingPageUrl,host:location.hostname});}

  function onTimeUpdate() {
    if (!video) return;
    watchFullscreenNearEnd();
    if (!settings.enabled || video.seeking) return;
    const t = Number(video.currentTime || 0);
    if (!Number.isFinite(t)) return;
    lastStableTime = t;
    reportPlayback("progress");

    for (const r of ranges) {
      if (!r || !shouldSkip(r.type) || skipped.has(r.id)) continue;
      const start = Number(r.start), end = Number(r.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (t >= start - 0.25 && t < end - 0.15) {
        skipped.add(r.id);
        try { video.currentTime = Math.min(end + 0.05, Math.max(0, video.duration - 0.25)); } catch (_) {}
        send({ type: "ANIFLOW_PLAYER_EVENT", event: "skip", range: r, fromTime: t, host: location.hostname });
        logDebug({ event: "skip", type: r.type, fromTime: t, toTime: end });
        break;
      }
    }
  }

  function onEnded() {
    // Armamos antes de pedir AutoNext para no perder el estado al navegar.
    armFullscreenContinuation("ended");
    if (!settings.enabled) return;
    reportPlayback("ended");
    logDebug({ event: "ended" });
  }

  function attach(v) {
    if (!v || video === v) return;

    try { attachedAbort?.abort(); } catch (_) {}
    attachedAbort = new AbortController();
    const signal = attachedAbort.signal;

    video = v;
    ranges = [];
    skipped.clear();
    fullscreenArmSent = false;

    v.addEventListener("seeking", () => { seekFrom = Number(lastStableTime || v.currentTime || 0); }, { signal });
    v.addEventListener("seeked", () => {
      if (!settings.respectManualRewind) return;
      const to=Number(v.currentTime||0), from=Number(seekFrom||0);
      if (!Number.isFinite(to)||!Number.isFinite(from)||from-to<2) return;
      for (const r of ranges) {
        const a=Number(r?.start), b=Number(r?.end);
        if (!Number.isFinite(a)||!Number.isFinite(b)) continue;
        if (b >= to-.5 && a <= from+.5) skipped.add(r.id);
      }
      send({type:"ANIFLOW_PLAYER_EVENT",event:"manual-rewind",fromTime:from,toTime:to,host:location.hostname});
      logDebug({event:"manual-rewind",fromTime:from,toTime:to});
    }, { signal });
    v.addEventListener("timeupdate", onTimeUpdate, { signal });
    v.addEventListener("ended", onEnded, { signal });
    v.addEventListener("playing", () => reportPlayback("start"), { signal });
    v.addEventListener("pause", () => reportPlayback("pause"), { signal });
    v.addEventListener("loadedmetadata", () => announceReady(true), { signal });
    v.addEventListener("durationchange", () => announceReady(false), { signal });
    v.addEventListener("canplay", tryAutoplay, { once:true, signal });

    if (v.readyState >= 1) announceReady(true);
    if (v.readyState >= 3) tryAutoplay();
    logDebug({ event: "attach" });
  }

  function scan() {
    const candidates = [...document.querySelectorAll("video")];
    if (!candidates.length) return;
    const ranked = candidates.map(v => {
      let area = 0;
      try {
        const r = v.getBoundingClientRect();
        const s = getComputedStyle(v);
        if (r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden") area = r.width * r.height;
      } catch (_) {}
      return { v, area };
    }).sort((a,b) => b.area-a.area);
    attach(ranked[0]?.v || candidates[0]);
  }

  document.addEventListener("fullscreenchange", () => {
    if (isFullscreen()) {
      if (fullscreenRestorePending) {
        fullscreenRestorePending = false;
        exitLocalFallback();
        send({ type: "ANIFLOW_FULLSCREEN_NATIVE", host: location.hostname, url: location.href });
      }
    } else {
      // Si el usuario sale manualmente de fullscreen, no rearmamos hasta el final.
      fullscreenArmSent = false;
    }
  });

  window.addEventListener("pagehide", () => armFullscreenContinuation("pagehide"), { capture:true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "ANIFLOW_PLAYER_CONFIG") {
      applyConfig(message.config || {});
      if (message.config?.fullscreenRestore) enableFullscreenRestore();
      if (message.config?.autoplay) tryAutoplay();
      sendResponse?.({ ok:true });
      return;
    }
    if (message?.type === "ANIFLOW_FULLSCREEN_RESTORE_FRAME") {
      enableFullscreenRestore();
      sendResponse?.({ ok:true });
      return;
    }
  });

  chrome.storage.sync.get(DEFAULTS, s => { settings = { ...DEFAULTS, ...s }; scan(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k,v] of Object.entries(changes)) if (k in DEFAULTS) settings[k] = v.newValue;
  });

  let scanTimer = null;
  const mo = new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 120);
  });
  try { mo.observe(document.documentElement, { childList:true, subtree:true }); } catch (_) {}
  setInterval(() => {
    scan();
    watchFullscreenNearEnd();
    if (video && !ranges.length) announceReady(false);
  }, 800);
})();
