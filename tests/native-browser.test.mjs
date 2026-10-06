import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureNativeCallback,saveNativeSignIn,pendingNativeSignIn,manufacturerUrl} from '../src/native-lock-browser.mjs';
function storage(){let value;return {setItem:(k,v)=>value=v,getItem:()=>value,removeItem:()=>value=null};}
test('native callback removes code before auth initialization and leaves ordinary sign-in alone',()=>{
 let cleaned;const history={replaceState:(a,b,url)=>cleaned=url};
 const result=captureNativeCallback({href:'https://treestand-manager.webflow.io/app/?code=synthetic&state=tslock.tedee.random&error_description=private'},history);
 assert.equal(result.provider,'tedee');assert.equal(cleaned,'/app/');assert.equal(result.url.includes('code=synthetic'),true);
 assert.equal(captureNativeCallback({href:'https://treestand-manager.webflow.io/app/?code=normal-login'},history),null);
});
test('native browser binding rejects another host, altered state and expired sign-ins',()=>{
 const store=storage(),result={provider:'tedee',state:'tslock.tedee.synthetic'};saveNativeSignIn(store,'a',result,'b'.repeat(64),1000);
 assert.equal(pendingNativeSignIn(store,'a',result,1001).owner,'a');
 assert.throws(()=>pendingNativeSignIn(store,'b',result,1001));assert.throws(()=>pendingNativeSignIn(store,'a',{...result,state:'other'},1001));assert.throws(()=>pendingNativeSignIn(store,'a',result,601000));
 assert.equal(manufacturerUrl('tedee','https://tedee.b2clogin.com/path'),'https://tedee.b2clogin.com/path');assert.throws(()=>manufacturerUrl('tedee','https://evil.example'));assert.throws(()=>manufacturerUrl('tedee','https://tedee.b2clogin.com.evil.example'));
});
