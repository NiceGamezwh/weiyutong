const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const validId=s=>/^[a-zA-Z0-9-]{1,100}$/.test(s);
const validHash=s=>/^[a-f0-9]{64}$/.test(s);
export async function api(request,env){
 const url=new URL(request.url),user=request.headers.get('oai-authenticated-user-id');
 if(!user)return json({error:'请使用同一个 ChatGPT 账号登录后同步。'},401);
 const owner=await digest(user),root=`accounts/${owner}/`;
 if(url.pathname==='/api/session')return json({owner});
 if(url.pathname==='/api/translation-status'&&request.method==='GET')return json({configured:!!env.DEEPL_API_KEY});
 if(!env.BUCKET)return json({error:'云端存储暂时不可用，请稍后重试。'},503);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)return json({error:'请求来源不匹配。'},403);
 try{
 if(url.pathname==='/api/translate'&&request.method==='POST'){
  if(!env.DEEPL_API_KEY)return json({error:'DeepL 翻译尚未连接，请先配置翻译服务。',configured:false},503);
  let input;try{input=await request.json();}catch{return json({error:'翻译请求格式无效。'},400);}
  const terms=input?.terms;
  if(!Array.isArray(terms)||!terms.length||terms.length>25||terms.some(t=>typeof t!=='string'||!t.trim()||t.length>1000)||terms.reduce((n,t)=>n+t.length,0)>5000)return json({error:'翻译内容超出单批限制，请减少搜索词。'},400);
  const host=env.DEEPL_API_KEY.trim().endsWith(':fx')?'https://api-free.deepl.com':'https://api.deepl.com';
  let response;try{response=await fetch(host+'/v2/translate',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'DeepL-Auth-Key '+env.DEEPL_API_KEY.trim()},
   body:JSON.stringify({text:terms,target_lang:'ZH-HANS',context:'These are product search keywords from Amazon US. Translate in an online shopping context.'}),signal:AbortSignal.timeout(45000)
  });}catch{return json({error:'DeepL 翻译连接超时，请稍后重试。'},502);}
  if(!response.ok){const errors={403:'DeepL 密钥验证失败，请检查服务配置。',429:'DeepL 请求频率受限，请稍后重试。',456:'DeepL 翻译额度已用完，请检查账户额度。'};return json({error:errors[response.status]||'DeepL 翻译暂不可用，请稍后重试。'},502);}
  let translated;try{translated=(await response.json()).translations;}catch{return json({error:'DeepL 翻译未返回完整译文，请重试。'},502);}
  if(!Array.isArray(translated)||translated.length!==terms.length||translated.some(t=>!t||typeof t.text!=='string'||!t.text.trim()||t.text.length>4000))return json({error:'DeepL 翻译结果无法对应搜索词，请重试。'},502);
  return json({translations:terms.map((term,i)=>({term,text:translated[i].text.trim()})),provider:'DeepL'});
 }
 if(url.pathname==='/api/deleted-reports'&&request.method==='GET'){
  const result=await env.BUCKET.list({prefix:root+'deleted/',limit:1000,cursor:url.searchParams.get('cursor')||undefined});
  return json({ids:result.objects.map(o=>o.key.slice((root+'deleted/').length)),cursor:result.truncated?result.cursor:null});
 }
 if(url.pathname==='/api/reports'&&request.method==='GET'){
  const result=await env.BUCKET.list({prefix:root+'reports/',limit:20,cursor:url.searchParams.get('cursor')||undefined});
  const reports=await Promise.all(result.objects.map(async item=>{const id=item.key.slice((root+'reports/').length,-5);if(await env.BUCKET.head(root+'deleted/'+id))return null;const o=await env.BUCKET.get(item.key);return o?o.json():null;}));
  return json({reports:reports.filter(Boolean),cursor:result.truncated?result.cursor:null});
 }
 const match=url.pathname.match(/^\/api\/reports\/([a-zA-Z0-9-]+)(?:\/chunks\/([a-f0-9]{64}))?$/);
 if(!match||!validId(match[1]))return json({error:'未找到接口。'},404);
 const id=match[1],hash=match[2],key=root+`reports/${id}.json`;
 const tombstone=root+'deleted/'+id;
 if(request.method==='DELETE'&&!hash){
  await env.BUCKET.put(tombstone,JSON.stringify({deletedAt:Date.now()}),{httpMetadata:{contentType:'application/json'}});
  await env.BUCKET.delete(key);
  const parts=await env.BUCKET.list({prefix:root+`data/${id}/`,limit:100});
  if(parts.objects.length)await env.BUCKET.delete(parts.objects.map(o=>o.key));
  return json({deleted:true,remaining:parts.truncated});
 }
 if(await env.BUCKET.head(tombstone))return json({error:'此报告已删除，请刷新报告列表。',deleted:true},410);
 if(hash){
  if(!validHash(hash))return json({error:'数据标识无效。'},400);
  const chunkKey=root+`data/${id}/${hash}`;
  if(request.method==='HEAD')return new Response(null,{status:await env.BUCKET.head(chunkKey)?200:404,headers:{'Cache-Control':'no-store'}});
  if(request.method==='GET'){const o=await env.BUCKET.get(chunkKey);return o?new Response(o.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}}):json({error:'报告数据暂不可用。'},404);}
  if(request.method==='PUT'){
   const existing=await env.BUCKET.head(chunkKey);if(existing)return json({ok:true});
   const text=await request.text();if(await digest(text)!==hash)return json({error:'上传校验失败，请重试。'},400);
   const rows=JSON.parse(text);if(!Array.isArray(rows)||rows.length<1||rows.length>5000||rows.some(r=>!r||typeof r.term!=='string'||!r.term.trim()||!Number.isSafeInteger(r.rank)||r.rank<=0))return json({error:'报告数据格式无效。'},400);
   await env.BUCKET.put(chunkKey,text,{httpMetadata:{contentType:'application/json'},customMetadata:{count:String(rows.length)}});if(await env.BUCKET.head(tombstone)){await env.BUCKET.delete(chunkKey);return json({error:'此报告已删除。'},410);}return json({ok:true});
  }
 }
 if(request.method==='PUT'&&!hash){
  const m=await request.json();
  if(m.id!==id||!['daily','weekly'].includes(m.kind)||typeof m.name!=='string'||m.name.length>1024||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isSafeInteger(m.saved)||!Number.isSafeInteger(m.count)||m.count<1||!Array.isArray(m.chunks)||!m.chunks.length||m.chunks.some(h=>!validHash(h)))return json({error:'报告信息无效。'},400);
  const existing=await env.BUCKET.get(key);if(existing){const old=await existing.json();return JSON.stringify(old.chunks)===JSON.stringify(m.chunks)&&old.count===m.count?json(old):json({error:'报告标识冲突，请重新导入。'},409);}
  let count=0;for(let i=0;i<m.chunks.length;i+=20){const parts=await Promise.all(m.chunks.slice(i,i+20).map(h=>env.BUCKET.head(root+`data/${id}/${h}`)));if(parts.some(p=>!p))return json({error:'数据尚未上传完整，请重试同步。'},409);count+=parts.reduce((n,p)=>n+Number(p.customMetadata.count),0);}
  if(count!==m.count)return json({error:'报告行数校验失败。'},400);
  if(await env.BUCKET.head(tombstone))return json({error:'此报告已删除。'},410);
  const safe={id,name:m.name,date:m.date,kind:m.kind,saved:m.saved,count:m.count,chunks:m.chunks};await env.BUCKET.put(key,JSON.stringify(safe),{httpMetadata:{contentType:'application/json'}});if(await env.BUCKET.head(tombstone)){await env.BUCKET.delete(key);return json({error:'此报告已删除。'},410);}return json(safe);
 }
 return json({error:'不支持的操作。'},405);
 }catch(e){console.error('Report storage failure',e);return json({error:'云端同步暂时失败，数据会保留并在连接恢复后重试。'},503);}
}
