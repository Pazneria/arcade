const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {withDeadline,closeOwnedQA}=require('./arcade-qa-lifecycle');
async function checkRunnerReceipt(file,entry,receiptName){
  const records=[],calls=[],ownedProcess={pid:1,exitCode:null,signalCode:null};
  const server={listening:false,once(){},listen(_port,_host,done){this.listening=true;done();},address:()=>({port:1}),closeAllConnections(){},close(done){calls.push('server');this.listening=false;done();}};
  const browser={version:()=> 'CPU mock',close(){calls.push('connection');throw Error('Connection close failed');}};
  const browserServer={process:()=>ownedProcess,wsEndpoint:()=> 'CPU mock',close(){calls.push('browserServer');ownedProcess.exitCode=0;},kill(){assert.fail('Graceful owned close succeeded');}};
  const fakeFs={...fs,mkdirSync(){},writeFileSync(file,data){records.push({file,receipt:JSON.parse(data)});}};
  const chromium={launchServer:async()=>browserServer,connect:async()=>browser};
  const fixture={instrumentApp(){},instrumentController(){},createFixtureServer:()=>server,routeAll(){},ready(){},runCase:async()=>{}};
  const sandbox={__dirname:__dirname,module:{exports:{}},process:{pid:0,platform:'cpu',env:{TEST_MODE:'normal',ARTIFACT_DIR:'cpu-receipts'}},console:{log(){},error(){}},Buffer,URL,
    require(name){if(name==='node:fs')return fakeFs;if(name==='playwright')return {chromium};if(name==='./test-directory-browser')return fixture;if(name==='node:child_process')return {execFileSync:()=> 'cpu-head'};return require(name);}};
  const source=fs.readFileSync(path.join(__dirname,file),'utf8');
  const substitutions=entry==='run'?"checkFixtureSyntax=()=>{};createFixtureServer=()=>server;runCase=async()=>{};":"extras=async()=>{};descendants=()=>[];";
  sandbox.server=server;vm.createContext(sandbox);
  vm.runInContext(source+'\n'+substitutions+'\nglobalThis.runQA='+entry+';',sandbox);
  await sandbox.runQA();
  assert.deepEqual(calls,['connection','browserServer','server']);
  const saved=records.find(record=>record.file.endsWith(receiptName));assert(saved,'Actual runner records cleanup after a failed connection close');
  assert.equal(saved.receipt.cleanup.complete,true);assert.match(saved.receipt.cleanup.errors[0].error,/Connection close failed/);
}
async function main(){
  await assert.rejects(withDeadline(new Promise(()=>{}),'Missing import',5),/Missing import exceeded 5 ms/);
  assert.equal(await withDeadline(Promise.resolve('requested'),'Import',100),'requested');
  const calls=[],processHandle={exitCode:null,signalCode:null};
  const server={listening:true,closeAllConnections(){calls.push('connections');throw Error('connection cleanup failed');},close(done){calls.push('server');this.listening=false;done();}};
  const cleanup=await closeOwnedQA({
    browser:{close(){calls.push('browser');throw Error('connection close failed');}},
    browserServer:{close(){calls.push('browserServer');throw Error('graceful close failed');},kill(){calls.push('kill');processHandle.signalCode='SIGKILL';}},
    browserProcess:processHandle,server,timeoutMs:100,
  });
  assert.deepEqual(calls,['browser','browserServer','kill','connections','server']);
  assert.equal(cleanup.complete,true);assert.equal(cleanup.errors.length,3);
  // A stuck connection closure times out; owned-server closure still runs.
  const stalledProcess={exitCode:null,signalCode:null};let closed=false;
  const recovered=await closeOwnedQA({browser:{close:()=>new Promise(()=>{})},browserServer:{close(){closed=true;stalledProcess.exitCode=0;},kill(){assert.fail('No kill needed');}},browserProcess:stalledProcess,timeoutMs:5});
  assert(closed);assert.equal(recovered.complete,true);assert.match(recovered.errors[0].error,/exceeded/);
  const blocked=await closeOwnedQA({browserServer:{close(){throw Error('closed failed');},kill(){throw Error('kill failed');}},browserProcess:{exitCode:null,signalCode:null},server:{listening:true,closeAllConnections(){},close(done){done(Error('server failed'));}},timeoutMs:100});
  assert.equal(blocked.complete,false);assert.equal(blocked.errors.length,3);
  assert.deepEqual(await closeOwnedQA({}),{browserRootExited:true,serverClosed:true,complete:true,errors:[]});
  // Execute each actual runner with mocked process/browser/network/file surfaces.
  await checkRunnerReceipt('test-directory-browser.js','run','browser-cleanup-receipt.json');
  await checkRunnerReceipt('test-arcade-rendered.js','main','rendered-qa-receipt.json');
  console.log('PASS CPU-only QA request deadlines, independent cleanup attempts, fallback kill and failure receipts');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
