// Test-only deadlines and cleanup for the single browser/server owned by a QA run.
function withDeadline(promise,label,timeoutMs=15000){
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} exceeded ${timeoutMs} ms`)),timeoutMs);});
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}
const exited=processHandle=>!processHandle||processHandle.exitCode!==null||processHandle.signalCode!==null;
async function closeOwnedQA({browser,browserServer,browserProcess,server,timeoutMs=10000}){
  const errors=[];
  async function attempt(step,operation){
    try{await withDeadline(Promise.resolve().then(operation),step,timeoutMs);return true;}
    catch(error){errors.push({step,error:String(error.message||error)});return false;}
  }
  if(browser)await attempt('browser.close',()=>browser.close());
  if(browserServer){
    const closed=await attempt('browserServer.close',()=>browserServer.close());
    if(!closed||!exited(browserProcess))await attempt('browserServer.kill',()=>browserServer.kill());
  }
  if(server){
    await attempt('server.closeAllConnections',()=>server.closeAllConnections?.());
    await attempt('server.close',()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  }
  const browserRootExited=exited(browserProcess),serverClosed=!server?.listening;
  return {browserRootExited,serverClosed,complete:browserRootExited&&serverClosed,errors};
}
module.exports={withDeadline,closeOwnedQA};
