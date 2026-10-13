// Skipper background bridge · v0.5.6 ICE
"use strict";
importScripts("tracking-protocol.js");

const aniflowFrameConfigs = new Map();
const aniflowFullscreenPending = new Map();
const ANIFLOW_FULLSCREEN_MAX_AGE = 60000;
const ANIFLOW_CONFIG_MAX_AGE = 45000;

const frameConfigKey = (tabId, frameId) => `${tabId}:${frameId}`;

function clearTabFrameConfigs(tabId) {
  const prefix = `${tabId}:`;
  for (const key of aniflowFrameConfigs.keys()) {
    if (key.startsWith(prefix)) aniflowFrameConfigs.delete(key);
  }
}

function getFreshFullscreenPending(tabId) {
  const p = aniflowFullscreenPending.get(tabId);
  if (!p) return null;
  if (Date.now() - p.time > ANIFLOW_FULLSCREEN_MAX_AGE) {
    aniflowFullscreenPending.delete(tabId);
    return null;
  }
  return p;
}

async function fetchJson(url, timeoutMs = 8500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit"
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Evita reutilizar rangos de un episodio anterior si un iframe aparece antes
  // que el content script principal durante la nueva navegación.
  if (changeInfo.status === "loading" || changeInfo.url) clearTabFrameConfigs(tabId);
});

chrome.tabs.onRemoved.addListener(tabId => {
  clearTabFrameConfigs(tabId);
  aniflowFullscreenPending.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return;

  if (message.type === "ANIFLOW_PLAYER_READY") {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId ?? 0;
    const topUrl = sender.tab?.url || "";
    if (tabId == null) { sendResponse({ ok:false }); return; }

    chrome.tabs.sendMessage(tabId, {
      type: "ANIFLOW_PLAYER_READY_FORWARD",
      duration: Number(message.duration || 0),
      frameId,
      host: message.host || "",
      url: message.url || ""
    }, { frameId: 0 }, response => {
      void chrome.runtime.lastError;

      const pending = getFreshFullscreenPending(tabId);
      const fullscreenRestore = !!pending && (
        (!!topUrl && !!pending.fromTopUrl && topUrl !== pending.fromTopUrl) ||
        (message.url || "") !== (pending.fromFrameUrl || "") ||
        frameId !== pending.frameId
      );

      if (fullscreenRestore) {
        chrome.tabs.sendMessage(tabId, {
          type: "ANIFLOW_FULLSCREEN_RESTORE_TOP",
          host: message.host || "",
          url: message.url || "",
          frameId
        }, { frameId: 0 }, () => { void chrome.runtime.lastError; });
      }

      if (response?.ok && response.config) {
        const config = { ...response.config, fullscreenRestore };
        aniflowFrameConfigs.set(frameConfigKey(tabId, frameId), {
          config,
          topUrl,
          time: Date.now()
        });
        sendResponse({ ok:true, config, fullscreenRestore });
        return;
      }

      const cached = aniflowFrameConfigs.get(frameConfigKey(tabId, frameId));
      const cacheFresh = cached &&
        Date.now() - Number(cached.time || 0) < ANIFLOW_CONFIG_MAX_AGE &&
        (!topUrl || !cached.topUrl || cached.topUrl === topUrl);
      const config = cacheFresh ? { ...cached.config, fullscreenRestore } : null;
      sendResponse({ ok: !!config || fullscreenRestore, config, fullscreenRestore });
    });
    return true;
  }

  if (message.type === "ANIFLOW_PLAYER_PUSH_CONFIG") {
    const tabId = sender.tab?.id;
    const frameId = Number(message.frameId);
    const topUrl = sender.tab?.url || "";
    if (tabId == null || !Number.isInteger(frameId)) { sendResponse({ ok:false }); return; }
    const config = message.config || {};
    aniflowFrameConfigs.set(frameConfigKey(tabId, frameId), { config, topUrl, time:Date.now() });
    chrome.tabs.sendMessage(tabId, { type:"ANIFLOW_PLAYER_CONFIG", config }, { frameId }, () => {
      void chrome.runtime.lastError;
      sendResponse({ ok:true });
    });
    return true;
  }

  if (message.type === "ANIFLOW_FULLSCREEN_ARM") {
    const tabId = sender.tab?.id;
    if (tabId == null) { sendResponse({ ok:false }); return; }
    aniflowFullscreenPending.set(tabId, {
      time: Date.now(),
      fromTopUrl: sender.tab?.url || "",
      fromFrameUrl: message.url || sender.url || "",
      fromHost: message.host || "",
      frameId: sender.frameId ?? 0,
      reason: message.reason || ""
    });
    sendResponse({ ok:true });
    return;
  }

  if (message.type === "ANIFLOW_FULLSCREEN_NATIVE") {
    const tabId = sender.tab?.id;
    if (tabId == null) { sendResponse({ ok:false }); return; }
    aniflowFullscreenPending.delete(tabId);
    chrome.tabs.sendMessage(tabId, { type:"ANIFLOW_FULLSCREEN_CLEAR_TOP" }, { frameId:0 }, () => {
      void chrome.runtime.lastError;
    });
    sendResponse({ ok:true });
    return;
  }

  if (message.type === "ANIFLOW_FULLSCREEN_CANCEL") {
    const tabId = sender.tab?.id;
    if (tabId == null) { sendResponse({ ok:false }); return; }
    aniflowFullscreenPending.delete(tabId);
    chrome.tabs.sendMessage(tabId, { type:"ANIFLOW_FULLSCREEN_CLEAR_TOP" }, { frameId:0 }, () => {
      void chrome.runtime.lastError;
    });
    sendResponse({ ok:true });
    return;
  }

  if (message.type === "ANIFLOW_PLAYER_EVENT") {
    const tabId = sender.tab?.id;
    if (tabId == null) { sendResponse({ ok:false }); return; }
    chrome.tabs.sendMessage(tabId, {
      type: "ANIFLOW_PLAYER_EVENT_FORWARD",
      event: message.event,
      range: message.range || null,
      fromTime: message.fromTime,
      position: message.position,
      duration: message.duration,
      pageUrl: message.pageUrl,
      host: message.host || "",
      frameId: sender.frameId ?? 0
    }, { frameId:0 }, () => { void chrome.runtime.lastError; });
    sendResponse({ ok:true });
    return;
  }

  if (message.type === "ANISKIP_FETCH") {
    const malId = Number(message.malId);
    const episode = Number(message.episode);
    const episodeLength = Number(message.episodeLength || 0);
    if (!Number.isFinite(malId) || malId <= 0 || !Number.isFinite(episode) || episode <= 0) {
      sendResponse({ ok:false, error:"Parámetros AniSkip inválidos" });
      return;
    }
    const url = new URL(`https://api.aniskip.com/v2/skip-times/${malId}/${episode}`);
    ["op", "ed", "mixed-op", "mixed-ed", "recap"].forEach(t => url.searchParams.append("types", t));
    url.searchParams.set("episodeLength", String(Math.max(0, episodeLength)));

    fetchJson(url.toString())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "JIKAN_SEARCH") {
    const q = String(message.query || "").trim().slice(0, 180);
    if (!q) { sendResponse({ ok:false, error:"Consulta vacía" }); return; }

    const url = new URL("https://api.jikan.moe/v4/anime");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "10");
    url.searchParams.set("order_by", "members");
    url.searchParams.set("sort", "desc");

    fetchJson(url.toString())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});


// ================= WATCHTOWER CENTER BRIDGE =================
const WT_EVENT_KEY = "watchtower:events";
let wtEventWrites=Promise.resolve();
function wtAppendEvent(raw){
  const event=WatchTowerTrackingProtocol.event(raw);if(!event)return Promise.resolve(false);
  const operation=wtEventWrites.catch(()=>{}).then(async()=>{
    const d=await chrome.storage.local.get({[WT_EVENT_KEY]:[]});
    const arr=Array.isArray(d[WT_EVENT_KEY])?d[WT_EVENT_KEY]:[];
    const ev={...event,id:typeof event.id==='string'&&event.id?event.id:crypto.randomUUID()};
    if(arr.some(x=>x.id===ev.id))return true;
    await chrome.storage.local.set({[WT_EVENT_KEY]:[...arr,ev].slice(-500)});
    return true;
  });
  wtEventWrites=operation.catch(error=>{console.warn('WatchTower: playback event could not be persisted',error?.message||'storage error');});
  return operation;
}

chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=="local")return;
  for(const [key,ch] of Object.entries(changes)){
    if(!key.startsWith("history:")||!ch.newValue||typeof ch.newValue!=="object")continue;
    const h=ch.newValue;
    const event=WatchTowerTrackingProtocol.fromHistory(h);if(event)void wtAppendEvent(event).catch(()=>{});
  }
});
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message?.type!=="WATCHTOWER_QUERY_ACTIVE")return;
  chrome.tabs.query({active:true,currentWindow:true},tabs=>{
    const tab=tabs?.[0];
    if(!tab?.id){sendResponse({status:{seen:false,videoFound:false,note:"Sin pestaña activa"}});return}
    chrome.tabs.sendMessage(tab.id,{type:"GET_PAGE_INFO"},{frameId:0},info=>{
      const err=chrome.runtime.lastError;
      if(err||!info){
        sendResponse({status:{seen:true,videoFound:false,host:(()=>{try{return new URL(tab.url||"").hostname}catch(_){return ""}})(),control:"limited",note:"La pestaña actual no expone estado del engine"}});return;
      }
      sendResponse({status:{seen:true,videoFound:!info.safeDrm&&!!info.ok,host:(()=>{try{return new URL(tab.url||"").hostname}catch(_){return ""}})(),title:info.meta?.title||info.siteKey||tab.title||"",progress:Number(info.meta?.progress||0),control:info.safeDrm?"limited":"direct",note:info.safeDrm?"Safe DRM · solo controles nativos":info.detectionStatus||"Engine activo"}})
    });
  });
  return true;
});
// ================= END WATCHTOWER CENTER BRIDGE =================

// ================= WATCHTOWER STREAMING IMPORTER =================
const WT_STREAMING_SNAPSHOTS = 'watchtower:streaming_snapshots';
const WT_STREAMING_MAX_AGE = 24*60*60*1000;
const WT_STREAMING_HOST_RE = /(netflix\.com|disneyplus\.com|primevideo\.com|amazon\.(com|es)|crunchyroll\.com|hidive\.com|max\.com|hbomax\.com|tv\.apple\.com|paramountplus\.com|hulu\.com|peacocktv\.com|skyshowtime\.com|movistarplus\.es|filmin\.es|mubi\.com|rakuten\.tv|app\.plex\.tv|discoveryplus\.com|britbox\.com|amcplus\.com|atresplayer\.com|rtve\.es)/i;
async function wtStreamingStore(tabId,snapshot){
  if(tabId==null||!snapshot||typeof snapshot!=='object')return;
  const d=await chrome.storage.local.get({[WT_STREAMING_SNAPSHOTS]:{}});
  const all=(d[WT_STREAMING_SNAPSHOTS]&&typeof d[WT_STREAMING_SNAPSHOTS]==='object')?d[WT_STREAMING_SNAPSHOTS]:{};
  all[String(tabId)]={...snapshot,tabId,storedAt:Date.now()};
  const cutoff=Date.now()-WT_STREAMING_MAX_AGE;
  for(const [k,v] of Object.entries(all))if(Number(v?.storedAt||v?.scannedAt||0)<cutoff)delete all[k];
  await chrome.storage.local.set({[WT_STREAMING_SNAPSHOTS]:all});
}
async function wtStreamingCached(){
  const d=await chrome.storage.local.get({[WT_STREAMING_SNAPSHOTS]:{}});
  const all=(d[WT_STREAMING_SNAPSHOTS]&&typeof d[WT_STREAMING_SNAPSHOTS]==='object')?d[WT_STREAMING_SNAPSHOTS]:{};
  const cutoff=Date.now()-WT_STREAMING_MAX_AGE;
  return Object.values(all).filter(v=>Number(v?.storedAt||v?.scannedAt||0)>=cutoff);
}
chrome.tabs.onRemoved.addListener(async tabId=>{
  try{const d=await chrome.storage.local.get({[WT_STREAMING_SNAPSHOTS]:{}});const all=d[WT_STREAMING_SNAPSHOTS]||{};if(String(tabId) in all){delete all[String(tabId)];await chrome.storage.local.set({[WT_STREAMING_SNAPSHOTS]:all})}}catch(_){}
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type==='WATCHTOWER_STREAMING_SNAPSHOT'){
    wtStreamingStore(sender.tab?.id,message.snapshot).then(()=>sendResponse({ok:true})).catch(()=>sendResponse({ok:false}));return true;
  }
  if(message?.type==='WATCHTOWER_STREAMING_GET_CACHED'){
    wtStreamingCached().then(snapshots=>sendResponse({ok:true,snapshots})).catch(()=>sendResponse({ok:false,snapshots:[]}));return true;
  }
  if(message?.type==='WATCHTOWER_STREAMING_SCAN_ALL'){
    chrome.tabs.query({},tabs=>{
      const targets=(tabs||[]).filter(t=>t.id!=null&&WT_STREAMING_HOST_RE.test(String(t.url||'')));
      if(!targets.length){sendResponse({ok:true,snapshots:[],note:'No hay pestañas de streaming compatibles abiertas'});return;}
      Promise.all(targets.map(tab=>new Promise(resolve=>{
        chrome.tabs.sendMessage(tab.id,{type:'STREAMING_IMPORT_SCAN'},{frameId:0},resp=>{
          const err=chrome.runtime.lastError;
          if(err||!resp?.snapshot){resolve(null);return}
          wtStreamingStore(tab.id,resp.snapshot).finally(()=>resolve({...resp.snapshot,tabId:tab.id}));
        });
      }))).then(rows=>sendResponse({ok:true,snapshots:rows.filter(Boolean)}));
    });
    return true;
  }
});
// ================= END WATCHTOWER STREAMING IMPORTER =================
