/* Local, dependency-free reconciliation of Companion and cloud playback events. */
(function(root){
'use strict';
const normalizeTitle=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function normalize(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>300)return null;
 const action=({play:'start',playing:'start',timeupdate:'progress'})[raw.action]||raw.action;
 if(!['start','progress','pause','stop','ended'].includes(action))return null;
 const e={title:raw.title.trim(),action,provider:typeof raw.provider==='string'?raw.provider.slice(0,80):'Extensión'};
 if(['anime','series','movie','documentary'].includes(raw.type))e.type=raw.type;
 if(raw.id!=null){if(typeof raw.id!=='string'||!raw.id||raw.id.length>200)return null;e.id=raw.id;}
 for(const k of ['season','episode','position','duration','progress']){
  if(raw[k]==null||raw[k]==='')continue;
  const n=Number(raw[k]);if(!Number.isFinite(n)||n<0)return null;
  if(['season','episode'].includes(k)&&(!Number.isSafeInteger(n)||n<1||n>100000))return null;
  if(k==='progress'&&n>100||k==='duration'&&n===0)return null;e[k]=n;
 }
 if(raw.occurredAt!=null){const n=typeof raw.occurredAt==='number'?raw.occurredAt:Date.parse(raw.occurredAt);if(!Number.isFinite(n)||n<=0)return null;e.occurredAt=n;}
 return e;
}
function apply(state,raw,{now=Date.now(),uid=()=>globalThis.crypto.randomUUID()}={}){
 const e=normalize(raw),skip=reason=>({changed:false,reason,state});if(!e||!normalizeTitle(e.title))return skip('invalid-event');
 const done=state.v4?.processedEvents||[];if(e.id&&done.includes(e.id))return skip('duplicate-event');
 const index=state.titles.findIndex(t=>normalizeTitle(t.title)===normalizeTitle(e.title));const previous=state.titles[index];
 if(previous?.manualLock)return skip('manual-lock');
 const series=previous?previous.type!=='movie':e.episode!=null||e.season!=null;
 if(series&&!previous&&(e.season==null||e.episode==null))return skip('episode-identity-required');
 const s=e.season??previous?.currentSeason??1,ep=e.episode??previous?.currentEpisode??1;
 const marker=previous?.playbackTracker;
 if(series&&marker?.completed&&(e.season==null||e.episode==null))return skip('ambiguous-after-completion');
 const oldS=Number(previous?.currentSeason)||1,oldE=Number(previous?.currentEpisode)||1;
 if(previous&&series&&(s<oldS||s===oldS&&ep<oldE))return skip('older-episode');
 const same=!!previous&&s===oldS&&ep===oldE;
 const sameMarker=marker&&marker.season===s&&marker.episode===ep;
 if(sameMarker&&e.occurredAt&&marker.occurredAt&&e.occurredAt<marker.occurredAt)return skip('older-event');
 const alreadyCompleted=sameMarker&&marker.completed||!series&&previous?.status==='finished'||state.history.some(h=>h.titleId===previous?.id&&h.action==='complete'&&h.season===s&&h.episode===ep);
 if(alreadyCompleted)return skip('completed-episode');
 const t=previous?{...previous}:{id:'ext-'+uid(),title:e.title,type:e.type||(series?'series':'movie'),status:'watching',seen:0,total:ep,currentEpisode:ep,currentSeason:s,progressPct:0,positionSec:0,durationSec:0,platform:e.provider,genres:[],year:'',source:'Extensión',metaFetchedAt:0};
 if(!same){t.progressPct=0;t.positionSec=0;t.durationSec=e.duration||0;}
 if(e.duration!=null)t.durationSec=e.duration;
 const position=e.position==null?undefined:t.durationSec>0?Math.min(e.position,t.durationSec):e.position;
 const progress=e.progress??(position!=null&&t.durationSec>0?position/t.durationSec*100:undefined);
 if(progress==null&&e.action==='ended'&&!(t.durationSec>0))return skip('completion-evidence-required');
 if(position!=null)t.positionSec=Math.max(same?Number(t.positionSec)||0:0,position);
 if(progress!=null)t.progressPct=Math.max(same?Number(t.progressPct)||0:0,progress);
 t.currentSeason=s;t.currentEpisode=ep;t.total=Math.max(Number(t.total)||1,ep);t.platform=e.provider;t.status='watching';
 t.updatedAt=now;t.lastWatchedAt=e.occurredAt||now;
 const threshold=Number(state.settings?.threshold);const completed=e.action==='ended'||t.progressPct>=(threshold>0&&threshold<=100?threshold:90);
 const history=[...state.history];
 if(completed){
  history.unshift({id:uid(),titleId:t.id,label:series?`T${s} E${ep} completado automáticamente`:'Película completada',action:'complete',season:s,episode:ep,progress:100,at:e.occurredAt||now,device:'PC · '+e.provider,minutes:t.durationSec>0?Math.round(t.durationSec/60):0});
  if(series){t.seen=Math.max(Number(t.seen)||0,ep);if(state.settings?.autoNext){t.currentEpisode=ep+1;t.progressPct=0;t.positionSec=0;}}else{t.progressPct=100;t.status='finished';t.seen=1;t.total=1;}
 }else if(['pause','stop'].includes(e.action))history.unshift({id:uid(),titleId:t.id,label:series?`T${s} E${ep} pausado al ${Math.round(t.progressPct)}%`:`Pausada al ${Math.round(t.progressPct)}%`,action:'progress',season:s,episode:ep,progress:t.progressPct,at:e.occurredAt||now,device:'PC · '+e.provider,minutes:t.durationSec>0?Math.round(t.positionSec/60):0});
 t.playbackTracker={version:1,season:s,episode:ep,completed,occurredAt:e.occurredAt||(sameMarker?marker.occurredAt:null)};
 const titles=[...state.titles];if(index<0)titles.unshift(t);else titles[index]=t;
 return {changed:true,state:{...state,titles,history,v4:{...state.v4,processedEvents:e.id?[...done,e.id].slice(-600):done,extension:{...state.v4?.extension,lastEvent:e}}}};
}
root.WatchTowerPlayback={normalize,apply};if(typeof module==='object')module.exports=root.WatchTowerPlayback;
})(typeof window==='object'?window:globalThis);
