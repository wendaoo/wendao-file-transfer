// Run against the development preview started with --remote-debugging-port=9226.
// Creates an isolated phone test folder and cleans it in finally.
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const appId = process.env.OPENMTP_IOS_TEST_APP;
if (!appId || !/^[A-Za-z0-9.-]+$/.test(appId)) throw Error('Set OPENMTP_IOS_TEST_APP to a file-sharing app bundle id');
const deadline = setTimeout(() => { console.error('Drag integration test timed out'); process.exit(1); }, 120000);
http.get('http://127.0.0.1:9226/json', response => {
 let body='';response.on('data', chunk => {body+=chunk});response.on('end',()=>{
  const page=JSON.parse(body).find(item=>item.type==='page'&&item.url.includes('/app.html'));
  const socket=new WebSocket(page.webSocketDebuggerUrl);
  socket.on('open',()=>socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:fs.readFileSync(path.join(__dirname,'verify-ios-drag.fixture.cjs'),'utf8').replace('__IOS_TEST_APP__', appId),awaitPromise:true,returnByValue:true}})));
  socket.on('message',data=>{const result=JSON.parse(data);if(result.id!==1)return;clearTimeout(deadline);socket.close();
   if(result.result?.exceptionDetails){console.error(result.result.exceptionDetails);process.exitCode=1;return}
   const value=result.result?.result?.value;console.log(JSON.stringify(value,null,2));
   if(!value||!value.files||!value.folder||!value.zeroByte||!value.uploadCancelPreserved||!value.empty||!value.sourceStillExists||!value.conflictRejected||!value.existingPreserved||value.staging.length||value.results.some(r=>r.error))process.exitCode=1;
  });
 });
}).on('error',error=>{clearTimeout(deadline);console.error(error);process.exitCode=1});
