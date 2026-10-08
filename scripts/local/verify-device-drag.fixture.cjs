(async()=>{
 const scan=n=>!n?null:n.memoizedProps?.store?.getState?n.memoizedProps.store:scan(n.child)||scan(n.sibling);const serial=scan(document.getElementById('root')._reactRootContainer._internalRoot.current).getState().Home.mtpDevice.info.usbDeviceInfo.SerialNumber;
 const explorer=()=>{const scan=n=>!n?null:n.stateNode?._handleTableDrop&&n.stateNode.props.deviceType==='mtp'?n.stateNode:scan(n.child)||scan(n.sibling);return scan(document.getElementById('root')._reactRootContainer._internalRoot.current)};
 const wait=async(test)=>{for(let i=0;i<200;i++){if(await test())return;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out waiting for transfer')};
 const originalPath=explorer().props.currentBrowsePath.mtp;
 const fs=require('fs'),crypto=require('crypto'),{ipcRenderer}=require('electron'),path=require('path');const root=fs.mkdtempSync('/private/tmp/openmtp-drag-multi-');const remote='/Download/'+path.basename(root);fs.mkdirSync(root+'/folder/empty',{recursive:true});fs.writeFileSync(root+'/a.txt','alpha');fs.writeFileSync(root+'/b.txt','beta');fs.writeFileSync(root+'/folder/in.txt','inside');fs.writeFileSync(root+'/folder/中文 空文件.txt','');fs.mkdirSync(root+'/out');
 const call=async(operation,args)=>{const r=await ipcRenderer.invoke('adb-files:request',{operation,storageId:65537,id:'multi',...args});if(r.error)throw Error(r.error);return r.data};await call('makeDirectory',{filePath:remote});
 try{
  explorer().props.actionCreateListDirectory({filePath:remote,ignoreHidden:false},'mtp');
  await wait(()=>explorer().props.currentBrowsePath.mtp===remote);
  // No preceding dragover: an external drop must not depend on stale Redux drag state.
  await explorer()._handleTableDrop({preventDefault(){},stopPropagation(){}},{destinationDeviceType:'mtp',externalFiles:[root+'/a.txt',root+'/b.txt',root+'/folder'].map(path=>({path}))});
  await wait(async()=>!explorer().props.fileTransferProgess.toggle&&await call('filesExist',{fileList:[remote+'/folder/in.txt']}));
  fs.writeFileSync(root+'/a.txt','must not overwrite after cancel');
  await explorer()._handleTableDrop({preventDefault(){},stopPropagation(){}},{destinationDeviceType:'mtp',externalFiles:[{path:root+'/a.txt'}]});
  if(!explorer().pendingPaste || !explorer().state.togglePasteConfirmDialog)throw Error('Upload conflict did not request confirmation');
  explorer()._handlePasteConfirm(false);
  if(explorer().pendingPaste)throw Error('Cancelled paste remained pending');
  const opts={files:[{path:remote+'/a.txt'},{path:remote+'/b.txt'},{path:remote+'/folder',isFolder:true}],serial,storageId:65537,destination:root+'/out'};
  const result=await ipcRenderer.invoke('device-drag:test',opts);await new Promise(r=>setTimeout(r,100));
  if(result.results.some(r=>r.error))throw Error(JSON.stringify(result));
  const outcome={results:result.results,files:fs.readFileSync(root+'/out/a.txt','utf8')==='alpha'&&fs.readFileSync(root+'/out/b.txt','utf8')==='beta',uploadCancelPreserved:fs.readFileSync(root+'/out/a.txt','utf8')==='alpha',zeroByte:fs.statSync(root+'/out/folder/中文 空文件.txt').size===0,folder:fs.readFileSync(root+'/out/folder/in.txt','utf8')==='inside',empty:fs.statSync(root+'/out/folder/empty').isDirectory(),sourceStillExists:await call('filesExist',{fileList:[remote+'/a.txt']}),staging:fs.readdirSync(root+'/out').filter(n=>n.startsWith('.openmtp-'))};
  fs.writeFileSync(root+'/out/a.txt','keep existing');const conflict=await ipcRenderer.invoke('device-drag:test',{...opts,files:[opts.files[0]]});await new Promise(r=>setTimeout(r,100));outcome.conflictRejected=Boolean(conflict.results[0].error);outcome.existingPreserved=fs.readFileSync(root+'/out/a.txt','utf8')==='keep existing';return outcome;
 }finally{await call('deleteFiles',{fileList:[remote]});explorer().props.actionCreateListDirectory({filePath:originalPath,ignoreHidden:true},'mtp');}
})()
