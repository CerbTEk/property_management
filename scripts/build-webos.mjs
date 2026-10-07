import {build} from 'vite';
import {copyFile,readdir,rm,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('webos-tv'),out=resolve(root,'build');
const loop=await stat(resolve('public/tv-scenes/woodland-loop.mp4')).catch(()=>null);
if(!loop?.size)throw Error('Generate the bundled photo video first: python scripts/render-starter-video.py');
// Classic-script bundle avoids local file-origin ES module restrictions on TVs.
await build({configFile:false,root,base:'./',define:{'process.env.NODE_ENV':'"production"'},publicDir:resolve('public'),build:{outDir:out,emptyOutDir:true,target:'chrome87',lib:{entry:resolve(root,'main.jsx'),name:'TreestandTV',formats:['iife'],fileName:()=> 'treestand-tv.js',cssFileName:'treestand-tv'},rollupOptions:{output:{inlineDynamicImports:true}}}});
for(const name of await readdir(resolve(root,'app')))await copyFile(resolve(root,'app',name),resolve(out,name));
await writeFile(resolve(out,'index.html'),'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Treestand TV</title><link rel="stylesheet" href="./treestand-tv.css"></head><body><div id="root"></div><script defer src="./treestand-tv.js"></script></body></html>');
await rm(resolve(out,'templates'),{recursive:true,force:true});
console.log('LG webOS application ready in webos-tv/build');

const {readFile}=await import('node:fs/promises');const js=await readFile(resolve(out,'treestand-tv.js'),'utf8');if(/process\.env|import\.meta/.test(js))throw Error('TV bundle contains unsupported runtime environment references.');

