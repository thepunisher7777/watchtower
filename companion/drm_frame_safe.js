(() => {
  "use strict";
  if(window===window.top)return;
  const context=(()=>{const p=[location.href,document.referrer||''];try{p.push(...Array.from(location.ancestorOrigins||[]))}catch(_){}return p.join(' ').toLowerCase()})();
  const site=(()=>{
    if(context.includes('netflix.com'))return'netflix';if(context.includes('disneyplus.com'))return'disneyplus';
    if(context.includes('primevideo.com')||context.includes('amazon.com')||context.includes('amazon.es'))return'primevideo';
    if(context.includes('hidive.com'))return'hidive';if(context.includes('max.com')||context.includes('hbomax.com'))return'max';
    if(context.includes('tv.apple.com'))return'appletv';if(context.includes('paramountplus.com'))return'paramount';if(context.includes('hulu.com'))return'hulu';
    if(context.includes('peacocktv.com'))return'peacock';if(context.includes('skyshowtime.com'))return'skyshowtime';if(context.includes('movistarplus.es'))return'movistarplus';
    if(context.includes('filmin.es'))return'filmin';if(context.includes('mubi.com'))return'mubi';if(context.includes('rakuten.tv'))return'rakutentv';if(context.includes('plex.tv'))return'plex';
    if(context.includes('discoveryplus.com'))return'discoveryplus';if(context.includes('britbox.com'))return'britbox';if(context.includes('amcplus.com'))return'amcplus';
    if(context.includes('atresplayer.com'))return'atresplayer';if(context.includes('rtve.es'))return'rtveplay';return'';
  })();
  if(!site)return;
  const DEFAULTS={enabled:true,skipOP:true,skipRecap:true,nativeButtons:true};let settings={...DEFAULTS},timer=null;const done=new Set(),lastClick=new Map();
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const PHRASES={
    intro:['skip intro','skip opening','skip opening credits','saltar intro','omitir intro','saltar introduccion','omitir introduccion','saltar cabecera','omitir cabecera','passer l intro','pular introducao','salta intro','intro uberspringen'],
    recap:['skip recap','skip previously','saltar resumen','omitir resumen','saltar recap','omitir recap','saltar recapitulacion','omitir recapitulacion','passer le resume','pular resumo','salta riassunto','ruckblick uberspringen']
  };
  const visible=el=>{if(!el||!el.isConnected)return false;try{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>2&&r.height>2&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>.01}catch(_){return false}};
  const disabled=el=>{try{return !!(el?.disabled||el?.getAttribute?.('aria-disabled')==='true'||el?.closest?.('[aria-disabled="true"],[disabled]'))}catch(_){return false}};
  function roots(){const out=[document],q=[document.documentElement],seen=new Set();while(q.length&&out.length<80){const n=q.shift();if(!n||seen.has(n))continue;seen.add(n);let all=[];try{all=[...n.querySelectorAll('*')]}catch(_){}for(const el of all){if(el.shadowRoot&&!seen.has(el.shadowRoot)){out.push(el.shadowRoot);q.push(el.shadowRoot)}}}return out}
  function all(sel,limit=4500){const out=[];for(const r of roots()){try{for(const el of r.querySelectorAll(sel)){out.push(el);if(out.length>=limit)return [...new Set(out)]}}catch(_){}}return [...new Set(out)]}
  function text(el){return norm([el?.getAttribute?.('aria-label'),el?.getAttribute?.('title'),el?.getAttribute?.('data-testid'),el?.getAttribute?.('data-uia'),el?.getAttribute?.('data-t'),String(el?.innerText||el?.textContent||'').slice(0,220)].filter(Boolean).join(' '))}
  function target(el){if(!el)return null;try{const x=el.closest?.("button,[role='button'],a[href],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='control' i],[class*='skip' i]");if(x&&visible(x)&&!disabled(x))return x}catch(_){}let n=el;for(let i=0;i<6&&n;i++,n=n.parentElement){if(!visible(n)||disabled(n))continue;const tag=String(n.tagName||'').toLowerCase(),role=String(n.getAttribute?.('role')||'').toLowerCase(),cls=String(n.className||'').toLowerCase();if(tag==='button'||tag==='a'||role==='button'||n.tabIndex>=0||/button|control|skip/.test(cls))return n}return null}
  function find(kind){
    const p=(PHRASES[kind]||[]).map(norm),sel="button,[role='button'],a[href],[tabindex],[aria-label],[title],[data-testid],[data-uia],[data-t],[class*='button' i],[class*='control' i],[class*='skip' i],span,div";
    for(const raw of all(sel)){if(!visible(raw))continue;const t=text(raw);if(!t||t.length>260||!p.some(x=>t.includes(x)))continue;if(kind==='intro'&&(PHRASES.recap||[]).map(norm).some(x=>t.includes(x)))continue;const el=target(raw);if(el&&visible(el)&&!disabled(el))return el}return null;
  }
  function report(intro,recap,action=''){try{window.top.postMessage({source:'WATCHTOWER_DRM_FRAME',site,detected:{intro:!!intro,recap:!!recap,next:false},action},'*')}catch(_){} }
  function click(el,kind){if(done.has(kind))return false;el=target(el);if(!el)return false;const key=kind+':'+text(el).slice(0,110),now=Date.now();if(now-(lastClick.get(key)||0)<7000)return false;lastClick.set(key,now);try{el.focus?.({preventScroll:true});if(typeof el.click==='function')el.click();else el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));done.add(kind);report(kind==='skip-intro',kind==='skip-recap',kind);try{chrome.storage.local.set({'debug:lastSafeDrmFrameAction':{site,kind,text:text(el),frameUrl:location.href,time:now}})}catch(_){}return true}catch(_){return false}}
  function scan(){if(!settings.enabled||!settings.nativeButtons||document.visibilityState==='hidden')return;const recap=done.has('skip-recap')?null:find('recap'),intro=done.has('skip-intro')?null:find('intro');report(intro,recap);if(settings.skipRecap&&recap&&click(recap,'skip-recap'))return;if(settings.skipOP&&intro)click(intro,'skip-intro')}
  function schedule(){clearTimeout(timer);timer=setTimeout(scan,80)}
  chrome.storage.sync.get(DEFAULTS,s=>{settings={...DEFAULTS,...s};scan()});chrome.storage.onChanged.addListener((c,a)=>{if(a!=='sync')return;for(const[k,v]of Object.entries(c))if(k in DEFAULTS)settings[k]=v.newValue;schedule()});
  const mo=new MutationObserver(schedule);try{mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true,attributeFilter:['class','aria-label','title','data-testid','data-uia','data-t','aria-disabled','disabled']})}catch(_){}setInterval(scan,800);
})();
