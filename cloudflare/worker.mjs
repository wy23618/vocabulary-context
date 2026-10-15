import { createServer } from 'node:http';
import { handleAsNodeRequest } from 'cloudflare:node';
import { Repository } from '../server/repository.mjs';
import { createService } from '../server/service.mjs';
import { createRuntime } from '../server/index.mjs';
import { DurableDatabase } from './database.mjs';
import widget from '../web/dist/widget.html';
import skill from '../skills/vocabulary-context/SKILL.md';
import schema from './schema.sql';
import {restoreEmptyStore} from './restore.mjs';

export class VocabularyLibrary {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.queue=Promise.resolve();
    ctx.storage.transactionSync(()=>ctx.storage.sql.exec(schema));
    const database=new DurableDatabase(ctx.storage);
    const repository=Object.create(Repository.prototype);
    repository.db=database;repository.transaction=fn=>ctx.storage.transactionSync(fn);repository.close=()=>{};
    const service=createService({repository});
    const config={publicUrl:env.VOCAB_PUBLIC_URL,ownerPassword:env.VOCAB_OWNER_PASSWORD||'',redirectUris:(env.VOCAB_REDIRECT_URIS||'https://chatgpt.com/connector_platform_oauth_redirect').split(',').map(x=>x.trim()),database,readUi:()=>widget,readSkill:()=>skill};
    const runtime=createRuntime({service,config});
    this.server=createServer(runtime.app);
    this.server.listen(0);
    this.port=this.server.address().port;
  }
  fetch(request){
    const task=this.queue.then(async()=>{
      if(new URL(request.url).pathname==='/_maintenance/restore')return restoreEmptyStore(request,this.ctx.storage,this.env.MIGRATION_TOKEN,{format:'vocabulary-cloudflare-backup',tables:['words','events','objects','requests']});
      const result=await handleAsNodeRequest(this.port,request);
      return new Response(await result.arrayBuffer(),{status:result.status,headers:result.headers});
    });
    this.queue=task.catch(()=>{});return task;
  }
}
export default {
  fetch(request,env){
    if(new URL(request.url).pathname==='/')return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vocabulary Context</title><body style="font:18px system-ui;background:#f6f7f1;color:#252a25;max-width:700px;margin:12vh auto;padding:24px"><h1>Vocabulary Context</h1><p>在阅读与交流中学习英语，把单词放回语境。</p><p>这是供兼容 MCP Apps 的宿主连接的个人词库服务。学习界面在宿主中打开。</p><p>连接地址：<code>/mcp</code> · OAuth 2.1 / PKCE</p><a href="/health">服务状态</a></body></html>',{headers:{'Content-Type':'text/html;charset=utf-8','X-Content-Type-Options':'nosniff'}});
    if(!env.VOCAB_PUBLIC_URL)return Response.json({error:'service_not_configured'},{status:503});
    return env.VOCAB_LIBRARY.get(env.VOCAB_LIBRARY.idFromName('personal-library-v1')).fetch(request);
  }
};
