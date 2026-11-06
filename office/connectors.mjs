import {createHash,createHmac,randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {join} from 'node:path';

const CALLBACK='http://127.0.0.1:1455/oauth/callback';
const services={
  'Google Sheets':{provider:'google',scopes:['openid','email','profile','https://www.googleapis.com/auth/spreadsheets']},
  'Google Drive':{provider:'google',scopes:['openid','email','profile','https://www.googleapis.com/auth/drive.file']},
  'Google Docs':{provider:'google',scopes:['openid','email','profile','https://www.googleapis.com/auth/documents']},
  'Google Calendar':{provider:'google',scopes:['openid','email','profile','https://www.googleapis.com/auth/calendar.events']},
  Gmail:{provider:'google',scopes:['openid','email','profile','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.compose']},
  Notion:{provider:'notion',scopes:[]},
  GitHub:{provider:'github',scopes:['read:user','repo']},
  GitLab:{provider:'gitlab',scopes:['read_user','read_api']},
  Slack:{provider:'slack',scopes:['channels:read','chat:write','files:write']},
  'Microsoft 365':{provider:'microsoft',scopes:['openid','profile','offline_access','User.Read','Files.ReadWrite','Calendars.ReadWrite','Mail.ReadWrite']},
  Dropbox:{provider:'dropbox',scopes:['files.metadata.read','files.content.read','files.content.write']},
  Airtable:{provider:'airtable',scopes:['data.records:read','data.records:write','schema.bases:read']},
  Trello:{provider:'trello',scopes:['read','write']},
  Asana:{provider:'asana',scopes:['default','offline_access']},
  Linear:{provider:'linear',scopes:['read','write']}
};
const providers={
  google:{auth:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',pkce:true,secret:false,extra:{access_type:'offline',prompt:'consent'}},
  notion:{auth:'https://api.notion.com/v1/oauth/authorize',token:'https://api.notion.com/v1/oauth/token',pkce:false,secret:true,basic:true,json:true},
  github:{auth:'https://github.com/login/oauth/authorize',token:'https://github.com/login/oauth/access_token',pkce:false,secret:true,json:true},
  gitlab:{auth:'https://gitlab.com/oauth/authorize',token:'https://gitlab.com/oauth/token',pkce:true,secret:true},
  slack:{auth:'https://slack.com/oauth/v2/authorize',token:'https://slack.com/api/oauth.v2.access',pkce:false,secret:true},
  microsoft:{auth:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',token:'https://login.microsoftonline.com/common/oauth2/v2.0/token',pkce:true,secret:false},
  dropbox:{auth:'https://www.dropbox.com/oauth2/authorize',token:'https://api.dropboxapi.com/oauth2/token',pkce:true,secret:false,extra:{token_access_type:'offline'}},
  airtable:{auth:'https://airtable.com/oauth2/v1/authorize',token:'https://airtable.com/oauth2/v1/token',pkce:true,secret:true,basic:true},
  asana:{auth:'https://app.asana.com/-/oauth_authorize',token:'https://app.asana.com/-/oauth_token',pkce:false,secret:true},
  linear:{auth:'https://linear.app/oauth/authorize',token:'https://api.linear.app/oauth/token',pkce:true,secret:true}
};
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&a===b;
const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const basic=(id,secret)=>'Basic '+Buffer.from(`${id}:${secret}`).toString('base64');

export function createConnectors(storeDir){
  const configFile=join(storeDir,'connector-config.json'),tokenFile=join(storeDir,'connector-tokens.json');
  let config={},tokens={};
  const states=new Map(),trelloRequests=new Map();
  async function save(path,value){await mkdir(storeDir,{recursive:true,mode:0o700});await writeFile(path,JSON.stringify(value),{mode:0o600});try{await chmod(path,0o600)}catch{}}
  async function load(){try{config=JSON.parse(await readFile(configFile,'utf8'))}catch{}try{tokens=JSON.parse(await readFile(tokenFile,'utf8'))}catch{}}
  function overview(){return Object.entries(services).map(([name,item])=>({name,provider:item.provider,configured:!!config[item.provider]?.clientId,clientId:config[item.provider]?.clientId||'',connected:!!tokens[name]?.access_token||!!tokens[name]?.oauth_token,email:tokens[name]?.email||'',redirectUri:`${CALLBACK}/${item.provider}`,scopes:item.scopes}))}
  async function readBody(req,max=100000){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>max)throw Error('request_too_large');parts.push(part)}return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}')}
  async function json(url,options={}){const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(60000)});const text=await response.text();let body;try{body=JSON.parse(text)}catch{body=Object.fromEntries(new URLSearchParams(text))}if(!response.ok||body.error)throw Error(body.error_description||body.error||`oauth_http_${response.status}`);return body}
  function trelloHeader(method,url,params,client,secret,token='',tokenSecret=''){
    const oauth={oauth_consumer_key:client,oauth_nonce:randomBytes(12).toString('hex'),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_version:'1.0'};
    if(token)oauth.oauth_token=token;
    const all={...params,...oauth},baseParams=Object.keys(all).sort().map(key=>`${encode(key)}=${encode(all[key])}`).join('&');
    const base=`${method.toUpperCase()}&${encode(url)}&${encode(baseParams)}`,key=`${encode(secret)}&${encode(tokenSecret)}`;
    oauth.oauth_signature=createHmac('sha1',key).update(base).digest('base64');
    return 'OAuth '+Object.entries(oauth).map(([key,value])=>`${encode(key)}="${encode(value)}"`).join(', ');
  }
  async function start(provider,service){
    const settings=config[provider],definition=providers[provider];
    if(!settings?.clientId||!definition)throw Error('oauth_client_not_configured');
    const redirectUri=`${CALLBACK}/${provider}`;
    if(provider==='trello'){
      const endpoint='https://trello.com/1/OAuthGetRequestToken';
      const response=await fetch(endpoint,{headers:{Authorization:trelloHeader('GET',endpoint,{oauth_callback:redirectUri},settings.clientId,settings.clientSecret)}});
      const values=new URLSearchParams(await response.text());if(!response.ok||values.has('error'))throw Error(values.get('error')||'trello_oauth_failed');
      const oauthToken=values.get('oauth_token'),oauthSecret=values.get('oauth_token_secret');if(!oauthToken||!oauthSecret)throw Error('trello_request_token_failed');trelloRequests.set(oauthToken,{oauthSecret,service});
      const url=new URL('https://trello.com/1/OAuthAuthorizeToken');url.search=new URLSearchParams({oauth_token:oauthToken,name:'AI Team Office',scope:'read,write',expiration:'never'}).toString();return url.href;
    }
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');states.set(state,{provider,service,redirectUri,verifier,expires:Date.now()+10*60*1000});
    const url=new URL(definition.auth),params={client_id:settings.clientId,redirect_uri:redirectUri,response_type:'code',state,...definition.extra};
    const item=services[service];if(item.scopes.length)params.scope=item.scopes.join(' ');
    if(definition.pkce){params.code_challenge=createHash('sha256').update(verifier).digest('base64url');params.code_challenge_method='S256'}
    if(provider==='asana')params.scope=item.scopes.join(' ');
    url.search=new URLSearchParams(params).toString();return url.href;
  }
  async function exchange(provider,service,code,state){
    const settings=config[provider],definition=providers[provider],pending=states.get(state);
    if(!pending||pending.provider!==provider||pending.service!==service||pending.expires<Date.now())throw Error('oauth_state_invalid');states.delete(state);
    const body={grant_type:'authorization_code',code,client_id:settings.clientId,redirect_uri:pending.redirectUri};if(settings.clientSecret)body.client_secret=settings.clientSecret;if(definition.pkce)body.code_verifier=pending.verifier;
    const headers={'content-type':definition.json?'application/json':'application/x-www-form-urlencoded','accept':'application/json'};
    if(definition.basic){headers.authorization=basic(settings.clientId,settings.clientSecret);delete body.client_secret}
    const response=await json(definition.token,{method:'POST',headers,body:definition.json?JSON.stringify(body):new URLSearchParams(body)});
    tokens[service]={...response,provider,connected_at:new Date().toISOString(),service};await save(tokenFile,tokens);return tokens[service];
  }
  async function handle(req,res,url){
    if(req.method==='GET'&&url.pathname==='/api/connectors'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({items:overview()}));return true}
    if(req.method==='POST'&&url.pathname==='/api/connectors/config'){
      const data=await readBody(req);const provider=String(data.provider||''),settings={clientId:String(data.clientId||'').trim(),clientSecret:String(data.clientSecret||'')};
      if(!providers[provider]&&provider!=='trello')throw Error('connector_invalid');if(!settings.clientId||settings.clientId.length>500||settings.clientSecret.length>2000)throw Error('connector_credentials_invalid');settings.clientSecret=settings.clientSecret||config[provider]?.clientSecret||'';if((providers[provider]?.secret||provider==='trello')&&!settings.clientSecret)throw Error('client_secret_required');
      config[provider]=settings;await save(configFile,config);res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true,items:overview()}));return true;
    }
    const startMatch=url.pathname.match(/^\/api\/connectors\/([a-z-]+)\/start$/);
    if(req.method==='POST'&&startMatch){const service=String((await readBody(req)).service||''),provider=startMatch[1];if(services[service]?.provider!==provider)throw Error('connector_invalid');const authUrl=await start(provider,service);res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({url:authUrl}));return true}
    if(req.method==='GET'&&url.pathname.startsWith('/oauth/callback/')){
      const provider=url.pathname.split('/').pop();let service='',connected;
      try{
        if(provider==='trello'){
          const oauthToken=url.searchParams.get('oauth_token'),oauthVerifier=url.searchParams.get('oauth_verifier'),pending=trelloRequests.get(oauthToken);if(!pending||!oauthVerifier)throw Error('oauth_state_invalid');trelloRequests.delete(oauthToken);service=pending.service;
          const endpoint='https://trello.com/1/OAuthGetAccessToken',params={oauth_token:oauthToken,oauth_verifier:oauthVerifier};const response=await fetch(endpoint,{headers:{Authorization:trelloHeader('GET',endpoint,params,config.trello.clientId,config.trello.clientSecret,oauthToken,pending.oauthSecret)}});const values=new URLSearchParams(await response.text());if(!response.ok||values.has('error'))throw Error(values.get('error')||'trello_oauth_failed');tokens[service]={provider,access_token:values.get('oauth_token'),token_secret:values.get('oauth_token_secret'),connected_at:new Date().toISOString(),service};await save(tokenFile,tokens);connected=true;
        }else{
          const state=url.searchParams.get('state'),pending=states.get(state);service=pending?.service||'';if(url.searchParams.has('error'))throw Error(url.searchParams.get('error'));if(!pending)throw Error('oauth_state_invalid');connected=await exchange(provider,service,url.searchParams.get('code'),state);
        }
        const isMobile=process.env.OFFICE_MOBILE==='1';const done=isMobile?'<script>location.replace("ai-team-office://connector-callback")</script><p>AI 팀 오피스로 돌아가는 중입니다.</p>':'<script>if(window.opener)window.opener.postMessage({type:"connector-connected"},location.origin);setTimeout(()=>window.close(),700)</script><p>연결되었습니다. 이 창을 닫고 오피스로 돌아가세요.</p>';
        res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<meta name="viewport" content="width=device-width"><title>커넥터 연결 완료</title><h2>${service} 연결 완료</h2>${done}`);return true;
      }catch(error){res.writeHead(400,{'content-type':'text/html; charset=utf-8'}).end(`<meta name="viewport" content="width=device-width"><h2>연결을 완료하지 못했습니다</h2><p>${String(error.message||'oauth_failed').replace(/[&<>]/g,'')}</p><button onclick="window.close()">창 닫기</button>`);return true}
    }
    if(req.method==='POST'&&url.pathname==='/api/connectors/disconnect'){
      const {service}=await readBody(req);delete tokens[service];await save(tokenFile,tokens);res.writeHead(200,{'content-type':'application/json'}).end('{"ok":true}');return true;
    }
    return false;
  }
  return{load,overview,handle};
}
