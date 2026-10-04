'use strict';
// v1.2.2 — repair Prime Video action-label imports once Companion provides a clean title.
const wtPrimeBadTitle=t=>{
  const s=String(t||'').trim();
  return /^(?:se incluye|incluid[oa]|included).*(?:prime|suscrip)/i.test(s)||
    /^(?:reanudar|resume|continuar|continue|ver ahora|watch now|reproducir|play)\b/i.test(s)||
    /(?:se incluye con prime|incluido con prime|included with prime).*(?:reanudar|resume|continuar|watch)/i.test(s)||
    /^(?:t|s)\s*\d+\s*e\s*\d+\b/i.test(s)||
    /^(?:e|ep\.?|episodio|episode)\s*\d+\b/i.test(s);
};
const wtPrimeApplyPrev=wtIApply;
wtIApply=function(raw,force=false){
  const c=wtINorm(raw);
  if(c.provider==='Prime Video'&&c.title&&c.url){
    const repair=state.titles.find(t=>!t.manualLock&&t.platform==='Prime Video'&&t.sourceUrl===c.url&&normTitle(t.title)!==normTitle(c.title)&&(
      wtPrimeBadTitle(t.title)||(!t.cover&&!t.year&&!t.summary&&!t.rating&&String(t.title||'').trim().length<=4)
    ));
    if(repair){
      repair.title=c.title;
      repair.type=c.type||repair.type;
      repair.source='Streaming Importer';
      repair.trackingSource='streaming-auto-repair';
      repair.metaFetchedAt=0;
      repair.updatedAt=now();
      if(c.season!=null)repair.currentSeason=c.season;
      if(c.episode!=null){repair.currentEpisode=c.episode;repair.seen=Math.max(Number(repair.seen)||0,c.episode-1);repair.total=Math.max(Number(repair.total)||1,c.episode)}
      if(c.progress!=null){repair.progressPct=c.progress;repair.positionSec=Math.round((c.progress/100)*(repair.durationSec||3000))}
      enrichTitle(repair,false).then(ok=>{if(ok){commit('prime-repair-enrich',false);renderAll()}}).catch(()=>{});
    }
  }
  return wtPrimeApplyPrev(c,force);
};
