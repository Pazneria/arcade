import {buildArcadeCatalog} from './arcade-catalog.js';
import {readReturnState,writeReturnState,clearReturnState,navigateAfterDispose} from './arcade-navigation.js';
import {createLoadingScreen} from './arcade-loading.js';

const $=id=>document.getElementById(id);
const games=buildArcadeCatalog(location,window.ArcadeCodexLinks);
const controls=$('controls'),directory=$('mobile-fallback'),actions=$('cabinet-actions'),status=$('load-status');
const loading=createLoadingScreen({root:$('scene-loading'),status,steps:[...document.querySelectorAll('.loading-steps li')]});
let controller=null,failed=false,mode='loading',selected=-1,loadPromise=null,generation=0,pending=null;
const handoff=window.pazneriaRoomHandoff;
let freshHandoff=!!(handoff?.active&&handoff.room==='arcade'&&handoff.camera==='default-entry-v1'),handoffWait=null,handoffObserver=null;
const handoffTargets=['scene-container','site-nav','controls','cabinet-actions','mobile-fallback','touch-controls'].map($);
function syncHandoff() {
  const covered=!!(handoff?.active&&handoff.room==='arcade');
  handoffTargets.forEach(element=>{element.inert=covered;});
  if(covered)return;
  handoffObserver?.disconnect();handoffObserver=null;
  const wait=handoffWait;handoffWait=null;wait?.resolve(wait.token===generation&&mode==='loading'&&!!controller);
}
if(freshHandoff){handoffObserver=new MutationObserver(syncHandoff);handoffObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-room-handoff']});syncHandoff();}
function cancelHandoff() {
  freshHandoff=false;handoff?.fail();syncHandoff();
}
function revealHandoff(token) {
  if(!handoff?.active)return Promise.resolve(token===generation&&mode==='loading'&&!!controller);
  return new Promise(resolve=>{handoffWait={resolve,token};handoff.ready();syncHandoff();});
}
function storage() {try{return sessionStorage;}catch{return null;}}
const readState=()=>readReturnState(storage(),{cabinetCount:games.length});
function save(index) {writeReturnState(storage(),index,{cabinetCount:games.length});}
function showMode(next) {
  mode=next;document.body.dataset.mode=next;controls.hidden=next!=='help';directory.hidden=next!=='directory';actions.hidden=next!=='inspect';
  $('scene-container').setAttribute('aria-busy',String(next==='loading'));
  $('reticle').hidden=next!=='explore';$('target-hint').hidden=true;
  $('touch-controls').hidden=next!=='explore'||!(matchMedia('(pointer: coarse)').matches||innerWidth<768);
}
function showHelp() {if(mode==='loading')dispose();controller?.pause();loading.hide();showMode('help');$('close-controls').focus();}
function openDirectory() {if(mode==='loading')dispose();controller?.pause();loading.hide();showMode('directory');$('return-to-3d').hidden=failed;$('directory-title').tabIndex=-1;$('directory-title').focus();}
function releasePending() {const owned=pending;pending=null;owned?.world?.dispose();owned?.renderer.dispose();owned?.renderer.forceContextLoss();}
function dispose() {generation++;cancelHandoff();loading.cancel();controller?.dispose();controller=null;releasePending();loadPromise=null;}
async function navigate(url,index=null) {
  if(index!==null)save(index);else clearReturnState(storage());
  loading.begin();status.textContent='Leaving Arcade';showMode('loading');
  await navigateAfterDispose(url,{dispose,navigate:destination=>location.assign(destination)});
}
function inspect(index,focus=true) {
  if(!controller)return;
  selected=(index+games.length)%games.length;const game=games[selected];controller.focusGame(selected);if(!controller)return;showMode('inspect');
  $('cabinet-title').textContent=game.name;$('cabinet-description').textContent=game.description;$('coming-soon').hidden=!game.comingSoon;
  for(const [id,url,label] of [['cabinet-play',game.comingSoon?null:game.url,`Play ${game.name}`],['cabinet-guide',game.guideUrl,`Open ${game.name} guide`]]) {
    const link=$(id);link.hidden=!url;link.setAttribute('aria-label',label);if(url)link.href=url;else link.removeAttribute('href');
  }
  if(focus) (game.comingSoon?$('cabinet-back'):$('cabinet-play')).focus();
}
function showFailure() {failed=true;dispose();loading.hide();showMode('directory');$('return-to-3d').hidden=true;$('retry-loading').hidden=false;$('directory-message').textContent='The 3D arcade is unavailable. Retry loading or choose a game below.';}
async function initialize() {
  if(controller)return controller;if(loadPromise)return loadPromise;const token=++generation;
  const defaultEntry=freshHandoff;freshHandoff=false;
  loadPromise=(async()=>{
    loading.begin();
    try {
      if(!await loading.stage(0,'Loading engine')||token!==generation)return null;
      const [THREE,{createArcadeScene},{createArcadeController}]=await Promise.all([import('./vendor/three.module.js'),import('./arcade-scene.js'),import('./arcade-controller.js')]);
      if(token!==generation)return null;
      if(!await loading.stage(1,'Building scene')||token!==generation)return null;
      const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:false});pending={renderer,world:null};
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
      const world=createArcadeScene(THREE,renderer,games);pending.world=world;
      if(!await loading.stage(2,'Preparing graphics')||token!==generation)return null;
      for(const texture of world.textures)renderer.initTexture(texture);renderer.compile(world.scene,world.camera);
      // The controller owns cleanup from this point, including failed first render.
      pending=null;
      controller=createArcadeController(THREE,renderer,world,{
        container:$('scene-container'),onTarget:anchor=>{const hint=$('target-hint');hint.hidden=!anchor;if(anchor)hint.textContent=anchor.kind==='home'?'E / tap · Home / Exit':`E / tap · ${games[anchor.gameIndex].name}`;},
        onInspect:inspect,onHome:()=>navigate('/'),onPause:reason=>{if(mode==='explore'){if(reason==='help'||reason==='unlock')showHelp();else showMode('paused');}},onResume:()=>{if(mode==='paused')startExplore();},onFailure:showFailure
      });
      if(!await loading.stage(3,'Opening Arcade')||token!==generation)return null;
      $('return-to-3d').hidden=false;$('retry-loading').hidden=true;
      if(defaultEntry){
        // Texture upload/compile and the controller's successful default-pose
        // first render are complete. Hold input through the shared cover fade.
        loading.hide();if(!await revealHandoff(token))return null;startExplore(true);
      }else{
        if(mode==='loading') {const state=readState();if(state)inspect(state.cabinetIndex,false);else startExplore();}
        if(!controller)return null;loading.finish();
      }
      return controller;
    } catch(error) {
      if(token!==generation)return null;
      console.warn('Unable to initialize the arcade.',error);showFailure();return null;
    } finally {if(token===generation)loadPromise=null;}
  })();return loadPromise;
}
function startExplore(focus=false) {if(!controller)return;showMode('explore');controller.resume();if(focus)$('scene-container').querySelector('canvas')?.focus({preventScroll:true});}
function returnToScene() {if(controller)startExplore(true);else if(failed)openDirectory();else {showMode('loading');initialize();}}
for(const [index,game] of games.entries()) {
  const card=document.createElement('article');card.className='fallback-card';const title=document.createElement('h2');title.textContent=game.name;
  const description=document.createElement('p');description.textContent=game.description;const links=document.createElement('div');links.className='actions fallback-card-actions';
  for(const [url,label,accessible] of [[game.comingSoon?null:game.url,'Launch',`Launch ${game.name} (opens in new tab)`],[game.guideUrl,'Guide',`Open ${game.name} guide (opens in new tab)`]]) {
    if(!url)continue;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent=label;link.setAttribute('aria-label',accessible);link.addEventListener('click',()=>{save(index);controller?.pause();});links.append(link);
  }
  if(game.comingSoon){const label=document.createElement('span');label.textContent='Coming soon';links.append(label);}card.append(title,description,links);$('fallback-grid').append(card);
}
$('open-games').addEventListener('click',openDirectory);$('controls-games').addEventListener('click',openDirectory);$('open-controls').addEventListener('click',showHelp);$('close-controls').addEventListener('click',returnToScene);
$('return-to-3d').addEventListener('click',returnToScene);$('retry-loading').addEventListener('click',()=>{loading.begin();status.textContent='Retrying Arcade';showMode('loading');dispose();location.reload();});
$('cabinet-back').addEventListener('click',()=>startExplore(true));$('cabinet-previous').addEventListener('click',()=>inspect(selected-1));$('cabinet-next').addEventListener('click',()=>inspect(selected+1));
for(const id of ['cabinet-play','cabinet-guide'])$(id).addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(e.currentTarget.href,selected);});
for(const link of document.querySelectorAll('#site-nav a,#mobile-fallback > .actions a'))link.addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(e.currentTarget.href);});
for(const [id,direction] of [['touch-forward',1],['touch-backward',-1]]) {
  const button=$(id);button.addEventListener('pointerdown',e=>{if(!controller||mode!=='explore')return;e.preventDefault();button.setPointerCapture(e.pointerId);controller.setTouchMove(direction);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>controller?.setTouchMove(0));
}
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&(mode==='inspect'||mode==='help')){e.preventDefault();if(!e.repeat)returnToScene();}});window.addEventListener('pagehide',dispose);
window.addEventListener('pageshow',e=>{if(e.persisted){failed=false;showMode('loading');initialize();}});
function resumeVisible() {if(mode==='paused'&&!document.hidden&&document.hasFocus())startExplore();}
window.addEventListener('focus',resumeVisible);document.addEventListener('visibilitychange',resumeVisible);
window.addEventListener('resize',()=>{$('touch-controls').hidden=mode!=='explore'||!(matchMedia('(pointer: coarse)').matches||innerWidth<768);});initialize();
