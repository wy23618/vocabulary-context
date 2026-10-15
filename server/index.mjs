import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createService } from './service.mjs';
import { tools } from './schemas.mjs';
import { createAuth } from './auth.mjs';
import { loadConfig } from './config.mjs';

export const UI_URI='ui://vocabulary-context/v6/reader.html';
export const UI_COMPAT_URIS=['ui://vocabulary-context/v1/reader.html','ui://vocabulary-context/v2/reader.html','ui://vocabulary-context/v3/reader.html','ui://vocabulary-context/v4/reader.html','ui://vocabulary-context/v5/reader.html'];
const workflow='All model work uses this host subscription. Stage manual/image word imports for reviewed confirmation. In enabled conversation practice, capture_conversation_word implements standing user authorization to collect words explicitly asked about or not understood: explain, capture with actual user evidence, and do not demand another import confirmation. For articles: first inspect open_workspace.active_generation or a supplied generation_id. Resume prepared tasks with get_generation and the SAME generation ID, including after a user authorizes a previously blocked UI request; reopen saved tasks without generating again. Only call prepare_article for a genuinely new article request; it freezes targets/config; write real prose; tokenize_article returns tokens[].index: send as word_map[].token_index; annotate content words with Chinese contextual definitions; validate_article, fix errors, save_article. Only saved article is success. Clicking definitions never changes levels. prepare_conversation is independent of reading; record only actual transcript. No API model calls. Image vision is done by host, then import_words_from_image stages real recognized items.';
const skillPath=new URL('../skills/vocabulary-context/SKILL.md',import.meta.url);
const skillUri='skill://vocabulary-context/vocabulary-context/SKILL.md';

export function createMcp(service,config) {
  const server=new McpServer({name:'vocabulary-context',version:'0.1.2'},{instructions:workflow+' Never claim the learning UI opened from a successful tool response alone; the client must successfully load and display its resource.',capabilities:{extensions:{'io.modelcontextprotocol/skills':{}}}});
  for(const [index,uri] of [UI_URI,...UI_COMPAT_URIS].entries()) {
    // Keep prior URIs readable for hosts with cached descriptors. Personal development
    // uses ChatGPT's default sandbox; the tunnel origin is not a hosted component domain.
    server.registerResource(`vocabulary-context-ui-${index}`,uri,{mimeType:'text/html;profile=mcp-app'},async()=>({contents:[{uri,mimeType:'text/html;profile=mcp-app',text:readFileSync(new URL('../web/dist/widget.html',import.meta.url),'utf8'),_meta:{ui:{prefersBorder:false,csp:{connectDomains:[],resourceDomains:[]}},'openai/widgetPrefersBorder':false,'openai/widgetCSP':{connect_domains:[],resource_domains:[]},'openai/widgetDescription':'Personal vocabulary library and contextual reading. Data loading does not confirm the client displayed this component.','openai/ui':{availableDisplayModes:['inline','fullscreen']}}}]}));
  }
  const skill=()=>readFileSync(skillPath,'utf8');
  const entry=()=>({uri:skillUri,frontmatter:{name:'vocabulary-context',description:'Learn postgraduate English vocabulary in natural reading and host conversation using your shared personal word library.'},resources:[{uri:skillUri,digest:`sha256:${createHash('sha256').update(skill()).digest('hex')}`} ]});
  server.registerResource('vocabulary-context-skill',skillUri,{mimeType:'text/markdown'},async()=>({contents:[{uri:skillUri,mimeType:'text/markdown',text:skill()}]}));
  server.server.setRequestHandler(z.object({method:z.literal('skills/list'),params:z.object({cursor:z.string().optional()}).optional()}),async()=>({skills:[entry()]}));
  server.server.setRequestHandler(z.object({method:z.literal('skills/get'),params:z.object({uri:z.literal(skillUri)})}),async()=>({skill:entry()}));
  for(const t of tools) {
    server.registerTool(t.name,{title:t.title,description:t.description,inputSchema:t.inputSchema,outputSchema:t.outputSchema,annotations:t.annotations,_meta:{...(t.ui?{ui:{resourceUri:UI_URI},'openai/outputTemplate':UI_URI,'openai/widgetAccessible':true}:{})}},async(args)=>{
      try {
        const result=await service.execute(t.name,args);
        const summary=t.name==='open_workspace'?'词库数据已读取；这不代表宿主已成功展示学习界面，请检查组件实际加载结果。':result.article?`${result.article.title} · lesson_id=${result.article.lesson_id}`:result.generation?`generation_id=${result.generation.id}；只有 status=saved 才表示文章已保存。`:result.saved_count!==undefined?`已保存 ${result.saved_count} 个词。`:result.valid!==undefined?`校验${result.valid?'通过':'未通过'}；请读取 structuredContent。`:`${t.title}完成；请读取 structuredContent。`;
        return {structuredContent:result,content:[{type:'text',text:summary}]};
      } catch(error) {
        const known=error.code && /^[A-Z_]+$/.test(error.code);
        const payload={error:{code:known?error.code:'SAVE_FAILED',message:known?error.message:'操作未完成，请重试；原数据已保留。',details:known?error.details:undefined}};
        // MCP errors omit structuredContent: clients otherwise validate it against the success schema.
        return {isError:true,content:[{type:'text',text:JSON.stringify(payload)}],_meta:{vocabularyError:payload.error}};
      }
    });
  }
  // MCP SDK 1.32.x serializes only standard fields from registerTool() and
  // silently drops OpenAI's top-level securitySchemes extension. Wrap the SDK's
  // registered list handler using the public replacement API so ChatGPT sees
  // the OAuth contract where its current connector docs require it.
  const registeredListHandler=server.server._requestHandlers.get('tools/list');
  server.server.setRequestHandler(ListToolsRequestSchema,async(request,extra)=>{
    const result=await registeredListHandler(request,extra);
    return {...result,tools:result.tools.map(item=>({...item,securitySchemes:[{type:'oauth2',scopes:['vocabulary:read','vocabulary:write']}]}))};
  });
  return server;
}
export function createRuntime(options={}) {
  const config={...loadConfig(),...options.config};
  const service=options.service||createService({dataDir:config.dataDir});
  const auth=createAuth(config);
  const app=express();app.disable('x-powered-by');
  app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');res.set('Cache-Control','no-store');next();});
  app.use(express.json({limit:'3mb'}));app.use(express.urlencoded({extended:false,limit:'16kb'}));
  auth.install(app);
  app.get('/health',(_req,res)=>res.json({ok:true,service:'vocabulary-context',version:'0.1.2',model_path:'host-subscription-only',login_configured:config.ownerPassword.length>=20}));
  const active=new Set();
  app.post('/mcp',auth.checkRequest,async(req,res)=>{
    const started=performance.now(),method=req.body?.method;
    if(['resources/read','tools/call'].includes(method))res.on('finish',()=>console.log(JSON.stringify({event:'mcp_rpc',method,...(method==='resources/read'?{resourceUri:[UI_URI,...UI_COMPAT_URIS,skillUri].includes(req.body.params?.uri)?req.body.params.uri:'other'}:{tool:tools.some(t=>t.name===req.body.params?.name)?req.body.params.name:'other'}),status:res.statusCode,durationMs:Math.round(performance.now()-started)})));
    // Stateless sessions: every authenticated call has the same authoritative repository.
    // Guard Origin against DNS rebinding, do not rely on device-local browser state.
    if(req.headers.origin && ![config.publicUrl,'https://chatgpt.com','https://chat.openai.com'].includes(req.headers.origin))return res.status(403).json({error:'invalid_origin'});
    const server=createMcp(service,config),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    active.add(transport);
    res.on('close',()=>{active.delete(transport);transport.close().catch(()=>{});server.close().catch(()=>{});});
    try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}catch{if(!res.headersSent)res.status(500).json({error:'mcp_request_failed'});}
  });
  app.all('/mcp',auth.checkRequest,(_req,res)=>res.status(405).set('Allow','POST').end());
  app.use((error,_req,res,_next)=>res.status(error.status===413?413:400).json({error:'invalid_request',message:'输入过大或格式不正确。'}));
  return {app,service,config,close:async()=>{await Promise.all([...active].map(t=>t.close()));auth.close();service.close();}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const runtime=createRuntime();const listener=runtime.app.listen(runtime.config.port,runtime.config.host,()=>{
    console.log(`Vocabulary Context MCP: ${runtime.config.publicUrl}/mcp`);
    console.log(`Data: ${runtime.config.dataDir}`);
    if(runtime.config.ownerPassword.length<20)console.log('未配置个人词库登录密码；OAuth 授权暂不可用，数据没有匿名访问入口。');
  });
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>listener.close(async()=>{await runtime.close();process.exit(0);}));
}
