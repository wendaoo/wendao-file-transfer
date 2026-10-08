require('@babel/register');
const assert=require('assert');
const {cachedDirectory,rememberDirectory,clearDirectoryCache}=require('../../app/services/directory-cache');
const now=Date.now;let clock=1000;Date.now=()=>clock;
try{
 const files=[{name:'file'}];rememberDirectory('device-a/root',files);
 assert.strictEqual(cachedDirectory('device-a/root'),files);
 assert.strictEqual(cachedDirectory('device-b/root'),null);
 clock+=5001;assert.strictEqual(cachedDirectory('device-a/root'),null);
 rememberDirectory('device-a/root',files);clearDirectoryCache();assert.strictEqual(cachedDirectory('device-a/root'),null);
 for(let i=0;i<13;i++)rememberDirectory('path'+i,files);
 assert.strictEqual(cachedDirectory('path0'),null);assert.strictEqual(cachedDirectory('path12'),files);
 console.log('Directory cache: expiry, isolation, invalidation and bounded retention passed.');
}finally{Date.now=now;clearDirectoryCache()}
