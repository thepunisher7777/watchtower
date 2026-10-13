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

  const haystack = contextHaystack();
  const protectedContext = PROTECTED_HOSTS.some(h => haystack.includes(h));
  const animeContext = ANIME_PARENT_HOSTS.some(h => haystack.includes(h));
  if (window === window.top || protectedContext || !animeContext) return;

  // Helper mínimo para iframes/reproductores embebidos.
  // No crea UI, no toca DRM y solo actúa si detecta claramente un aviso de reanudación.

  const DEFAULTS = {
    enabled: true,
    resumeBehavior: "continue"
  };

  const norm = s => String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
    "you left off at",
    "reprendre la lecture", "continuer la lecture", "reprendre la ou vous vous etes arrete",
    "continuar assistindo", "retomar reproducao", "continuar de onde parou",
    "continua a guardare", "riprendi la riproduzione",
    "weiter ansehen", "wiedergabe fortsetzen"
  ];

  const continueWords = [
    "aceptar","continuar","reanudar","seguir","seguir viendo","retomar",
    "resume","continue","keep watching","resume watching","continue watching",
    "reprendre","continuer","continuar assistindo","retomar","continua","riprendi","weiter ansehen","fortsetzen"
  ];

  const restartWords = [
    "cancelar","empezar","desde el principio","reiniciar","desde cero",
    "start over","restart","from beginning","from the beginning"
  ];

  let settings = { ...DEFAULTS };
  let handled = false;

  chrome.storage.sync.get(DEFAULTS, s => {
    settings = { ...DEFAULTS, ...s };
    scan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, v] of Object.entries(changes)) {
      if (k in DEFAULTS) settings[k] = v.newValue;
    }
  });

  const visible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  };

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

  function clickLikeHuman(el) {
    if (!el) return false;
    try {
      el.focus?.({ preventScroll:true });
      if (typeof el.click === "function") {
        el.click();
        return true;
      }
      el.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true, view:window }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function tryPlay() {
    const v = document.querySelector("video");
    if (!v) return;
    try {
      const p = v.play();
      if (p?.catch) p.catch(() => {});
    } catch (_) {}
  }

  function scan() {
    if (!settings.enabled || handled || settings.resumeBehavior === "ignore") return;

    const bodyText = norm(document.body?.innerText || document.body?.textContent || "");
    const phraseHit = resumePhrases.some(p => bodyText.includes(norm(p)));
    if (!phraseHit) return;

    const buttons = [
      ...document.querySelectorAll(
        "button,a,[role='button'],input[type='button'],input[type='submit'],[onclick],[tabindex='0'],.btn,[class*='button' i]"
      )
    ].filter(visible);

    const wanted = settings.resumeBehavior === "restart" ? restartWords : continueWords;
    const btn = buttons.find(el => matchesAny(el, wanted));
    if (!btn) return;

    handled = true;

    // Guarda qué frame lo resolvió; útil para luego restringir permisos.
    try {
      chrome.storage.local.set({
        "debug:lastResumeFrame": {
          url: location.href,
          host: location.hostname,
          time: Date.now(),
          behavior: settings.resumeBehavior,
          buttonText: textOf(btn)
        }
      });
    } catch (_) {}

    if (clickLikeHuman(btn)) {
      setTimeout(tryPlay, 250);
      setTimeout(tryPlay, 700);
      setTimeout(tryPlay, 1300);
    } else {
      handled = false;
    }
  }

  // DOM dinámico: reescanea al aparecer el modal.
  let scanTimer = null;
  const mo = new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 120);
  });
  try {
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  } catch (_) {}

  setInterval(scan, 800);
})();
