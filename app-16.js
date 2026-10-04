'use strict';
// v1.2.4 — Crunchyroll parent-series repair and episode-thumbnail cleanup.
const wtCrunchyApplyPrev=wtIApply;
wtIApply=function(raw,force=false){
  const c=wtINorm(raw);
  let stale=null;
  if(c.provider==='Crunchyroll'&&c.title&&c.episodeTitle&&normTitle(c.title)!==normTitle(c.episodeTitle)){
    stale=state.titles.find(t=>!t.manualLock&&t.platform==='Crunchyroll'&&normTitle(t.title)===normTitle(c.episodeTitle));
  }
  const changed=wtCrunchyApplyPrev(c,force);
  const canonical=wtIFind(c);
  let touched=changed;
  if(canonical&&c.provider==='Crunchyroll'&&c.episodeTitle){
    if(stale&&stale!==canonical&&!stale.manualLock){
      canonical.seen=Math.max(Number(canonical.seen)||0,Number(stale.seen)||0);
      canonical.total=Math.max(Number(canonical.total)||1,Number(stale.total)||1);
      canonical.currentSeason=Math.max(Number(canonical.currentSeason)||1,Number(stale.currentSeason)||1);
      canonical.currentEpisode=Math.max(Number(canonical.currentEpisode)||1,Number(stale.currentEpisode)||1);
      canonical.progressPct=Math.max(Number(canonical.progressPct)||0,Number(stale.progressPct)||0);
      canonical.positionSec=Math.max(Number(canonical.positionSec)||0,Number(stale.positionSec)||0);
      canonical.updatedAt=Math.max(Number(canonical.updatedAt)||0,Number(stale.updatedAt)||0,now());
      canonical.lastWatchedAt=Math.max(Number(canonical.lastWatchedAt)||0,Number(stale.lastWatchedAt)||0);
      state.titles=state.titles.filter(t=>t!==stale);
      touched=true;
    }
    // Old Crunchyroll builds saved landscape episode stills as portrait covers. If the new
    // Companion intentionally sends no poster, clear the stale streaming cover and re-enrich by series title.
    if(!c.cover&&canonical.coverSource==='streaming'){
      canonical.cover='';canonical.banner='';canonical.coverSource='';canonical.metaFetchedAt=0;canonical.metadataProvider='';canonical.metadataUrl='';touched=true;
      enrichTitle(canonical,true).then(ok=>{if(ok){commit('crunchy-parent-enrich',false);renderAll()}}).catch(()=>{});
    }
  }
  return touched;
};
