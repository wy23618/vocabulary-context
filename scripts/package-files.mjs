import {basename} from 'node:path';

export function publishable(path){
  const normalized=path.replaceAll('\\','/'),parts=normalized.split('/'),name=basename(path);
  if(parts.some(p=>['node_modules','data','.git','.wrangler','.runtime','.cache','.tmp','test-results','previews'].includes(p)))return false;
  if(/\.(?:sqlite(?:-wal|-shm)?|db|log|tmp|pem|key|p12|pfx|dump|enc)$/i.test(name))return false;
  if(name.startsWith('.env')&&!name.endsWith('.example'))return false;
  if(name.startsWith('.dev.vars')&&!name.endsWith('.example'))return false;
  return true;
}
