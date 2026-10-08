const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '../..');
const pkg = require(path.join(root, 'package.json'));
const output = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
const cache = path.join(root, '.cache');
fs.mkdirSync(cache, { recursive: true });
const WebSocket = require(path.join(root, 'node_modules/ws'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wendao-smoke-profile-'));
fs.mkdirSync(path.join(home, 'Library/Application Support'), { recursive: true });
const log = fs.openSync(path.join(cache, 'smoke.log'), 'w');
const port = Number(process.env.OPENMTP_SMOKE_PORT || Math.floor(10000 + Math.random() * 30000));
const child = spawn(path.join(root, 'dist', output, `${pkg.productName}.app/Contents/MacOS/${pkg.productName}`), [`--remote-debugging-port=${port}`], {env: {...process.env, HOME: home}, stdio: ['ignore', log, log]});
let launchError;
child.on('error', error => { launchError = error; });
const delay = n => new Promise(r => setTimeout(r, n));
const getTargets = () => new Promise((resolve, reject) => {
  const request = http.get(`http://127.0.0.1:${port}/json/list`, res => {let text='';res.on('data',x=>text+=x);res.on('end',()=>{try{resolve(JSON.parse(text));}catch(e){reject(e);}});}).on('error', reject);
  request.setTimeout(1500, () => request.destroy(Error('Inspector request timed out')));
});
let socket;
(async () => {
  let target;
  for (let i=0;i<30;i++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw Error('App exited before opening a window: '+child.exitCode);
    try {target=(await getTargets()).find(t=>t.type==='page' && t.url.startsWith('file:') && t.url.includes('app.html') && t.url.startsWith(require('url').pathToFileURL(root).href));} catch {}
    if(target) break;
    await delay(500);
  }
  if(!target) throw Error('App renderer was not reachable');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});
  let seq=0;const pending=new Map();const exceptions=[];
  socket.on('message',raw=>{const m=JSON.parse(raw);if(m.id && pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text);});
  const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,r);socket.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);j(Error('CDP timeout '+method));}},8000).unref();});
  await send('Runtime.enable');
  await delay(3000);
  await send('Runtime.evaluate', { expression: '[...document.querySelectorAll("button")].find(b => b.textContent.trim().toLowerCase() === "close")?.click()' });
  await delay(3000);
  const result=await send('Runtime.evaluate',{expression:'JSON.stringify({title:document.title,text:document.body.innerText,main:!!document.querySelector("main"),filesPane:!!document.getElementById("device-files-pane"),elements:document.body.querySelectorAll("*").length})',returnByValue:true});
  if(result.result.exceptionDetails)throw Error(JSON.stringify(result.result.exceptionDetails));
  const state=JSON.parse(result.result.result.value);
  if(!state.main || !state.filesPane || state.elements<30 || state.text.length<40) throw Error('Empty or failed renderer: '+JSON.stringify(state));
  if(exceptions.length) throw Error('Renderer exceptions: '+exceptions.join(', '));
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(cache, 'smoke.png'),Buffer.from(shot.result.data,'base64'));
  fs.writeFileSync(path.join(cache, 'smoke-result.json'),JSON.stringify({passed:true,profile:home,state,exceptions},null,2));
  console.log(JSON.stringify({passed:true,title:state.title,elements:state.elements,text:state.text.slice(0,800),exceptions}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(socket)socket.terminate();child.kill('SIGKILL');fs.closeSync(log);});
