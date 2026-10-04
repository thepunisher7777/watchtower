'use strict';
// v1.4.1 — External ratings panel (IMDb/FilmAffinity + native metadata sources).
(()=>{
  const style=document.createElement('style');
  style.textContent=`
  .wt-ratings{margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px}
  .wt-ratings-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
  .wt-ratings-head h3{margin:0;font-size:12px}.wt-ratings-actions{display:flex;gap:6px;flex-wrap:wrap}
  .wt-rating-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .wt-rating-card{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:10px;min-height:68px}
  .wt-rating-card small{display:block;color:var(--muted);font-size:9px;margin-bottom:5px}.wt-rating-card b{font-size:18px;line-height:1}.wt-rating-card span{display:block;color:var(--muted);font-size:8px;margin-top:5px}
  .wt-rating-link{color:#8bc3ff;text-decoration:none}.wt-rating-link:hover{text-decoration:underline}
  .wt-mini-btn{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#dce8f6;border-radius:9px;padding:6px 8px;font-size:9px;cursor:pointer}
  @media(max-width:760px){.wt-rating-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);

  const loadCfg=()=>{try{return JSON.parse(localStorage.getItem('flowwatch_v4_config')||'{}')}catch(_){return {}}};
  const saveCfg=c=>localStorage.setItem('flowwatch_v4_config',JSON.stringify(c));
  const escQ=s=>encodeURIComponent(String(s||'').trim());
  const normScore=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:null};
  const fmt10=v=>{const n=normScore(v);return n?`${n.toFixed(n%1?1:0)}/10`:'—'};

  async function omdbRating(t){
    const cfg=loadCfg(),key=String(cfg.omdbKey||'').trim();
    if(!key)return null;
    const qs=new URLSearchParams({apikey:key,t:t.title||''});
    if(t.year)qs.set('y',String(t.year));
    if(t.type==='movie')qs.set('type','movie');
    else if(t.type==='series')qs.set('type','series');
    const r=await fetch(`https://www.omdbapi.com/?${qs.toString()}`);
    if(!r.ok)return null;const x=await r.json();
    if(x.Response==='False')return null;
    const imdb=normScore(x.imdbRating);
    const rt=(x.Ratings||[]).find(a=>/rotten tomatoes/i.test(a.Source||''))?.Value||'';
    const meta=(x.Ratings||[]).find(a=>/metacritic/i.test(a.Source||''))?.Value||x.Metascore||'';
    return {imdb,imdbId:x.imdbID||'',rt,meta,title:x.Title||'',year:x.Year||''};
  }

  async function providerRating(t){
    try{
      if(t.type==='anime'){
        const rs=await aniListSearch(t.title);const best=(rs||[])[0];
        return best?.rating?{label:'AniList',value:`${Math.round(Number(best.rating)*10)}/100`}:null;
      }
      if(t.type==='series'){
        const rs=await tvMazeSearch(t.title);const best=(rs||[])[0];
        return best?.rating?{label:'TVmaze',value:fmt10(best.rating)}:null;
      }
      if(t.type==='movie'){
        const cfg=loadCfg(),token=String(cfg.tmdbToken||'').trim();if(!token)return null;
        const headers={Accept:'application/json'};let url=`https://api.themoviedb.org/3/search/movie?query=${escQ(t.title)}&language=es-ES`;
        if(token.startsWith('eyJ'))headers.Authorization=`Bearer ${token}`;else url+=`&api_key=${escQ(token)}`;
        const r=await fetch(url,{headers});if(!r.ok)return null;const x=await r.json(),m=(x.results||[])[0];
        return m?.vote_average?{label:'TMDB',value:fmt10(m.vote_average)}:null;
      }
    }catch(_){return null}
    return null;
  }

  function stored(t){t.externalRatings=t.externalRatings||{};return t.externalRatings}
  function card(name,value,sub='',href=''){
    const body=`<small>${name}</small><b>${value||'—'}</b>${sub?`<span>${sub}</span>`:''}`;
    return href?`<a class="wt-rating-card wt-rating-link" target="_blank" rel="noopener" href="${href}">${body}</a>`:`<div class="wt-rating-card">${body}</div>`;
  }

  async function renderRatings(t){
    const host=document.getElementById('wtRichMeta')||document.getElementById('detailContent');
    if(!host||document.getElementById('wtRatingsPanel'))return;
    const ratings=stored(t);
    const panel=document.createElement('div');panel.className='wt-ratings';panel.id='wtRatingsPanel';
    panel.innerHTML=`<div class="wt-ratings-head"><h3>Valoraciones externas</h3><div class="wt-ratings-actions"><button class="wt-mini-btn" id="wtRatingsEdit">Editar</button><button class="wt-mini-btn" id="wtOmdbSetup">IMDb automático</button></div></div><div class="wt-rating-grid" id="wtRatingGrid"><div class="wt-rating-card"><small>Cargando</small><b>…</b><span>Buscando fuentes disponibles</span></div></div>`;
    host.appendChild(panel);
    const imdbSearch=`https://www.imdb.com/find/?q=${escQ(t.title)}`;
    const faSearch=`https://www.filmaffinity.com/es/search.php?stext=${escQ(t.title)}`;
    const [omdb,provider]=await Promise.all([omdbRating(t).catch(()=>null),providerRating(t).catch(()=>null)]);
    if(omdb?.imdb){ratings.imdb=omdb.imdb;ratings.imdbId=omdb.imdbId||ratings.imdbId||'';ratings.rottenTomatoes=omdb.rt||ratings.rottenTomatoes||'';ratings.metacritic=omdb.meta||ratings.metacritic||'';t.externalRatings=ratings;commit('ratings-refresh',false)}
    const grid=document.getElementById('wtRatingGrid');if(!grid)return;
    const imdbHref=ratings.imdbId?`https://www.imdb.com/title/${ratings.imdbId}/`:imdbSearch;
    grid.innerHTML=
      card('IMDb',ratings.imdb?fmt10(ratings.imdb):'—',ratings.imdb?'Actualizado automáticamente/manual':(loadCfg().omdbKey?'Sin coincidencia':'Configura OMDb para autocompletar'),imdbHref)+
      card('FilmAffinity',ratings.filmaffinity?fmt10(ratings.filmaffinity):'—',ratings.filmaffinity?'Guardado en WatchTower':'Sin API pública fiable · editable manualmente',faSearch)+
      card(provider?.label||'Fuente principal',provider?.value||(t.rating?fmt10(t.rating):'—'),provider?'Fuente de metadatos':'Dato local')+
      card('Rotten Tomatoes',ratings.rottenTomatoes||'—',ratings.rottenTomatoes?'Vía OMDb':'Si está disponible en OMDb')+
      card('Metacritic',ratings.metacritic||'—',ratings.metacritic?'Vía OMDb':'Si está disponible en OMDb');

    document.getElementById('wtRatingsEdit').onclick=()=>{
      const imdb=prompt('Nota IMDb (0-10). Déjalo vacío para conservarla:',ratings.imdb??'');
      if(imdb!==null&&imdb.trim()!==''){const n=Number(imdb.replace(',','.'));if(n>=0&&n<=10)ratings.imdb=n}
      const fa=prompt('Nota FilmAffinity (0-10). Déjalo vacío para conservarla:',ratings.filmaffinity??'');
      if(fa!==null&&fa.trim()!==''){const n=Number(fa.replace(',','.'));if(n>=0&&n<=10)ratings.filmaffinity=n}
      t.externalRatings=ratings;commit('ratings-manual',false);document.getElementById('wtRatingsPanel')?.remove();renderRatings(t)
    };
    document.getElementById('wtOmdbSetup').onclick=()=>{
      const c=loadCfg();const key=prompt('Clave de OMDb para obtener IMDb automáticamente. Puedes dejarla vacía para desactivarlo:',c.omdbKey||'');
      if(key===null)return;c.omdbKey=key.trim();saveCfg(c);document.getElementById('wtRatingsPanel')?.remove();renderRatings(t)
    };
  }

  const prevOpen=window.openDetail;
  if(typeof prevOpen==='function')window.openDetail=function(id){prevOpen(id);const t=getTitle(id);setTimeout(()=>t&&renderRatings(t),140)};
})();
