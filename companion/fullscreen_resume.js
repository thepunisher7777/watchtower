(() => {
  "use strict";

  // Skipper Fullscreen Continuity
  // Native Fullscreen cannot normally be re-entered automatically after a page
  // navigation because Chromium requires a fresh user gesture. To keep marathon
  // playback visually continuous we:
  // 1) remember that the outgoing episode was fullscreen near its end,
  // 2) put the next player into a viewport-filling fallback immediately,
  // 3) promote that fallback to native Fullscreen on the first user gesture.

  const KEY = "aniflow:fullscreen-next";
  const TS_KEY = "aniflow:fullscreen-next-ts";
  const URL_KEY = "aniflow:fullscreen-next-url";
  const MAX_AGE = 45000;
  const ARM_REMAINING_SECONDS = 12;

  let video = null;
  let fallbackContainer = null;
  let containerStyle = null;
  let videoStyle = null;
  let bodyOverflow = null;
  let armedForRestore = false;
  let promotionBound = false;
  let timer = null;
  let autoAttemptedForUrl = "";

  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  function safeSet(k, v) {
    try { sessionStorage.setItem(k, v); } catch (_) {}
  }

  function safeGet(k) {
    try { return sessionStorage.getItem(k); } catch (_) { return null; }
  }

  function safeRemove(k) {
    try { sessionStorage.removeItem(k); } catch (_) {}
  }

  function clearPending() {
    safeRemove(KEY);
    safeRemove(TS_KEY);
    safeRemove(URL_KEY);
  }

  function armPending() {
    if (!isFullscreen()) return;
    safeSet(KEY, "1");
    safeSet(TS_KEY, String(Date.now()));
    safeSet(URL_KEY, location.href);
  }

  function hasFreshPending() {
    if (safeGet(KEY) !== "1") return false;
    const ts = Number(safeGet(TS_KEY) || 0);
    if (!ts || Date.now() - ts > MAX_AGE) {
      clearPending();
      return false;
    }
    const from = safeGet(URL_KEY) || "";
    // A pending marker belongs to the outgoing page. Do not trigger the fallback
    // while we are still on that same episode waiting for AutoNext.
    return !!from && from !== location.href;
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

  function pickContainer(v) {
    if (!v) return null;
    let el = v.parentElement;
    let fallback = el || v;
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      const cls = String(el.className || "").toLowerCase();
      const rect = el.getBoundingClientRect();
      const hasControls = !!el.querySelector?.("button,[role='button']");
      if (/player|video-js|plyr|jwplayer|video-container|embed/.test(cls) ||
          (hasControls && rect.width > 420 && rect.height > 220)) {
        return el;
      }
      if (rect.width > 420 && rect.height > 220) fallback = el;
    }
    return fallback || v;
  }

  function enterFallback(v) {
    if (!v || fallbackContainer) return;
    const c = pickContainer(v);
    if (!c) return;

    fallbackContainer = c;
    containerStyle = c.getAttribute("style");
    videoStyle = v.getAttribute("style");
    bodyOverflow = document.body?.style?.overflow ?? "";

    Object.assign(c.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      maxWidth: "100vw",
      maxHeight: "100vh",
      margin: "0",
      padding: "0",
      zIndex: "2147483646",
      background: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    });
    Object.assign(v.style, {
      width: "100%",
      height: "100%",
      maxWidth: "100vw",
      maxHeight: "100vh",
      objectFit: "contain",
      background: "#000"
    });
    if (document.body) document.body.style.overflow = "hidden";
  }

  function exitFallback() {
    if (!fallbackContainer) return;
    if (containerStyle === null) fallbackContainer.removeAttribute("style");
    else fallbackContainer.setAttribute("style", containerStyle || "");

    if (video) {
      if (videoStyle === null) video.removeAttribute("style");
      else video.setAttribute("style", videoStyle || "");
    }
    if (document.body) document.body.style.overflow = bodyOverflow || "";

    fallbackContainer = null;
    containerStyle = null;
    videoStyle = null;
  }

  async function requestNativeFullscreen() {
    if (!armedForRestore || isFullscreen()) return false;
    const target = fallbackContainer || pickContainer(video) || video || document.documentElement;
    if (!target) return false;
    try {
      if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: "hide" });
      else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
      else return false;
      if (isFullscreen()) {
        armedForRestore = false;
        clearPending();
        // Native fullscreen now owns the presentation; remove our fallback styles.
        exitFallback();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function bindPromotionGesture() {
    if (promotionBound) return;
    promotionBound = true;

    const promote = () => {
      if (!armedForRestore || isFullscreen()) return;
      // Called synchronously from the user's gesture so Chromium grants fullscreen.
      requestNativeFullscreen();
    };

    document.addEventListener("pointerdown", promote, true);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && armedForRestore && !isFullscreen()) {
        armedForRestore = false;
        clearPending();
        exitFallback();
        return;
      }
      if (e.key === "F11") return;
      promote();
    }, true);
  }

  function restoreIfNeeded() {
    if (!hasFreshPending()) return;
    const v = findVideo();
    if (!v) return;
    video = v;
    armedForRestore = true;
    enterFallback(v);
    bindPromotionGesture();

    // Solo un intento automático por URL. Si Chromium exige gesto de usuario,
    // los listeners de pointer/teclado harán la promoción nativa sin bombardear
    // requestFullscreen() desde un temporizador.
    if (autoAttemptedForUrl !== location.href) {
      autoAttemptedForUrl = location.href;
      requestNativeFullscreen();
    }
  }

  function watchOutgoingEpisode() {
    const v = findVideo();
    if (v) video = v;
    if (!video || !isFullscreen()) return;
    const duration = Number(video.duration || 0);
    const current = Number(video.currentTime || 0);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return;
    const remaining = duration - current;
    if (remaining <= ARM_REMAINING_SECONDS && remaining >= -1) armPending();
  }

  document.addEventListener("fullscreenchange", () => {
    if (isFullscreen()) {
      // If the next page managed to enter fullscreen natively, the pending state
      // is no longer needed.
      if (armedForRestore) {
        armedForRestore = false;
        clearPending();
        exitFallback();
      }
    }
  });

  // If a platform changes URL with History API instead of full navigation,
  // periodically re-check both the outgoing and incoming state.
  timer = setInterval(() => {
    watchOutgoingEpisode();
    restoreIfNeeded();
  }, 500);

  window.addEventListener("pagehide", () => {
    watchOutgoingEpisode();
  }, { capture: true });

  // Initial fast checks reduce the visible flash after loading the next episode.
  [0, 80, 180, 350, 700, 1200].forEach(ms => setTimeout(restoreIfNeeded, ms));
})();
