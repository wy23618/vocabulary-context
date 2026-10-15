import { randomBytes,createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadConfig } from '../server/config.mjs';
import { UI_URI,UI_COMPAT_URIS } from '../server/index.mjs';
const config=loadConfig(),base=config.publicUrl;
const checked=async(url,options,status=200)=>{const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});if(r.status!==status)throw new Error(`${new URL(url).pathname}: expected ${status}, got ${r.status}`);return r;};
const json=body=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
await checked(`${base}/mcp`,json({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),401);
const resource=await(await checked(`${base}/.well-known/oauth-protected-resource`)).json();
if(resource.resource!==`${base}/mcp`)throw new Error('OAuth service address mismatch');
const redirect=config.redirectUris[0];
const client=await(await checked(`${base}/oauth/register`,json({redirect_uris:[redirect],token_endpoint_auth_method:'none'}),201)).json();
const verifier=randomBytes(32).toString('base64url');
const query=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',resource:resource.resource,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),state:randomBytes(12).toString('hex')});
const page=await(await checked(`${base}/oauth/authorize?${query}`)).text();const nonce=page.match(/name="nonce" value="([^"]+)"/)?.[1];if(!nonce)throw new Error('OAuth consent form unavailable');
const grant=await checked(`${base}/oauth/consent`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:base},body:new URLSearchParams({nonce,password:config.ownerPassword}),redirect:'manual'},302);
const callback=new URL(grant.headers.get('location'));if(callback.searchParams.get('iss')!==base)throw new Error('OAuth issuer mismatch');
const tokens=await(await checked(`${base}/oauth/token`,json({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:redirect,code:callback.searchParams.get('code'),code_verifier:verifier,resource:resource.resource}))).json();
const mcp=new Client({name:'Vocabulary Context protected HTTPS verification',version:'1'});
try {
  await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{authorization:`Bearer ${tokens.access_token}`}}}));
  const catalog=await mcp.listTools();const workspace=await mcp.callTool({name:'open_workspace',arguments:{}});if(workspace.isError)throw new Error('Workspace failed');
  for(const uri of [UI_URI,...UI_COMPAT_URIS]){const ui=await mcp.readResource({uri});if(!ui.contents[0]?.text?.includes('Vocabulary Context'))throw new Error(`UI resource unavailable: ${uri}`);}
  console.log(`HTTPS verified: ${base}/mcp`);console.log(`Anonymous blocked; OAuth/PKCE completed; ${catalog.tools.length} MCP tools and bundled UI read successfully.`);
  console.log('No library mutations performed. This verifies service transport, not ChatGPT desktop/tablet installation.');
} finally {
  await mcp.close();
  for(const token of [tokens.access_token,tokens.refresh_token])await checked(`${base}/oauth/revoke`,json({token}));
}
