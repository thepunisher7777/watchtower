(() => {
  "use strict";
  if (window !== window.top) return;

  let activeIframe = null;
  let savedStyle = null;
  let bodyOverflow = null;
  let savedAllowFullscreen = null;
  let hadAllowFullscreen = false;
  let promotionBound = false;

  function visibleArea(el) {
    try {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || r.width <= 0 || r.height <= 0) return 0;
      return r.width * r.height;
    } catch (_) { return 0; }
  }

  function findIframe(host, url) {
    const frames = [...document.querySelectorAll("iframe")];
    if (!frames.length) return null;
    const normalizedHost = String(host || "").replace(/^www\./, "");
    const byExact = frames.find(f => {
      const src = String(f.src || f.getAttribute("src") || "");
      return url && src === url;
    });
    if (byExact) return byExact;
    const byHost = frames.filter(f => {
      const src = String(f.src || f.getAttribute("src") || "");
      try { return new URL(src, location.href).hostname.replace(/^www\./, "") === normalizedHost; }
      catch (_) { return normalizedHost && src.includes(normalizedHost); }
    }).sort((a,b) => visibleArea(b)-visibleArea(a))[0];
    if (byHost) return byHost;
    return frames.sort((a,b) => visibleArea(b)-visibleArea(a))[0] || null;
  }

  function enterIframeFallback(iframe) {
    if (!iframe) return;
    if (activeIframe && activeIframe !== iframe) clearFallback();
    if (activeIframe === iframe) return;
    activeIframe = iframe;
    savedStyle = iframe.getAttribute("style");
    bodyOverflow = document.body?.style?.overflow ?? "";
    hadAllowFullscreen = iframe.hasAttribute("allowfullscreen");
    savedAllowFullscreen = iframe.getAttribute("allowfullscreen");
    Object.assign(iframe.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      maxWidth: "100vw",
      maxHeight: "100vh",
      margin: "0",
      padding: "0",
      border: "0",
      zIndex: "2147483647",
      background: "#000"
    });
    try { iframe.setAttribute("allowfullscreen", "true"); } catch (_) {}
    if (document.body) document.body.style.overflow = "hidden";
  }

  function clearFallback() {
    if (!activeIframe) return;
    if (savedStyle === null) activeIframe.removeAttribute("style");
    else activeIframe.setAttribute("style", savedStyle || "");
    if (hadAllowFullscreen) activeIframe.setAttribute("allowfullscreen", savedAllowFullscreen ?? "");
    else activeIframe.removeAttribute("allowfullscreen");
    if (document.body) document.body.style.overflow = bodyOverflow || "";
    activeIframe = null;
    savedStyle = null;
    savedAllowFullscreen = null;
    hadAllowFullscreen = false;
  }

  async function promoteTopNative() {
    if (!activeIframe || document.fullscreenElement) return;
    try {
      if (activeIframe.requestFullscreen) await activeIframe.requestFullscreen({ navigationUI:"hide" });
      else if (activeIframe.webkitRequestFullscreen) activeIframe.webkitRequestFullscreen();
    } catch (_) {}
  }

  function bindPromotionGesture() {
    if (promotionBound) return;
    promotionBound = true;
    const promote = () => promoteTopNative();
    document.addEventListener("pointerdown", promote, true);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && activeIframe && !document.fullscreenElement) {
        clearFallback();
        return;
      }
      if (e.key === "F11") return;
      promote();
    }, true);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "ANIFLOW_FULLSCREEN_RESTORE_TOP") {
      const iframe = findIframe(message.host, message.url);
      if (iframe) {
        enterIframeFallback(iframe);
        bindPromotionGesture();
        // Best effort; normally Chromium will require a fresh gesture.
        promoteTopNative();
      }
      sendResponse?.({ ok: !!iframe });
      return;
    }
    if (message?.type === "ANIFLOW_FULLSCREEN_CLEAR_TOP") {
      clearFallback();
      sendResponse?.({ ok:true });
      return;
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement && activeIframe) clearFallback();
  });

  const staleObserver = new MutationObserver(() => {
    if (activeIframe && !activeIframe.isConnected) {
      if (document.body) document.body.style.overflow = bodyOverflow || "";
      activeIframe = null;
      savedStyle = null;
      savedAllowFullscreen = null;
      hadAllowFullscreen = false;
    }
  });
  try { staleObserver.observe(document.documentElement, { childList:true, subtree:true }); } catch (_) {}
})();
