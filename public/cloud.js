async function once(path,options={}){
 const response=await fetch(path,{...options,cache:'no-store',signal:AbortSignal.timeout(90000),credentials:'same-origin',headers:{'Content-Type':'application/json',...options.headers}});
 const data=await response.json().catch(()=>({error:'无法连接云端，请刷新登录后重试。'}));
 if(!response.ok){const e=new Error(data.error||'同步失败，请稍后重试。');e.permanent=response.status<500&&response.status!==429;throw e;}return data;
}
export async function request(path,options={}){for(let attempt=0;;attempt++){try{return await once(path,options);}catch(e){if(attempt>=3||e.permanent)throw e;await new Promise(r=>setTimeout(r,Math.min(8000,1000*2**attempt)));}}}
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function uploadReport(report,progress=()=>{}){
 const rows=report.rows;const chunks=[];for(let offset=0;offset<rows.length;offset+=2500){const body=JSON.stringify(rows.slice(offset,offset+2500).map(r=>({term:r.term,rank:r.rank}))),digest=await hash(body);const path=`/api/reports/${report.id}/chunks/${digest}`;const exists=await fetch(path,{method:'HEAD',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(90000)});if(exists.status!==200)await request(path,{method:'PUT',body});chunks.push(digest);progress(Math.min(offset+2500,rows.length),rows.length);}
 const meta={id:report.id,name:report.name,date:report.date,kind:report.kind||'daily',saved:report.saved,count:rows.length,chunks};
 await request(`/api/reports/${report.id}`,{method:'PUT',body:JSON.stringify(meta)});return meta;
}
export async function listReports(){let cursor=null,all=[];do{const page=await request('/api/reports'+(cursor?'?cursor='+encodeURIComponent(cursor):''));all.push(...page.reports);cursor=page.cursor;}while(cursor);return all;}
export async function downloadReport(meta,progress=()=>{}){const rows=[];for(let i=0;i<meta.chunks.length;i++){const chunk=await request(`/api/reports/${meta.id}/chunks/${meta.chunks[i]}`);for(const row of chunk)rows.push(row);progress(i+1,meta.chunks.length);}if(rows.length!==meta.count)throw new Error('下载数据不完整，将自动重试。');return{...meta,rows};}

export async function deletedReports(){let cursor=null,ids=[];do{const result=await request('/api/deleted-reports'+(cursor?'?cursor='+encodeURIComponent(cursor):''));ids.push(...result.ids);cursor=result.cursor;}while(cursor);return ids;}
export async function deleteReport(id){let result;do{result=await request('/api/reports/'+encodeURIComponent(id),{method:'DELETE'});}while(result.remaining);}
