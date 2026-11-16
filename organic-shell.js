/* Artwork view navigation. Existing posting, authentication and reports remain
   in their original modules; this file only manages reversible disclosures. */
(function(){
  'use strict';
  let reportsOpen=false;
  function closeTools(){
    document.body.classList.remove('organic-tools-open');
    document.querySelector('[data-organic-tools]')?.setAttribute('aria-expanded','false');
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-organic-tools]')){
      const open=document.body.classList.toggle('organic-tools-open');
      document.querySelector('[data-organic-tools]')?.setAttribute('aria-expanded',String(open));
      if(open)document.querySelector('[data-organic-tools-close]')?.focus();
    }else if(event.target.closest('[data-organic-tools-close]')){
      closeTools();document.querySelector('[data-organic-tools]')?.focus();
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('organic-tools-open')){
      closeTools();document.querySelector('[data-organic-tools]')?.focus();
    }
  });
  document.addEventListener('toggle',event=>{
    if(event.target.id==='organicFullReports'&&event.target.isConnected)reportsOpen=event.target.open;
  },true);
  window.djomsOrganicShell={closeTools,get reportsOpen(){return reportsOpen;}};
})();
