import { readFileSync,writeFileSync } from 'node:fs';
const supplied=process.argv[2];
if(!supplied||!/^((plugin_)?asdk_app_|connector_|templated_apps_)[A-Za-z0-9_-]+$/.test(supplied))throw new Error('提供在 ChatGPT 实际注册后取得的技术 ID。不能填写示例或虚构 ID。');
const actual=supplied.replace(/^plugin_asdk_app_/,'asdk_app_');
writeFileSync(new URL('../.app.json',import.meta.url),JSON.stringify({apps:{'vocabulary-context':{id:actual,required:true}}},null,2)+'\n');
const path=new URL('../plugin.json',import.meta.url);const manifest=JSON.parse(readFileSync(path,'utf8'));
manifest.extensions['com.openai'].apps='./.app.json';writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');
console.log('已写入实际 MCP 连接引用。请在本地安装包中核对绑定；这不证明已安装或账号已授权。');
if(actual!==supplied)console.log('按官方注册引用格式移除了浏览器 ID 的 leading plugin_ 前缀。');
