const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {createRequire}=require('node:module');
const runtime=createRequire(process.env.WATCHTOWER_TEST_RUNTIME||require('node:path').resolve('package.json'));const {JSDOM,VirtualConsole}=runtime('jsdom');
test('all application chunks load and genuine receiver persists, filters origins and preserves existing views',()=>{
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,''),{url:'https://watchtower.test/',runScripts:'outside-only',virtualConsole:vc});const w=dom.window;
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.fetch=async()=>{throw Error('No network in fictional UI test')};w.confirm=()=>true;w.BroadcastChannel=undefined;
 const chunks=fs.readFileSync('app.js','utf8').match(/\['app-1.js'.*?\]/)[0];const files=JSON.parse(chunks.replace(/'/g,'"'));
 for(const file of files){try{new (require('node:vm').Script)(fs.readFileSync(file,'utf8'),{filename:file}).runInContext(dom.getInternalVMContext())}catch(e){errors.push(file+': '+e.message)}}
 assert.deepEqual(errors,[],'Every shipped application chunk must parse and initialize');
 w.eval(`state.titles=[];state.history=[];state.settings.autoNext=true;state.v4.processedEvents=[];scheduleCloudPush=()=>{};`);
 const send=(event,origin='https://watchtower.test',source=w)=>w.dispatchEvent(new w.MessageEvent('message',{source,origin,data:{source:'FLOWWATCH_EXTENSION',type:'EVENT',event}}));
 const e={id:'fixture-1',title:'Serie ficticia',provider:'HTMLMediaElement fixture',action:'progress',season:1,episode:1,position:95,duration:100};
 send(e,'https://wrong.test');assert.equal(w.eval('state.titles.length'),0);send(e,undefined,null);assert.equal(w.eval('state.titles.length'),0);send(e);assert.equal(w.eval('state.history.length'),1);send({...e,id:'fixture-2',action:'ended'});assert.equal(w.eval('state.history.length'),1);
 const saved=JSON.parse(w.localStorage.getItem('flowwatch_v3_state'));assert.equal(saved.titles[0].currentEpisode,2);assert.equal(saved.titles[0].playbackTracker.completed,true);
 send({...e,id:'fixture-3',episode:2,action:'start',position:0});assert.equal(w.eval('state.titles[0].currentEpisode'),2);assert.equal(w.eval('state.titles[0].progressPct'),0);
 w.eval('state.titles[0].manualLock=true');send({...e,id:'fixture-4',episode:3});assert.equal(w.eval('state.titles[0].currentEpisode'),2);
 for(const view of ['home','library','calendar','activity','settings']){const b=w.document.querySelector(`[data-view="${view}"]`);assert.ok(b);b.click();}
 assert.deepEqual(errors,[]);dom.window.close();
});
