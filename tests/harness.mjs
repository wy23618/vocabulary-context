// Local MCP Apps protocol harness only. NOT a ChatGPT installation or a product website.
import express from 'express';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tools } from '../server/schemas.mjs';
export async function startHarness(service,{port=0,platform='desktop'}={}) {
  const app=express();const messages=[];let offline=false;
  app.use(express.json({limit:'3mb'}));
  app.get('/',(_req,res)=>res.type('html').send(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCP App local protocol test</title><style>html,body{margin:0;background:#F6F7F1}#label{font:11px system-ui;padding:4px 10px;color:#70776e}iframe{width:100%;height:calc(100vh - 22px);border:0;display:block}</style><div id="label">LOCAL PROTOCOL HARNESS · Not a ChatGPT host</div><iframe id="app" src="about:blank" sandbox="allow-scripts allow-same-origin"></iframe><script>
  const iframe=document.querySelector('iframe');window.messages=[];window.modelContexts=[];window.sentFollowUps=[];window.sizeNotifications=[];window.theme='light';window.platform=${JSON.stringify(platform)};
  iframe.src='/widget';iframe.addEventListener('load',()=>{iframe.contentWindow.openai={sendFollowUpMessage:async({prompt,scrollToBottom})=>window.sentFollowUps.push({prompt,scrollToBottom})};if(window.platform==='mobile')delete iframe.contentWindow.openai.sendFollowUpMessage});
  function send(method,params){iframe.contentWindow.postMessage({jsonrpc:'2.0',method,params},location.origin)}
  window.sendToolResult=result=>send('ui/notifications/tool-result',result);
  window.setTheme=theme=>{window.theme=theme;send('ui/notifications/host-context-changed',{theme})};
  window.addEventListener('message',async e=>{
    if(e.source!==iframe.contentWindow||e.data?.jsonrpc!=='2.0')return;
    const m=e.data;if(m.id===undefined){if(m.method==='ui/notifications/size-changed')window.sizeNotifications.push(m.params);return;}let result;
    try{
      if(m.method==='ui/initialize')result={protocolVersion:m.params.protocolVersion,hostInfo:{name:'local-test-harness',version:'1'},hostCapabilities:{serverTools:{},serverResources:{},openLinks:{}},hostContext:{theme:window.theme,locale:'zh-CN',platform:window.platform,displayMode:'inline',availableDisplayModes:['inline','fullscreen']}};
      else if(m.method==='tools/call')result=await(await fetch('/call',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m.params)})).json();
      else if(m.method==='ui/message'){if(window.rejectMessages)result={isError:true};else{window.messages.push(m.params);await fetch('/message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m.params)});result={};}}
      else if(m.method==='ui/update-model-context'){if(window.rejectModelContext)throw new Error('Model context update unsupported in this test host');window.modelContexts.push(m.params);result={};}
      else if(m.method==='ui/request-display-mode')result={mode:m.params.mode};
      else result={};
      iframe.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result},location.origin);
    }catch(error){iframe.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,error:{code:-32000,message:error.message}},location.origin)}
  });
  </script></html>`));
  app.get('/widget',(_req,res)=>res.type('html').send(readFileSync(new URL('../web/dist/widget.html',import.meta.url),'utf8')));
  app.post('/call',async(req,res)=>{
    if(offline==='transport')return res.json({isError:true,content:[{type:'text',text:'tool call error: tool call failed for `codex_apps/test.list_words`\n\nCaused by:\n    Mcp error: -32603: Internal error'}]});
    if(offline)return res.json({isError:true,content:[{type:'text',text:JSON.stringify({error:{code:'OFFLINE',message:'词库服务不可达。输入已保留，请稍后重试。'}})}]});
    const {name,arguments:args}=req.body;const definition=tools.find(x=>x.name===name);
    try{if(!definition)throw new Error('unknown tool');const input=definition.inputSchema.parse(args||{});const structuredContent=await service.execute(name,input);definition.outputSchema.parse(structuredContent);res.json({structuredContent,content:[]});}
    catch(error){res.json({isError:true,content:[{type:'text',text:JSON.stringify({error:{code:error.code||'INVALID_INPUT',message:error.message,details:error.details}})}]});}
  });
  app.post('/message',(req,res)=>{messages.push(req.body);res.json({});});
  const server=createServer(app);await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${server.address().port}`,messages,setOffline:v=>offline=v,close:()=>new Promise(resolve=>server.close(resolve))};
}
