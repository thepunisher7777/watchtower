'use strict';
// v1.3.0 — cross-platform canonical streaming guard.
// Companion v0.9+ sends parent/episode evidence so WatchTower can repair older bad imports
// instead of creating duplicates or trusting UI labels as programme titles.
const wtNormV130=wtINorm;
wtINorm=function(c){
  const n=wtNormV130(c);
  n.episodeTitle=String(c?.episodeTitle||n.episodeTitle||'').trim();
  n.contentKind=String(c?.contentKind||'');
  n.parentResolved=!!c?.parentResolved;
  n.titleEvidence=Math.max(0,Math.min(130,Number(c?.titleEvidence)||0));
  n.cover=String(c?.cover||n.cover||'');
  n.banner=String(c?.banner||'');
  return n;
};
const wtUiGarbageTitle=t=>{
  const s=String(t||'').replace(/\s+/g,' ').trim();
  return /^(?:resume|reanudar|continue|continuar|seguir viendo|watch now|ver ahora|play|reproducir|more info|m[aá]s informaci[oó]n|details|detalles|my list|mi lista|watchlist|my stuff|add to|a[nñ]adir|agregar|remove from|quitar)\b/i.test(s)||
    /^(?:t|s)\s*\d+\s*e\s*\d+\b/i.test(s)||
    /^(?:e|ep\.?|episode|episodio|cap[ií]tulo)\s*\d+\b/i.test(s)||
    /^\d{1,3}%$/.test(s)||/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s);
};
const wtStreamingRecord=t=>String(t?.trackingSource||'').startsWith('streaming')||t?.source==='Streaming Importer';
function wtMergeStreamingRecord(dst,src){
  if(!dst||!src||dst===src)return;
  dst.seen=Math.max(Number(dst.seen)||0,Number(src.seen)||0);
  dst.total=Math.max(Number(dst.total)||1,Number(src.total)||1);
  dst.currentSeason=Math.max(Number(dst.currentSeason)||1,Number(src.currentSeason)||1);
  dst.currentEpisode=Math.max(Number(dst.currentEpisode)||1,Number(src.currentEpisode)||1);
  dst.progressPct=Math.max(Number(dst.progressPct)||0,Number(src.progressPct)||0);
  dst.positionSec=Math.max(Number(dst.positionSec)||0,Number(src.positionSec)||0);
  dst.updatedAt=Math.max(Number(dst.updatedAt)||0,Number(src.updatedAt)||0,now());
  dst.lastWatchedAt=Math.max(Number(dst.lastWatchedAt)||0,Number(src.lastWatchedAt)||0);
  dst.watchlists=[...new Set([...(dst.watchlists||[]),...(src.watchlists||[])])];
  if(!dst.cover&&src.cover)dst.cover=src.cover;
  if(!dst.banner&&src.banner)dst.banner=src.banner;
}
const wtApplyV130=wtIApply;
wtIApply=function(raw,force=false){
  const c=wtINorm(raw);if(!c.title||wtUiGarbageTitle(c.title))return false;
  let stale=[];
  if(c.episodeTitle&&c.parentResolved){
    stale.push(...state.titles.filter(t=>!t.manualLock&&t.platform===c.provider&&wtStreamingRecord(t)&&normTitle(t.title)===normTitle(c.episodeTitle)&&normTitle(t.title)!==normTitle(c.title)));
  }
  if(c.url&&(c.parentResolved||c.titleEvidence>=90)){
    stale.push(...state.titles.filter(t=>!t.manualLock&&t.platform===c.provider&&wtStreamingRecord(t)&&t.sourceUrl===c.url&&normTitle(t.title)!==normTitle(c.title)&&(wtUiGarbageTitle(t.title)||c.parentResolved)));
  }
  stale=[...new Set(stale)];
  const changed=wtApplyV130(c,force);const canonical=wtIFind(c);let touched=changed;
  if(canonical){
    canonical.contentKind=c.contentKind||canonical.contentKind||'';
    canonical.parentResolved=!!(canonical.parentResolved||c.parentResolved);
    canonical.titleEvidence=Math.max(Number(canonical.titleEvidence)||0,c.titleEvidence||0);
    canonical.episodeTitle=c.episodeTitle||canonical.episodeTitle||'';
    if(c.cover&&/^https?:\/\//i.test(c.cover)){canonical.cover=c.cover;canonical.coverSource='streaming';touched=true}
    if(c.banner&&/^https?:\/\//i.test(c.banner)){canonical.banner=c.banner;touched=true}
    for(const old of stale){if(old===canonical)continue;wtMergeStreamingRecord(canonical,old);state.titles=state.titles.filter(t=>t!==old);touched=true}
  }
  return touched;
};
// One-time conservative cleanup: remove only unmistakable UI/action labels created automatically.
setTimeout(()=>{
  const before=state.titles.length;
  state.titles=state.titles.filter(t=>t.manualLock||!wtStreamingRecord(t)||!wtUiGarbageTitle(t.title));
  if(state.titles.length!==before){commit('streaming-cleanup-v130',false);renderAll();toast(`WatchTower limpió ${before-state.titles.length} detecciones inválidas`)}
},500);
