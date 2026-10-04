'use strict';
// v1.4.0 — Rich library details. Shows everything WatchTower knows locally and
// enriches the open title with provider metadata without changing the tracking source.
(()=>{
  const css=`
  .wt-rich{margin-top:14px;display:grid;gap:12px}.wt-rich-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.wt-rich-card{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:10px}.wt-rich-card small{display:block;color:var(--muted);font-size:9px;margin-bottom:3px}.wt-rich-card b{font-size:11px;line-height:1.3}.wt-rich-section{border-top:1px solid rgba(255,255,255,.08);padding-top:12px}.wt-rich-section h3{margin:0 0 8px;font-size:12px}.wt-rich-pills{display:flex;gap:6px;flex-wrap:wrap}.wt-rich-pill{font-size:9px;padding:5px 7px;border:1px solid rgba(255,255,255,.08);border-radius:999px;color:#c9d7e8;background:rgba(255,255,255,.025)}.wt-rich-copy{font-size:10px;line-height:1.65;color:#cbd7e6;margin:0}.wt-rich-cast{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;font-size:9px;color:#b9c9da}.wt-rich-loading{font-size:9px;color:var(--muted)}.wt-rich-link{color:#8bc3ff;text-decoration:none}.wt-rich-link:hover{text-decoration:underline}@media(max-width:760px){.wt-rich-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wt-rich-cast{grid-template-columns:1fr}}
  `;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  const fmt=v=>(v===0||v?String(v):'—');
  const yn=v=>v?'Sí':'No';
  const dateFmt=v=>{if(!v)return '—';try{return new Date(v).toLocaleDateString('es-ES')}catch(_){return String(v)}};
  const minFmt=v=>Number(v)>0?`${Math.round(Number(v))} min`:'—';
  const money=v=>Number(v)>0?new Intl.NumberFormat('es-ES',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v):'—';
  const chips=a=>(Array.isArray(a)?a:[]).filter(Boolean).map(x=>`<span class="wt-rich-pill">${esc(String(x))}</span>`).join('');
  const card=(k,v)=>`<div class="wt-rich-card"><small>${esc(k)}</small><b>${esc(fmt(v))}</b></div>`;
  const cleanSummary=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const cfg=()=>{try{return JSON.parse(localStorage.getItem('flowwatch_v4_config')||'{}')}catch(_){return {}}};

  async function tvmazeRich(t){
    let id=t.metadataProvider==='TVmaze'?t.externalId:null;
    if(!id){const rs=await tvMazeSearch(t.title);const best=(rs||[]).map(r=>({r,s:typeof wtMetaScore==='function'?wtMetaScore(t.title,r.title):(r.title||'').toLowerCase()===(t.title||'').toLowerCase()?1:0})).sort((a,b)=>b.s-a.s)[0];if(!best||best.s<.74)return null;id=best.r.externalId}
    const [showRes,epsRes,castRes]=await Promise.all([
      fetch(`https://api.tvmaze.com/shows/${encodeURIComponent(id)}`),
      fetch(`https://api.tvmaze.com/shows/${encodeURIComponent(id)}/episodes`),
      fetch(`https://api.tvmaze.com/shows/${encodeURIComponent(id)}/cast`)
    ]);
    if(!showRes.ok)return null;const s=await showRes.json();const eps=epsRes.ok?await epsRes.json():[];const cast=castRes.ok?await castRes.json():[];
    const current=Array.isArray(eps)?eps.find(e=>Number(e.season)===Number(t.currentSeason||1)&&Number(e.number)===Number(t.currentEpisode||1)):null;
    const next=Array.isArray(eps)?eps.find(e=>e.airstamp&&new Date(e.airstamp)>new Date()):null;
    return {provider:'TVmaze',id,title:s.name,originalTitle:s.name,type:s.type,language:s.language,status:s.status,premiered:s.premiered,ended:s.ended,runtime:s.averageRuntime||s.runtime,network:s.network?.name||s.webChannel?.name||'',country:s.network?.country?.name||s.webChannel?.country?.name||'',schedule:[...(s.schedule?.days||[]),s.schedule?.time||''].filter(Boolean).join(' · '),genres:s.genres||[],rating:s.rating?.average||'',summary:cleanSummary(s.summary),officialSite:s.officialSite||'',totalEpisodes:Array.isArray(eps)?eps.length:null,seasons:Array.isArray(eps)?new Set(eps.map(e=>e.season)).size:null,currentEpisode:current?{name:current.name,airdate:current.airdate,runtime:current.runtime,summary:cleanSummary(current.summary)}:null,nextEpisode:next?{season:next.season,episode:next.number,name:next.name,airdate:next.airdate}:null,cast:(cast||[]).slice(0,10).map(x=>`${x.person?.name||''}${x.character?.name?` · ${x.character.name}`:''}`).filter(Boolean),cover:s.image?.original||s.image?.medium||'',url:s.url||''};
  }

  async function anilistRich(t){
    let id=t.metadataProvider==='AniList'?Number(t.externalId):null;
    if(!id){const rs=await aniListSearch(t.title);const best=(rs||[]).map(r=>({r,s:typeof wtMetaScore==='function'?wtMetaScore(t.title,r.title):(r.title||'').toLowerCase()===(t.title||'').toLowerCase()?1:0})).sort((a,b)=>b.s-a.s)[0];if(!best||best.s<.74)return null;id=Number(best.r.externalId)}
    const query=`query($id:Int!){Media(id:$id,type:ANIME){id title{romaji english native}format status season seasonYear episodes duration countryOfOrigin source genres synonyms averageScore meanScore popularity favourites description(asHtml:false)siteUrl coverImage{extraLarge large}bannerImage studios(isMain:true){nodes{name}} nextAiringEpisode{airingAt episode timeUntilAiring} tags{rank name isMediaSpoiler}}}`;
    const r=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query,variables:{id}})});if(!r.ok)return null;const m=(await r.json())?.data?.Media;if(!m)return null;
    return {provider:'AniList',id:m.id,title:m.title?.english||m.title?.romaji||m.title?.native||t.title,originalTitle:m.title?.romaji||'',nativeTitle:m.title?.native||'',type:m.format||'',status:m.status||'',season:[m.season,m.seasonYear].filter(Boolean).join(' '),episodes:m.episodes,duration:m.duration,country:m.countryOfOrigin||'',source:m.source||'',genres:m.genres||[],synonyms:m.synonyms||[],rating:m.averageScore?`${m.averageScore}/100`:'',meanScore:m.meanScore?`${m.meanScore}/100`:'',popularity:m.popularity,favourites:m.favourites,summary:cleanSummary(m.description),studios:(m.studios?.nodes||[]).map(x=>x.name),tags:(m.tags||[]).filter(x=>!x.isMediaSpoiler&&x.rank>=70).slice(0,8).map(x=>x.name),nextEpisode:m.nextAiringEpisode?{episode:m.nextAiringEpisode.episode,date:new Date(m.nextAiringEpisode.airingAt*1000).toLocaleString('es-ES')}:null,cover:m.coverImage?.extraLarge||m.coverImage?.large||'',banner:m.bannerImage||'',url:m.siteUrl||''};
  }

  async function tmdbRich(t){
    const c=cfg(),token=(c.tmdbToken||'').trim();if(!token)return null;
    let id=t.metadataProvider==='TMDB'?t.externalId:null;
    const headers={Accept:'application/json'};let auth='';if(token.startsWith('eyJ'))headers.Authorization=`Bearer ${token}`;else auth=`&api_key=${encodeURIComponent(token)}`;
    if(!id){let u=`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(t.title)}&language=es-ES${auth}`;const sr=await fetch(u,{headers});if(!sr.ok)return null;const a=(await sr.json()).results||[];const best=a.map(r=>({r,s:typeof wtMetaScore==='function'?wtMetaScore(t.title,r.title||r.original_title):(r.title||'').toLowerCase()===(t.title||'').toLowerCase()?1:0})).sort((a,b)=>b.s-a.s)[0];if(!best||best.s<.74)return null;id=best.r.id}
    let u=`https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}?language=es-ES&append_to_response=credits${auth}`;const r=await fetch(u,{headers});if(!r.ok)return null;const m=await r.json();
    return {provider:'TMDB',id:m.id,title:m.title,originalTitle:m.original_title,status:m.status,release:m.release_date,runtime:m.runtime,genres:(m.genres||[]).map(x=>x.name),rating:m.vote_average?Number(m.vote_average).toFixed(1):'',votes:m.vote_count,summary:m.overview||'',tagline:m.tagline||'',companies:(m.production_companies||[]).map(x=>x.name),countries:(m.production_countries||[]).map(x=>x.name),languages:(m.spoken_languages||[]).map(x=>x.name),budget:m.budget,revenue:m.revenue,cast:(m.credits?.cast||[]).slice(0,10).map(x=>`${x.name}${x.character?` · ${x.character}`:''}`),director:(m.credits?.crew||[]).find(x=>x.job==='Director')?.name||'',cover:m.poster_path?`https://image.tmdb.org/t/p/w780${m.poster_path}`:'',banner:m.backdrop_path?`https://image.tmdb.org/t/p/w1280${m.backdrop_path}`:'',url:`https://www.themoviedb.org/movie/${m.id}`};
  }

  async function richFor(t){
    try{
      if(t.type==='anime')return await anilistRich(t);
      if(t.type==='movie')return await tmdbRich(t);
      return await tvmazeRich(t);
    }catch(_){return null}
  }

  function localHtml(t){
    const watched=t.status==='finished'?'Completada':statusLabel(t.status);
    const lists=(t.watchlists||[]);
    return `<div class="wt-rich" id="wtRichMeta" data-title="${esc(t.id)}">
      <div class="wt-rich-section"><h3>Información de WatchTower</h3><div class="wt-rich-grid">
      ${card('Estado',watched)}${card('Tipo',typeLabel(t.type))}${card('Servicio',t.platform||'Local')}${card('Año',t.year||'—')}
      ${card('Temporada actual',t.currentSeason||1)}${card('Episodio actual',t.currentEpisode||1)}${card('Episodios vistos',`${t.seen||0}/${t.total||'?'}`)}${card('Progreso episodio',`${pct(t)}%`)}
      ${card('Valoración',t.rating?`★ ${t.rating}`:'—')}${card('Seguimiento',t.trackingSource||'—')}${card('Bloqueo manual',yn(t.manualLock))}${card('Última actividad',humanAgo(t.lastWatchedAt||t.updatedAt))}
      </div></div>
      ${t.episodeTitle?`<div class="wt-rich-section"><h3>Episodio detectado</h3><p class="wt-rich-copy">${esc(t.episodeTitle)}</p></div>`:''}
      ${(t.genres||[]).length?`<div class="wt-rich-section"><h3>Géneros</h3><div class="wt-rich-pills">${chips(t.genres)}</div></div>`:''}
      ${lists.length?`<div class="wt-rich-section"><h3>Guardado en</h3><div class="wt-rich-pills">${chips(lists)}</div></div>`:''}
      <div class="wt-rich-section" id="wtRemoteMeta"><h3>Ficha ampliada</h3><div class="wt-rich-loading">Buscando reparto, estado, duración, emisión y más información…</div></div>
    </div>`;
  }

  function remoteHtml(m,t){
    if(!m)return `<h3>Ficha ampliada</h3><p class="wt-rich-copy">No he encontrado una coincidencia suficientemente fiable. Puedes usar <b>Actualizar ficha</b> o corregir el título manualmente.</p>`;
    if(m.provider==='TVmaze')return `<h3>Ficha ampliada · TVmaze</h3>
      <div class="wt-rich-grid">${card('Título oficial',m.title)}${card('Idioma',m.language)}${card('Estado',m.status)}${card('Estreno',dateFmt(m.premiered))}${card('Final',dateFmt(m.ended))}${card('Duración',minFmt(m.runtime))}${card('Temporadas',m.seasons)}${card('Episodios totales',m.totalEpisodes)}${card('Cadena / plataforma',m.network)}${card('País',m.country)}${card('Emisión',m.schedule)}${card('Nota',m.rating?`★ ${m.rating}`:'—')}</div>
      ${m.summary?`<div class="wt-rich-section"><h3>Sinopsis</h3><p class="wt-rich-copy">${esc(m.summary)}</p></div>`:''}
      ${m.currentEpisode?`<div class="wt-rich-section"><h3>Episodio actual</h3><p class="wt-rich-copy"><b>${esc(m.currentEpisode.name||`T${t.currentSeason} E${t.currentEpisode}`)}</b>${m.currentEpisode.airdate?` · ${esc(dateFmt(m.currentEpisode.airdate))}`:''}${m.currentEpisode.runtime?` · ${esc(minFmt(m.currentEpisode.runtime))}`:''}${m.currentEpisode.summary?`<br>${esc(m.currentEpisode.summary)}`:''}</p></div>`:''}
      ${m.nextEpisode?`<div class="wt-rich-section"><h3>Próximo episodio</h3><p class="wt-rich-copy">T${esc(m.nextEpisode.season)} E${esc(m.nextEpisode.episode)} · ${esc(m.nextEpisode.name||'Sin título')} · ${esc(dateFmt(m.nextEpisode.airdate))}</p></div>`:''}
      ${m.cast?.length?`<div class="wt-rich-section"><h3>Reparto principal</h3><div class="wt-rich-cast">${m.cast.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>`:''}
      ${m.officialSite||m.url?`<div class="wt-rich-section"><a class="wt-rich-link" target="_blank" rel="noopener" href="${esc(m.officialSite||m.url)}">Abrir ficha oficial ↗</a></div>`:''}`;
    if(m.provider==='AniList')return `<h3>Ficha ampliada · AniList</h3>
      <div class="wt-rich-grid">${card('Título',m.title)}${card('Título original',m.originalTitle)}${card('Formato',m.type)}${card('Estado',m.status)}${card('Temporada',m.season)}${card('Episodios',m.episodes)}${card('Duración / episodio',minFmt(m.duration))}${card('Origen',m.source)}${card('País',m.country)}${card('Puntuación',m.rating)}${card('Media',m.meanScore)}${card('Popularidad',m.popularity)}${card('Favoritos',m.favourites)}</div>
      ${m.nativeTitle?`<div class="wt-rich-section"><h3>Título nativo</h3><p class="wt-rich-copy">${esc(m.nativeTitle)}</p></div>`:''}
      ${m.summary?`<div class="wt-rich-section"><h3>Sinopsis</h3><p class="wt-rich-copy">${esc(m.summary)}</p></div>`:''}
      ${m.studios?.length?`<div class="wt-rich-section"><h3>Estudio</h3><div class="wt-rich-pills">${chips(m.studios)}</div></div>`:''}
      ${m.genres?.length?`<div class="wt-rich-section"><h3>Géneros</h3><div class="wt-rich-pills">${chips(m.genres)}</div></div>`:''}
      ${m.tags?.length?`<div class="wt-rich-section"><h3>Temas</h3><div class="wt-rich-pills">${chips(m.tags)}</div></div>`:''}
      ${m.synonyms?.length?`<div class="wt-rich-section"><h3>Otros títulos</h3><p class="wt-rich-copy">${esc(m.synonyms.join(' · '))}</p></div>`:''}
      ${m.nextEpisode?`<div class="wt-rich-section"><h3>Próximo episodio</h3><p class="wt-rich-copy">E${esc(m.nextEpisode.episode)} · ${esc(m.nextEpisode.date)}</p></div>`:''}
      ${m.url?`<div class="wt-rich-section"><a class="wt-rich-link" target="_blank" rel="noopener" href="${esc(m.url)}">Abrir en AniList ↗</a></div>`:''}`;
    return `<h3>Ficha ampliada · TMDB</h3><div class="wt-rich-grid">${card('Título',m.title)}${card('Título original',m.originalTitle)}${card('Estado',m.status)}${card('Estreno',dateFmt(m.release))}${card('Duración',minFmt(m.runtime))}${card('Nota',m.rating?`★ ${m.rating}`:'—')}${card('Votos',m.votes)}${card('Director',m.director)}${card('Presupuesto',money(m.budget))}${card('Recaudación',money(m.revenue))}</div>
      ${m.tagline?`<div class="wt-rich-section"><h3>Lema</h3><p class="wt-rich-copy">${esc(m.tagline)}</p></div>`:''}${m.summary?`<div class="wt-rich-section"><h3>Sinopsis</h3><p class="wt-rich-copy">${esc(m.summary)}</p></div>`:''}${m.companies?.length?`<div class="wt-rich-section"><h3>Productoras</h3><div class="wt-rich-pills">${chips(m.companies)}</div></div>`:''}${m.countries?.length?`<div class="wt-rich-section"><h3>Países</h3><div class="wt-rich-pills">${chips(m.countries)}</div></div>`:''}${m.cast?.length?`<div class="wt-rich-section"><h3>Reparto principal</h3><div class="wt-rich-cast">${m.cast.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>`:''}${m.url?`<div class="wt-rich-section"><a class="wt-rich-link" target="_blank" rel="noopener" href="${esc(m.url)}">Abrir en TMDB ↗</a></div>`:''}`;
  }

  const prev=openDetail;
  openDetail=function(id){
    prev(id);const t=getTitle(id),dc=document.getElementById('detailContent');if(!t||!dc)return;
    const actions=dc.querySelector('.modalactions');
    const host=document.createElement('div');host.innerHTML=localHtml(t);const rich=host.firstElementChild;
    if(actions)dc.insertBefore(rich,actions);else dc.appendChild(rich);
    // If the local record is still bare, try the existing strict enrichment first.
    const bare=!t.summary||!t.externalId||!t.year;
    const task=(async()=>{if(bare){const ok=await enrichTitle(t,false);if(ok){commit('detail-auto-enrich',false);renderLibrary();renderHero()}}return richFor(t)})();
    task.then(m=>{const box=document.getElementById('wtRemoteMeta');if(!box||box.closest('#wtRichMeta')?.dataset.title!==String(id))return;box.innerHTML=remoteHtml(m,t);if(m){let changed=false;if(!t.summary&&m.summary){t.summary=m.summary;changed=true}if(!t.year&&(m.premiered||m.season||m.release)){t.year=String(m.premiered||m.season||m.release).match(/\d{4}/)?.[0]||t.year;changed=true}if(!t.rating&&m.rating){t.rating=String(m.rating).replace('/100','');changed=true}if(!t.cover&&m.cover){t.cover=m.cover;changed=true}if(!t.banner&&m.banner){t.banner=m.banner;changed=true}if((!t.genres||!t.genres.length)&&m.genres?.length){t.genres=m.genres;changed=true}if(changed){commit('rich-detail-cache',false);renderLibrary();renderHero()}}}).catch(()=>{const box=document.getElementById('wtRemoteMeta');if(box)box.innerHTML='<h3>Ficha ampliada</h3><p class="wt-rich-copy">No se pudo consultar la fuente externa ahora mismo.</p>'});
  };
})();
