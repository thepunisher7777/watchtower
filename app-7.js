'use strict';
// WatchTower 1.0.1 · clean first-run shell. Legacy storage/message identifiers stay unchanged for migration compatibility.
(function(){
  const q=s=>document.querySelector(s);
  const homeTitle=q('#view-home .viewhead h1');
  if(homeTitle){homeTitle.id='welcomeTitle';homeTitle.textContent='Buenas'}
  const profileBtn=q('.profilebtn');
  if(profileBtn&&!profileBtn.querySelector('.profilelabel'))profileBtn.innerHTML='<span class="avatar">WT</span><span class="profilelabel">Mi perfil</span>';
  const clear=q('#clearHistory');if(clear)clear.textContent='Limpiar historial';
  const reset=q('#resetData');if(reset)reset.textContent='Restablecer datos';
  const pwa=q('#pwaState');if(pwa)pwa.textContent='PWA';
  const side=q('#sideDevice');if(side&&side.textContent.includes('demo'))side.textContent='PC';
  const playerTitle=q('#playerTitle');if(playerTitle&&/demo/i.test(playerTitle.textContent))playerTitle.textContent='Simulador de progreso';
  for(const p of document.querySelectorAll('#view-personalize .v4card > p')){if(p.textContent.includes('Flow táctico'))p.textContent='Estilo táctico por defecto, pero sin obligarte a usar siempre el mismo acento.'}

  let modal=q('#welcomeModal');
  if(!modal){
    modal=document.createElement('div');modal.className='modalback';modal.id='welcomeModal';modal.innerHTML='<div class="modal" style="width:min(520px,96vw)"><div class="modaltop"><div><div class="eyebrow">WatchTower by ARX</div><h2>Tu WatchTower, tus datos</h2><p>Este navegador empieza con una biblioteca vacía. El nombre es opcional y se guarda solo en tu espacio local o en tu cuenta si activas la nube.</p></div></div><div class="formgrid"><div class="field full"><label>Nombre o alias (opcional)</label><input id="profileName" maxlength="40" placeholder="Ej. Alex" autocomplete="nickname"></div></div><div class="modalactions"><button class="secondary" id="welcomeSkip">Ahora no</button><button class="primary" id="welcomeStart">Empezar</button></div></div>';
    document.body.appendChild(modal);
  }
  const start=q('#welcomeStart'), skip=q('#welcomeSkip'), input=q('#profileName');
  if(start&&!start.dataset.bound){start.dataset.bound='1';start.addEventListener('click',()=>{saveProfile(input?.value||'',true);modal.classList.remove('open');toast('WatchTower preparado')})}
  if(skip&&!skip.dataset.bound){skip.dataset.bound='1';skip.addEventListener('click',()=>{saveProfile('',true);modal.classList.remove('open')})}
  if(input&&!input.dataset.bound){input.dataset.bound='1';input.addEventListener('keydown',e=>{if(e.key==='Enter')start?.click()})}
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
  renderProfile();
  if(!state.profile?.setupDone)setTimeout(openProfileSetup,100);
  document.documentElement.dataset.product='watchtower';
})();
