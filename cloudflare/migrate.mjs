import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createBackup} from '../scripts/backup.mjs';

const [mode,fileArg,origin]=process.argv.slice(2),file=resolve(fileArg||'data/cloudflare-backup.json');
if(mode==='export'){
  if(existsSync(file))throw new Error('Backup already exists; choose a new path.');
  const {backupDir}=createBackup(),database=new DatabaseSync(resolve(backupDir,'vocabulary.sqlite'),{readOnly:true});
  try{
    const tables=['words','events','objects','requests'].map(name=>{
      const columns=database.prepare(`PRAGMA table_info(${name})`).all().map(c=>c.name);
      const rows=database.prepare(`SELECT * FROM ${name}`).all().map(row=>columns.map(c=>row[c]));
      return {name,columns,rows};
    });
    const data={format:'vocabulary-cloudflare-backup',version:1,createdAt:new Date().toISOString(),tables};
    const sha256=createHash('sha256').update(JSON.stringify(data)).digest('hex');
    mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify({...data,sha256}),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({file,sha256,counts:Object.fromEntries(tables.map(t=>[t.name,t.rows.length]))}));
  }finally{database.close();}
}else if(mode==='import'){
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw new Error('Expected HTTPS origin without credentials or path.');
  if(!process.env.MIGRATION_TOKEN||process.env.MIGRATION_TOKEN.length<43)throw new Error('MIGRATION_TOKEN must be supplied privately.');
  const body=readFileSync(file,'utf8'),payload=JSON.parse(body),{sha256,...data}=payload;
  if(createHash('sha256').update(JSON.stringify(data)).digest('hex')!==sha256)throw new Error('Backup hash mismatch.');
  const response=await fetch(url.origin+'/_maintenance/restore',{method:'POST',headers:{authorization:'Bearer '+process.env.MIGRATION_TOKEN,'content-type':'application/json'},body,redirect:'error'});
  const result=await response.json();if(!response.ok)throw new Error('Cloud restore rejected: '+(result.error||response.status));
  if(result.sha256!==sha256||JSON.stringify(result.counts)!==JSON.stringify(Object.fromEntries(data.tables.map(t=>[t.name,t.rows.length]))))throw new Error('Cloud receipt mismatch.');
  console.log(JSON.stringify(result));
}else throw new Error('Usage: node --env-file=.env cloudflare/migrate.mjs export <private-file> | import <private-file> <https-origin>');
