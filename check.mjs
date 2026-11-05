import http from 'node:http';
import { randomBytes, randomUUID, createHash, createPublicKey, verify, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const AUTH = 'https://auth.openai.com';
const API = 'https://api.openai.com/v1';
const base = new URL('./', import.meta.url);
export function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function validateJWT(token, keys, client, nonce, now = Date.now()/1000) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw Error('invalid_identity');
  const h = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const p = JSON.parse(Buffer.from(parts[1], 'base64url'));
  if (!['RS256', 'ES256'].includes(h.alg) || !h.kid || h.crit) throw Error('invalid_identity');
  const k = keys.find(k => k.kid === h.kid && (!k.use || k.use === 'sig') && (!k.alg || k.alg === h.alg));
  if (!k || (h.alg === 'RS256' && k.kty !== 'RSA') || (h.alg === 'ES256' && (k.kty !== 'EC' || k.crv !== 'P-256'))) throw Error('invalid_identity');
  const key = createPublicKey({key:k, format:'jwk'});
  if (!verify('sha256', Buffer.from(parts[0]+'.'+parts[1]), h.alg === 'ES256' ? {key, dsaEncoding:'ieee-p1363'} : key, Buffer.from(parts[2], 'base64url'))) throw Error('invalid_identity');
  const audience = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (p.iss !== AUTH || !audience.includes(client) || (audience.length > 1 && p.azp !== client) || (p.azp && p.azp !== client) || typeof p.exp !== 'number' || p.exp <= now-5 || typeof p.iat !== 'number' || p.iat > now+5 || (p.nbf !== undefined && (typeof p.nbf !== 'number' || p.nbf > now+5)) || !equal(p.nonce,nonce) || typeof p.sub !== 'string' || !p.sub) throw Error('invalid_identity');
  return true;
}
export async function consumeSSE(body) {
  let buffer = '', completed = false;
  const decoder = new TextDecoder();
  function event(block) {
    const data = block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    const e = JSON.parse(data);
    if (['response.failed','response.incomplete','error'].includes(e.type)) throw Error('inference_not_completed');
    if (e.type === 'response.completed') completed = true;
  }
  for await (const chunk of body) {
    buffer += decoder.decode(chunk,{stream:true});
    buffer = buffer.replace(/\r\n/g,'\n');
    let i;
    while ((i=buffer.indexOf('\n\n')) >= 0) { event(buffer.slice(0,i)); buffer=buffer.slice(i+2); }
    if (buffer.length > 2_000_000) throw Error('stream_too_large');
  }
  buffer += decoder.decode();
  if (buffer.trim()) event(buffer);
  if (!completed) throw Error('inference_not_completed');
}
async function getJSON(url, options = {}) {
  const r = await fetch(url, { ...options, redirect:'error', signal:AbortSignal.timeout(30000) });
  if (!r.ok) throw Error('http_'+r.status);
  return r.json();
}
function openBrowser(url) {
  const args = process.platform === 'win32' ? ['rundll32.exe',['url.dll,FileProtocolHandler',url]] : process.platform === 'darwin' ? ['open',[url]] : ['xdg-open',[url]];
  const child=spawn(args[0],args[1],{stdio:'ignore'}); child.on('error',()=>{}); child.unref();
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) { console.log('Node.js 22 or newer is required.'); return; }
  let host;
  try { host=JSON.parse(await readFile(new URL('host.json',base),'utf8')).host; }
  catch(e) { if(e.code !== 'ENOENT') throw Error('invalid_host_file'); host='urn:uuid:'+randomUUID(); await writeFile(new URL('host.json',base), JSON.stringify({host}), {flag:'wx'}); }
  if (!/^urn:uuid:[a-f0-9-]{36}$/.test(host)) throw Error('invalid_host_file');
  const report={version:1,checked_at:new Date().toISOString(),identity_verified:false,plan_scope:false,model_catalog:false,response_completed:false,api_key_used:false,paid_fallback:false,credentials_saved:false,stage:'start',status:'pending'};
  let state,nonce,verifier,started=false,used=false,timer;
  const entry=randomBytes(24).toString('base64url');
  const server=http.createServer();
  async function finish(status, code='none') {
    report.status=status; report.error_code=code;
    await writeFile(new URL('diagnostic.json',base),JSON.stringify(report,null,2));
    console.log('\nResult: '+status+' / Stage: '+report.stage+' / Code: '+code);
    console.log('Share diagnostic.json only. No password, token or account identity is included.');
    clearTimeout(timer); server.close(); server.closeIdleConnections();
  }
  server.on('request',async(req,res)=>{
    res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self' https://auth.openai.com; frame-ancestors 'none'; base-uri 'none'");
    const origin='http://127.0.0.1:'+server.address().port;
    if(req.headers.host !== new URL(origin).host) {res.writeHead(403).end();return;}
    const u=new URL(req.url,origin);
    if(req.method==='GET' && u.pathname==='/'+entry) {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end('<h1>AI Office 연결 검증</h1><p>공식 OpenAI 로그인 후 구독 권한, 사용 가능 모델, 짧은 응답 1회를 검사합니다.</p><p>인증 정보는 디스크에 저장하지 않습니다. API 키나 결제 정보를 입력하지 않습니다. 이 검사는 구독 사용량을 소모할 수 있습니다.</p><p>동의 화면에 추가 크레딧 소비 또는 예상하지 못한 결제 조건이 보이면 취소하세요.</p><form method="post" action="/'+entry+'/start"><button>Continue with ChatGPT</button></form>'); return;
    }
    if(req.method==='GET' && u.pathname==='/'+entry+'/start') {
      res.writeHead(303,{Location:'/'+entry}).end(); return;
    }
    if(req.method==='POST' && u.pathname==='/'+entry+'/start' && req.headers.origin!==origin) {
      res.writeHead(403,{'Content-Type':'text/html; charset=utf-8'}).end('<h1>로그인 요청을 확인할 수 없습니다</h1><p>프로그램을 다시 실행하고 새로 열린 시작 화면의 버튼을 눌러주세요.</p>'); return;
    }
    if(req.method==='POST' && u.pathname==='/'+entry+'/start' && started) {
      res.writeHead(409,{'Content-Type':'text/html; charset=utf-8'}).end('<h1>로그인을 이미 시작했습니다</h1><p>열린 OpenAI 로그인 화면을 이용하세요. 해당 화면이 없다면 실행 창을 닫고 프로그램을 다시 실행하세요.</p>'); return;
    }
    if(req.method==='POST' && u.pathname==='/'+entry+'/start' && req.headers.origin===origin && !started) {
      started=true; state=randomBytes(32).toString('base64url'); nonce=randomBytes(32).toString('base64url'); verifier=randomBytes(48).toString('base64url');
      const auth=new URL(AUTH+'/api/accounts/authorize');
      auth.search=new URLSearchParams({client_id:'dynamic_agent_client',agent_name_hint:'AI Office Connection Check',ext_agent_host_id:host,response_type:'code',redirect_uri:origin+'/auth/callback',scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource:API,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString();
      report.stage='authorization'; res.writeHead(303,{Location:auth.href}).end(); return;
    }
    if(req.method!=='GET' || u.pathname!=='/auth/callback') {res.writeHead(404).end();return;}
    if(!started || used || !equal(u.searchParams.get('state'),state)) {res.writeHead(400).end('Invalid or expired callback.');return;}
    used=true; clearTimeout(timer);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<h1>로그인 결과를 받았습니다</h1><p>검증 결과는 실행 창과 diagnostic.json에서 확인하세요. 이 페이지의 주소는 공유하지 마세요.</p>');
    let tokens;
    try {
      if(u.searchParams.has('error')) throw Error('authorization_denied');
      const client=u.searchParams.get('client_id'); const code=u.searchParams.get('code');
      if(!client || client==='dynamic_agent_client' || !code) throw Error('registration_incomplete');
      report.stage='token_exchange';
      tokens=await getJSON(AUTH+'/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,code,code_verifier:verifier,redirect_uri:origin+'/auth/callback',resource:API})});
      report.stage='identity_validation';
      const jwks=await getJSON(AUTH+'/.well-known/jwks.json');
      validateJWT(tokens.id_token,jwks.keys,client,nonce); report.identity_verified=true;
      report.stage='plan_scope';
      if(!String(tokens.scope || '').split(/\s+/).includes('chatgpt.tokens.use.direct') || !tokens.access_token || tokens.token_type?.toLowerCase()!=='bearer') throw Error('plan_permission_missing');
      report.plan_scope=true;
      report.stage='model_catalog';
      const catalog=await getJSON(API+'/models',{headers:{Authorization:'Bearer '+tokens.access_token}});
      const models=(catalog.models || []).filter(m=>m.visibility==='list' && typeof m.slug==='string');
      if(!models.length) throw Error('no_available_model');
      report.model_catalog=true;
      // Prefer a small model when available; never route to a separate paid credential.
      const model=models.find(m=>/mini|nano/i.test(m.slug)) || models[0];
      report.stage='inference';
      const response=await fetch(API+'/responses',{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),headers:{Authorization:'Bearer '+tokens.access_token,'Content-Type':'application/json'},body:JSON.stringify({model:model.slug,input:[{role:'user',content:'Reply with exactly OK. Do not use tools.'}],store:false,stream:true})});
      if(!response.ok) throw Error('http_'+response.status);
      await consumeSSE(response.body); report.response_completed=true; report.stage='completed';
      await finish('PASS');
    } catch(e) {
      const allowed=/^(http_\d{3}|authorization_denied|registration_incomplete|invalid_identity|plan_permission_missing|no_available_model|inference_not_completed|stream_too_large)$/;
      await finish('NOT_PASSED',allowed.test(e.message)?e.message:'network_or_validation_error');
    } finally {tokens=null; state=null; nonce=null; verifier=null;}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const url='http://127.0.0.1:'+server.address().port+'/'+entry;
  console.log('AI Office connection check. No API key. No paid fallback.');
  console.log('Open on this computer: '+url);
  timer=setTimeout(()=>{used=true;finish('NOT_PASSED','login_timeout').catch(()=>{});},600000);
  openBrowser(url);
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) main().catch(()=>{console.log('Startup failed. Check Node version and folder write permission.');process.exitCode=1;});
