import assert from 'node:assert/strict';import {api} from '../worker/api.mjs';
const req=(path,body)=>new Request('https://example.com'+path,{method:body?'POST':'GET',headers:{Origin:'https://example.com','Content-Type':'application/json','oai-authenticated-user-id':'owner'},body:body?JSON.stringify(body):undefined});
const env={BUCKET:{},DEEPL_API_KEY:'test-only:fx'},terms=['cup holder','travel case'];
assert.equal((await (await api(req('/api/translation-status'),{})).json()).configured,false);
assert.equal((await api(req('/api/translate',{terms}),{BUCKET:{}})).status,503);
let calls=0,status=200,result={translations:[{text:'杯架'},{text:'旅行收纳盒'}]},host='https://api-free.deepl.com';
globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,host+'/v2/translate');assert.equal(options.headers.Authorization,'DeepL-Auth-Key '+env.DEEPL_API_KEY);const body=JSON.parse(options.body);assert.equal(body.target_lang,'ZH-HANS');assert.deepEqual(body.text,terms);return Response.json(result,{status});};
assert.deepEqual((await (await api(req('/api/translate',{terms}),env)).json()).translations,[{term:'cup holder',text:'杯架'},{term:'travel case',text:'旅行收纳盒'}]);
assert.equal((await api(req('/api/translate',{terms:Array(26).fill('x')}),env)).status,400);assert.equal(calls,1);
host='https://api.deepl.com';env.DEEPL_API_KEY='test-pro';assert.equal((await api(req('/api/translate',{terms}),env)).status,200);
for(const bad of [{translations:[{text:'杯架'}]},{translations:[{text:''},{text:'盒'}]},{}]){result=bad;assert.equal((await api(req('/api/translate',{terms}),env)).status,502);}
for(const code of [403,429,456,500]){status=code;const response=await api(req('/api/translate',{terms}),env);assert.equal(response.status,502);assert.ok((await response.json()).error.includes('DeepL'));}
assert.equal((await api(new Request('https://example.com/api/translate',{method:'POST'}),env)).status,401);
const wrongOrigin=req('/api/translate',{terms});wrongOrigin.headers.set('Origin','https://other.example');assert.equal((await api(wrongOrigin,env)).status,403);
console.log('PASS: DeepL Free/Pro endpoints, Chinese translations, malformed results, quota/auth/rate errors, limits and access checks (mocked service).');
