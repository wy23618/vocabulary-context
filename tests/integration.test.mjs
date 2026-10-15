import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes,createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRuntime,UI_URI,UI_COMPAT_URIS } from '../server/index.mjs';
import { tools } from '../server/schemas.mjs';

export async function login(base,password,redirect,consentOrigin=base) {
  const registration=await fetch(`${base}/oauth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[redirect],token_endpoint_auth_method:'none'})});
  assert.equal(registration.status,201);const client=await registration.json();
  const verifier=randomBytes(32).toString('base64url');
  const query=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',resource:`${base}/mcp`,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),state:'integration-state',scope:'vocabulary:read vocabulary:write'});
  const page=await fetch(`${base}/oauth/authorize?${query}`);assert.equal(page.status,200);
  const html=await page.text();assert.match(html,/<form[^>]+target="_top"/);
  const nonce=html.match(/name="nonce" value="([^"]+)"/)[1];
  const consentRequest={method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:consentOrigin},body:new URLSearchParams({nonce,password}),redirect:'manual'};
  const granted=await fetch(`${base}/oauth/consent`,consentRequest);assert.equal(granted.status,302);
  const retried=await fetch(`${base}/oauth/consent`,consentRequest);assert.equal(retried.status,302);assert.equal(retried.headers.get('location'),granted.headers.get('location'));
  const callback=new URL(granted.headers.get('location'));assert.equal(callback.searchParams.get('iss'),base);assert.equal(callback.searchParams.get('state'),'integration-state');
  const tokenBody={grant_type:'authorization_code',client_id:client.client_id,redirect_uri:redirect,code:callback.searchParams.get('code'),code_verifier:verifier,resource:`${base}/mcp`};
  const tokens=await fetch(`${base}/oauth/token`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(tokenBody)});assert.equal(tokens.status,200);
  return {tokens:await tokens.json(),tokenBody,client};
}
async function setup(t){
  const dataDir=mkdtempSync(join(tmpdir(),'vocab-mcp-'));const password=randomBytes(24).toString('hex');const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  let runtime;const http=createServer((req,res)=>runtime.app(req,res));await new Promise(r=>http.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${http.address().port}`;
  runtime=createRuntime({config:{dataDir,publicUrl:base,ownerPassword:password,redirectUris:[redirect]}});
  t.after(async()=>{await runtime.close();await new Promise(r=>http.close(r));rmSync(dataDir,{recursive:true,force:true});});
  return {runtime,base,password,redirect};
}
test('OAuth discovery, PKCE, owner consent, audience, replay and refresh protection',async t=>{
  const {base,password,redirect}=await setup(t);
  const denied=await fetch(`${base}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(denied.status,401);assert.match(denied.headers.get('www-authenticate'),/resource_metadata/);
  const resource=await(await fetch(`${base}/.well-known/oauth-protected-resource`)).json();assert.equal(resource.resource,`${base}/mcp`);
  const meta=await(await fetch(`${base}/.well-known/oauth-authorization-server`)).json();assert.deepEqual(meta.code_challenge_methods_supported,['S256']);assert.equal(meta.authorization_response_iss_parameter_supported,true);
  const invalid=await fetch(`${base}/oauth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:['https://attacker.example/callback']})});assert.equal(invalid.status,400);
  const linked=await login(base,password,redirect,new URL(redirect).origin);
  const embedded=await login(base,password,redirect,'null');assert.ok(embedded.tokens.access_token);
  const replay=await fetch(`${base}/oauth/token`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(linked.tokenBody)});assert.equal(replay.status,400);
  const refresh={grant_type:'refresh_token',client_id:linked.client.client_id,refresh_token:linked.tokens.refresh_token,resource:`${base}/mcp`};
  const refreshed=await fetch(`${base}/oauth/token`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(refresh)});assert.equal(refreshed.status,200);
  const again=await fetch(`${base}/oauth/token`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(refresh)});assert.equal(again.status,400);
  const wrong=await fetch(`${base}/oauth/token`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...refresh,resource:'https://attacker.example'})});assert.equal(wrong.status,400);
});
test('cached mobile UI descriptors retain readable resources and default sandbox compatibility',async t=>{
  const {base,password,redirect}=await setup(t),{tokens}=await login(base,password,redirect);
  const client=new Client({name:'cached-ui-descriptor-client',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{authorization:`Bearer ${tokens.access_token}`}}}));
  t.after(()=>client.close());
  const catalog=await client.listTools(),workspaceTool=catalog.tools.find(x=>x.name==='open_workspace');
  assert.equal(workspaceTool._meta.ui.resourceUri,UI_URI);
  assert.equal(workspaceTool._meta['openai/outputTemplate'],UI_URI);
  let currentHtml;
  for(const uri of [UI_URI,...UI_COMPAT_URIS]){
    const resource=await client.readResource({uri}),entry=resource.contents[0];
    assert.equal(entry.uri,uri);assert.equal(entry.mimeType,'text/html;profile=mcp-app');assert.match(entry.text,/Vocabulary Context/);
    assert.equal(entry._meta.ui.domain,undefined);assert.equal(entry._meta['openai/widgetDomain'],undefined);
    assert.deepEqual(entry._meta.ui.csp,{connectDomains:[],resourceDomains:[]});
    assert.deepEqual(entry._meta['openai/widgetCSP'],{connect_domains:[],resource_domains:[]});
    assert.deepEqual(entry._meta['openai/ui'].availableDisplayModes,['inline','fullscreen']);
    if(currentHtml)assert.equal(entry.text,currentHtml);else currentHtml=entry.text;
  }
  const result=await client.callTool({name:'open_workspace',arguments:{}});
  assert.equal(result.isError,undefined);assert.deepEqual(result.structuredContent.words,[]);
  assert.match(result.content[0].text,/不代表宿主已成功展示/);
});
test('real MCP clients share library, validate schemas, dedupe retry and reject stale device edits',async t=>{
  const {base,password,redirect}=await setup(t);const {tokens}=await login(base,password,redirect);
  const desktop=new Client({name:'desktop-protocol-test',version:'1'}),tablet=new Client({name:'tablet-protocol-test',version:'1'});
  for(const client of [desktop,tablet])await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{authorization:`Bearer ${tokens.access_token}`}}}));
  t.after(async()=>{await desktop.close();await tablet.close();});
  const catalog=await desktop.listTools();assert.equal(catalog.tools.length,tools.length);
  for(const tool of catalog.tools){assert.ok(tool.inputSchema);assert.ok(tool.outputSchema);assert.equal(tool.annotations.openWorldHint,false);assert.equal(tool._meta?.securitySchemes,undefined);}
  const rawCatalogResponse=await fetch(`${base}/mcp`,{method:'POST',headers:{authorization:`Bearer ${tokens.access_token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:88,method:'tools/list'})});
  assert.equal(rawCatalogResponse.status,200);const rawCatalog=await rawCatalogResponse.json();assert.deepEqual(rawCatalog.result.tools[0].securitySchemes,[{type:'oauth2',scopes:['vocabulary:read','vocabulary:write']}]);
  const call=async(client,name,args)=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(JSON.stringify(r.structuredContent));const schema=tools.find(x=>x.name===name).outputSchema;assert.equal(schema.safeParse(r.structuredContent).success,true,name);return r.structuredContent;};
  const preview=await call(desktop,'add_words',{text:'retain\ncompelling\nretain',request_id:'integration-import-1'});assert.equal(preview.duplicate_count,1);
  const confirm={import_id:preview.import_id,items:preview.items.map(x=>({id:x.id,word:x.word,level:2,included:true,user_note:x.user_note})),request_id:'integration-confirm-1'};
  const saved=await call(desktop,'confirm_import',confirm);await call(tablet,'confirm_import',confirm);
  const shared=await call(tablet,'list_words',{});assert.equal(shared.words.length,2);assert.equal(shared.words[0].add_count,1);
  const retain=shared.words.find(w=>w.word==='retain');const edited=await call(tablet,'update_familiarity',{word_id:retain.id,level:3,expected_version:retain.version,request_id:'integration-tablet-edit'});assert.equal(edited.word.familiarity_level,3);
  const refreshed=await call(desktop,'list_words',{});assert.equal(refreshed.words.find(w=>w.id===retain.id).familiarity_level,3);
  const stale=await desktop.callTool({name:'update_familiarity',arguments:{word_id:retain.id,level:0,expected_version:retain.version,request_id:'integration-stale-edit'}});assert.equal(stale.isError,true);assert.equal(JSON.parse(stale.content[0].text).error.code,'VERSION_CONFLICT');
  const malformed=await desktop.callTool({name:'update_familiarity',arguments:{word_id:retain.id,level:8,expected_version:retain.version,request_id:'integration-invalid'}});assert.equal(malformed.isError,true);
  const workspace=await call(desktop,'open_workspace',{});assert.equal(workspace.words.length,2);
  const skill=await desktop.readResource({uri:'skill://vocabulary-context/vocabulary-context/SKILL.md'});assert.match(skill.contents[0].text,/subscription/);
});
