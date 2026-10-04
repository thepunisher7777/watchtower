'use strict';
// v1.2.1 — repair episode-as-title imports and preserve parent-series metadata.
const wtNormV121=wtINorm;
wtINorm=function(c){const n=wtNormV121(c);n.episodeTitle=String(c?.episodeTitle||'').trim();return n};
const wtApplyV121=wtIApply;
wtIApply=function(raw,force=false){
  const c=wtINorm(raw);
  if(c.episodeTitle&&c.title&&normTitle(c.episodeTitle)!==normTitle(c.title)){
    const bad=state.titles.find(t=>!t.manualLock&&(
      (t.platform===c.provider&&normTitle(t.title)===normTitle(c.episodeTitle))||
      (c.url&&t.sourceUrl===c.url&&/^(?:T\s*\d+\s*)?E\s*\d+\b|^(?:episodio|episode|cap[ií]tulo|ep\.?)\s*\d+\b/i.test(String(t.title||'')))
    ));
    if(bad){bad.title=c.title;bad.type=c.type||bad.type;bad.currentSeason=c.season??bad.currentSeason;bad.currentEpisode=c.episode??bad.currentEpisode;bad.sourceUrl=c.url||bad.sourceUrl;bad.updatedAt=now();bad.trackingSource='streaming-auto-repair'}
  }
  return wtApplyV121(c,force);
};
