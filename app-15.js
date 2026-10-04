'use strict';
// v1.2.3 — streaming artwork, strict metadata matching and cleanup of malformed auto imports.
const wtMetaNorm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const wtStop=new Set(['the','a','an','of','and','de','del','la','el','los','las','y','en','un','una','unos','unas','is','to','for','with','con','by']);
const wtMetaTokens=s=>wtMetaNorm(s).split(' ').filter(x=>x.length>1&&!wtStop.has(x));
function wtMetaScore(a,b){
  const na=wtMetaNorm(a),nb=wtMetaNorm(b);if(!na||!nb)return 0;if(na===nb)return 1;
  const A=wtMetaTokens(a),B=wtMetaTokens(b);if(!A.length||!B.length)return 0;
  const sa=new Set(A),sb=new Set(B),inter=[...sa].filter(x=>sb.has(x)).length;
  const dice=(2*inter)/(sa.size+sb.size);
  const contain=(na.includes(nb)||nb.includes(na))?0.08:0;
  return Math.min(1,dice+contain);
}
const wtStreamingAuto=t=>String(t?.trackingSource||'').startsWith('streaming')||t?.source==='Streaming Importer';

// Preserve artwork and canonical streaming URLs delivered by Companion.
const wtNormV123=wtINorm;
wtINorm=function(c){const n=wtNormV123(c);n.cover=String(c?.cover||'');return n};
const wtApplyV123=wtIApply;
wtIApply=function(raw,force=false){
  const c=wtINorm(raw),changed=wtApplyV123(c,force);const t=wtIFind(c);let extra=false;
  if(t&&c.cover&&/^https?:\/\//i.test(c.cover)&&t.cover!==c.cover){t.cover=c.cover;t.coverSource='streaming';extra=true}
  if(t&&c.url&&/^https?:\/\//i.test(c.url)&&t.sourceUrl!==c.url){t.sourceUrl=c.url;t.source='Streaming Importer';extra=true}
  if(extra){t.updatedAt=now()}
  return changed||extra;
};

// Metadata must actually match the imported title. Better no poster than a poster from another show.
enrichTitle=async function(t,force=false){
  if(!force&&t.cover&&t.metaFetchedAt&&now()-t.metaFetchedAt<7*86400000)return true;
  try{
    const results=await universalSearch(t.title,t.type);if(!results.length)return false;
    const ranked=results.map(r=>({r,score:wtMetaScore(t.title,r.title)})).sort((a,b)=>b.score-a.score);
    const oneToken=wtMetaTokens(t.title).length<=1,threshold=oneToken?.92:.74;
    const best=ranked[0];
    if(!best||best.score<threshold){
      if(wtStreamingAuto(t)&&t.coverSource!=='streaming'&&['TVmaze','AniList','TMDB'].includes(String(t.source||''))){
        Object.assign(t,{cover:'',banner:'',year:'',genres:[],rating:'',summary:'',externalId:null,nextAiring:null,nextEpisodeUrl:'',metadataProvider:'',metadataUrl:'',metaFetchedAt:now(),source:'Streaming Importer'});
      }
      return false;
    }
    const r=best.r;if(r.provider==='TVmaze'&&!r.total){try{r.total=await tvMazeEpisodes(r.externalId)}catch(_){}}
    const keepStreamCover=t.coverSource==='streaming'&&t.cover;
    const imported=wtStreamingAuto(t);
    Object.assign(t,{
      cover:keepStreamCover?t.cover:(r.cover||t.cover||''),banner:r.banner||t.banner||'',year:r.year||t.year||'',genres:r.genres||t.genres||[],rating:r.rating||t.rating||'',summary:r.summary||t.summary||'',
      externalId:r.externalId,total:r.total||t.total||1,nextAiring:r.nextAiring||null,nextEpisodeUrl:r.nextEpisodeUrl||'',metaFetchedAt:now(),metadataProvider:r.provider,metadataUrl:r.sourceUrl||'',metadataMatch:Number(best.score.toFixed(2))
    });
    if(!imported){t.source=r.provider;t.sourceUrl=r.sourceUrl||t.sourceUrl||''}
    else if(!t.source)t.source='Streaming Importer';
    if(t.total&&t.seen>t.total)t.seen=t.total;return true;
  }catch(_){return false}
};

function wtMalformedAutoTitle(t){
  if(!t||t.manualLock||!wtStreamingAuto(t))return false;const s=String(t.title||'').trim(),p=String(t.platform||'');
  if(p==='Prime Video'&&(
    /^(?:se incluye|incluid[oa]|included).*(?:prime|suscrip)/i.test(s)||
    /^(?:reanudar|resume|continuar|continue|ver ahora|watch now|reproducir|play)\b/i.test(s)||
    /^(?:t|s)\s*\d+\s*e\s*\d+\b/i.test(s)||/^(?:e|ep\.?|episodio|episode)\s*\d+\b/i.test(s)||
    s.length<=3))return true;
  if(p==='Crunchyroll'&&/^(?:e|ep\.?|episodio|episode)\s*\d+\s*[-–—:]/i.test(s))return true;
  return false;
}

// One-time self-healing: remove only malformed records created automatically, never manual/locked titles.
setTimeout(()=>{
  const before=state.titles.length;state.titles=state.titles.filter(t=>!wtMalformedAutoTitle(t));
  let cleanedMeta=0;
  for(const t of state.titles){
    if(t.platform==='Prime Video'&&wtStreamingAuto(t)&&t.coverSource!=='streaming'&&['TVmaze','AniList','TMDB'].includes(String(t.source||''))){
      Object.assign(t,{cover:'',banner:'',year:'',genres:[],rating:'',summary:'',externalId:null,nextAiring:null,nextEpisodeUrl:'',metadataProvider:'',metadataUrl:'',source:'Streaming Importer',metaFetchedAt:0});cleanedMeta++;
    }
  }
  if(state.titles.length!==before||cleanedMeta){commit('streaming-cleanup-v123',false);renderAll();toast(`WatchTower reparó ${before-state.titles.length+cleanedMeta} detecciones antiguas`)}
},350);
