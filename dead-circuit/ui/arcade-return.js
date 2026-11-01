(()=>{
  const params=new URLSearchParams(location.search);let parentOrigin=null;
  try{const url=new URL(params.get('arcadeParentOrigin'));if(url.href===url.origin+'/'&&(url.origin==='https://pazneria.github.io'||['localhost','127.0.0.1','[::1]'].includes(url.hostname)))parentOrigin=url.origin;}catch{}
  const fromWindow=params.get('arcadeWindow')==='1'&&params.get('from')==='arcade'&&parentOrigin&&params.get('arcadeSession');
  const returnUrl=new URL(parentOrigin&&parentOrigin!=='https://pazneria.github.io'?'/':'/arcade/',parentOrigin||'https://pazneria.github.io').href;
  let leaving=false;
  function back(event){
    if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    if(!fromWindow||!window.opener||window.opener.closed)return;
    event.preventDefault();if(leaving)return;leaving=true;
    try{window.opener.postMessage({type:'dead-circuit:window:return',version:1,session:params.get('arcadeSession')},parentOrigin);window.opener.focus();}catch{}
    window.close();
    // Some browser policies refuse close. A normal full-page return still works.
    setTimeout(()=>location.assign(returnUrl),150);
  }
  for(const panel of document.querySelectorAll('#overlay .panel,.levelPanel,.milestonePanel')){
    const link=document.createElement('a');link.href=returnUrl;link.className='arcade-return';link.textContent='← BACK TO ARCADE';link.addEventListener('click',back);panel.append(link);
  }
})();
