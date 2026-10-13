(() => {
  'use strict';
  if (window !== window.top) return;

  // WatchTower Streaming Importer v7 · cross-platform canonical-title guard
  // Reads metadata already rendered by the service UI. It never touches <video>,
  // EME/DRM, cookies, session tokens or hidden account APIs.

  const host = location.hostname.toLowerCase();
  const PROVIDER = (() => {
    if (host.includes('netflix.com')) return 'Netflix';
    if (host.includes('disneyplus.com')) return 'Disney+';
    if (host.includes('primevideo.com') || /amazon\.(com|es)$/.test(host)) return 'Prime Video';
    if (host.includes('crunchyroll.com')) return 'Crunchyroll';
    if (host.includes('hidive.com')) return 'HIDIVE';
    if (host.includes('max.com') || host.includes('hbomax.com')) return 'Max';
    if (host.includes('tv.apple.com')) return 'Apple TV+';
    if (host.includes('paramountplus.com')) return 'Paramount+';
    if (host.includes('hulu.com')) return 'Hulu';
    if (host.includes('peacocktv.com')) return 'Peacock';
    if (host.includes('skyshowtime.com')) return 'SkyShowtime';
    if (host.includes('movistarplus.es')) return 'Movistar Plus+';
    if (host.includes('filmin.es')) return 'Filmin';
    if (host.includes('mubi.com')) return 'MUBI';
    if (host.includes('rakuten.tv')) return 'Rakuten TV';
    if (host.includes('plex.tv')) return 'Plex';
    if (host.includes('discoveryplus.com')) return 'Discovery+';
    if (host.includes('britbox.com')) return 'BritBox';
    if (host.includes('amcplus.com')) return 'AMC+';
    if (host.includes('atresplayer.com')) return 'Atresplayer';
    if (host.includes('rtve.es')) return 'RTVE Play';
    return host || 'Streaming';
  })();

  const SITE = PROVIDER.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const MAX_ITEMS = 450;
  const observed = new Map();
  let publishTimer = null;
  let lastFingerprint = '';

  const normalize = v => String(v || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const hasAny=(text,terms)=>{const n=normalize(text);return terms.some(x=>n.includes(normalize(x)))};

  const WATCHLIST_TERMS = [
    'my list','mi lista','watchlist','watch list','lista de seguimiento','my stuff','mi contenido',
    'my queue','mi cola','queue','up next','a continuación','a continuacion','saved','guardados',
    'favoritos','favorites','favourites','pendientes','wishlist','lista de deseos','mi selección','mi seleccion'
  ];
  const CONTINUE_TERMS = [
    'continue watching','seguir viendo','continue','resume','continuar viendo','continuar','keep watching',
    'watch again','seguir reproduciendo','retomar','continue to watch'
  ];


  // Provider-aware guardrails. We prefer missing a doubtful card to polluting the library
  // with an episode name, CTA, section heading or artwork still.
  const PROVIDER_PROFILE = {
    'Netflix': {series:/\/(?:title)\//i, movie:null, episode:/\/watch\//i},
    'Disney+': {series:/\/series\//i, movie:/\/(?:movie|movies)\//i, episode:/\/(?:video|episode)\//i},
    'Prime Video': {series:/\/(?:detail|gp\/video\/detail)\//i, movie:null, episode:null},
    'Crunchyroll': {series:/\/series\//i, movie:/\/movie\//i, episode:/\/watch\//i, strictEpisodeParent:true},
    'HIDIVE': {series:/\/(?:tv|series|show)\//i, movie:/\/(?:movie|film)\//i, episode:/\/(?:watch|stream|episode|video)\//i},
    'Max': {series:/\/(?:show|series)\//i, movie:/\/movie\//i, episode:/\/(?:video|episode|watch)\//i},
    'Apple TV+': {series:/\/show\//i, movie:/\/movie\//i, episode:/\/episode\//i, strictEpisodeParent:true},
    'Paramount+': {series:/\/(?:shows|show|series)\//i, movie:/\/(?:movies|movie)\//i, episode:/\/(?:video|episode|watch)\//i},
    'Hulu': {series:/\/(?:series|hub|show)\//i, movie:/\/(?:movie|movies)\//i, episode:/\/(?:watch|episode)\//i},
    'Peacock': {series:/\/(?:watch|collections|show|series)\//i, movie:/\/(?:movie|movies)\//i, episode:/\/(?:watch|episode)\//i},
    'SkyShowtime': {series:/\/(?:series|tv|show)\//i, movie:/\/(?:movie|movies)\//i, episode:/\/(?:watch|episode|video)\//i},
    'Movistar Plus+': {series:/\/(?:serie|series|ficha)\//i, movie:/\/(?:pelicula|cine|ficha)\//i, episode:/\/(?:ver|video|episodio|ficha)\//i},
    'Filmin': {series:/\/(?:serie|series)\//i, movie:/\/(?:pelicula|film)\//i, episode:/\/(?:capitulo|episodio|video)\//i},
    'MUBI': {series:/\/(?:series)\//i, movie:/\/(?:films|film)\//i, episode:/\/(?:watch|episode)\//i},
    'Rakuten TV': {series:/\/(?:series|tv_shows)\//i, movie:/\/(?:movies|movie)\//i, episode:/\/(?:episodes|episode|watch)\//i},
    'Plex': {series:/\/(?:show|series)\//i, movie:/\/(?:movie|film)\//i, episode:/\/(?:episode|watch)\//i},
    'Discovery+': {series:/\/(?:shows|show|series)\//i, movie:/\/(?:movies|movie)\//i, episode:/\/(?:video|episode|watch)\//i},
    'BritBox': {series:/\/(?:show|series|programme)\//i, movie:/\/(?:movie|film)\//i, episode:/\/(?:episode|watch|video)\//i},
    'AMC+': {series:/\/(?:shows|show|series)\//i, movie:/\/(?:movies|movie)\//i, episode:/\/(?:episode|watch|video)\//i},
    'Atresplayer': {series:/\/(?:series|programas|programa)\//i, movie:/\/(?:peliculas|pelicula)\//i, episode:/\/(?:capitulo|episodio|video)\//i},
    'RTVE Play': {series:/\/(?:series|programas|programa)\//i, movie:/\/(?:peliculas|cine)\//i, episode:/\/(?:video|capitulo|episodio)\//i}
  };
  const PROFILE = PROVIDER_PROFILE[PROVIDER] || {series:/\/(?:series|show|tv)\//i,movie:/\/(?:movie|movies|film)\//i,episode:/\/(?:watch|episode|video|play)\//i};
  const GLOBAL_UI_TERMS = [
    ...WATCHLIST_TERMS,...CONTINUE_TERMS,'play','watch','resume','reanudar','continuar','continue','ver ahora','watch now',
    'more info','mas informacion','más información','details','detalles','episodes','episodios','season','temporada',
    'add to watchlist','remove from watchlist','añadir a mi lista','agregar a mi lista','quitar de mi lista','included with','se incluye con',
    'subscription','suscripcion','suscripción','trailer','avance','preview','siguiente episodio','next episode','skip intro','saltar intro','skip recap','saltar resumen'
  ];
  function globalJunkTitle(raw){
    const t=String(raw||'').replace(/\s+/g,' ').trim(),n=normalize(t);if(!t)return true;
    if(t.length<3||t.length>150)return true;
    if(/^\d{1,3}%$/.test(t)||/^\d{1,2}:\d{2}(?::\d{2})?$/.test(t))return true;
    if(/^(?:t|s)\s*\d+\s*e\s*\d+\b/i.test(t)||/^(?:e|ep\.?|episodio|episode|cap[ií]tulo)\s*\d+\b/i.test(t))return true;
    if(/^(?:season|temporada)\s*\d+(?:\s*[-–—:·|]\s*)?(?:episode|episodio|cap[ií]tulo)?\s*\d*/i.test(t))return true;
    const exact=GLOBAL_UI_TERMS.some(x=>n===normalize(x));if(exact)return true;
    if(/^(?:resume|reanudar|continue|continuar|watch now|ver ahora|play|reproducir|included with|se incluye con|add to|añadir|agregar|remove from|quitar)\b/i.test(t))return true;
    if(n===normalize(PROVIDER)||n===normalize(PROVIDER.replace('+','')))return true;
    return false;
  }

  function rendered(el) {
    if (!el || !el.isConnected) return false;
    try { const s=getComputedStyle(el); return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0; }
    catch (_) { return true; }
  }
  function absUrl(href){try{return new URL(href||'',location.href).href}catch(_){return location.href}}
  function textOf(el){if(!el)return '';return String(el.getAttribute?.('aria-label')||el.getAttribute?.('title')||el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()}
  function imageRatio(img){
    let w=Number(img?.naturalWidth)||Number(img?.getAttribute?.('width'))||0,h=Number(img?.naturalHeight)||Number(img?.getAttribute?.('height'))||0;
    if(!(w&&h)){try{const r=img.getBoundingClientRect();w=r.width;h=r.height}catch(_){}}
    return w&&h?w/h:0;
  }
  function imageUrl(img){
    const vals=[img?.currentSrc,img?.src,img?.getAttribute?.('src'),img?.getAttribute?.('data-src')].filter(Boolean);
    const ss=img?.getAttribute?.('srcset')||img?.getAttribute?.('data-srcset')||'';
    if(ss){for(const part of ss.split(','))vals.push(part.trim().split(/\s+/)[0])}
    return vals.find(u=>/^https?:\/\//i.test(String(u||''))&&!/(sprite|logo|avatar|profile|icon|badge)/i.test(String(u||'')))||'';
  }
  function portraitCoverFrom(root){
    if(!root)return '';let imgs=[];try{imgs=[...root.querySelectorAll('img')]}catch(_){}
    const rows=[];
    for(const img of imgs.slice(0,30)){
      const src=imageUrl(img);if(!src)continue;const ratio=imageRatio(img);if(ratio&&ratio>0.96)continue;
      const alt=cleanTitle(img.getAttribute?.('alt')||'');let score=0;if(ratio&&ratio<0.82)score+=80;if(alt&&!globalJunkTitle(alt))score+=30;
      score+=(Number(img.naturalWidth)||0)*(Number(img.naturalHeight)||0)/100000;
      rows.push({src,score});
    }
    rows.sort((a,b)=>b.score-a.score);return rows[0]?.src||'';
  }
  function landscapeArtworkFrom(root){
    if(!root)return '';let imgs=[];try{imgs=[...root.querySelectorAll('img')]}catch(_){}
    const rows=[];for(const img of imgs.slice(0,30)){const src=imageUrl(img);if(!src)continue;const ratio=imageRatio(img);if(ratio&&ratio<1.15)continue;rows.push({src,score:(Number(img.naturalWidth)||0)*(Number(img.naturalHeight)||0)})}
    rows.sort((a,b)=>b.score-a.score);return rows[0]?.src||'';
  }

  function parseSeasonEpisode(text) {
    const s=String(text||'').replace(/\s+/g,' ');
    const patterns=[
      /\b(?:S|T)\s*(\d{1,3})\s*[:·.\-]?\s*E\s*(\d{1,4})\b/i,
      /\b(?:season|temporada)\s*(\d{1,3}).{0,35}?(?:episode|episodio|cap[ií]tulo)\s*(\d{1,4})\b/i,
      /\b(\d{1,3})x(\d{1,4})\b/i
    ];
    for(const re of patterns){const m=s.match(re);if(m)return {season:Number(m[1])||1,episode:Number(m[2])||1}}
    const ep=s.match(/\b(?:E|episode|episodio|cap[ií]tulo|ep\.?)\s*[#:.-]?\s*(\d{1,4})\b/i);
    return {season:null,episode:ep?Number(ep[1])||null:null};
  }

  function progressFrom(root){
    if(!root)return null;
    const sels=["[role='progressbar'][aria-valuenow]","[role='slider'][aria-valuenow]","[aria-label*='progress' i][aria-valuenow]","[aria-label*='progreso' i][aria-valuenow]"];
    for(const sel of sels){let nodes=[];try{nodes=[...root.querySelectorAll(sel)]}catch(_){}for(const el of nodes){const n=Number(el.getAttribute('aria-valuenow')),min=Number(el.getAttribute('aria-valuemin')||0),max=Number(el.getAttribute('aria-valuemax')||100);if(Number.isFinite(n)&&Number.isFinite(max)&&max>min){const p=Math.round((n-min)/(max-min)*100);if(p>=1&&p<=99)return p}}}
    let styled=[];try{styled=[...root.querySelectorAll("[class*='progress' i] [style*='width'],[class*='progress' i][style*='width'],[data-uia*='progress' i] [style*='width']")]}catch(_){}
    for(const el of styled){const m=String(el.getAttribute('style')||'').match(/width\s*:\s*([0-9.]+)%/i);if(m){const p=Math.round(Number(m[1]));if(p>=1&&p<=99)return p}}
    return null;
  }

  const NOISE=[/^play$/i,/^reproducir$/i,/^watch$/i,/^ver$/i,/^resume$/i,/^continuar$/i,/^continue watching$/i,/^seguir viendo$/i,/^my list$/i,/^mi lista$/i,/^watchlist$/i,/^my stuff$/i,/^more info$/i,/^más información$/i,/^details$/i,/^detalles$/i,/^episodes?$/i,/^episodios?$/i];
  function cleanTitle(raw){
    let t=String(raw||'').replace(/\s+/g,' ').trim();
    t=t.replace(/^(?:play|watch|resume|continue|reproducir|ver|continuar)\s*[:\-–—]?\s*/i,'');
    t=t.replace(/\s*[·|•]\s*(?:S|T)\s*\d+\s*E\s*\d+.*$/i,'');
    t=t.replace(/\s*[·|•]\s*(?:episode|episodio|cap[ií]tulo)\s*\d+.*$/i,'');
    if(NOISE.some(re=>re.test(t)))return '';
    if(t.length<2||t.length>160)return '';
    return t;
  }

  function episodeishTitle(t){return /^(?:T\s*\d+\s*)?E\s*\d+\b|^(?:episode|episodio|cap[ií]tulo|ep\.?)\s*\d+\b/i.test(String(t||'').trim())}

  function visibleSeriesLinkTitle(){
    // Especially useful on Crunchyroll watch pages where H1 is the episode title.
    const selectors=["a[href*='/series/']","a[href*='/show/']","a[href*='/tv/']"];
    const found=[];
    for(const sel of selectors){
      let nodes=[];try{nodes=[...document.querySelectorAll(sel)]}catch(_){}
      for(const a of nodes){
        if(!rendered(a))continue;
        const t=cleanTitle(a.getAttribute('aria-label'))||cleanTitle(a.getAttribute('title'))||cleanTitle(a.textContent);
        if(!t||episodeishTitle(t))continue;
        const r=a.getBoundingClientRect();
        // Prefer links around the upper/player area, then shortest clean label.
        found.push({t,score:(r.top>=0&&r.top<900?30:0)+(t.length<70?10:0)-Math.min(20,t.length/10)});
      }
    }
    found.sort((a,b)=>b.score-a.score);
    return found[0]?.t||'';
  }

  function seriesFromDocumentTitle(){
    const d=cleanTitle(document.title);
    if(!d)return '';
    const ep=d.match(/^(.*?)\s*[-–—|·]\s*(?:T\s*\d+\s*)?E\s*\d+\b/i);
    if(ep&&cleanTitle(ep[1]))return cleanTitle(ep[1]);
    const after=d.match(/^(?:T\s*\d+\s*)?E\s*\d+\s*[-–—:]\s*.*?\s*[-–—|·]\s*(.+?)(?:\s*[-–—|·]\s*Crunchyroll)?$/i);
    if(after&&cleanTitle(after[1])&&!episodeishTitle(after[1]))return cleanTitle(after[1]);
    return '';
  }


  function parseParentFromLabel(raw,episodeTitle=''){
    const t=String(raw||'').replace(/\s+/g,' ').trim();if(!t)return '';
    const pats=[
      /^(?:watch|ver|reproducir|resume|reanudar|continue|continuar)\s+(.+?)\s+(?:season|temporada)?\s*\d*\s*(?:episode|episodio|cap[ií]tulo|ep\.?)\s*\d+\b/i,
      /^(.+?)\s*[-–—|·,:]\s*(?:S|T)\s*\d+\s*E\s*\d+\b/i,
      /^(.+?)\s*[-–—|·,:]\s*(?:season|temporada)\s*\d+.{0,18}?(?:episode|episodio|cap[ií]tulo)\s*\d+\b/i
    ];
    for(const re of pats){const m=t.match(re),v=cleanTitle(m?.[1]);if(v&&!globalJunkTitle(v)&&normalize(v)!==normalize(episodeTitle))return v}
    return '';
  }
  function genericParentTitle(anchor,card,episodeTitle=''){
    const rows=[];const add=(raw,score,src)=>{
      const parsed=parseParentFromLabel(raw,episodeTitle);if(parsed)rows.push({t:parsed,q:score+25,src:`${src}:parsed`});
      const t=cleanTitle(raw);if(!t||globalJunkTitle(t)||normalize(t)===normalize(episodeTitle)||episodeishTitle(t))return;
      rows.push({t,q:score,src});
    };
    const scopes=[card,card?.parentElement,card?.parentElement?.parentElement].filter(Boolean);
    for(const scope of scopes){
      let links=[];try{links=[...scope.querySelectorAll('a[href]')]}catch(_){}
      for(const a of links.slice(0,50)){const href=a.getAttribute('href')||'';if(PROFILE.series?.test(href)){add(a.getAttribute('aria-label'),125,'series-link-aria');add(a.getAttribute('title'),124,'series-link-title');add(a.textContent,118,'series-link-text')}}
      let els=[];try{els=[...scope.querySelectorAll('[data-series-title],[data-show-title],[data-program-title],[data-parent-title],[data-series-name],[data-show-name]')]}catch(_){}
      for(const el of els.slice(0,30)){for(const a of ['data-series-title','data-show-title','data-program-title','data-parent-title','data-series-name','data-show-name'])add(el.getAttribute?.(a),122,a);add(textOf(el),110,'semantic-parent')}
      if(rows.some(r=>r.q>=118))break;
    }
    let attrs=[];try{attrs=[...card?.querySelectorAll?.('[aria-label],[title],img[alt]')||[]]}catch(_){}
    for(const el of attrs.slice(0,80)){add(el.getAttribute?.('aria-label'),88,'aria');add(el.getAttribute?.('title'),86,'title');add(el.getAttribute?.('alt'),82,'alt')}
    add(anchor?.getAttribute?.('aria-label'),95,'anchor-aria');add(anchor?.getAttribute?.('title'),94,'anchor-title');
    rows.sort((a,b)=>b.q-a.q||a.t.length-b.t.length);return rows.find(r=>r.q>=88)?.t||'';
  }
  function currentPageParentTitle(episodeTitle=''){
    const local=genericParentTitle(null,document.querySelector('main')||document.body,episodeTitle);if(local)return local;
    const doc=seriesFromDocumentTitle();if(doc&&!globalJunkTitle(doc)&&normalize(doc)!==normalize(episodeTitle))return doc;
    return '';
  }
  function contentKindFrom(href,blob=''){
    const h=String(href||'');if(PROFILE.movie?.test(h))return 'movie';
    if(PROFILE.series?.test(h)&&!PROFILE.episode?.test(h))return 'series';
    if(PROFILE.episode?.test(h)||parseSeasonEpisode(blob).episode!=null)return 'episode';
    return 'unknown';
  }

  const PRIME_JUNK_TERMS = [
    'se incluye con prime','incluido con prime','incluida con prime','included with prime','prime video',
    'reanudar','resume','continuar','continue watching','seguir viendo','ver ahora','watch now','reproducir','play',
    'añadir a mi lista','agregar a mi lista','add to watchlist','remove from watchlist','quitar de mi lista',
    'más información','mas informacion','more info','detalles','details','temporada','season','episodio','episode'
  ];
  function primeJunkTitle(raw){
    const t=String(raw||'').replace(/\s+/g,' ').trim(),n=normalize(t);
    if(!t)return true;
    if(/^(?:t|s)\s*\d+\s*e\s*\d+\b/i.test(t)||/^(?:e|ep\.?|episodio|episode)\s*\d+\b/i.test(t))return true;
    if(/^\d{1,3}%$/.test(t)||/^\d{1,2}:\d{2}(?::\d{2})?$/.test(t))return true;
    if(n==='prime'||n==='prime video'||n==='amazon prime video')return true;
    if(/^(?:se incluye|incluid[oa]|included).*(?:prime|suscrip)/i.test(t))return true;
    if(/^(?:reanudar|resume|continuar|continue|ver ahora|watch now|reproducir|play)\b/i.test(t))return true;
    const hits=PRIME_JUNK_TERMS.filter(x=>n===normalize(x)||n.startsWith(normalize(x)+' '));
    if(hits.length)return true;
    // Labels such as “Se incluye con Prime, Reanudar T1 E12” are UI actions, never programme titles.
    if(/(?:se incluye con prime|incluido con prime|included with prime).*(?:reanudar|resume|continuar|watch)/i.test(t))return true;
    return false;
  }
  function primeTitleFrom(anchor,card){
    const rows=[]; const add=(raw,score,src)=>{
      for(const bit of String(raw||'').split(/\n+/)){
        const t=cleanTitle(bit); if(!t||primeJunkTitle(t))continue;
        if(t.length<3||t.length>140)continue;
        let q=score;
        if(/\b(?:t|s)\s*\d+\s*e\s*\d+\b/i.test(t))q-=35;
        if(/\b(?:temporada|season|episodio|episode)\s*\d+/i.test(t))q-=25;
        if(/[·|•]/.test(t))q-=4;
        rows.push({t,q,src});
      }
    };
    // Poster/hero alt text is generally the cleanest title exposed by Prime.
    for(const img of [...(card?.querySelectorAll?.('img[alt]')||[])].slice(0,12))add(img.getAttribute('alt'),95,'img');
    for(const sel of ["[data-testid*='title' i]","[data-automation-id*='title' i]","[class*='title' i]","[role='heading']","h1","h2","h3","h4","strong"]){
      let nodes=[];try{nodes=[...card?.querySelectorAll?.(sel)||[]]}catch(_){}
      for(const el of nodes.slice(0,12))add(textOf(el),sel.includes('data-')?90:80,sel);
    }
    // Prime often puts useful text in a sibling while the link aria-label is just “Resume”.
    for(const line of String(card?.innerText||'').split(/\n+/).slice(0,30))add(line,68,'text');
    add(anchor?.getAttribute?.('title'),58,'anchor-title');
    add(anchor?.getAttribute?.('aria-label'),35,'anchor-label');
    rows.sort((a,b)=>b.q-a.q || a.t.length-b.t.length);
    // Prime action labels are too noisy. Only accept a title from poster/title/heading-grade evidence.
    const best=rows.find(r=>r.q>=76);
    return best?.t||'';
  }
  function primeCurrentTitle(){
    const roots=[document.querySelector('main'),document.body].filter(Boolean);
    for(const root of roots){
      const t=primeTitleFrom(null,root);if(t&&!primeJunkTitle(t))return t;
    }
    let d=String(document.title||'').replace(/^\s*(?:prime video|amazon prime video)\s*[:\-–—|·]\s*/i,'').replace(/\s*[:\-–—|·]\s*(?:prime video|amazon prime video)\s*$/i,'');
    d=cleanTitle(d);return primeJunkTitle(d)?'':d;
  }

  function titleEvidence(anchor,card){
    const rows=[];const add=(raw,score,src)=>{
      for(const bit of String(raw||'').split(/\n+/)){
        const t=cleanTitle(bit);if(!t||globalJunkTitle(t))continue;let q=score;
        if(/\b(?:t|s)\s*\d+\s*e\s*\d+\b/i.test(t))q-=35;
        if(/\b(?:season|temporada|episode|episodio|cap[ií]tulo)\s*\d+/i.test(t))q-=28;
        if(hasAny(t,WATCHLIST_TERMS)||hasAny(t,CONTINUE_TERMS))q-=30;
        rows.push({t,q,src});
      }
    };
    for(const el of [...(card?.querySelectorAll?.('[data-series-title],[data-show-title],[data-program-title],[data-parent-title],[data-title]')||[])].slice(0,24)){
      add(el.getAttribute('data-series-title'),122,'data-series-title');add(el.getAttribute('data-show-title'),122,'data-show-title');add(el.getAttribute('data-program-title'),120,'data-program-title');add(el.getAttribute('data-parent-title'),120,'data-parent-title');add(el.getAttribute('data-title'),105,'data-title');
    }
    for(const img of [...(card?.querySelectorAll?.('img[alt]')||[])].slice(0,16))add(img.getAttribute('alt'),104,'img-alt');
    for(const sel of ["[data-uia*='title' i]","[data-testid*='title' i]","[class*='title' i]","[role='heading']","h1","h2","h3","h4","strong"]){let nodes=[];try{nodes=[...card?.querySelectorAll?.(sel)||[]]}catch(_){}for(const el of nodes.slice(0,16))add(textOf(el),96,sel)}
    add(anchor?.getAttribute?.('title'),90,'anchor-title');add(anchor?.getAttribute?.('aria-label'),78,'anchor-aria');
    for(const el of [...(card?.querySelectorAll?.('[aria-label],[title]')||[])].slice(0,36)){add(el.getAttribute('title'),72,'desc-title');add(el.getAttribute('aria-label'),68,'desc-aria')}
    for(const line of String(card?.innerText||'').split(/\n+/).slice(0,24))add(line,56,'text');
    rows.sort((a,b)=>b.q-a.q||a.t.length-b.t.length);
    return rows.find(r=>r.q>=78)||null;
  }
  function titleFrom(anchor,card){return titleEvidence(anchor,card)?.t||''}




  function slugTitleFromSeriesHref(href){
    try{
      const u=new URL(href||'',location.href);const m=u.pathname.match(/\/series\/[^/]+\/([^/?#]+)/i);if(!m)return '';
      const t=decodeURIComponent(m[1]).replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
      if(!t)return '';return t.replace(/\b\w/g,c=>c.toUpperCase());
    }catch(_){return ''}
  }

  function crunchyNoiseTitle(raw){
    const t=String(raw||'').replace(/\s+/g,' ').trim(),n=normalize(t);if(!t)return true;
    if(episodeishTitle(t))return true;
    if(/^\d{1,3}%$/.test(t)||/^\d{1,2}:\d{2}(?::\d{2})?$/.test(t))return true;
    if(hasAny(n,['continue watching','seguir viendo','watchlist','mi lista','more info','mas informacion','details','detalles','watch now','ver ahora','add to watchlist','añadir a mi lista','remove from watchlist','quitar de mi lista']))return true;
    return false;
  }

  function crunchyParseSeriesFromLabel(raw){
    const t=String(raw||'').replace(/\s+/g,' ').trim();if(!t)return '';
    const pats=[
      /^(?:watch|ver|reproducir)\s+(.+?)\s+(?:episode|episodio|cap[ií]tulo|ep\.?)\s*\d+\b/i,
      /^(.+?)\s*[-–—|·]\s*(?:season|temporada)\s*\d+\s*[-–—|·,:]?\s*(?:episode|episodio|cap[ií]tulo|ep\.?)\s*\d+\b/i,
      /^(.+?)\s*[-–—|·]\s*(?:S|T)\s*\d+\s*E\s*\d+\b/i,
      /^(.+?)\s*[,·|]\s*(?:S|T)\s*\d+\s*E\s*\d+\b/i,
      /^(?:continue watching|seguir viendo|reanudar|resume)\s*[:\-–—]?\s*(.+?)(?:\s*[-–—|·]\s*(?:S|T)\s*\d+\s*E\s*\d+|$)/i
    ];
    for(const re of pats){const m=t.match(re);const v=cleanTitle(m?.[1]);if(v&&!crunchyNoiseTitle(v))return v}
    return '';
  }

  function crunchySeriesFromCard(anchor,card,episodeTitle=''){
    const rows=[];const add=(raw,score,src)=>{
      const direct=crunchyParseSeriesFromLabel(raw);if(direct)rows.push({t:direct,q:score+30,src:`${src}:parsed`});
      const t=cleanTitle(raw);if(!t||crunchyNoiseTitle(t)||normalize(t)===normalize(episodeTitle))return;
      if(t.length<2||t.length>140)return;rows.push({t,q:score,src});
    };

    // 1) A real /series/ link is the strongest evidence. Search the card and a small local wrapper.
    const scopes=[card,card?.parentElement,card?.parentElement?.parentElement].filter(Boolean);
    for(const scope of scopes){
      let links=[];try{links=[...scope.querySelectorAll("a[href*='/series/']")]}catch(_){}
      for(const a of links.slice(0,12)){
        const href=a.getAttribute('href')||'';
        add(a.getAttribute('aria-label'),120,'series-link-aria');add(a.getAttribute('title'),118,'series-link-title');add(a.textContent,112,'series-link-text');
        const slug=slugTitleFromSeriesHref(href);if(slug&&!crunchyNoiseTitle(slug))rows.push({t:slug,q:100,src:'series-slug'});
      }
      if(rows.some(x=>x.q>=112))break;
    }

    // 2) Crunchyroll's React cards expose semantic data/class names that change less often than layout wrappers.
    const semanticSelectors=[
      "[data-t*='series-title' i]","[data-t*='show-title' i]","[data-t*='anime-title' i]","[data-t*='parent-title' i]",
      "[data-testid*='series-title' i]","[data-testid*='show-title' i]","[data-testid*='anime-title' i]",
      "[class*='series-title' i]","[class*='show-title' i]","[class*='anime-title' i]","[class*='parent-title' i]"
    ];
    for(const sel of semanticSelectors){let els=[];try{els=[...card?.querySelectorAll?.(sel)||[]]}catch(_){}for(const el of els.slice(0,10)){add(textOf(el),105,sel);add(el.getAttribute?.('aria-label'),108,`${sel}:aria`);add(el.getAttribute?.('title'),108,`${sel}:title`)}}

    // 3) Accessibility labels / image alts often contain “Watch <series> Episode …”.
    let attrs=[];try{attrs=[...card?.querySelectorAll?.('[aria-label],[title],img[alt],[data-title],[data-series-title],[data-show-title]')||[]]}catch(_){}
    for(const el of attrs.slice(0,80)){
      add(el.getAttribute?.('data-series-title'),104,'data-series-title');add(el.getAttribute?.('data-show-title'),104,'data-show-title');
      add(el.getAttribute?.('data-title'),82,'data-title');add(el.getAttribute?.('aria-label'),90,'aria');add(el.getAttribute?.('title'),88,'title');add(el.getAttribute?.('alt'),84,'alt');
    }
    add(anchor?.getAttribute?.('aria-label'),96,'anchor-aria');add(anchor?.getAttribute?.('title'),94,'anchor-title');

    // 4) Last-resort text lines: only use a different clean line from the episode title.
    for(const line of String(card?.innerText||'').split(/\n+/).slice(0,30))add(line,58,'text');

    // Penalise obvious section headings and exact episode-name echoes.
    for(const r of rows){
      if(hasAny(r.t,WATCHLIST_TERMS)||hasAny(r.t,CONTINUE_TERMS))r.q-=45;
      if(normalize(r.t)===normalize(episodeTitle))r.q-=80;
      if(/^(?:episode|episodio|cap[ií]tulo|temporada|season)\b/i.test(r.t))r.q-=60;
    }
    rows.sort((a,b)=>b.q-a.q||a.t.length-b.t.length);
    return rows.find(r=>r.q>=72)?.t||'';
  }

  function bestImageUrl(img){
    const candidates=[];const add=(u,w=0)=>{u=String(u||'').trim();if(/^https?:\/\//i.test(u)&&!/(sprite|logo|avatar|profile|icon)/i.test(u))candidates.push({u,w:Number(w)||0})};
    add(img?.currentSrc,Number(img?.naturalWidth)||0);add(img?.src,Number(img?.naturalWidth)||0);add(img?.getAttribute?.('data-src'),0);
    for(const attr of ['srcset','data-srcset']){const ss=img?.getAttribute?.(attr)||'';for(const part of ss.split(',')){const m=part.trim().match(/^(\S+)\s+(\d+)(?:w|x)$/i);if(m)add(m[1],Number(m[2])*(m[0].toLowerCase().endsWith('x')?1000:1));else if(part.trim())add(part.trim().split(/\s+/)[0],0)}}
    candidates.sort((a,b)=>b.w-a.w);return candidates[0]?.u||'';
  }

  function crunchyPosterFrom(card){
    let imgs=[];try{imgs=[...card?.querySelectorAll?.('img')||[]]}catch(_){}
    const rows=[];
    for(const img of imgs.slice(0,20)){
      const u=bestImageUrl(img);if(!u)continue;const nw=Number(img.naturalWidth)||0,nh=Number(img.naturalHeight)||0;let ratio=nw&&nh?nw/nh:0;
      if(!ratio){try{const r=img.getBoundingClientRect();ratio=r.width&&r.height?r.width/r.height:0}catch(_){}}
      // Crunchyroll continue-watching uses landscape episode stills. Do not promote them to portrait posters.
      if(ratio&&ratio>0.95)continue;
      const area=(nw*nh)||0;rows.push({u,score:area+(ratio&&ratio<0.82?500000:0)});
    }
    rows.sort((a,b)=>b.score-a.score);return rows[0]?.u||'';
  }

  function cardFor(anchor){
    for(const sel of ["[data-uia*='slider-item' i]","[data-uia*='title-card' i]","[data-testid*='card' i]","[data-testid*='tile' i]","[class*='slider-item' i]","[class*='title-card' i]","[class*='card' i]","[class*='tile' i]","article","li"]){const c=anchor?.closest?.(sel);if(c)return c}
    return anchor?.parentElement||anchor;
  }

  function selectorSet(){
    const sets={
      'Netflix':["a[href*='/watch/']","a[href*='/title/']","a[href*='jbv=']","[data-uia*='title-card' i]","[class*='title-card' i]","[class*='slider-item' i]"],
      'Disney+':["a[href*='/video/']","a[href*='/episode/']","a[href*='/series/']","a[href*='/movies/']","a[href*='/movie/']","[data-testid*='set-item' i]","[data-testid*='tile' i]"],
      'Prime Video':["a[href*='/detail/']","a[href*='/gp/video/detail/']","a[href*='/region/'] [href*='/detail/']"],
      'Crunchyroll':["a[href*='/watch/']","a[href*='/series/']","[data-t*='card' i]","[class*='erc-browse-card' i]"],
      'HIDIVE':["a[href*='/stream/']","a[href*='/watch/']","a[href*='/episode/']","a[href*='/tv/']","a[href*='/series/']"],
      'Max':["a[href*='/video/']","a[href*='/episode/']","a[href*='/show/']","a[href*='/movie/']","[data-testid*='tile' i]"],
      'Apple TV+':["a[href*='/show/']","a[href*='/movie/']","a[href*='/episode/']","[data-testid*='shelf' i] a"],
      'Paramount+':["a[href*='/shows/']","a[href*='/movies/']","a[href*='/video/']","a[href*='/episode/']"],
      'Hulu':["a[href*='/watch/']","a[href*='/series/']","a[href*='/movie/']","a[href*='/hub/']"],
      'Peacock':["a[href*='/watch/']","a[href*='/collections/']","a[href*='/movie/']"],
      'SkyShowtime':["a[href*='/watch/']","a[href*='/series/']","a[href*='/movie/']","a[href*='/video/']"],
      'Movistar Plus+':["a[href*='/ficha/']","a[href*='/serie/']","a[href*='/pelicula/']","a[href*='/video/']"],
      'Filmin':["a[href*='/serie/']","a[href*='/pelicula/']","a[href*='/capitulo/']","a[href*='/video/']"],
      'MUBI':["a[href*='/films/']","a[href*='/film/']","a[href*='/series/']"],
      'Rakuten TV':["a[href*='/movies/']","a[href*='/movie/']","a[href*='/series/']","a[href*='/episodes/']"],
      'Plex':["a[href*='source=']","a[href*='/watch/']","a[href*='/show/']","a[href*='/movie/']","a[href*='/episode/']"],
      'Discovery+':["a[href*='/show/']","a[href*='/shows/']","a[href*='/video/']","a[href*='/episode/']"],
      'BritBox':["a[href*='/show/']","a[href*='/series/']","a[href*='/episode/']","a[href*='/movie/']"],
      'AMC+':["a[href*='/shows/']","a[href*='/series/']","a[href*='/episode/']","a[href*='/movies/']"],
      'Atresplayer':["a[href*='/series/']","a[href*='/programas/']","a[href*='/capitulo/']","a[href*='/video/']"],
      'RTVE Play':["a[href*='/play/videos/']","a[href*='/series/']","a[href*='/programas/']","a[href*='/cine/']"]
    };
    return sets[PROVIDER]||["a[href]"];
  }

  function pageContext(){return normalize([location.pathname,location.search,document.title,document.querySelector('h1')?.textContent,document.querySelector('main h2')?.textContent].filter(Boolean).join(' '))}
  function pageIsWatchlist(){const p=pageContext();return hasAny(p,WATCHLIST_TERMS)||/my[-_]?list|watchlist|my[-_]?stuff|my[-_]?queue|wishlist|favorites?|favoritos|pendientes/i.test(location.pathname)}
  function sectionContext(card){
    const chunks=[];let n=card;
    for(let depth=0;n&&depth<8;depth++,n=n.parentElement){
      chunks.push(n.getAttribute?.('aria-label')||'',n.getAttribute?.('data-testid')||'',n.getAttribute?.('data-uia')||'',String(n.className||''));
      for(const h of [...(n.querySelectorAll?.(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > [role="heading"]')||[])].slice(0,4))chunks.push(textOf(h));
      const prev=n.previousElementSibling;if(prev&&(/H[1-4]/.test(prev.tagName)||prev.getAttribute?.('role')==='heading'))chunks.push(textOf(prev));
    }
    return chunks.join(' ');
  }

  function classify(card,blob,progress){
    const ctx=sectionContext(card), watchlist=pageIsWatchlist()||hasAny(ctx,WATCHLIST_TERMS), cont=hasAny(ctx,CONTINUE_TERMS)||hasAny(blob,CONTINUE_TERMS);
    if(progress!=null||cont)return {kind:'continue-watching',listMember:watchlist,sourceLabel:watchlist?'Mi lista + progreso':'Seguir viendo'};
    if(watchlist)return {kind:'watchlist',listMember:true,sourceLabel:'Mi lista'};
    return {kind:'catalog-visible',listMember:false,sourceLabel:'Catálogo'};
  }

  function guessType(url,kind=''){if(PROVIDER==='Crunchyroll'||PROVIDER==='HIDIVE')return 'anime';if(kind==='movie'||PROFILE.movie?.test(String(url||'')))return 'movie';return 'series'}

  function anchorFor(node){
    if(node?.matches?.('a[href]')){
      if(PROVIDER!=='Prime Video'||/\/(?:gp\/video\/)?detail\//i.test(node.getAttribute('href')||''))return node;
    }
    const sels=PROVIDER==='Netflix'
      ? ["a[href*='/watch/']","a[href*='/title/']","a[href*='jbv=']","a[href]"]
      : PROVIDER==='Prime Video'
        ? ["a[href*='/gp/video/detail/']","a[href*='/detail/']"]
        : ["a[href]"];
    for(const sel of sels){try{const a=node?.querySelector?.(sel);if(a)return a}catch(_){}}
    return null;
  }

  function candidateFrom(node){
    if(!node||!rendered(node))return null;
    const anchor=anchorFor(node),card=node.matches?.("[data-uia*='title-card' i],[class*='title-card' i],[class*='slider-item' i],[data-testid*='card' i],[data-testid*='tile' i],article,li")?node:cardFor(anchor||node);
    if(!card)return null;
    const href=anchor?.getAttribute?.('href')||'';if(href&&(href.startsWith('#')||href.startsWith('javascript:')))return null;
    if(PROVIDER==='Prime Video'&&anchor&&!/\/(?:gp\/video\/)?detail\//i.test(href))return null;
    const evidence=PROVIDER==='Prime Video'?null:titleEvidence(anchor,card);
    let title=PROVIDER==='Prime Video'?primeTitleFrom(anchor,card):(evidence?.t||'');if(!title||globalJunkTitle(title))return null;
    if(PROVIDER==='Prime Video'&&primeJunkTitle(title))return null;
    const blob=[textOf(anchor),String(card?.innerText||'')].join(' '),se=parseSeasonEpisode(blob),progress=progressFrom(card),hasImage=!!card?.querySelector?.('img'),cls=classify(card,blob,progress),url=href?absUrl(href):location.href;
    if(cls.kind==='catalog-visible')return null;
    const contentKind=contentKindFrom(href,blob);let episodeTitle='',parentResolved=false;
    if(PROVIDER==='Crunchyroll'&&/\/watch\//i.test(href||'')){
      episodeTitle=title;const parent=crunchySeriesFromCard(anchor,card,episodeTitle)||genericParentTitle(anchor,card,episodeTitle);if(!parent)return null;title=parent;parentResolved=true;
    }else if(contentKind==='episode'){
      const parent=genericParentTitle(anchor,card,title);
      if(parent&&normalize(parent)!==normalize(title)){episodeTitle=title;title=parent;parentResolved=true}
      else if(PROFILE.strictEpisodeParent){return null}
    }
    if(globalJunkTitle(title))return null;
    const tEvidence=PROVIDER==='Prime Video'?92:(evidence?.q||78);
    // For a doubtful episode route, require stronger evidence unless a parent series was resolved.
    if(contentKind==='episode'&&!parentResolved&&tEvidence<90&&se.episode!=null)return null;
    let confidence=.50;if(hasImage)confidence+=.07;if(progress!=null)confidence+=.18;if(se.episode)confidence+=.06;if(tEvidence>=95)confidence+=.10;else if(tEvidence>=85)confidence+=.06;if(cls.kind==='watchlist')confidence+=.12;if(cls.listMember)confidence+=.04;if(parentResolved)confidence+=.10;if(PROVIDER!=='Streaming')confidence+=.04;confidence=Math.min(.99,confidence);
    const artwork=PROVIDER==='Crunchyroll'?crunchyPosterFrom(card):portraitCoverFrom(card),banner=landscapeArtworkFrom(card);
    return {id:`${SITE}:${normalize(title)}:${se.season||0}:${se.episode||0}:${url}`,provider:PROVIDER,siteKey:SITE,title,episodeTitle,type:guessType(url,contentKind),season:se.season,episode:se.episode,progress,url,cover:artwork,banner,kind:cls.kind,contentKind,parentResolved,listMember:cls.listMember,sourceLabel:cls.sourceLabel,titleEvidence:tEvidence,confidence:Number(confidence.toFixed(2)),detectedAt:Date.now(),pageUrl:location.href,pageTitle:document.title||''};
  }

  function currentPageCandidate(){
    const path=location.pathname.toLowerCase();if(!/watch|video|episode|episodio|play|stream/.test(path))return null;
    const h1=cleanTitle(document.querySelector('h1')?.textContent),body=String(document.body?.innerText||'').slice(0,18000),se=parseSeasonEpisode([h1,document.title,body].join(' ')),progress=progressFrom(document),contentKind=contentKindFrom(location.href,[h1,document.title].join(' '));
    let title=PROVIDER==='Prime Video'?primeCurrentTitle():(h1||cleanTitle(document.title.split(/[|·–—]/)[0])),episodeTitle='',parentResolved=false;
    if(PROVIDER==='Crunchyroll'){
      const parent=visibleSeriesLinkTitle()||currentPageParentTitle(title);if(parent){episodeTitle=title||'';title=parent;parentResolved=true}else if(/\/watch\//i.test(path))return null;
    }else if(contentKind==='episode'){
      const parent=currentPageParentTitle(title);if(parent&&normalize(parent)!==normalize(title)){episodeTitle=title||'';title=parent;parentResolved=true}else if(PROFILE.strictEpisodeParent)return null;
    }
    if(!title||globalJunkTitle(title)||(PROVIDER==='Prime Video'&&primeJunkTitle(title)))return null;
    const root=document.querySelector('main')||document.body,artwork=PROVIDER==='Crunchyroll'?crunchyPosterFrom(root):portraitCoverFrom(root),banner=landscapeArtworkFrom(root);
    let confidence=progress!=null?.84:.70;if(parentResolved)confidence+=.10;if(se.episode)confidence+=.04;confidence=Math.min(.98,confidence);
    return {id:`${SITE}:current:${normalize(title)}:${location.href}`,provider:PROVIDER,siteKey:SITE,title,episodeTitle,type:guessType(location.href,contentKind),season:se.season,episode:se.episode,progress,url:location.href,cover:artwork||'',banner:banner||'',kind:'current-page',contentKind,parentResolved,listMember:false,sourceLabel:'Reproduciendo ahora',titleEvidence:parentResolved?100:88,confidence:Number(confidence.toFixed(2)),detectedAt:Date.now(),pageUrl:location.href,pageTitle:document.title||''};
  }

  function rank(c){return (c.kind==='current-page'?500:0)+(c.kind==='continue-watching'?350:0)+(c.kind==='watchlist'?220:0)+(c.progress!=null?120:0)+(c.listMember?30:0)+Math.round((c.confidence||0)*100)}
  function mergeCandidate(c){
    if(!c?.title||globalJunkTitle(c.title))return;const key=`${normalize(c.title)}|${c.provider}`;const prev=observed.get(key);
    if(!prev){observed.set(key,c);return}
    const merged={...prev,...c,listMember:!!(prev.listMember||c.listMember),parentResolved:!!(prev.parentResolved||c.parentResolved),detectedAt:Math.max(prev.detectedAt||0,c.detectedAt||0),episodeTitle:c.episodeTitle||prev.episodeTitle||'',cover:c.cover||prev.cover||'',banner:c.banner||prev.banner||'',titleEvidence:Math.max(prev.titleEvidence||0,c.titleEvidence||0)};
    if(rank(prev)>rank(c)){merged.kind=prev.kind;merged.progress=prev.progress;merged.season=prev.season;merged.episode=prev.episode;merged.url=prev.url;merged.confidence=Math.max(prev.confidence||0,c.confidence||0);merged.sourceLabel=prev.listMember||c.listMember?(prev.progress!=null?'Mi lista + progreso':'Mi lista'):prev.sourceLabel}
    observed.set(key,merged);
  }

  function scan(){
    for(const sel of selectorSet()){
      let nodes=[];try{nodes=[...document.querySelectorAll(sel)]}catch(_){}
      for(const node of nodes){const c=candidateFrom(node);if(c)mergeCandidate(c);if(observed.size>=MAX_ITEMS)break}
      if(observed.size>=MAX_ITEMS)break;
    }
    // On explicit watchlist pages, do a conservative second pass over likely cards.
    if(pageIsWatchlist()&&observed.size<MAX_ITEMS&&PROVIDER!=='Prime Video'){
      let roots=[];try{roots=[...document.querySelectorAll("[data-uia*='title-card' i],[class*='title-card' i],[class*='slider-item' i],[data-testid*='card' i],[data-testid*='tile' i],main article,main li")]}catch(_){}
      for(const r of roots.slice(0,700)){const c=candidateFrom(r);if(c)mergeCandidate(c);if(observed.size>=MAX_ITEMS)break}
    }
    const current=currentPageCandidate();if(current)mergeCandidate(current);
    return [...observed.values()].sort((a,b)=>rank(b)-rank(a)).slice(0,MAX_ITEMS);
  }

  function snapshot(){return {provider:PROVIDER,siteKey:SITE,url:location.href,title:document.title||PROVIDER,scannedAt:Date.now(),pageKind:pageIsWatchlist()?'watchlist':'standard',items:scan()}}
  function publish(force=false){const snap=snapshot(),fp=JSON.stringify(snap.items.map(x=>[x.title,x.episodeTitle,x.kind,x.contentKind,x.parentResolved,x.listMember,x.season,x.episode,x.progress,x.url,x.cover,x.banner]));if(!force&&fp===lastFingerprint)return snap;lastFingerprint=fp;try{chrome.runtime.sendMessage({type:'WATCHTOWER_STREAMING_SNAPSHOT',snapshot:snap},()=>void chrome.runtime.lastError)}catch(_){}return snap}

  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{if(message?.type==='STREAMING_IMPORT_SCAN'){sendResponse({ok:true,snapshot:publish(true)});return}});
  setTimeout(()=>publish(true),900);setTimeout(()=>publish(true),2600);setTimeout(()=>publish(true),6500);
  const mo=new MutationObserver(()=>{clearTimeout(publishTimer);publishTimer=setTimeout(()=>publish(false),900)});
  try{mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-valuenow','aria-label','title','style','class','data-testid','data-uia']})}catch(_){}
})();
