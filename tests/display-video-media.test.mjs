import test from 'node:test';import assert from 'node:assert/strict';
import {screenVideo} from '../supabase/functions/guest-display/video.mjs';
test('ready videos are owner/listing scoped, briefly signed, and expose no worker metadata',async()=>{
 const property='10000000-0000-0000-0000-000000000001',file='20000000-0000-0000-0000-000000000001.mp4',filters=[];
 let path=`${property}/${file}`,signed=0;
 const admin={from(table){assert.equal(table,'ts_display_videos');return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle:async()=>({data:{object_path:path,ready_version:2,photo_count:3,lease_id:'private'}})};},storage:{from(bucket){assert.equal(bucket,'treestand-display-videos');return {createSignedUrl:async(p,seconds)=>{signed++;assert.equal(p,path);assert.equal(seconds,1200);return {data:{signedUrl:'https://signed.example/video'}};}};}}};
 assert.deepEqual(await screenVideo(admin,{property_id:property,owner_id:'owner'}),{id:file,url:'https://signed.example/video',photo_count:3});
 assert.deepEqual(filters,[['property_id',property],['owner_id','owner']]);
 path=`30000000-0000-0000-0000-000000000001/${file}`;assert.equal(await screenVideo(admin,{property_id:property,owner_id:'owner'}),null);assert.equal(signed,1);
 path=null;assert.equal(await screenVideo(admin,{property_id:property,owner_id:'owner'}),null);
});

