import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createRuntime } from '../server/index.mjs';

// Real Chrome navigation through the production consent form and a separate
// local callback origin. This proves browser redirects, not ChatGPT host login.
test('Chrome consent can follow its cross-origin callback without CSP blocking',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'vocab-auth-browser-'));
  const password=randomBytes(24).toString('hex');
  let callback;
  const callbackServer=createServer((req,res)=>{
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname!=='/connector_platform_oauth_redirect'){res.writeHead(204);res.end();return;}
    callback=url;
    res.writeHead(200,{'content-type':'text/html'});res.end('<p>Callback received</p>');
  });
  await new Promise(r=>callbackServer.listen(0,'127.0.0.1',r));
  const callbackUri=`http://127.0.0.1:${callbackServer.address().port}/connector_platform_oauth_redirect`;
  let runtime;
  const http=createServer((req,res)=>runtime.app(req,res));
  await new Promise(r=>http.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${http.address().port}`;
  runtime=createRuntime({config:{dataDir,publicUrl:base,ownerPassword:password,redirectUris:[callbackUri]}});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  t.after(async()=>{
    await browser.close();await runtime.close();await new Promise(r=>http.close(r));await new Promise(r=>callbackServer.close(r));
    assert.ok(resolve(dataDir).startsWith(resolve(tmpdir())+sep));rmSync(dataDir,{recursive:true,force:true});
  });
  const client=await(await fetch(`${base}/oauth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[callbackUri],token_endpoint_auth_method:'none'})})).json();
  const verifier=randomBytes(32).toString('base64url');
  const query=new URLSearchParams({client_id:client.client_id,redirect_uri:callbackUri,response_type:'code',resource:`${base}/mcp`,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),state:'browser-regression-state'});
  const page=await browser.newPage();
  const browserErrors=[];page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text());});
  await page.goto(`${base}/oauth/authorize?${query}`);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button',{name:'连接词库'}).click();
  try {await page.getByText('Callback received').waitFor({timeout:4000});}
  catch {assert.fail(`Consent did not navigate to the callback. Browser errors: ${browserErrors.join(' | ')}`);}
  assert.equal(callback.searchParams.get('state'),'browser-regression-state');
  assert.equal(callback.searchParams.get('iss'),base);assert.ok(callback.searchParams.get('code'));
  assert.equal(browserErrors.some(message=>message.includes('form-action')),false);
  const grant=await fetch(`${base}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:callbackUri,resource:`${base}/mcp`,code:callback.searchParams.get('code'),code_verifier:verifier})});
  assert.equal(grant.status,200);const tokens=await grant.json();assert.ok(tokens.access_token);
});
