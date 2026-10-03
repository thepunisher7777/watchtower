'use strict';
// Visible-brand cleanup. Legacy storage/message identifiers remain intentionally unchanged for migration compatibility.
const wtAvatar=document.querySelector('.avatar');if(wtAvatar)wtAvatar.textContent='WT';
for(const p of document.querySelectorAll('#view-personalize .v4card > p')){if(p.textContent.includes('Flow táctico'))p.textContent='Estilo táctico por defecto, pero sin obligarte a usar siempre el mismo acento.'}
document.documentElement.dataset.product='watchtower';
