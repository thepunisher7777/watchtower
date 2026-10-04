'use strict';
// WatchTower Streaming Importer v2 — Mi lista / Watchlist / My Stuff support.
state.settings.autoImportWatchlist=state.settings.autoImportWatchlist!==false;

const wtIKindLabel=c=>c?.sourceLabel||(c?.kind==='watchlist'?'Mi lista':c?.kind==='continue-watching'?(c?.listMember?'Mi lista + progreso':'Seguir viendo'):c?.kind==='current-page'?'Reproduciendo ahora':'Detectado');
const wtIRank=c=>(c?.kind==='current-page'?500:c?.kind==='continue-watching'?400:c?.kind==='watchlist'?250:0)+(c?.progress!=null?100:0)+(c?.listMember?25:0)+Math.round((Number(c?.confidence)||0)*100);

wtINorm=function(c){return {provider:String(c?.provider||'Streaming'),title:String(c?.title||'').trim(),type:['anime','series','movie'].includes(c?.type)?c.type:'series',season:c?.season==null?null:Math.max(1,Number(c.season)||1),episode:c?.episode==null?null:Math.max(1,Number(c.episode)||1),progress:c?.progress==null?null:Math.max(0,Math.min(100,Math.round(Number(c.progress)||0))),confidence:Number(c?.confidence)||0,kind:String(c?.kind||''),listMember:!!c?.listMember,sourceLabel:String(c?.sourceLabel||''),url:String(c?.url||'')}};

wtIApply=function(raw,force=false){
  const c=wtINorm(raw);if(!c.title)return false;let t=wtIFind(c);
  if(t?.manualLock&&!force){wtIQueue(c,'Bloqueado manualmente');return false}
  const isWatchlist=c.kind==='watchlist';
  const season=c.season??Number(t?.currentSeason)||1,episode=c.episode??Number(t?.currentEpisode)||1;
  if(!t){
    const autoContinue=state.settings.autoAddHighConfidence&&c.confidence>=.88&&c.kind==='continue-watching'&&c.progress>0;
    const autoList=state.settings.autoImportWatchlist!==false&&c.confidence>=.82&&isWatchlist;
    if(!force&&!autoContinue&&!autoList){wtIQueue(c,isWatchlist?'Confirmar título de Mi lista':'Confirmar título nuevo');return false}
    const planned=isWatchlist&&c.progress==null;
    t={id:`stream-${uid()}`,title:c.title,type:c.type,status:planned?'planned':'watching',seen:planned?0:Math.max(0,episode-1),total:Math.max(1,episode),currentEpisode:episode,currentSeason:season,progressPct:planned?0:(c.progress||0),positionSec:0,durationSec:c.type==='anime'?1440:(c.type==='movie'?7200:3000),platform:c.provider,updatedAt:now(),lastWatchedAt:planned?0:now(),cover:'',year:'',genres:[],rating:'',summary:'',source:'Streaming Importer',sourceUrl:c.url,metaFetchedAt:0,trackingSource:planned?'streaming-watchlist':'streaming-auto',manualLock:false,watchlists:c.listMember||isWatchlist?[c.provider]:[]};
    t.positionSec=Math.round((t.progressPct/100)*t.durationSec);state.titles.unshift(t);
    enrichTitle(t,false).then(ok=>{if(ok){commit('stream-enrich',false);renderAll()}}).catch(()=>{});
    return true;
  }
  let changed=false;
  if(c.listMember||isWatchlist){const lists=Array.isArray(t.watchlists)?t.watchlists:[];if(!lists.includes(c.provider)){t.watchlists=[...lists,c.provider];changed=true}}
  if(isWatchlist&&c.progress==null){if(c.url&&t.sourceUrl!==c.url){t.sourceUrl=c.url;changed=true}if(!t.platform&&c.provider){t.platform=c.provider;changed=true}if(changed){t.updatedAt=now();t.trackingSource=t.trackingSource||'streaming-watchlist'}return changed}
  const oldS=Number(t.currentSeason)||1,oldE=Number(t.currentEpisode)||1,oldP=Number(t.progressPct)||0,newer=season>oldS||(season===oldS&&episode>oldE),same=season===oldS&&episode===oldE;
  if(force||newer){t.currentSeason=season;t.currentEpisode=episode;t.seen=Math.max(Number(t.seen)||0,episode-1);t.total=Math.max(Number(t.total)||1,episode);if(c.progress!=null){t.progressPct=c.progress;t.positionSec=Math.round((c.progress/100)*(t.durationSec||3000))}changed=true}else if(same&&c.progress!=null&&c.progress>oldP){t.progressPct=c.progress;t.positionSec=Math.round((c.progress/100)*(t.durationSec||3000));changed=true}
  if(changed){t.platform=c.provider;t.sourceUrl=c.url||t.sourceUrl;t.status='watching';t.updatedAt=now();t.lastWatchedAt=now();t.trackingSource='streaming-auto'}return changed
};

wtIProcess=function(snaps,manual=false){
  wtIEnsure();state.settings.autoImportWatchlist=state.settings.autoImportWatchlist!==false;
  const m=new Map;
  for(const s of snaps||[])for(const x of s?.items||[]){const c=wtINorm(x);if(!c.title||!['watchlist','continue-watching','current-page'].includes(c.kind))continue;const k=`${normTitle(c.title)}|${c.provider}`,p=m.get(k);if(!p||wtIRank(c)>wtIRank(p))m.set(k,{...p,...c,listMember:!!(p?.listMember||c.listMember)})}
  WTIMP.preview=[...m.values()].sort((a,b)=>wtIRank(b)-wtIRank(a));let n=0,q0=state.streamingQueue.length;
  if(state.settings.autoStreamingSync)for(const c of WTIMP.preview){const ex=wtIFind(c);if(ex){if(wtIApply(c))n++}else if((c.kind==='watchlist'&&state.settings.autoImportWatchlist!==false&&c.confidence>=.82)||(c.kind==='continue-watching'&&state.settings.autoAddHighConfidence&&c.confidence>=.88&&c.progress>0)){if(wtIApply(c))n++}else wtIQueue(c,c.kind==='watchlist'?'Confirmar Mi lista':'Confirmar detección')}
  else WTIMP.preview.forEach(c=>wtIQueue(c,'Auto-sync desactivado'));
  if(n||state.streamingQueue.length!==q0){commit('streaming-sync',false);renderAll()}wtIRender();wtIBadge();if(manual){const l=WTIMP.preview.filter(c=>c.kind==='watchlist'||c.listMember).length,p=WTIMP.preview.filter(c=>c.kind!=='watchlist'&&c.progress!=null).length;toast(WTIMP.preview.length?`${WTIMP.preview.length} detectados · ${l} de Mi lista · ${p} con progreso · ${n} sincronizados`:'No se detectaron datos útiles')}
};

wtIRender=function(){
  const r=$('#wtIResults');if(!r)return;const a=WTIMP.preview.length?WTIMP.preview:state.streamingQueue.map(x=>wtINorm(x.candidate));
  r.innerHTML=a.length?a.slice(0,60).map((c,i)=>{const ex=wtIFind(c),label=wtIKindLabel(c),planned=c.kind==='watchlist'&&c.progress==null;return `<div class="wtir" data-i="${i}"><b>${esc(c.provider)} · ${esc(label)} · ${Math.round(c.confidence*100)}%</b><div class="wtif"><input data-f="title" value="${esc(c.title)}"><select data-f="type"><option value="series" ${c.type==='series'?'selected':''}>Serie</option><option value="anime" ${c.type==='anime'?'selected':''}>Anime</option><option value="movie" ${c.type==='movie'?'selected':''}>Película</option></select><input data-f="season" type="number" min="1" value="${c.season||1}"><input data-f="episode" type="number" min="1" value="${c.episode||1}"><input data-f="progress" type="number" min="0" max="100" value="${c.progress??0}"></div><div style="font-size:9px;color:var(--muted);margin:6px 0">${planned?'Se añadirá como Pendiente':c.listMember?'También está guardado en Mi lista':'Progreso visible del servicio'}${ex?.manualLock?' · 🔒 protegido manualmente':''}</div><button class="primary wtia" data-i="${i}">${ex?'Actualizar':'Importar'}</button></div>`}).join(''):'<div class="empty">Abre “Mi lista”, “Seguir viendo” o una página de reproducción y pulsa Escanear.</div>';
  $$('.wtia').forEach(b=>b.onclick=()=>{const i=+b.dataset.i,row=document.querySelector(`.wtir[data-i="${i}"]`),base=a[i],g=f=>row.querySelector(`[data-f="${f}"]`).value,c={...base,title:g('title'),type:g('type'),season:+g('season'),episode:+g('episode'),progress:base.kind==='watchlist'&&base.progress==null?null:+g('progress')};wtIApply(c,true);state.streamingQueue=state.streamingQueue.filter(x=>x.key!==wtIKey(c));commit('stream-review',false);renderAll();wtIRender();wtIBadge();toast('Guardado')})
};

// Add a dedicated watchlist toggle to the existing importer UI.
(()=>{const box=document.querySelector('.wtiopts');if(box&&!document.getElementById('wtIWatchlists')){const l=document.createElement('label');l.innerHTML='<input id="wtIWatchlists" type="checkbox"> Importar Mi lista / Watchlist automáticamente';box.appendChild(l);const cb=l.querySelector('input');cb.checked=state.settings.autoImportWatchlist!==false;cb.onchange=e=>{state.settings.autoImportWatchlist=e.target.checked;commit('stream-setting',false)}}const btn=document.getElementById('wtIBtn');if(btn){const old=btn.onclick;btn.onclick=()=>{if(typeof old==='function')old();setTimeout(()=>{const cb=document.getElementById('wtIWatchlists');if(cb)cb.checked=state.settings.autoImportWatchlist!==false},0)}}})();
