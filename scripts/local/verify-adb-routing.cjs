require('@babel/register');
const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
let mode = 'kalam', connected = false, fail = false;
const calls = [];
class Adb {
 async connect() { return connected; }
 initialize() { calls.push('adb-init'); return { data: {} }; }
 listFiles() { calls.push('adb-list'); return { data: [] }; }
 transferFiles({ onError, onCompleted }) { calls.push('adb-transfer'); if(fail)onError({error:'disconnected'});else onCompleted(); }
}
class Kalam {
 initialize() { calls.push('kalam-init'); return { data: {} }; }
 listFiles() { calls.push('kalam-list'); return { data: [] }; }
}
class Legacy {
 listFiles() { calls.push('legacy-list'); return { data: [] }; }
}
Module._load = function(request, ...args) {
 if(request.endsWith('/FileExplorerAdbDataSource'))return {FileExplorerAdbDataSource:Adb};
 if(request.endsWith('/FileExplorerKalamDataSource'))return {FileExplorerKalamDataSource:Kalam};
 if(request.endsWith('/FileExplorerLegacyDataSource'))return {FileExplorerLegacyDataSource:Legacy};
 if(request.endsWith('/FileExplorerLocalDataSource'))return {FileExplorerLocalDataSource:class {}};
 if(request.endsWith('/helpers/settings'))return {getMtpModeSetting:()=>mode};
 return originalLoad.call(this,request,...args);
};
const {FileExplorerRepository}=require('../../app/data/file-explorer/repositories/FileExplorerRepository');
(async()=>{
 const repo=new FileExplorerRepository();
 const opts={deviceType:'mtp',filePath:'/',ignoreHidden:true,storageId:65537};
 assert.strictEqual(await repo.prepareAdb(),false);await repo.initialize(opts);await repo.listFiles(opts);
 mode='legacy';await repo.listFiles(opts);
 connected=true;assert.strictEqual(await repo.prepareAdb(),true);await repo.initialize(opts);await repo.listFiles(opts);
 fail=true;let errors=0;repo.transferFiles({...opts,fileList:['/x'],destination:'/tmp',direction:'download',onPreprocess:()=>{},onProgress:()=>{},onCompleted:()=>{throw Error('false success')},onError:()=>{errors++}});
 assert.strictEqual(errors,1);
 assert.deepStrictEqual(calls,['kalam-init','kalam-list','legacy-list','adb-init','adb-list','adb-transfer']);
 console.log('Transport routing: ADB preferred in both modes, Kalam/Legacy fallback without ADB, no retry after transfer error passed.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Module._load=originalLoad});
