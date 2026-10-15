import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { publishable } from './package-files.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const files = [
  '.env.example', '.dev.vars.example', '.gitignore', 'README.md', 'START-HERE.md', 'wrangler.jsonc',
  'package.json', 'package-lock.json', 'plugin.json', 'mcp.json',
  'deploy', 'docs', 'cloudflare', 'scripts', 'server', 'shared', 'skills', 'web',
];
const entries = {};

function add(file) {
  const normalized = file.replaceAll('\\', '/');
  entries[normalized] = new Uint8Array(readFileSync(join(root, file)));
}

function walk(directory) {
  for (const item of readdirSync(join(root, directory), { withFileTypes: true })) {
    const file = join(directory, item.name);
    if (!publishable(file)) continue;
    if (item.isDirectory()) walk(file);
    else add(file);
  }
}

for (const path of files) {
  if (['deploy','docs','cloudflare','scripts','server','shared','skills','web'].includes(path)) walk(path);
  else add(path);
}

const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
const output = join(outDir, `vocabulary-context-self-hosted-${version}.zip`);
writeFileSync(output, zipSync(entries, { level: 6 }));
console.log(`Self-hosted project package: ${relative(root, output)}`);
console.log('The archive excludes .env, data, databases, logs, attachments, dependencies, and generated files.');
