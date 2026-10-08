import {buildArcadeCatalog} from './arcade-catalog.js';
import {readReturnState,writeReturnState,clearReturnState,navigateAfterDispose} from './arcade-navigation.js';

const $=id=>document.getElementById(id);
const games=buildArcadeCatalog(location,window.ArcadeCodexLinks);
const welcome=$('welcome'),directory=$('mobile-fallback'),actions=$('cabinet-actions'),explore=$('explore'),status=$('load-status');
let controller=null,failed=false,mode='loading',selected=-1,loadPromise=null,generation=0;
function storage() {try{return sessionStorage;}catch{return null;}}
const readState=()=>readReturnState(storage(),{cabinetCount:games.length});
function save(index) {writeReturnState(storage(),index,{cabinetCount:games.length});}
function showMode(next) {
  mode=next;welcome.hidden=next!=='welcome';directory.hidden=next!=='directory'&&next!=='loading';actions.hidden=next!=='inspect';
  $('reticle').hidden=next!=='explore';$('target-hint').hidden=true;
  $('touch-controls').hidden=next!=='explore'||!(matchMedia('(pointer: coarse)').matches||innerWidth<768);$('pause-explore').hidden=next!=='explore';
}
function showWelcome(focus=true) {controller?.pause();showMode('welcome');if(focus)explore.focus();}
function openDirectory() {controller?.pause();showMode('directory');$('directory-title').tabIndex=-1;$('directory-title').focus();}
function dispose() {generation++;controller?.dispose();controller=null;loadPromise=null;}
async function navigate(url,index=null) {
  if(index!==null)save(index);else clearReturnState(storage());
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
function showFailure() {failed=true;dispose();showMode('directory');$('return-to-3d').hidden=true;$('directory-message').textContent='The 3D arcade is unavailable. You can still launch available games below.';}
async function initialize() {
  if(controller)return controller;if(loadPromise)return loadPromise;const token=++generation;
  loadPromise=(async()=>{
    let renderer,world;
    try {
      const [THREE,{createArcadeScene},{createArcadeController}]=await Promise.all([import('./vendor/three.module.js'),import('./arcade-scene.js'),import('./arcade-controller.js')]);
      if(token!==generation)return null;
      renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:false});
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
      world=createArcadeScene(THREE,renderer,games);for(const texture of world.textures)renderer.initTexture(texture);renderer.compile(world.scene,world.camera);
      controller=createArcadeController(THREE,renderer,world,{
        container:$('scene-container'),onTarget:anchor=>{const hint=$('target-hint');hint.hidden=!anchor;if(anchor)hint.textContent=anchor.kind==='home'?'E / tap · Home / Exit':`E / tap · ${games[anchor.gameIndex].name}`;},
        onInspect:inspect,onHome:()=>navigate('/'),onPause:()=>{if(mode==='explore')showWelcome();},onFailure:showFailure
      });
      explore.disabled=false;$('return-to-3d').hidden=false;status.textContent='Ready to explore';
      if(mode==='loading') {const state=readState();if(state)inspect(state.cabinetIndex,false);else showWelcome(false);}
      return controller;
    } catch(error) {
      if(!controller){world?.dispose();renderer?.dispose();renderer?.forceContextLoss();}
      console.warn('Unable to initialize the arcade.',error);showFailure();return null;
    }
  })();return loadPromise;
}
function startExplore() {if(!controller)return;showMode('explore');controller.resume();controller.capture();}
for(const [index,game] of games.entries()) {
  const card=document.createElement('article');card.className='fallback-card';const title=document.createElement('h2');title.textContent=game.name;
  const description=document.createElement('p');description.textContent=game.description;const links=document.createElement('div');links.className='actions fallback-card-actions';
  for(const [url,label,accessible] of [[game.comingSoon?null:game.url,'Launch',`Launch ${game.name} (opens in new tab)`],[game.guideUrl,'Guide',`Open ${game.name} guide (opens in new tab)`]]) {
    if(!url)continue;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent=label;link.setAttribute('aria-label',accessible);link.addEventListener('click',()=>{save(index);controller?.pause();});links.append(link);
  }
  if(game.comingSoon){const label=document.createElement('span');label.textContent='Coming soon';links.append(label);}card.append(title,description,links);$('fallback-grid').append(card);
}
$('open-games').addEventListener('click',openDirectory);$('welcome-games').addEventListener('click',openDirectory);explore.addEventListener('click',startExplore);$('pause-explore').addEventListener('click',()=>showWelcome());
$('return-to-3d').addEventListener('click',async()=>{if(!controller&&!failed)await initialize();if(controller)showWelcome();});
$('cabinet-back').addEventListener('click',()=>showWelcome());$('cabinet-previous').addEventListener('click',()=>inspect(selected-1));$('cabinet-next').addEventListener('click',()=>inspect(selected+1));
for(const id of ['cabinet-play','cabinet-guide'])$(id).addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(e.currentTarget.href,selected);});
for(const link of document.querySelectorAll('#site-nav a,#mobile-fallback > .actions a'))link.addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(e.currentTarget.href);});
for(const [id,direction] of [['touch-forward',1],['touch-backward',-1]]) {
  const button=$(id);button.addEventListener('pointerdown',e=>{if(!controller||mode!=='explore')return;e.preventDefault();button.setPointerCapture(e.pointerId);controller.setTouchMove(direction);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>controller?.setTouchMove(0));
}
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&mode==='inspect'){e.preventDefault();showWelcome();}});window.addEventListener('pagehide',dispose);
window.addEventListener('pageshow',e=>{if(e.persisted){failed=false;showMode('loading');initialize();}});
window.addEventListener('resize',()=>{$('touch-controls').hidden=mode!=='explore'||!(matchMedia('(pointer: coarse)').matches||innerWidth<768);});initialize();
