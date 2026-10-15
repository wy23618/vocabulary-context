// Explicitly requested live-library load fixture. Excluded from the plugin package.
import assert from 'node:assert/strict';
import { createService } from '../server/service.mjs';
import { createBackup } from '../scripts/backup.mjs';
import { loadConfig } from '../server/config.mjs';

const pool=`abandon ability abnormal abolish absorb abstract abundant academic accelerate access accomplish account accumulate accurate achieve acknowledge acquire adapt adequate adjust administration adopt advance advantage advocate affect aggregate aid allocate alter alternative ambition amend analyze anticipate apparent appeal application apply approach appropriate arbitrary arise arrange assess assign assist associate assume assure attach attain attitude attribute authority available avoid awareness balance barrier benefit bias brief capacity capital capture category cause challenge characteristic circumstance civil clarify classical collapse colleague combine comfort commercial commit community comparable compare compensate compete complex component comprehensive concentrate concept concern conclude concrete conduct conference confidence conflict conform confront consequence considerable consistent constant constitute constrain construct consult consume contemporary content contradict contribute conventional convert convince cooperate coordinate core corporate correspond crucial cultivate culture currency debate decade decline dedicate define demonstrate deny depress derive design despite detect determine develop devote differ dimension discipline discriminate display distinct distribute diverse document dominate durable dynamic economy efficient element eliminate emerge emphasis enable encounter enhance enormous ensure enterprise environment equivalent establish estimate evaluate eventual evident evolve exceed exclude expand expect expense experience expert explicit exploit expose external facilitate factor feature federal finance flexible fluctuate focus foundation framework fundamental gap generate genuine global grant guarantee hypothesis identify illustrate impact implement imply impose incentive incident income indicate individual inevitable influence infrastructure initiative innovate insight institution integrate intellectual intense interact internal interpret investment involve isolate issue justify labor launch layer legislation liberal maintain major manipulate margin mature mechanism medium migrate minor modify monitor motive mutual negative negotiate network neutral nevertheless norm objective obtain occupy occur opportunity oppose option organize original outcome overall participate perceive persist perspective phenomenon physical policy potential practical precise predict preserve primary principle priority proceed process prohibit promote proportion prospect protect pursue qualitative rational react recognize recover reform region regulate reinforce reject relate release relevant reliable require research resolve resource respond restrict retain reveal revenue revise revolution rigid role secure seek select sequence significant similar source specific stable standard status strategy structure submit subsequent substitute sufficient summary supplement supply sustain symbol target technical temporary tend tension theory transform transition trend ultimate undergo underlying unique universal update valid vary vehicle version via violate virtual visible vital voluntary welfare whereas widespread withdraw witness yield`.split(/\s+/);
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
const seedId=`library-load-${date}`,config=loadConfig();
let fixtureTime=new Date(`${date}T04:00:00Z`);
const service=createService({dataDir:config.dataDir,now:()=>fixtureTime});
try{
 const prior=service.repository.get('test_seed',seedId);
 if(prior){console.log(JSON.stringify({already_seeded:true,id:prior.id,added_count:prior.added_count,total:service.repository.allWords().length,backup:prior.backup},null,2));}
 else {
  const originals=service.repository.allWords(true),originalIds=new Set(originals.map(w=>w.id));
  const existing=new Set(originals.map(w=>w.word));
  const candidates=[...new Set(pool)].filter(w=>!existing.has(w)).slice(0,300);
  assert.ok(candidates.length>=250,'词表不足250个新词。');
  const backup=createBackup({dataDir:config.dataDir});
  const added=[];let repeated=0,paused=0;
  for(let offset=0;offset<candidates.length;offset+=10){
   const batch=candidates.slice(offset,offset+10),day=Math.floor(offset/10);
   fixtureTime=new Date(new Date(`${date}T04:00:00Z`).getTime()-day*86400000);
   const staged=await service.execute('add_words',{text:batch.join('\n'),source:'SYSTEM',request_id:`${seedId}:stage:${day}`});
   const result=await service.execute('confirm_import',{import_id:staged.import_id,items:staged.items.map((item,i)=>({id:item.id,word:item.word,included:true,level:(offset+i)%5,user_note:`测试数据 · ${seedId}`})),request_id:`${seedId}:confirm:${day}`});
   added.push(...result.words.map(w=>w.id));
   if(day>0&&day%2===0){
    for(let pass=0;pass<2;pass++){
     fixtureTime=new Date(fixtureTime.getTime()+3600000);
     const preview=await service.execute('add_words',{text:batch[4],source:'SYSTEM',request_id:`${seedId}:readd-stage:${day}:${pass}`});
     await service.execute('confirm_import',{import_id:preview.import_id,items:preview.items.map(x=>({id:x.id,word:x.word,included:true,level:x.level,user_note:x.user_note||`测试数据 · ${seedId}`})),request_id:`${seedId}:readd-confirm:${day}:${pass}`});
    }
    repeated++;
   }
   if(day%2===1){const word=service.repository.word(result.words[0].id);await service.execute('update_familiarity',{word_id:word.id,expected_version:word.version,paused:true,request_id:`${seedId}:pause:${day}`});paused++;}
  }
  for(const before of originals)assert.deepEqual(service.repository.word(before.id,true),before,'已有词被修改。');
  service.repository.transaction(()=>{
   for(const wordId of added)for(const event of service.repository.events(wordId)){event.metadata.test_seed=seedId;service.repository.db.prepare('UPDATE events SET data=? WHERE id=?').run(JSON.stringify(event),event.id);}
   const manifest={id:seedId,added_word_ids:added,added_count:added.length,created_at:new Date().toISOString(),backup:backup.backupDir,repeated_test_words:repeated,paused_test_words:paused,synthetic_add_dates:true};
   service.repository.put('test_seed',seedId,manifest);
  });
  const report={inserted:added.length,total:service.repository.allWords().length,preserved:originalIds.size,levels:{},time:{},repeated_test_words:repeated,paused_test_words:paused,backup:backup.backupDir};
  fixtureTime=new Date();
  for(let level=0;level<5;level++)report.levels[level]=(await service.execute('list_words',{levels:[level]})).words.length;
  for(const time of ['today','yesterday','7days','earlier'])report.time[time]=(await service.execute('list_words',{time})).words.length;
  assert.equal(service.repository.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  console.log(JSON.stringify(report,null,2));
 }
}finally{service.close();}
