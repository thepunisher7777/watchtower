(() => {
  "use strict";
  const PAGE_SOURCE = "FLOWWATCH_WEB";        // legacy protocol retained for migration
  const EXT_SOURCE = "FLOWWATCH_EXTENSION";
  const STATE_KEY = "watchtower:center_state";
  const EVENT_KEY = "watchtower:events";
  const CLOUD_KEY = "watchtower:cloud_config";
  const AF_DEFAULT = {enabled:true,autoSkip:true,autoNext:true,resumeAssist:true,openingSec:90,scope:"safe",customHosts:[]};
  let lastPostedEventId = null;

  const post = (type, payload={}) => window.postMessage({source:EXT_SOURCE,type,...payload}, location.origin);
  const localGet = obj => new Promise(r=>chrome.storage.local.get(obj,r));
  const localSet = obj => new Promise(r=>chrome.storage.local.set(obj,r));
  const syncGet  = obj => new Promise(r=>chrome.storage.sync.get(obj,r));
  const syncSet  = obj => new Promise(r=>chrome.storage.sync.set(obj,r));

  async function afSettings(){
    const s=await syncGet({enabled:true,skipOP:true,skipRecap:true,skipED:true,autoNext:true,resumeBehavior:"continue",fallbackSeconds:90});
    return {enabled:!!s.enabled,autoSkip:!!(s.skipOP||s.skipRecap||s.skipED),autoNext:!!s.autoNext,resumeAssist:s.resumeBehavior!=="ignore",openingSec:Number(s.fallbackSeconds||90),scope:"safe",customHosts:[]};
  }
  async function setAf(x={}){
    const s={};
    if('enabled' in x)s.enabled=!!x.enabled;
    if('autoSkip' in x){s.skipOP=!!x.autoSkip;s.skipRecap=!!x.autoSkip;s.skipED=!!x.autoSkip}
    if('autoNext' in x){s.autoNext=!!x.autoNext;s.autoPlayNext=!!x.autoNext}
    if('resumeAssist' in x)s.resumeBehavior=x.resumeAssist?'continue':'ignore';
    if('openingSec' in x)s.fallbackSeconds=Math.max(30,Math.min(180,Number(x.openingSec)||90));
    await syncSet(s);
  }
  async function queryActive(){
    return new Promise(resolve=>{try{chrome.runtime.sendMessage({type:'WATCHTOWER_QUERY_ACTIVE'},r=>resolve(r||null))}catch(_){resolve(null)}});
  }
  async function sendAfState(){
    const [settings,status]=await Promise.all([afSettings(),queryActive()]);
    post('ANIFLOW_STATE',{settings,status:status?.status||{seen:false,videoFound:false,host:'',control:'',note:'Abre un reproductor compatible'}});
  }
  async function sendEvents(force=false){
    const d=await localGet({[EVENT_KEY]:[]});
    const arr=Array.isArray(d[EVENT_KEY])?d[EVENT_KEY]:[];
    if(!arr.length)return;
    const latest=arr.slice(-500);
    if(!force&&latest.at(-1)?.id===lastPostedEventId)return;
    lastPostedEventId=latest.at(-1)?.id||null;
    post('EVENTS',{events:latest});
  }
  async function heartbeat(){
    const d=await localGet({[EVENT_KEY]:[]});
    const arr=Array.isArray(d[EVENT_KEY])?d[EVENT_KEY]:[];
    post('HEARTBEAT',{lastEvent:arr.at(-1)||null});
    sendEvents();
  }

  window.addEventListener('message', async e=>{
    if(e.source!==window||e.origin!==location.origin)return;
    const d=e.data||{};
    if(d.source!==PAGE_SOURCE)return;
    switch(d.type){
      case 'HELLO': await heartbeat(); break;
      case 'PULL_EVENTS': await sendEvents(true); break;
      case 'STATE_SET': if(d.state&&typeof d.state==='object')await localSet({[STATE_KEY]:d.state}); break;
      case 'STATE_GET': {const x=await localGet({[STATE_KEY]:null}); if(x[STATE_KEY])post('CENTER_STATE',{state:x[STATE_KEY]}); break;}
      case 'ANIFLOW_SET': await setAf({...AF_DEFAULT,...(d.settings||{})}); await sendAfState(); break;
      case 'ANIFLOW_GET': await sendAfState(); break;
      case 'ANIFLOW_PING': await sendAfState(); break;
      case 'CLOUD_CONFIG': if(d.config&&typeof d.config==='object')await localSet({[CLOUD_KEY]:d.config}); break;
      case 'STREAMING_SCAN': {try{chrome.runtime.sendMessage({type:'WATCHTOWER_STREAMING_SCAN_ALL'},r=>post('STREAMING_SCAN_RESULTS',r||{ok:false,snapshots:[]}))}catch(_){post('STREAMING_SCAN_RESULTS',{ok:false,snapshots:[]})} break;}
      case 'STREAMING_GET_CACHED': {try{chrome.runtime.sendMessage({type:'WATCHTOWER_STREAMING_GET_CACHED'},r=>post('STREAMING_CACHED',r||{ok:false,snapshots:[]}))}catch(_){post('STREAMING_CACHED',{ok:false,snapshots:[]})} break;}
    }
  });

  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&(changes[EVENT_KEY]||changes[STATE_KEY])){heartbeat()}
    if(area==='sync')sendAfState();
  });
  heartbeat();
  setInterval(heartbeat,10000);
})();
