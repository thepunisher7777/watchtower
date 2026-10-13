/* Shared, non-executing schema for the legacy Skipper absolute-episode stream. */
(function(root){
'use strict';
function fromHistory(h){
 if(!h||typeof h.title!=='string'||!h.title.trim()||h.title.length>300)return null;
 const episode=Number(h.episode),season=h.season==null?1:Number(h.season),position=Number(h.currentTime),duration=Number(h.duration),at=Number(h.updatedAt);
 if(!Number.isSafeInteger(episode)||episode<1||!Number.isSafeInteger(season)||season<1||!Number.isFinite(position)||position<0||!Number.isFinite(duration)||duration<=0||!Number.isFinite(at)||at<=0)return null;
 const action=h.playbackAction||'progress';if(!['start','progress','pause','stop','ended'].includes(action))return null;
 // Season 1 is the documented legacy absolute-episode namespace, not TV metadata.
 return {title:h.title.trim(),provider:'Skipper',type:'anime',season,episode,position:Math.min(position,duration),duration,progress:Math.min(100,position/duration*100),action,occurredAt:new Date(at).toISOString()};
}
function event(raw){
 if(!raw||typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>300)return null;
 const e={...raw};if(!['start','progress','pause','stop','ended'].includes(e.action))return null;
 if(!Number.isSafeInteger(e.season)||e.season<1||!Number.isSafeInteger(e.episode)||e.episode<1||!Number.isFinite(e.position)||e.position<0||!Number.isFinite(e.duration)||e.duration<=0||!Number.isFinite(e.progress)||e.progress<0||e.progress>100)return null;
 return e;
}
root.WatchTowerTrackingProtocol={fromHistory,event};if(typeof module==='object')module.exports=root.WatchTowerTrackingProtocol;
})(typeof window==='object'?window:globalThis);
