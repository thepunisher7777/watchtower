'use strict';
const video=document.querySelector('video'),status=document.querySelector('#status');
document.querySelector('#episode').onclick=()=>{document.title='WatchTower QA FICTICIO · Episodio 2';history.replaceState(null,'',location.pathname+'?episode=2');video.pause();video.currentTime=0;status.textContent='Episodio 2 preparado. Espera un segundo y pulsa reproducir.';};
document.querySelector('#near-end').onclick=()=>{if(Number.isFinite(video.duration)&&video.duration>0){video.currentTime=video.duration*.92;status.textContent='Umbral alcanzado; deja terminar para comprobar que no duplica la finalización.';}};
