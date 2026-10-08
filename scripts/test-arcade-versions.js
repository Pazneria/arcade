const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..','versions');
const record=JSON.parse(fs.readFileSync(path.join(root,'version-record.json')));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const version of record.versions){
  const archive=fs.readFileSync(path.join(root,version.archive));assert.equal(sha(archive),version.archiveSha256);assert.equal(archive.length,version.archiveBytes);
  for(const [file,evidence] of Object.entries(version.files)){
    const bytes=fs.readFileSync(path.join(root,version.snapshot,file));assert.equal(sha(bytes),evidence.sha256,`${version.id}/${file} must retain original bytes`);assert.equal(bytes.length,evidence.bytes);
  }
}
console.log('Saved Arcade version archive and snapshot SHA256 checks passed.');
