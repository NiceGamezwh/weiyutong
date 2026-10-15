import fs from 'node:fs/promises';
const {build}=await import('esbuild');await build({entryPoints:['src/import-worker.mjs'],bundle:true,format:'iife',platform:'browser',outfile:'public/import-worker.js',external:['./core.js'],minify:true});
const names=await fs.readdir('public');const assets={};
const types={html:'text/html; charset=utf-8',js:'application/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
for(const name of names){const content=await fs.readFile('public/'+name,'utf8');assets['/'+name]={content,type:types[name.split('.').pop()]||'text/plain'};}
const api=await fs.readFile('worker/api.mjs','utf8');
const worker=api+'\nconst assets='+JSON.stringify(assets)+';\nexport default {async fetch(request,env){const p=new URL(request.url).pathname;if(p.startsWith("/api/"))return api(request,env);const asset=assets[p==="/"?"/index.html":p];if(!asset)return new Response("Not found",{status:404});if(!["GET","HEAD"].includes(request.method))return new Response("Method not allowed",{status:405});return new Response(request.method==="HEAD"?null:asset.content,{headers:{"Content-Type":asset.type,"Cache-Control":"no-cache","X-Content-Type-Options":"nosniff"}});}};\n';
await fs.rm('dist',{recursive:true,force:true});await fs.mkdir('dist/server',{recursive:true});await fs.mkdir('dist/.openai',{recursive:true});await fs.writeFile('dist/server/index.js',worker);await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');console.log('Built authenticated report API and existing application assets.');
