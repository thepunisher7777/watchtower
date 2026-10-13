(() => {
  "use strict";

  // Skipper Safe DRM Mode v5 · cross-platform native control matrix
  // NO accede/modifica <video>, currentTime, EME/DRM, MediaSource, cookies ni tokens.
  // Solo detecta y activa controles nativos visibles que la propia plataforma expone.
  if (window !== window.top) return;

  const DEFAULTS={enabled:true,skipOP:true,skipRecap:true,skipED:true,autoNext:true,nativeButtons:true,showHud:true};
  const host=location.hostname.toLowerCase();
  const SITE=(()=>{
    if(host.includes('netflix.com'))return'netflix';
    if(host.includes('disneyplus.com'))return'disneyplus';
    if(host.includes('primevideo.com')||host.includes('amazon.com')||host.includes('amazon.es'))return'primevideo';
    if(host.includes('hidive.com'))return'hidive';
    if(host.includes('max.com')||host.includes('hbomax.com'))return'max';
    if(host.includes('tv.apple.com'))return'appletv';
    if(host.includes('paramountplus.com'))return'paramount';
    if(host.includes('hulu.com'))return'hulu';
    if(host.includes('peacocktv.com'))return'peacock';
    if(host.includes('skyshowtime.com'))return'skyshowtime';
    if(host.includes('movistarplus.es'))return'movistarplus';
    if(host.includes('filmin.es'))return'filmin';
    if(host.includes('mubi.com'))return'mubi';
    if(host.includes('rakuten.tv'))return'rakutentv';
    if(host.includes('plex.tv'))return'plex';
    if(host.includes('discoveryplus.com'))return'discoveryplus';
    if(host.includes('britbox.com'))return'britbox';
    if(host.includes('amcplus.com'))return'amcplus';
    if(host.includes('atresplayer.com'))return'atresplayer';
    if(host.includes('rtve.es'))return'rtveplay';
    return'protected';
  })();

  const PHRASES={
    intro:[
      'skip intro','skip opening','skip opening credits','skip credits','omit intro','omit opening',
      'saltar intro','omitir intro','saltar introduccion','omitir introduccion','saltar cabecera','omitir cabecera','saltar opening','omitir opening',
      'passer l intro','ignorer l intro','passer le generique','pular introducao','pular abertura','salta intro','salta sigla','intro uberspringen','vorspann uberspringen'
    ],
    recap:[
      'skip recap','skip previously','skip recapitulacion','skip recapitation','omit recap',
      'saltar resumen','omitir resumen','saltar recap','omitir recap','saltar recapitulacion','omitir recapitulacion',
      'passer le resume','ignorer le resume','pular resumo','salta riassunto','riassunto salta','ruckblick uberspringen','zusammenfassung uberspringen'
    ],
    next:[
      'next episode','play next episode','up next','next chapter','siguiente episodio','proximo episodio','reproducir siguiente episodio','siguiente capitulo','proximo capitulo',
      'episode suivant','prochain episode','episodio seguinte','proximo episodio','episodio successivo','nachste folge'
    ]
  };

  const BASE_SELECTORS={
    intro:[
      "[data-testid*='skip-intro' i]","[data-testid*='skip-opening' i]","[data-uia*='skip-intro' i]","[data-t*='skip-intro' i]",
      "[aria-label*='skip intro' i]","[aria-label*='saltar intro' i]","[aria-label*='omitir intro' i]","[title*='skip intro' i]","[title*='omitir intro' i]"
    ],
    recap:[
      "[data-testid*='skip-recap' i]","[data-uia*='skip-recap' i]","[data-t*='skip-recap' i]",
      "[aria-label*='skip recap' i]","[aria-label*='saltar resumen' i]","[aria-label*='omitir resumen' i]","[title*='skip recap' i]","[title*='omitir resumen' i]"
    ],
    next:[
      "[data-testid*='next-episode' i]","[data-uia*='next-episode' i]","[data-t*='next-episode' i]",
      "[aria-label*='next episode' i]","[aria-label*='siguiente episodio' i]","[aria-label*='próximo episodio' i]","[title*='next episode' i]","[title*='siguiente episodio' i]"
    ]
  };

  // Platform-specific selectors are intentionally conservative. Text matching remains the fallback.
  const SITE_SELECTORS={
    netflix:{
      intro:["[data-uia='player-skip-intro']",".watch-video--skip-content-button"],
      recap:["[data-uia*='skip-recap' i]","[data-uia*='recap' i]"],
      next:["[data-uia='next-episode-seamless-button']",".button-nfplayerNextEpisode"]
    },
    primevideo:{
      intro:["[data-testid*='skip-intro' i]","[class*='skipintro' i]"],
      recap:["[data-testid*='skip-recap' i]","[class*='skiprecap' i]"],
      next:["[data-testid*='next-episode' i]","[class*='next-episode' i]"]
    },
    disneyplus:{
      intro:["[data-testid*='skip-intro' i]","[data-testid*='skip-opening' i]"],
      recap:["[data-testid*='skip-recap' i]"],
      next:["[data-testid*='next-episode' i]","[data-testid*='up-next' i]"]
    },
    max:{
      intro:["[data-testid*='skip-intro' i]","[data-testid*='skip-opening' i]"],
      recap:["[data-testid*='skip-recap' i]"],
      next:["[data-testid*='next-episode' i]","[data-testid*='up-next' i]"]
    },
    appletv:{
      intro:["[data-testid*='skip-intro' i]","[aria-label*='skip intro' i]"],
      recap:["[data-testid*='skip-recap' i]","[aria-label*='skip recap' i]"],
      next:["[data-testid*='next-episode' i]","[aria-label*='next episode' i]"]
    },
    paramount:{intro:["[data-testid*='skip-intro' i]"],recap:["[data-testid*='skip-recap' i]"],next:["[data-testid*='next-episode' i]"]},
    hulu:{intro:["[data-testid*='skip-intro' i]"],recap:["[data-testid*='skip-recap' i]"],next:["[data-testid*='next-episode' i]"]},
    peacock:{intro:["[data-testid*='skip-intro' i]"],recap:["[data-testid*='skip-recap' i]"],next:["[data-testid*='next-episode' i]"]},
    skyshowtime:{intro:["[data-testid*='skip-intro' i]"],recap:["[data-testid*='skip-recap' i]"],next:["[data-testid*='next-episode' i]"]},
    hidive:{intro:["[data-testid*='skip-intro' i]"],recap:["[data-testid*='skip-recap' i]"],next:["[data-testid*='next-episode' i]"]},
    movistarplus:{intro:["[data-testid*='skip-intro' i]"],recap:["[data-testid*='skip-recap' i]"],next:["[data-testid*='next-episode' i]"]},
    filmin:{intro:["[data-testid*='skip-intro' i]"],recap:["[data-testid*='skip-recap' i]"],next:["[data-testid*='next-episode' i]"]}
  };

  let settings={...DEFAULTS},scanTimer=null,pageUrl=location.href,lastAction='Modo seguro activo';
  let lastDetected={intro:false,recap:false,next:false};
  let nextTriggeredHere=false;
  const doneHere=new Set();
  const lastClickAt=new Map();
  const NEXT_GLOBAL_COOLDOWN_MS=90000;

  const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const actionPhrases=k=>(PHRASES[k]||[]).map(normalize);

  function refreshPageGuard(){if(location.href!==pageUrl){pageUrl=location.href;nextTriggeredHere=false;doneHere.clear();lastClickAt.clear()}}
  function visible(el){if(!el||!el.isConnected)return false;try{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>2&&r.height>2&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>.01}catch(_){return false}}
  function disabled(el){try{return !!(el.disabled||el.getAttribute?.('aria-disabled')==='true'||el.getAttribute?.('data-disabled')==='true'||el.closest?.('[aria-disabled="true"],[disabled]'))}catch(_){return false}}

  function roots(){
    const out=[document],q=[document.documentElement],seen=new Set();
    while(q.length&&out.length<120){const n=q.shift();if(!n||seen.has(n))continue;seen.add(n);let all=[];try{all=[...n.querySelectorAll('*')]}catch(_){}for(const el of all){if(el.shadowRoot&&!seen.has(el.shadowRoot)){out.push(el.shadowRoot);q.push(el.shadowRoot)}}}
    return out;
  }
  function deepQueryAll(sel,limit=4000){const out=[];for(const r of roots()){try{for(const el of r.querySelectorAll(sel)){out.push(el);if(out.length>=limit)return [...new Set(out)]}}catch(_){}}return [...new Set(out)]}
  function semanticText(el){return normalize([el?.getAttribute?.('aria-label'),el?.getAttribute?.('title'),el?.getAttribute?.('data-uia'),el?.getAttribute?.('data-testid'),el?.getAttribute?.('data-t'),String(el?.innerText||el?.textContent||'').slice(0,220)].filter(Boolean).join(' '))}
  function matchesPhraseText(text,kind){const n=normalize(text);if(!n)return false;return actionPhrases(kind).some(p=>n.includes(p))}
  function phraseMatch(el,kind){return matchesPhraseText(semanticText(el),kind)}

  function clickableTarget(el){
    if(!el)return null;
    try{const hit=el.closest?.("button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='control' i],[class*='skip' i],[class*='next' i]");if(hit&&visible(hit)&&!disabled(hit))return hit}catch(_){}
    let n=el;for(let i=0;i<6&&n;i++,n=n.parentElement){if(!visible(n)||disabled(n))continue;const tag=String(n.tagName||'').toLowerCase(),role=String(n.getAttribute?.('role')||'').toLowerCase(),cls=String(n.className||'').toLowerCase();if(tag==='button'||tag==='a'||role==='button'||n.tabIndex>=0||/button|control|skip|next/.test(cls))return n}
    try{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(hit&&hit!==el){const t=hit.closest?.("button,[role='button'],a[href],[tabindex],[class*='button' i],[class*='control' i]");if(t&&visible(t)&&!disabled(t))return t}}catch(_){}
    return visible(el)&&!disabled(el)?el:null;
  }

  function selectorFind(kind){
    const selectors=[...(SITE_SELECTORS[SITE]?.[kind]||[]),...(BASE_SELECTORS[kind]||[])];
    for(const sel of selectors){
      for(const raw of deepQueryAll(sel).filter(visible)){
        const el=clickableTarget(raw)||raw;if(!el||disabled(el))continue;
        // Site/base selectors explicitly describe this action. Shared/generic skip classes are not used here.
        return el;
      }
    }
    return null;
  }

  function textFind(kind){
    const selector="button,[role='button'],a[href],[tabindex],[aria-label],[title],[data-testid],[data-uia],[data-t],[class*='button' i],[class*='control' i],[class*='skip' i],[class*='next' i],span,div";
    for(const raw of deepQueryAll(selector,6500)){
      if(!visible(raw))continue;
      let text='';try{text=semanticText(raw)}catch(_){}
      if(!text||text.length>260||!matchesPhraseText(text,kind))continue;
      // Avoid a large parent containing both Intro and Recap; prefer the smallest matching descendant/target.
      if(kind==='intro'&&matchesPhraseText(text,'recap'))continue;
      const el=clickableTarget(raw);if(el&&visible(el)&&!disabled(el)&&phraseMatch(el,kind))return el;
    }
    return null;
  }

  function primeSharedFind(kind){
    if(SITE!=='primevideo'||!['intro','recap'].includes(kind))return null;
    for(const raw of deepQueryAll(".atvwebplayersdk-skipelement-button,[class*='skipelement' i],[class*='skip-element' i]")){
      if(!visible(raw))continue;const el=clickableTarget(raw)||raw;if(phraseMatch(el,kind))return el;
    }
    return null;
  }

  function find(kind){return primeSharedFind(kind)||selectorFind(kind)||textFind(kind)}

  function clickNative(el,kind){
    refreshPageGuard();if(doneHere.has(kind))return false;
    el=clickableTarget(el)||el;if(!visible(el)||disabled(el))return false;
    const key=`${kind}:${semanticText(el).slice(0,110)}`,now=Date.now();if(now-(lastClickAt.get(key)||0)<7000)return false;lastClickAt.set(key,now);
    try{
      el.focus?.({preventScroll:true});
      if(typeof el.click==='function')el.click();
      else{
        for(const type of ['pointerdown','mousedown','pointerup','mouseup','click']){const C=type.startsWith('pointer')&&typeof PointerEvent==='function'?PointerEvent:MouseEvent;el.dispatchEvent(new C(type,{bubbles:true,cancelable:true,view:window,button:0,buttons:type.includes('down')?1:0}))}
      }
      doneHere.add(kind);lastAction=`${kind} · ${new Date().toLocaleTimeString()}`;
      try{chrome.storage.local.set({'debug:lastSafeDrmAction':{site:SITE,kind,text:semanticText(el),url:location.href,time:now,frame:'top'}})}catch(_){}
      refreshHud();return true;
    }catch(_){return false}
  }

  function getLastAutoNextAt(){try{return Number(sessionStorage.getItem('wtSafe:lastAutoNextAt')||0)||0}catch(_){return 0}}
  function setLastAutoNextAt(ts){try{sessionStorage.setItem('wtSafe:lastAutoNextAt',String(ts))}catch(_){} }
  function contextText(el){const parts=[];let n=el;for(let i=0;i<6&&n;i++,n=n.parentElement){try{parts.push(String(n.innerText||n.textContent||'').slice(0,1200))}catch(_){}}return normalize(parts.join(' '))}
  function hasEndEvidence(el){
    const text=contextText(el),phrases=['up next','next episode starts','next episode in','a continuacion','siguiente episodio en','proximo episodio en','autoplay','reproduccion automatica','episode suivant dans','episodio seguinte em','episodio successivo tra'];
    if(phrases.some(p=>text.includes(normalize(p))))return true;
    if(/\b(?:in|en|dans|em|tra)\s*\d{1,2}\s*(?:s|sec|secs|seg|segs|seconds|segundos)?\b/i.test(text))return true;
    return deepQueryAll("[data-testid*='up-next' i],[data-testid*='autoplay' i],[data-testid*='end-card' i],[data-testid*='endcard' i],[data-uia*='seamless' i],[data-uia*='autoplay' i],[class*='upnext' i],[class*='up-next' i],[class*='autoplay' i],[class*='endcard' i],[class*='end-card' i]").some(visible);
  }
  function canAutoNext(el){
    refreshPageGuard();if(!el||nextTriggeredHere||doneHere.has('next-episode'))return false;
    if(Date.now()-getLastAutoNextAt()<NEXT_GLOBAL_COOLDOWN_MS)return false;
    if(SITE==='netflix'&&String(el.getAttribute?.('data-uia')||'').toLowerCase().includes('next-episode-seamless'))return true;
    return hasEndEvidence(el);
  }
  function guardedAutoNext(el){if(!canAutoNext(el))return false;if(!clickNative(el,'next-episode'))return false;nextTriggeredHere=true;setLastAutoNextAt(Date.now());lastAction='next-episode · guardado contra doble salto';refreshHud();return true}

  function playerish(){return /watch|play|video|episode|episodio/i.test(location.pathname+location.search)||!!find('intro')||!!find('recap')||!!find('next')}
  function injectHud(){
    if(!settings.showHud||document.getElementById('wt-safe-hud')||!playerish())return;
    const style=document.createElement('style');style.id='wt-safe-hud-style';style.textContent=`#wt-safe-hud{position:fixed;right:14px;top:126px;z-index:2147483646;width:278px;background:rgba(5,11,20,.93);color:#eff7ff;border:1px solid rgba(103,180,255,.28);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.42);font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;backdrop-filter:blur(12px)}#wt-safe-hud .h{display:flex;align-items:center;gap:9px;padding:10px 11px;border-bottom:1px solid rgba(255,255,255,.08)}#wt-safe-hud .l{width:25px;height:25px;border-radius:8px;background:#58a9ff;color:#06111d;display:grid;place-items:center;font-weight:900}#wt-safe-hud .t{font-weight:800}#wt-safe-hud .s{font-size:10px;opacity:.65}#wt-safe-hud .b{padding:9px 11px}#wt-safe-hud .r{display:flex;justify-content:space-between;gap:8px;margin:4px 0}#wt-safe-hud .ok{color:#81e6b2}#wt-safe-hud .mut{opacity:.65}#wt-safe-hud button{border:0;border-radius:8px;padding:6px 8px;font-weight:750;cursor:pointer;background:#17304d;color:#eaf5ff;margin-top:7px;margin-right:5px}`;document.documentElement.appendChild(style);
    const hud=document.createElement('div');hud.id='wt-safe-hud';hud.innerHTML=`<div class="h"><div class="l">WT</div><div><div class="t">Skipper · ${SITE}</div><div class="s">Safe DRM · matriz nativa v5</div></div></div><div class="b"><div class="r"><span>Opening</span><b class="i">—</b></div><div class="r"><span>Resumen</span><b class="c">—</b></div><div class="r"><span>Siguiente</span><b class="n">—</b></div><div class="r mut"><span>Última acción</span><span class="a">${lastAction}</span></div><button class="scan">Escanear</button><button class="hide">Ocultar</button></div>`;document.documentElement.appendChild(hud);hud.querySelector('.scan').onclick=scan;hud.querySelector('.hide').onclick=()=>hud.remove();refreshHud();
  }
  function refreshHud(){const h=document.getElementById('wt-safe-hud');if(!h)return;const set=(s,on,kind)=>{const e=h.querySelector(s);if(e){e.textContent=doneHere.has(kind)?'Omitido':on?'Detectado':'No visible';e.className=(on||doneHere.has(kind))?'ok':''}};set('.i',lastDetected.intro,'skip-intro');set('.c',lastDetected.recap,'skip-recap');set('.n',lastDetected.next,'next-episode');const a=h.querySelector('.a');if(a)a.textContent=lastAction}

  function scan(){
    refreshPageGuard();if(!settings.enabled||!settings.nativeButtons||document.visibilityState==='hidden')return;
    const recap=doneHere.has('skip-recap')?null:find('recap'),intro=doneHere.has('skip-intro')?null:find('intro'),next=find('next');
    lastDetected={recap:!!recap,intro:!!intro,next:!!next};injectHud();refreshHud();
    if(settings.skipRecap&&recap&&clickNative(recap,'skip-recap'))return;
    if(settings.skipOP&&intro&&clickNative(intro,'skip-intro'))return;
    if(settings.autoNext&&next)guardedAutoNext(next);
  }
  function scheduleScan(){clearTimeout(scanTimer);scanTimer=setTimeout(scan,90)}

  chrome.storage.sync.get(DEFAULTS,s=>{settings={...DEFAULTS,...s};scan()});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='sync')return;for(const[k,v]of Object.entries(changes))if(k in DEFAULTS)settings[k]=v.newValue;scheduleScan()});
  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{if(message?.type==='GET_PAGE_INFO')sendResponse({ok:true,safeDrm:true,siteKey:SITE,detectionStatus:'Safe DRM Mode v5',timingSource:'Controles nativos',lastAction,detected:lastDetected,meta:{title:document.title||SITE,episode:null,slug:SITE}})});
  window.addEventListener('message',e=>{const d=e.data||{};if(d.source!=='WATCHTOWER_DRM_FRAME')return;if(d.site&&d.site!==SITE&&SITE!=='protected')return;if(d.detected){lastDetected={intro:!!(lastDetected.intro||d.detected.intro),recap:!!(lastDetected.recap||d.detected.recap),next:!!(lastDetected.next||d.detected.next)};if(d.action){doneHere.add(d.action);lastAction=`${d.action} · frame`;try{chrome.storage.local.set({'debug:lastSafeDrmFrameAction':{...d,url:location.href,time:Date.now()}})}catch(_){}}injectHud();refreshHud()}});
  const mo=new MutationObserver(scheduleScan);try{mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true,attributeFilter:['class','aria-label','title','data-uia','data-testid','data-t','aria-disabled','disabled']})}catch(_){}
  document.addEventListener('visibilitychange',scheduleScan,{passive:true});setInterval(scan,850);
})();
