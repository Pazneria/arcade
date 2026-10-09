import {buildArcadeCatalog} from './arcade-catalog.js';
import {readReturnState,writeReturnState,clearReturnState,navigateAfterDispose} from './arcade-navigation.js';
import {createLoadingScreen} from './arcade-loading.js';
import {createCabinetGame,placeCabinetScreen} from './arcade-cabinet.js';
import {screenProjection} from './arcade-screen-projection.js';
import {createCabinetMenu} from './arcade-menu.js';
import {createTokenEntry} from './token-entry/token-entry.js';
import {createCabinetSession} from './arcade-session.js';

const $=id=>document.getElementById(id);
const games=buildArcadeCatalog(location,window.ArcadeCodexLinks);
const controls=$('controls'),directory=$('mobile-fallback'),actions=$('cabinet-actions'),status=$('load-status');
const loading=createLoadingScreen({root:$('scene-loading'),status,steps:[...document.querySelectorAll('.loading-steps li')]});
let controller=null,failed=false,mode='loading',selected=-1,loadPromise=null,generation=0,pending=null,pendingSceneFocus=false;
let navigationObserver=null;
let screenMap=null,cabinetMenu=null;
const tokens=new Map();
const tokenFactories=new Map();
const directoryButtons=[];
const cabinetGame=createCabinetGame({host:$('game-frame'),onEscape:()=>returnToScene(),onState:showGameOpening});
const cabinetSession=createCabinetSession({game:cabinetGame,tokenFor:()=>{if(!tokens.has(selected)&&tokenFactories.has(selected))tokens.set(selected,tokenFactories.get(selected)());return tokens.get(selected);},
  onStart:()=>{showMode('inserting');$('game-back').focus({preventScroll:true});startPresentation();},
  onReady:attempt=>{controller?.stopPresentation?.();cabinetMenu?.ready(attempt.requestId);showMode('play');setGameExpanded(true);},
  onError:(error,attempt)=>{cabinetMenu?.error(attempt.requestId,error);showMode('inspect');$('cabinet-lifecycle-status').hidden=false;$('cabinet-lifecycle-status').textContent='This game could not be opened. Try Start again, or return to the aisle.';startPresentation();cabinetMenu?.enabled?cabinetMenu.focus():$('cabinet-play').focus();},
});
const handoff=window.pazneriaRoomHandoff;
let freshHandoff=!!(handoff?.active&&handoff.room==='arcade'&&handoff.camera==='default-entry-v1'),handoffWait=null,handoffObserver=null;
const handoffTargets=['scene-container','site-nav','controls','cabinet-actions','cabinet-browse','mobile-fallback','touch-controls'].map($);
function updateNavigationInset() {
  const bottom=Math.ceil($('site-nav').getBoundingClientRect().bottom);
  document.documentElement.style.setProperty('--site-nav-bottom',bottom+'px');
}
function observeNavigation() {
  updateNavigationInset();
  if(!navigationObserver&&typeof ResizeObserver==='function'){
    navigationObserver=new ResizeObserver(updateNavigationInset);navigationObserver.observe($('site-nav'));
  }
}
function releaseNavigation() {navigationObserver?.disconnect();navigationObserver=null;}
function setGameExpanded(expanded) {
  document.body.dataset.gameExpanded=String(expanded);
  $('game-expand').setAttribute('aria-pressed',String(expanded));
  $('game-expand').textContent=expanded?'Fit to cabinet':'Open play view';
}
function updateGameSizeAvailability() {
  const available=mode==='play';$('game-expand').hidden=!available;
}
function showGameOpening(phase) {
  const visible=['opening','delayed','error'].includes(phase),game=games[selected];
  $('game-opening').hidden=!visible;$('game-retry').hidden=!['delayed','error'].includes(phase);
  $('game-frame').setAttribute('aria-busy',String(['opening','delayed'].includes(phase)));
  $('game-load-message').textContent=phase==='opening'?`Opening ${game?.name||'game'}…`
    :phase==='delayed'?'This game is taking longer to open. Keep waiting, try again, or open it full page.'
    :phase==='error'?'This game could not be opened. Try again, or open it full page.':'';
  if(mode==='inserting'){
    $('cabinet-lifecycle-status').hidden=false;
    $('cabinet-lifecycle-status').textContent=phase==='delayed'?'The game is taking longer to open. Keep waiting, try again, or return to the aisle.':phase==='error'?'The game could not be opened.':phase==='prepared'?'Token accepted. Opening the game.':`Inserting token · opening ${game?.name||'game'}`;
    $('game-retry').hidden=phase!=='delayed';
  }
}
function layoutScreen(rect){
  screenMap=placeCabinetScreen(actions,rect,screenProjection);
  placeCabinetScreen($('cabinet-game'),rect,screenProjection);
}
function startPresentation(){controller?.present?.((dt,time)=>{cabinetMenu?.update(dt,time);tokens.get(selected)?.update(dt);});}
function cancelLaunch(){cabinetSession.cancel();if(mode==='inserting'){showMode('inspect');startPresentation();cabinetMenu?.focus();}}
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
  if(!['play','inserting'].includes(next)){setGameExpanded(false);cabinetSession.cancel();}
  if(!['inspect','inserting'].includes(next))controller?.stopPresentation?.();
  mode=next;document.body.dataset.mode=next;controls.hidden=next!=='help';directory.hidden=next!=='directory';actions.hidden=next!=='inspect'&&next!=='inserting';
  $('cabinet-menu').hidden=false;$('cabinet-game').hidden=!['play','inserting'].includes(next);$('game-actions').hidden=!['play','inserting'].includes(next);
  $('cabinet-browse').hidden=next!=='inspect';
  $('cabinet-lifecycle-status').hidden=next!=='inserting';updateGameSizeAvailability();
  $('scene-container').setAttribute('aria-busy',String(next==='loading'));
  $('reticle').hidden=next!=='explore';$('target-hint').hidden=true;
  $('touch-controls').hidden=next!=='explore'||!(matchMedia('(pointer: coarse)').matches||innerWidth<768);
  directoryButtons.forEach(button=>{button.hidden=!controller||failed;});
}
function showHelp() {if(mode==='loading')dispose();controller?.pause();loading.hide();showMode('help');$('close-controls').focus();}
function openDirectory() {
  if(mode==='loading')dispose();controller?.pause();loading.hide();showMode('directory');$('return-to-3d').hidden=failed;
  if(!failed)$('directory-message').textContent=controller?'Choose a cabinet, or open a game in a new tab.':'Open a game in a new tab, or return to the 3D arcade.';
  updateNavigationInset();window.scrollTo(0,0);$('directory-title').tabIndex=-1;$('directory-title').focus({preventScroll:true});
}
function releasePending() {const owned=pending;pending=null;owned?.world?.dispose();owned?.renderer.dispose();owned?.renderer.forceContextLoss();}
function dispose({leaving=false}={}) {if(leaving)releaseNavigation();generation++;pendingSceneFocus=false;cabinetSession.cancel();cabinetMenu?.dispose();cabinetMenu=null;tokens.forEach(token=>token.dispose());tokens.clear();tokenFactories.clear();cancelHandoff();loading.cancel();controller?.dispose();controller=null;releasePending();loadPromise=null;}
async function navigate(url,index=null) {
  if(index!==null)save(index);else clearReturnState(storage());
  loading.begin();status.textContent='Leaving Arcade';showMode('loading');
  await navigateAfterDispose(url,{dispose:()=>dispose({leaving:true}),navigate:destination=>location.assign(destination)});
}
function inspect(index,focus=true,{approach=true}={}) {
  if(!controller)return;
  cabinetSession.cancel();
  selected=(index+games.length)%games.length;const game=games[selected];controller.focusGame(selected,{approach});if(!controller)return;showMode('inspect');
  $('cabinet-title').textContent=game.name;$('cabinet-description').textContent=game.description;$('coming-soon').hidden=!game.comingSoon;
  for(const [id,url,label] of [['cabinet-play',game.comingSoon?null:game.url,`Play ${game.name}`],['cabinet-guide',game.guideUrl,`Open ${game.name} guide`]]) {
    const link=$(id);link.hidden=!url;link.setAttribute('aria-label',label);if(url)link.href=url;else link.removeAttribute('href');
  }
  cabinetMenu?.mount(game);cabinetMenu?.update(0,0);startPresentation();
  if(focus){if(cabinetMenu?.enabled)cabinetMenu.focus();else (game.comingSoon?$('cabinet-back'):$('cabinet-play')).focus();}
}
function playCabinet(selection=null,attempt=null) {
  if(!controller||mode!=='inspect'||games[selected]?.comingSoon)return;
  if(cabinetMenu?.enabled&&!attempt){cabinetMenu.start();return;}
  controller.pause();save(selected);const game=games[selected];
  const launch=selection&&game.name==='RaceGPT'?{...game,url:cabinetMenu.launchUrl(game.url,selection),nativeBridge:'racegpt-v1'}:game;
  $('game-full-page').href=launch.url;$('game-full-page').setAttribute('aria-label',`Open ${game.name} full page`);
  cabinetSession.start(launch,{signal:attempt?.signal,requestId:attempt?.id});
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
        onInspect:index=>inspect(index,true,{approach:false}),onHome:()=>navigate('/'),onPause:reason=>{if(mode==='explore'){if(reason==='help'||reason==='unlock')showHelp();else showMode('paused');}else if(mode==='inserting')returnToScene();},onResume:()=>{if(mode==='paused')startExplore();},onFailure:showFailure,
        onScreenLayout:layoutScreen
      });
      const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
      for(const anchor of world.anchors||[])if(anchor.kind==='game'&&anchor.tokenMount)tokenFactories.set(anchor.gameIndex,()=>createTokenEntry({THREE,parent:anchor.tokenMount.parent,mount:anchor.tokenMount,reducedMotion:()=>reducedMotion.matches}));
      cabinetMenu=createCabinetMenu({canvas:$('cabinet-display'),hotspots:$('cabinet-hotspots'),native:$('cabinet-native'),onStart:playCabinet,onBack:returnToScene,onCancel:cancelLaunch});
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
function startExplore(focus=false,{capture=false,freeLook}={}) {
  if(!controller)return;pendingSceneFocus||=focus;controller.resume(freeLook===undefined?undefined:{freeLook});
  showMode(controller.active?'explore':'paused');
  if(controller.active&&capture)controller.capture();
  if(controller.active&&pendingSceneFocus){pendingSceneFocus=false;$('scene-container').querySelector('canvas')?.focus({preventScroll:true});}
}
function returnToScene(event) {
  cabinetSession.cancel();cabinetMenu?.cancel();
  if(controller){
    controller.returnToAisle?.();
    if(controller){
      // Removing a focused child document can leave Chrome's top document
      // unfocused. Restore its canvas focus before the focus-gated resume.
      if(!document.hidden)$('scene-container').querySelector('canvas')?.focus({preventScroll:true});
      startExplore(true,{freeLook:true,capture:!!(event?.isTrusted&&event.type==='click')});
    }
  }else if(failed)openDirectory();else {showMode('loading');initialize();}
}
for(const [index,game] of games.entries()) {
  const card=document.createElement('article');card.className='fallback-card';const title=document.createElement('h2');title.textContent=game.name;
  const description=document.createElement('p');description.textContent=game.description;const links=document.createElement('div');links.className='actions fallback-card-actions';
  const view=document.createElement('button');view.type='button';view.textContent='View cabinet';view.hidden=true;view.setAttribute('aria-label',`View ${game.name} cabinet`);view.addEventListener('click',()=>{if(controller)inspect(index);});directoryButtons.push(view);links.append(view);
  for(const [url,label,accessible] of [[game.comingSoon?null:game.url,'Launch',`Launch ${game.name} (opens in new tab)`],[game.guideUrl,'Guide',`Open ${game.name} guide (opens in new tab)`]]) {
    if(!url)continue;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent=label;link.setAttribute('aria-label',accessible);link.addEventListener('click',()=>{save(index);controller?.pause();});links.append(link);
  }
  if(game.comingSoon){const label=document.createElement('span');label.textContent='Coming soon';links.append(label);}card.append(title,description,links);$('fallback-grid').append(card);
}
$('open-games').addEventListener('click',openDirectory);$('controls-games').addEventListener('click',openDirectory);$('open-controls').addEventListener('click',showHelp);$('close-controls').addEventListener('click',returnToScene);
$('return-to-3d').addEventListener('click',returnToScene);$('retry-loading').addEventListener('click',()=>{loading.begin();status.textContent='Retrying Arcade';showMode('loading');dispose({leaving:true});location.reload();});
$('cabinet-back').addEventListener('click',returnToScene);$('cabinet-screen-back').addEventListener('click',returnToScene);$('game-back').addEventListener('click',returnToScene);$('cabinet-previous').addEventListener('click',()=>inspect(selected-1,false));$('cabinet-next').addEventListener('click',()=>inspect(selected+1,false));
$('game-retry').addEventListener('click',()=>{if(mode==='inserting'&&cabinetGame.phase==='delayed'){cancelLaunch();if(cabinetMenu?.enabled)cabinetMenu.cancel();playCabinet();}});
$('game-expand').addEventListener('click',()=>{if(mode==='play')setGameExpanded(document.body.dataset.gameExpanded!=='true');});
$('cabinet-play').addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();playCabinet();});
actions.addEventListener('pointermove',e=>{if(!cabinetMenu?.enabled||!['inspect','inserting'].includes(mode))return;const point=screenMap?.uv(e.clientX,e.clientY);if(point)cabinetMenu.pointer({...point,type:'move'});});
actions.addEventListener('pointerleave',()=>cabinetMenu?.pointer({u:0,v:0,type:'leave'}));
for(const id of ['cabinet-guide','game-full-page'])$(id).addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(e.currentTarget.href,selected);});
for(const link of document.querySelectorAll('#site-nav a,#mobile-fallback > .actions a'))link.addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(e.currentTarget.href);});
for(const [id,direction] of [['touch-forward',1],['touch-backward',-1]]) {
  const button=$(id);button.addEventListener('pointerdown',e=>{if(!controller||mode!=='explore')return;e.preventDefault();button.setPointerCapture(e.pointerId);controller.setTouchMove(direction);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>controller?.setTouchMove(0));
}
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&['inspect','inserting','play','help'].includes(mode)){e.preventDefault();if(!e.repeat)returnToScene();}else if(['inspect','inserting'].includes(mode)&&actions.contains?.(e.target))cabinetMenu?.key(e);});window.addEventListener('pagehide',()=>dispose({leaving:true}));
window.addEventListener('pageshow',e=>{if(e.persisted){observeNavigation();failed=false;showMode('loading');initialize();}});
function resumeVisible() {if(mode==='paused'&&!document.hidden&&document.hasFocus())startExplore();}
window.addEventListener('focus',()=>{resumeVisible();if(mode==='inspect')startPresentation();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&['play','inserting'].includes(mode))returnToScene();else if(!document.hidden&&mode==='inspect')startPresentation();resumeVisible();});
window.addEventListener('resize',()=>{updateNavigationInset();updateGameSizeAvailability();$('touch-controls').hidden=mode!=='explore'||!(matchMedia('(pointer: coarse)').matches||innerWidth<768);});setGameExpanded(false);updateGameSizeAvailability();observeNavigation();initialize();
