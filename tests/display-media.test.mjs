import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageExtension,nextImagePosition} from '../src/display-media.mjs';
import {screenImages} from '../supabase/functions/guest-display/media.mjs';
test('uploads accept supported bounded images and fill at most twelve slots',()=>{
 assert.equal(imageExtension({type:'image/jpeg',size:100}),'jpg');
 for(const file of [{type:'image/svg+xml',size:100},{type:'image/png',size:9*1024*1024},{type:'image/png',size:0}])assert.throws(()=>imageExtension(file));
 assert.equal(nextImagePosition([{position:0},{position:2}]),1);
 assert.throws(()=>nextImagePosition(Array.from({length:12},(_,position)=>({position}))));
});
test('TV photos are scoped to the connected listing and owner and signed briefly after validation',async()=>{
 const property='00000000-0000-0000-0000-000000000001',photo=property+'/00000000-0000-0000-0000-000000000002.jpg',filters=[];
 const admin={from(table){assert.equal(table,'ts_display_images');return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},order(){return this;},async limit(n){assert.equal(n,12);return {data:[{object_path:photo,caption:'Our garden'},{object_path:'foreign/00000000-0000-0000-0000-000000000002.jpg',caption:'Foreign'}]};}};},storage:{from(bucket){assert.equal(bucket,'treestand-display-images');return {async createSignedUrls(paths,seconds){assert.deepEqual(paths,[photo]);assert.equal(seconds,120);return {data:[{signedUrl:'https://storage.example/signed-photo'}]};}};}}};
 const images=await screenImages(admin,{property_id:property,owner_id:'owner'});
 assert.deepEqual(filters,[['property_id',property],['owner_id','owner']]);assert.equal(images.length,1);assert.equal(images[0].caption,'Our garden');assert.equal(images[0].url,'https://storage.example/signed-photo');assert.equal(JSON.stringify(images).includes('Foreign'),false);
});
