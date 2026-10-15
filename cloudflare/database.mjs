/** DatabaseSync subset consumed by the existing repository and OAuth service. */
export class DurableDatabase {
  constructor(storage){this.storage=storage;}
  exec(sql){
    for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean)) {
      if(/^PRAGMA/i.test(statement))continue;
      this.storage.sql.exec(statement);
    }
  }
  prepare(sql){
    const run=(args)=>this.storage.sql.exec(sql,...args);
    return {get:(...args)=>run(args).toArray()[0],all:(...args)=>run(args).toArray(),run:(...args)=>{const c=run(args);return {changes:c.rowsWritten};}};
  }
  close(){}
}
