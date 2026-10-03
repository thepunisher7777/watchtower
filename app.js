'use strict';
const WATCHTOWER_CHUNKS=['app-1.js','app-2.js','app-3.js','app-4.js','app-5.js','app-6.js','app-7.js'];
for(const src of WATCHTOWER_CHUNKS){const s=document.createElement('script');s.src=src;s.async=false;s.dataset.watchtowerChunk=src;s.onerror=()=>console.error('WatchTower: no se pudo cargar',src);document.head.appendChild(s)}
