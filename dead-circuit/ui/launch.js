/* Field-screen presentation only. The simulation owns Start, pause and audio. */
window.DeadCircuitField={create({getState,getLoadState,pause,hush}){
  const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),sonoma=params.get('map')==='sonoma';
  const overlay=$('overlay'),status=$('launch-status'),help=$('launch-help'),retry=$('launch-retry'),fullscreen=$('launch-fullscreen');
  const district=sonoma?'SONOMA PLAZA':'ORIGINAL TOWN';let fullscreenWasActive=!!document.fullscreenElement;
  const setText=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
  setText($('launch-district'),district+' / FIELD '+(sonoma?'01':'02'));
  setText($('launch-site'),sonoma?'SONOMA, CALIFORNIA':'OUTPOST DISTRICT');
  document.body.dataset.fieldDistrict=sonoma?'sonoma':'town';
  const brand=document.querySelector('#hud .brand');if(brand)brand.innerHTML='DEAD CIRCUIT<span> / </span>'+(sonoma?'SONOMA PLAZA':'TOWN DISTRICT');
  for(const map of ['sonoma','town']){
    const link=$('district-'+map),url=new URL(location.href);url.searchParams.set('map',map);url.searchParams.set('v','dc-field-20261101-1');link.href=url.href;
    const current=(map==='sonoma')===sonoma;
    if(current){link.setAttribute('aria-current','page');link.querySelector('i').textContent='SELECTED';link.addEventListener('click',e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey)e.preventDefault();});}
  }
  // Reuse every original control and its listeners. No setting is recreated.
  for(const id of ['soundOption','ambienceOption','motionOption']){const option=$(id);if(option)$('launch-settings').append(option);}
  $('field-loadout').append($('kitPicker'));
  $('field-results').append($('resultDetails'));
  $('field-record').append($('bestRecord'));
  $('field-run-summary').querySelector('div').append($('pauseBuild'));
  $('pauseBuild').setAttribute('tabindex','0');$('pauseBuild').setAttribute('aria-label','Current run build and stats');
  $('field-attribution').append($('rendererCompare'));
  const oldMapLink=$('rendererCompare').querySelector('a');if(oldMapLink)oldMapLink.hidden=true;
  for(const el of document.querySelectorAll('.sonoma-controls'))el.hidden=!sonoma;
  function moveReturn(){const link=overlay.querySelector('.arcade-return');if(link)$('overlay').querySelector('.launch-secondary').prepend(link);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',moveReturn,{once:true});else moveReturn();
  function sync(){
    const state=getState(),load=getLoadState(),newRun=['menu','dead','finished'].includes(state);
    document.body.dataset.launchState=state;document.body.dataset.fieldLoad=load;
    $('districtChoice').hidden=!newRun&&load!=='error';$('field-loadout').hidden=!newRun;
    $('field-run-summary').hidden=!['paused','requesting'].includes(state);
    retry.hidden=!['error','fallback'].includes(load);setText(retry,load==='fallback'?'RETRY 3D':'RETRY LOADING');
    let title,description;
    if(load==='error'){title='DISTRICT UNAVAILABLE';description=district+' could not start. Retry loading, choose another district, or return to the arcade.';}
    else if(load==='loading'){title='PREPARING '+district;description='Stay here while the district loads. Your run has not started.';}
    else if(state==='requesting'){title='WAITING FOR MOUSE CAPTURE';description='Cancel returns to pause if the browser does not allow mouse capture.';}
    else if(state==='paused'){title='RUN PAUSED · MOUSE RELEASED';description='Resume captures the mouse. Escape releases it again.';}
    else if(state==='dead'||state==='finished'){title='YOUR RUN IS IN';description='Choose a kit for your next run, or head back to the arcade.';}
    else if(load==='fallback'){title='BASIC GRAPHICS MODE';description='3D is unavailable. Original Town can run in basic mode; reload to retry 3D. Records are paused.';}
    else{title='DISTRICT READY';description='Choose a starting kit, then enter the streets.';}
    setText(status,title);setText(help,description);
    setText($('launch-departure'),['paused','requesting'].includes(state)?'Back to Arcade ends this run. Your local best stays on this browser.':'Keyboard & mouse · Single player · No audio until you start');
  }
  const observer=new MutationObserver(sync);
  observer.observe(overlay,{attributes:true,attributeFilter:['style','data-mode']});
  observer.observe($('rendererCompare'),{subtree:true,childList:true,characterData:true});
  retry.addEventListener('click',()=>{pause();hush();location.reload();});
  if(!document.documentElement.requestFullscreen)fullscreen.hidden=true;
  fullscreen.addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch{setText(help,'Fullscreen is unavailable here. You can keep playing in this window.');}
  });
  document.addEventListener('fullscreenchange',()=>{
    const active=!!document.fullscreenElement;if(fullscreenWasActive&&!active&&getState()==='playing')pause();fullscreenWasActive=active;
    fullscreen.innerHTML=active?'EXIT FULLSCREEN <span>OPTIONAL</span>':'FULLSCREEN <span>OPTIONAL</span>';
  });
  window.addEventListener('pagehide',()=>{observer.disconnect();hush();},{once:true});
  sync();return {sync};
}};
