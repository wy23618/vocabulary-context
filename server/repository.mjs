import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}};
function lifecycle(dataDir,fn) {
  mkdirSync(dataDir,{recursive:true});const lock=join(dataDir,'.vocabulary-lifecycle.lock');
  if(existsSync(lock)) {let owner;try{owner=JSON.parse(readFileSync(lock,'utf8'));}catch{throw new Error('数据正在维护，稍后再试。');}if(alive(owner.pid))throw new Error('数据正在维护，稍后再试。');unlinkSync(lock);}
  writeFileSync(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});
  try{return fn();}finally{unlinkSync(lock);}
}
/** Maintenance is exclusive with repository startup; live leases prevent replacing an open DB. */
export function withStoppedRepository(dataDir,fn) {
  return lifecycle(dataDir,()=>{
    for(const filename of readdirSync(dataDir).filter(x=>x.startsWith('.vocabulary-open-')&&x.endsWith('.lease'))){const path=join(dataDir,filename);let lease;try{lease=JSON.parse(readFileSync(path,'utf8'));}catch{throw new Error('无法确认服务停止状态，请先关闭服务。');}if(alive(lease.pid))throw new Error('词库服务仍在运行，请先停止服务再恢复。');unlinkSync(path);}
    return fn();
  });
}

/** Durable SQLite store. One file, WAL + immediate transactions; installation and data are separate. */
export class Repository {
  constructor(dataDir) {
    lifecycle(dataDir,()=>{
      this.path = join(dataDir, 'vocabulary.sqlite');
      this.db = new DatabaseSync(this.path);
      if(this.db.prepare('PRAGMA user_version').get().user_version>1){this.db.close();throw new Error('词库由更新版本创建，请升级插件后再打开。');}
      try{this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS words(id TEXT PRIMARY KEY, normalized TEXT UNIQUE NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, word_id TEXT NOT NULL, type TEXT NOT NULL, timestamp TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_word ON events(word_id,timestamp);
      CREATE TABLE IF NOT EXISTS objects(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,result TEXT NOT NULL);
      INSERT OR IGNORE INTO migrations VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      PRAGMA user_version=1;`);
      this.lease=join(dataDir,`.vocabulary-open-${process.pid}-${randomUUID()}.lease`);writeFileSync(this.lease,JSON.stringify({pid:process.pid,opened_at:new Date().toISOString()}),{flag:'wx'});
      }catch(error){this.db.close();throw error;}
    });
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  allWords(includeDeleted = false) {
    return this.db.prepare(`SELECT data FROM words ${includeDeleted ? '' : 'WHERE deleted=0'}`).all().map(x => JSON.parse(x.data));
  }
  word(id, includeDeleted = false) {
    const row = this.db.prepare(`SELECT data FROM words WHERE id=? ${includeDeleted ? '' : 'AND deleted=0'}`).get(id);
    return row ? JSON.parse(row.data) : null;
  }
  byNormalized(normalized, includeDeleted = false) {
    const row = this.db.prepare(`SELECT data FROM words WHERE normalized=? ${includeDeleted ? '' : 'AND deleted=0'}`).get(normalized);
    return row ? JSON.parse(row.data) : null;
  }
  putWord(word) {
    this.db.prepare('INSERT INTO words(id,normalized,deleted,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET normalized=excluded.normalized,deleted=excluded.deleted,data=excluded.data')
      .run(word.id, word.word.toLowerCase(), word.deleted ? 1 : 0, JSON.stringify(word));
  }
  putEvent(event) {
    this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(event.id,event.word_id,event.type,event.timestamp,JSON.stringify(event));
  }
  event(id) { const row=this.db.prepare('SELECT data FROM events WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  events(wordId) { return this.db.prepare('SELECT data FROM events WHERE word_id=? ORDER BY timestamp,id').all(wordId).map(x=>JSON.parse(x.data)); }
  put(kind,id,data) { this.db.prepare('INSERT INTO objects VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind,id,JSON.stringify(data)); }
  get(kind,id) { const row=this.db.prepare('SELECT data FROM objects WHERE kind=? AND id=?').get(kind,id); return row ? JSON.parse(row.data) : null; }
  objects(kind) { return this.db.prepare('SELECT data FROM objects WHERE kind=?').all(kind).map(x=>JSON.parse(x.data)); }
  request(id) { const row=this.db.prepare('SELECT fingerprint,result FROM requests WHERE id=?').get(id); return row ? { fingerprint:row.fingerprint,result:JSON.parse(row.result) } : null; }
  putRequest(id,fingerprint,result) { this.db.prepare('INSERT INTO requests VALUES(?,?,?)').run(id,fingerprint,JSON.stringify(result)); }
  /** Online consistent backup, safe while another connection writes. */
  backup(destination) { this.db.prepare('VACUUM INTO ?').run(destination); return destination; }
  close() { if(this.closed)return;this.db.close();if(this.lease&&existsSync(this.lease))unlinkSync(this.lease);this.closed=true; }
}
