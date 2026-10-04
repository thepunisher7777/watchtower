'use strict';
// Entry points used by WatchTower Companion.
setTimeout(()=>{try{const p=new URLSearchParams(location.search),open=p.get('open');if(open==='importer'){const b=document.getElementById('wtIBtn');if(b)b.click()}else if(open==='skipper'&&typeof nav==='function'){nav('aniflow')}if(open){p.delete('open');const q=p.toString();history.replaceState(null,'',location.pathname+(q?`?${q}`:'')+location.hash)}}catch(_){}},900);
