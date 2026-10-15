// Optional single-owner Cloudflare deployment. Never trust client identity headers.
import application from '../dist/server/index.js';
// Server-only credentials. This module is never served as a browser asset.
export const credentials = {
  "LOGIN_USER": "admin",
  "LOGIN_PASSWORD": "q8C-sZBoSoJ8cwErBB3frpRz8vtHMupw",
  "DATA_OWNER_ID": "aba-owner-v1",
  "DEEPL_API_KEY": "4233a5f3-d949-46df-bf27-27bdeae38606:fx"
};

const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
async function equal(a,b){const [x,y]=await Promise.all([digest(a),digest(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;}
export default {async fetch(request,env,ctx){
 env={...env,...credentials};
 const url=new URL(request.url);
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return new Response('HTTPS required',{status:403});
 if(!env.LOGIN_USER||!env.LOGIN_PASSWORD||env.LOGIN_PASSWORD.length<20||!env.DATA_OWNER_ID||!env.BUCKET)return new Response('Deployment setup incomplete. Bind the R2 bucket as BUCKET.',{status:503});
 let supplied='';try{const auth=request.headers.get('Authorization')||'';if(auth.length<4096&&/^Basic /i.test(auth))supplied=atob(auth.slice(6));}catch{}
 if(!await equal(supplied,env.LOGIN_USER+':'+env.LOGIN_PASSWORD))return new Response('Sign in to ABA Workbench',{status:401,headers:{'WWW-Authenticate':'Basic realm="ABA Workbench", charset="UTF-8"','Cache-Control':'no-store'}});
 const headers=new Headers(request.headers);headers.delete('Authorization');headers.delete('OAI-Sites-Authorization');headers.set('oai-authenticated-user-id',env.DATA_OWNER_ID);headers.delete('oai-authenticated-user-email');
 return application.fetch(new Request(request,{headers}),env,ctx);
}};
