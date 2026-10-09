const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='e88a27f4d27d695d1f0e1b61faa3d0d207d5b9b5';
const normalized=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const hash=file=>crypto.createHash('sha256').update(normalized(file)).digest('hex');
const sourceFiles=['assets/arcade-app.js','assets/arcade-controller.js','assets/arcade-cabinet.js','assets/arcade-scene.js','assets/arcade-screen-projection.js','assets/arcade-menu.js','assets/arcade-session.js','assets/arcade.css','index.html',
  'assets/cabinet-menu/racegpt-menu.js','assets/cabinet-menu/track-art.js','assets/token-entry/token-entry.js','assets/token-entry/entry-session.js','assets/token-entry/token-prop.js'];
const collaborators=[
  {kind:'RaceGPT menu',commit:'15dec9dd764d927c2b8d547d85fad5dc8d9c8fc9',source:'C:/Users/jmore/Documents/Codex/2026-10-09/task-30/racegpt-title/src/cabinet',target:'assets/cabinet-menu',files:['racegpt-menu.js','track-art.js']},
  {kind:'Token entry',commit:'651c25e1caacc98e9f2c6fc131149c3e91248f5c',source:'C:/Users/jmore/Documents/Codex/2026-10-09/task-31/token-entry/assets/token-entry',target:'assets/token-entry',files:['token-entry.js','entry-session.js','token-prop.js']},
];
for(const owner of collaborators)for(const file of owner.files)assert.equal(hash(path.join(root,owner.target,file)),hash(path.join(owner.source,file)),`${owner.kind} copied source must remain unchanged`);
const protectedDiff=cp.execFileSync('git',['diff','--name-only',base,'--','versions','assets/vendor','assets/arcade-source.json','codex-link-contract.js','assets/arcade-art.js'],{cwd:root,encoding:'utf8'}).trim();assert.equal(protectedDiff,'');
cp.execFileSync('git',['merge-base','--is-ancestor',base,'HEAD'],{cwd:root});
const receipt={schemaVersion:1,recordedAt:new Date().toISOString(),baseCommit:base,liveBase:'5feed14ca411bf4050f4df0cc7ba88c7bb7a9c75',checkout:root,branch:'craft/cabinet-screen-lifecycle',hashBasis:'UTF-8, CRLF normalized to LF',collaborators,
  sourceFiles:sourceFiles.map(file=>({file,sha256:hash(path.join(root,file)),bytes:Buffer.byteLength(normalized(path.join(root,file)))})),protectedDiff:[],
  cpuSuite:{command:'npm test',result:'passed',log:'docs/cabinet-craft-cpu.txt'},reviewHarness:{file:'scripts/review-cabinet-craft.cjs',syntaxChecked:true,launched:false},
  graphicsRun:false,renderedAcceptance:'pending coordinated parent slot',published:false,merged:false,softwareInstalled:false,existingBrowserFocused:false,localhost5418Touched:false};
fs.writeFileSync(path.join(root,'docs/cabinet-craft-source-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({protectedDiff:[],unchangedCollaboratorFiles:5,receipt:'docs/cabinet-craft-source-receipt.json',graphicsRun:false}));
