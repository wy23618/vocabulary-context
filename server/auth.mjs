import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, timingSafeEqual, scryptSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const random=()=>randomBytes(32).toString('base64url');
const hash=x=>createHash('sha256').update(x).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const html=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createAuth({dataDir,publicUrl,ownerPassword,redirectUris,now=()=>Date.now()}) {
  const consentOrigins=new Set([new URL(publicUrl).origin,...redirectUris.map(uri=>new URL(uri).origin)]);
  mkdirSync(dataDir,{recursive:true});
  const db=new DatabaseSync(join(dataDir,'auth.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS auth_records(kind TEXT,key TEXT PRIMARY KEY,value TEXT,expires INTEGER);');
  const put=(kind,key,value,expires)=>db.prepare('INSERT OR REPLACE INTO auth_records VALUES(?,?,?,?)').run(kind,key,JSON.stringify(value),expires);
  const get=(kind,key)=>{const row=db.prepare('SELECT * FROM auth_records WHERE kind=? AND key=?').get(kind,key);return row&&row.expires>now()?JSON.parse(row.value):null;};
  const del=key=>db.prepare('DELETE FROM auth_records WHERE key=?').run(key);
  const scopes='vocabulary:read vocabulary:write';
  const resource=`${publicUrl}/mcp`;
  const challenge=`Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource", scope="${scopes}"`;
  const passSalt=randomBytes(16),passwordHash=ownerPassword?scryptSync(ownerPassword,passSalt,32):null;
  const attempts=new Map();
  function limited(req,res) {
    const key=req.ip||'unknown',current=attempts.get(key)||{count:0,expires:now()+60000};
    if(current.expires<now()){current.count=0;current.expires=now()+60000;}
    current.count++;attempts.set(key,current);
    if(attempts.size>2000) for(const [k,v]of attempts)if(v.expires<now())attempts.delete(k);
    if(current.count>30){res.set('Retry-After','60').status(429).json({error:'rate_limited'});return true;}return false;
  }
  function issue(clientId) {
    const access=random(),refresh=random();
    put('access',hash(access),{clientId,resource,scope:scopes},now()+3600000);
    put('refresh',hash(refresh),{clientId,resource,scope:scopes},now()+30*86400000);
    return {access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope:scopes};
  }
  function checkRequest(req,res,next) {
    const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const data=bearer&&get('access',hash(bearer));
    if(!data||data.resource!==resource){res.set('WWW-Authenticate',challenge).status(401).json({error:'authentication_required',message:'请先连接个人词库账号。'});return;}
    req.auth={token:bearer,clientId:data.clientId,scopes:data.scope.split(' ')};next();
  }
  function install(app) {
    app.get(['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'],(_req,res)=>res.json({resource,authorization_servers:[publicUrl],scopes_supported:scopes.split(' '),resource_name:'Vocabulary Context'}));
    app.get('/.well-known/oauth-authorization-server',(_req,res)=>res.json({issuer:publicUrl,authorization_endpoint:`${publicUrl}/oauth/authorize`,token_endpoint:`${publicUrl}/oauth/token`,registration_endpoint:`${publicUrl}/oauth/register`,revocation_endpoint:`${publicUrl}/oauth/revoke`,response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:scopes.split(' '),authorization_response_iss_parameter_supported:true}));
    app.post('/oauth/register',(req,res)=>{
      if(limited(req,res))return;
      const body=req.body;
      if(!Array.isArray(body.redirect_uris)||!body.redirect_uris.length||body.redirect_uris.some(x=>!redirectUris.includes(x))||!['none',undefined].includes(body.token_endpoint_auth_method))return res.status(400).json({error:'invalid_client_metadata'});
      const clientId=random();const data={client_id:clientId,redirect_uris:body.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],client_name:'ChatGPT'};
      put('client',clientId,data,now()+3650*86400000);res.status(201).json(data);
    });
    app.get('/oauth/authorize',(req,res)=>{
      if(limited(req,res))return;
      const q=req.query,client=get('client',q.client_id);
      if(!client||!client.redirect_uris.includes(q.redirect_uri))return res.status(400).send('连接无效，请重新连接词库。');
      if(q.response_type!=='code'||q.code_challenge_method!=='S256'||!/^[-_a-zA-Z0-9]{43}$/.test(q.code_challenge||'')||q.resource!==resource||!q.state||String(q.state).length>2048)return res.status(400).send('连接参数无效。');
      if(q.scope&&String(q.scope).split(' ').some(s=>!scopes.split(' ').includes(s)))return res.status(400).send('权限范围无效。');
      if(!passwordHash||ownerPassword.length<20)return res.status(503).send('词库尚未配置登录密码，请完成服务配置后重试。');
      const nonce=random(),nonceKey=hash(nonce);put('consent',nonceKey,{clientId:q.client_id,redirect:q.redirect_uri,challenge:q.code_challenge,state:q.state},now()+600000);
      console.log(JSON.stringify({event:'oauth_authorize_issued',pid:process.pid,host:req.get('host')||null,nonceTag:nonceKey.slice(0,12),expiresInSeconds:600}));
      res.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' "+new URL(q.redirect_uri).origin+"; frame-ancestors 'none'").send(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接个人词库</title><style>body{background:#F6F7F1;color:#252A25;font:16px system-ui;max-width:430px;margin:12vh auto;padding:24px}h1{font-size:26px}label,input,button{display:block;width:100%;box-sizing:border-box}input{margin:12px 0 20px;padding:14px;border:1px solid #DDE3D9;border-radius:10px}button{padding:14px;background:#4F6953;color:white;border:0;border-radius:10px}p{line-height:1.7}</style><h1>Vocabulary Context</h1><p>连接你的个人词库，让电脑和平板共享单词、文章与学习反馈。授权读取和修改这份词库。</p><form method="post" action="/oauth/consent" target="_top"><input type="hidden" name="nonce" value="${html(nonce)}"><label>个人词库密码<input type="password" name="password" required autocomplete="current-password" maxlength="512"></label><button>连接词库</button></form></html>`);
    });
    app.post('/oauth/consent',(req,res)=>{
      if(limited(req,res))return;
      const requestOrigin=req.headers.origin;
      // Some embedded webviews serialize their opaque origin as "null". Consent
      // is still protected by the short-lived, single-use nonce and owner password.
      if(requestOrigin && requestOrigin!=='null') {
        let normalizedOrigin;
        try { normalizedOrigin=new URL(requestOrigin).origin; } catch { return res.status(403).send(`来源不匹配。收到的来源：${html(requestOrigin)}`); }
        if(!consentOrigins.has(normalizedOrigin))return res.status(403).send(`来源不匹配。收到的来源：${html(requestOrigin)}`);
      }
      const {nonce,password}=req.body||{},noncePresent=typeof nonce==='string'&&nonce.length>0,nonceKey=noncePresent?hash(nonce):null,consent=nonceKey&&get('consent',nonceKey);
      console.log(JSON.stringify({event:'oauth_consent_submit',pid:process.pid,host:req.get('host')||null,origin:req.get('origin')||null,noncePresent,nonceTag:nonceKey?.slice(0,12)||null,recordFound:Boolean(consent)}));
      if(!noncePresent)return res.status(400).send('提交内容没有授权编号。请关闭此页，从 ChatGPT 插件设置重新发起授权。');
      if(!consent) {
        const completed=get('consent-completed',nonceKey);
        if(completed) {
          console.log(JSON.stringify({event:'oauth_consent_retry',pid:process.pid,nonceTag:nonceKey.slice(0,12)}));
          return res.redirect(302,completed.redirectUrl);
        }
        return res.status(400).send('授权编号与当前记录不匹配或已过期。请关闭此页，从 ChatGPT 插件设置重新发起授权。');
      }
      if(typeof password!=='string')return res.status(400).send('授权表单没有收到密码。请重新发起授权后再提交。');
      if(password.length>512)return res.status(400).send('密码输入长度异常，请重新发起授权。');
      if(!passwordHash)return res.status(503).send('词库登录尚未配置，请先启动项目服务。');
      const actual=scryptSync(password,passSalt,32);
      if(!timingSafeEqual(actual,passwordHash))return res.status(403).send('密码不正确。请返回连接流程重试。');
      del(nonceKey);const code=random();put('code',hash(code),consent,now()+120000);
      const redirect=new URL(consent.redirect);redirect.searchParams.set('code',code);redirect.searchParams.set('state',consent.state);redirect.searchParams.set('iss',publicUrl);
      const redirectUrl=redirect.href;
      put('consent-completed',nonceKey,{redirectUrl},now()+120000);
      res.redirect(302,redirectUrl);
    });
    app.post('/oauth/token',(req,res)=>{
      if(limited(req,res))return;
      res.set('Cache-Control','no-store');const b=req.body;
      const client=b.client_id&&get('client',b.client_id);
      console.log(JSON.stringify({event:'oauth_token_request',pid:process.pid,grantType:b.grant_type||null,clientKnown:Boolean(client),codePresent:typeof b.code==='string',codeTag:typeof b.code==='string'?hash(b.code).slice(0,12):null,resourceMatches:b.resource===resource,contentType:req.get('content-type')||null}));
      if(b.resource!==resource)return res.status(400).json({error:'invalid_target'});
      if(!client)return res.status(400).json({error:'invalid_client'});
      if(b.grant_type==='authorization_code') {
        const code=typeof b.code==='string'&&get('code',hash(b.code));
        const verifierValid=typeof b.code_verifier==='string'&&/^[-._~a-zA-Z0-9]{43,128}$/.test(b.code_verifier);
        const checks={codeFound:Boolean(code),clientMatches:Boolean(code&&code.clientId===b.client_id),redirectMatches:Boolean(code&&code.redirect===b.redirect_uri),verifierValid,pkceMatches:Boolean(code&&verifierValid&&equal(createHash('sha256').update(b.code_verifier).digest('base64url'),code.challenge))};
        if(!checks.codeFound||!checks.clientMatches||!checks.redirectMatches||!checks.verifierValid||!checks.pkceMatches){console.log(JSON.stringify({event:'oauth_token_rejected',pid:process.pid,codeTag:typeof b.code==='string'?hash(b.code).slice(0,12):null,...checks}));return res.status(400).json({error:'invalid_grant'});}
        del(hash(b.code));const tokens=issue(b.client_id);console.log(JSON.stringify({event:'oauth_token_issued',pid:process.pid,codeTag:hash(b.code).slice(0,12)}));return res.json(tokens);
      }
      if(b.grant_type==='refresh_token') {
        const record=typeof b.refresh_token==='string'&&get('refresh',hash(b.refresh_token));
        if(!record||record.clientId!==b.client_id)return res.status(400).json({error:'invalid_grant'});
        del(hash(b.refresh_token));return res.json(issue(b.client_id));
      }
      res.status(400).json({error:'unsupported_grant_type'});
    });
    app.post('/oauth/revoke',(req,res)=>{if(limited(req,res))return;if(typeof req.body.token==='string')del(hash(req.body.token));res.status(200).end();});
  }
  return {install,checkRequest,close:()=>db.close()};
}
