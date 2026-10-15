import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({ entryPoints: [path.join(root, 'web/main.jsx')], bundle: true, write: false, minify: true, format: 'iife', target: ['es2022'], define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'none' });
const css = await readFile(path.join(root, 'web/styles.css'), 'utf8');
const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text ?? result.outputFiles[0].text;
await mkdir(path.join(root, 'web/dist'), { recursive: true });
await writeFile(path.join(root, 'web/dist/widget.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>Vocabulary Context</title><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`);
console.log('Built self-contained MCP App: web/dist/widget.html');
