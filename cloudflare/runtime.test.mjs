import {readdirSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('Workers runtime: OAuth PKCE, MCP tools, durable library, conflict rollback and UI resource',async()=>{
  const base='https://vocabulary.test',password='synthetic-test-password-'+randomBytes(16).toString('hex'),redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:"test-worker",modules:[{type:'ESModule',path:'dist/worker/worker.js'},...readdirSync('dist/worker').filter(x=>/\.(sql|html|md)$/.test(x)&&x!=='README.md').map(x=>({type:'Text',path:'dist/worker/'+x}))],compatibilityDate:'2026-10-15',compatibilityFlags:['nodejs_compat'],durableObjects:{VOCAB_LIBRARY:{className:'VocabularyLibrary',useSQLite:true}},bindings:{VOCAB_PUBLIC_URL:base,VOCAB_OWNER_PASSWORD:password,VOCAB_REDIRECT_URIS:redirect,MIGRATION_TOKEN:'m'.repeat(48)}}]}));
  const request=(path,options)=>mf.dispatchFetch(base+path,options);
  const post=(path,body,headers={})=>request(path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    assert.equal((await request('/health')).status,200);
    assert.equal((await post('/mcp',{})).status,401);
    const source=new DatabaseSync(':memory:');source.exec(readFileSync('cloudflare/schema.sql','utf8'));
    const tables=['words','events','objects','requests'].map(name=>({name,columns:source.prepare(`PRAGMA table_info(${name})`).all().map(c=>c.name),rows:[]}));source.close();
    const data={format:'vocabulary-cloudflare-backup',version:1,tables};
    const backup={...data,sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
    assert.equal((await post('/_maintenance/restore',backup)).status,404);
    const auth={authorization:'Bearer '+'m'.repeat(48)};
    const invalidData=structuredClone(data);invalidData.tables[0].rows=[['test-a','duplicate',0,'{}'],['test-b','duplicate',0,'{}']];
    const invalid={...invalidData,sha256:createHash('sha256').update(JSON.stringify(invalidData)).digest('hex')};
    assert.equal((await post('/_maintenance/restore',invalid,auth)).status,409);
    const restored=await post('/_maintenance/restore',backup,auth);assert.equal(restored.status,200,await restored.clone().text());
    assert.equal((await post('/_maintenance/restore',backup,auth)).status,409);
    const client=await (await post('/oauth/register',{redirect_uris:[redirect],token_endpoint_auth_method:'none'})).json();
    const verifier=randomBytes(32).toString('base64url');
    const query=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',resource:base+'/mcp',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),state:'test',scope:'vocabulary:read vocabulary:write'});
    const page=await request('/oauth/authorize?'+query),html=await page.text();assert.equal(page.status,200,html);
    const nonce=html.match(/name="nonce" value="([^"]+)"/)[1];
    const consent=await request('/oauth/consent',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:base},body:new URLSearchParams({nonce,password}).toString(),redirect:'manual'});
    assert.equal(consent.status,302,await consent.clone().text());
    const code=new URL(consent.headers.get('location')).searchParams.get('code');
    const tokenResult=await post('/oauth/token',{grant_type:'authorization_code',client_id:client.client_id,redirect_uri:redirect,code,code_verifier:verifier,resource:base+'/mcp'});
    const tokens=await tokenResult.json();assert.equal(tokenResult.status,200,JSON.stringify(tokens));
    let id=0;
    const rpc=async(method,params)=>{
      const r=await post('/mcp',{jsonrpc:'2.0',id:++id,method,params},{authorization:'Bearer '+tokens.access_token,accept:'application/json, text/event-stream'});
      const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.ok(!body.error,JSON.stringify(body));return body.result;
    };
    const catalog=await rpc('tools/list',{});assert.ok(catalog.tools.length>=29);
    const call=async(name,args={})=>rpc('tools/call',{name,arguments:args});
    assert.equal((await call('open_workspace')).structuredContent.words.length,0);
    const staged=(await call('add_words',{text:'retain\ncompelling',request_id:'cloud-stage'})).structuredContent;
    const confirmed=await call('confirm_import',{import_id:staged.import_id,items:staged.items.map(x=>({id:x.id,word:x.word,level:2,included:true,user_note:x.user_note})),request_id:'cloud-confirm'});
    assert.ok(!confirmed.isError,JSON.stringify(confirmed));
    const words=(await call('list_words')).structuredContent.words;assert.equal(words.length,2);
    const word=words[0];
    assert.ok(!(await call('update_familiarity',{word_id:word.id,level:3,expected_version:word.version,request_id:'cloud-update'})).isError);
    const stale=await call('update_familiarity',{word_id:word.id,level:0,expected_version:word.version,request_id:'cloud-stale'});assert.equal(stale.isError,true);
    assert.equal((await call('list_words')).structuredContent.words.find(w=>w.id===word.id).familiarity_level,3);
    const ui=await rpc('resources/read',{uri:'ui://vocabulary-context/v6/reader.html'});assert.match(ui.contents[0].text,/Vocabulary Context/);
    const skill=await rpc('resources/read',{uri:'skill://vocabulary-context/vocabulary-context/SKILL.md'});assert.match(skill.contents[0].text,/subscription/);
  }finally{await mf.dispose();}
});
