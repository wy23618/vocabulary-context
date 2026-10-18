import { randomUUID, createHash } from 'node:crypto';
import { Repository } from './repository.mjs';
import { loadConfig } from './config.mjs';
import { conversationOpening, conversationInstructions } from '../shared/conversation.mjs';
import { tools as toolDefinitions } from './schemas.mjs';

export class DomainError extends Error {
  constructor(code,message,details={}) { super(message); this.name='DomainError'; this.code=code; this.details=details; }
}
const fail=(code,message,details)=>{throw new DomainError(code,message,details);};
const check=(ok,message)=>{if(!ok) fail('INVALID_INPUT',message);};
const id=()=>randomUUID();
const stable=x=>JSON.stringify(x && typeof x==='object' ? Array.isArray(x) ? x.map(v=>JSON.parse(stable(v??null))) : Object.fromEntries(Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>[k,JSON.parse(stable(x[k]))])) : x);
const normalize=x=>String(x??'').normalize('NFKC').trim().toLowerCase().replace(/[’]/g,"'").replace(/[‐‑]/g,'-').replace(/\s+/g,' ');
const levels=['Lv.1','Lv.2','Lv.3','Lv.4','Lv.5'];
const validLevel=n=>Number.isInteger(n)&&n>=0&&n<=4;
const sources=new Set(['MANUAL','PASTE','IMAGE','SYSTEM']);
const WRITE=new Set(['add_words','import_words_from_image','confirm_import','update_familiarity','remove_word','undo_event','select_target_words','reroll_auto_words','save_selection','prepare_article','prepare_split_articles','save_article','record_word_feedback','prepare_conversation','record_conversation_usage','save_conversation_review','save_sentence_analysis','save_preferences','save_word_details','capture_conversation_word']);
export const SELECTION_WEIGHTS={familiarity:[10,8,5,2,.5],load:[2,2,1.5,1,.5],strata:[.5,.3,.2]};
const lengthRanges={short:[200,300],standard:[350,500],long:[550,750]};
const dateKey=(value,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const dayOrdinal=key=>Math.floor(Date.parse(`${key}T00:00:00Z`)/86400000);
// Conservative inflections, not a lemmatizer. Unsupported/ambiguous forms must use the exact target.
const forms=word=>{
  const w=normalize(word),set=new Set([w]);if(w.includes(' ')||/(?:ous|ive|al|ible|able|ful|less|ic|ical)$/.test(w)||['compelling','interesting','important','different','independent','durable','plausible'].includes(w))return set;
  if(/[^aeiou]y$/.test(w))set.add(w.slice(0,-1)+'ies');else if(/(?:s|sh|ch|x|z|o)$/.test(w))set.add(w+'es');else set.add(w+'s');
  if(/(?:tion|sion|ment|ness|ity|ship|ance|ence)$/.test(w)&&!['balance','finance','advance'].includes(w))return set;
  if(/[^aeiou]y$/.test(w)){set.add(w.slice(0,-1)+'ied');set.add(w+'ing');}
  else if(w.endsWith('ie')){set.add(w+'d');set.add(w.slice(0,-2)+'ying');}
  else if(w.endsWith('e')&&!w.endsWith('ee')){set.add(w+'d');set.add(w.slice(0,-1)+'ing');}
  else {set.add(w+'ed');set.add(w+'ing');}
  if(['admit','commit','permit','prefer','occur','refer','begin','stop','plan','drop','fit','get','run','sit','win'].includes(w)){set.delete(w+'ed');set.delete(w+'ing');set.add(w+w.at(-1)+'ed');set.add(w+w.at(-1)+'ing');}
  const irregular={go:['went','gone'],have:['had'],make:['made'],take:['took','taken'],give:['gave','given'],think:['thought'],know:['knew','known'],see:['saw','seen'],write:['wrote','written'],read:['read'],keep:['kept'],find:['found'],begin:['began','begun'],run:['ran'],sit:['sat'],win:['won'],get:['got','gotten']};for(const form of irregular[w]??[])set.add(form);return set;
};
const tokenize=text=>[...text.matchAll(/[\p{L}]+(?:['’\-][\p{L}]+)*/gu)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
const functionWords=new Set('a an the of to in on at by for with and or but if as that this these those it its is are was were be been being have has had do does did will would can could may might shall should must not no so than then there here i you he she we they me him her us them my your our their from into about through up out also both each any all some such which who whom whose what when where why how very more most less least just'.split(' '));
const indexedTokens=article=>tokenize(article).map((t,index)=>({index,start:t.start,end:t.end,surface_form:t.text,requires_mapping:!functionWords.has(normalize(t.text))}));

export function createService({dataDir=loadConfig().dataDir,now=()=>new Date(),random=Math.random,repository=new Repository(dataDir)}={}) {
  const stamp=()=>new Date(now()).toISOString();
  let queue=Promise.resolve();
  const wordFor=wordId=>repository.word(wordId)??fail('WORD_NOT_FOUND','这个词已删除或不存在。');
  const selectionFor=selectionId=>{
    const selection=repository.get('selection',selectionId)??fail('SELECTION_NOT_FOUND','请先选择目标词。');
    return {...selection,words:selection.words.map(w=>({...w,...(repository.word(w.id)??{deleted:true,unavailable:true}),sources:w.sources,reason:w.reason}))};
  };
  const articleFor=lessonId=>repository.get('article',lessonId)??fail('ARTICLE_NOT_FOUND','文章不存在。');
  const getPreferences=()=>({timezone:'Asia/Shanghai',...repository.get('preferences','current')});
  function event(type,source,before,after,metadata={}) {
    const e={id:id(),word_id:after.id,type,source,timestamp:stamp(),metadata:{...metadata,before,after_version:after.version}};
    repository.putWord(after); repository.putEvent(e); return e;
  }
  function currentSelection() { const key=repository.get('state','selection'); return key ? selectionFor(key.id) : null; }
  function saveSelection(selection) { repository.put('selection',selection.id,selection);repository.put('state','selection',{id:selection.id});return selection; }
  function inTime(word,time) {
    if(!time||time==='all') return true;
    const timezone=getPreferences().timezone;
    const difference=dayOrdinal(dateKey(stamp(),timezone))-dayOrdinal(dateKey(word.last_added_at,timezone));
    return time==='today'?difference===0:time==='yesterday'?difference===1:time==='7days'?difference>=0&&difference<7:time==='earlier'?difference>=7:false;
  }
  function listWords(args={}) {
    check(!args.time||['today','yesterday','7days','earlier','all'].includes(args.time),'时间筛选无效。');
    check(!args.levels||args.levels.every(validLevel),'熟练度筛选无效。');
    const query=normalize(args.query??'');
    const words=repository.allWords().filter(w=>inTime(w,args.time)&&(!args.levels?.length||args.levels.includes(w.familiarity_level))&&(!query||w.word.includes(query)||w.user_note?.includes(query)||w.meaning?.includes(query))&&(!args.forgotten||w.add_count>=3||repository.events(w.id).some(e=>e.type==='READD'&&e.metadata.before?.familiarity_level>=3)))
      .sort((a,b)=>b.last_added_at.localeCompare(a.last_added_at)||a.word.localeCompare(b.word));
    const day=dateKey(stamp(),getPreferences().timezone); const ordinal=dayOrdinal(day);
    const key=x=>new Date(x*86400000).toISOString().slice(0,10);
    const ranges={today:[day,day],yesterday:[key(ordinal-1),key(ordinal-1)],'7days':[key(ordinal-6),day],earlier:[null,key(ordinal-7)]};
    return {words,time_range:args.time&&args.time!=='all'?{timezone:getPreferences().timezone,start_date:ranges[args.time][0],end_date:ranges[args.time][1],inclusive:true}:null};
  }
  function preview(items,source,duplicateCount=0) {
    const seen=new Set(); const output=[];
    for(const entry of items) {
      const raw=typeof entry==='string'?entry:entry.word; const word=normalize(raw);
      if(!word) continue;
      if(seen.has(word)){duplicateCount++;continue;}seen.add(word);
      const existing=repository.byNormalized(word);
      const previous=existing?.familiarity_level;
      const proposed=existing?Math.max(previous>1?previous-1:previous,0):1;
      output.push({id:id(),word,raw_input:String(raw),user_note:entry.user_note??'',level:proposed,previous_level:previous??null,existing:!!existing,existing_version:existing?.version??null,uncertain:!!entry.uncertain||!/^[\p{L}]+(?:['\- ][\p{L}]+)*$/u.test(word),included:true});
    }
    check(output.length>0,'没有识别到可确认的单词。'); check(output.length<=500,'单次导入最多500个词，请分批加入。');
    const result={import_id:id(),items:output,new_count:output.filter(x=>!x.existing).length,existing_count:output.filter(x=>x.existing).length,duplicate_count:duplicateCount};
    repository.put('import',result.import_id,{...result,source,created_at:stamp(),confirmed:false});return result;
  }
  function weightedSample(pool,count,avoid=[]) {
    const chosen=[];const eligible=[...pool];const avoidSet=new Set(avoid);
    for(let i=0;i<count&&eligible.length;i++) {
      const categoryDraw=random();const category=categoryDraw<SELECTION_WEIGHTS.strata[0]?'low':categoryDraw<SELECTION_WEIGHTS.strata[0]+SELECTION_WEIGHTS.strata[1]?'middle':'any';
      let candidates=eligible.filter(w=>!avoidSet.has(w.id));
      if(!candidates.length)candidates=eligible;
      const group=candidates.filter(w=>category==='low'?w.familiarity_level<=1:category==='middle'?w.familiarity_level>=2&&w.familiarity_level<=3:true);
      if(group.length)candidates=group;
      const weights=candidates.map(w=>{const last=Math.max(Date.parse(w.last_article_at??w.first_added_at),Date.parse(w.last_conversation_at??w.first_added_at));const days=Math.max(0,(Date.parse(stamp())-last)/86400000);const recent=repository.events(w.id).filter(e=>['ARTICLE','CONVERSATION'].includes(e.type)&&Date.parse(e.timestamp)>=Date.parse(stamp())-7*86400000).length;return SELECTION_WEIGHTS.familiarity[w.familiarity_level]*(1+Math.min(days,45)/15)*(1+Math.min(w.add_count-1,8)*.2)/(1+recent*.35);});
      let draw=random()*weights.reduce((a,b)=>a+b,0);let index=weights.length-1;for(let j=0;j<weights.length;j++){draw-=weights[j];if(draw<=0){index=j;break;}}
      const w=candidates[index];chosen.push(w);eligible.splice(eligible.findIndex(x=>x.id===w.id),1);
    }return chosen;
  }
  function buildSelection(args,previous) {
    const mode=args.mode??'auto';check(['auto','manual','mixed'].includes(mode),'选词方式无效。');
    const autoCount=args.auto_count??4;check(Number.isInteger(autoCount)&&autoCount>=0&&autoCount<=100,'自动补词数量应为0～100。');
    const manualIds=[...new Set(args.manual_ids??[])];const excludedIds=[...new Set(args.excluded_ids??[])];
    const manual=manualIds.map(wordFor);const all=repository.allWords();const today=mode==='manual'||args.include_today===false?[]:all.filter(w=>inTime(w,'today')&&!w.paused&&!excludedIds.includes(w.id));
    const locked=new Map();for(const w of today)locked.set(w.id,{...w,sources:['today'],reason:'今天主动加入'});
    for(const w of manual)locked.set(w.id,{...w,sources:[...(locked.get(w.id)?.sources??[]),'manual'],reason:locked.has(w.id)?'今日词 · 手动必选':'手动必选'});
    if(previous){locked.clear();for(const w of previous.words.filter(w=>!w.sources.includes('auto')))locked.set(w.id,{...wordFor(w.id),sources:w.sources,reason:w.reason});}
    const pool=all.filter(w=>!locked.has(w.id)&&!excludedIds.includes(w.id)&&!w.paused&&!inTime(w,'today'));
    const auto=mode==='manual'?[]:weightedSample(pool,autoCount,previous?.words.filter(w=>w.sources.includes('auto')).map(w=>w.id));
    const words=[...locked.values(),...auto.map(w=>({...w,sources:['auto'],reason:w.add_count>=3?'反复加入，适合复现':w.familiarity_level<=1?'旧词 · 仍需巩固':'旧词 · 间隔复现'}))];
    return {id:previous?.id??id(),mode,include_today:args.include_today!==false,words,manual_ids:manualIds,excluded_ids:excludedIds,auto_count:autoCount,updated_at:stamp()};
  }
  function configFor(config={}) {
    const length=config.length??'standard';check([...Object.keys(lengthRanges),'custom'].includes(length),'篇幅配置无效。');
    const range=length==='custom'?[config.min_words,config.max_words]:lengthRanges[length];
    check(Number.isInteger(range[0])&&Number.isInteger(range[1])&&range[0]>=100&&range[1]>=range[0]&&range[1]<=2000,'自定义篇幅应为100～2000词。');
    const difficulty=config.difficulty??'standard',syntax=config.syntax??'standard';
    check(['easy','standard','hard'].includes(difficulty),'难度配置无效。');check(['natural','standard','intensive'].includes(syntax),'句法配置无效。');
    return {...config,topic:String(config.topic??'自动').trim(),length,min_words:range[0],max_words:range[1],difficulty,syntax};
  }
  function assessLoad(selection,config) {
    const weight=selection.words.reduce((sum,w)=>sum+SELECTION_WEIGHTS.load[w.familiarity_level],0);
    const recommended=Math.max(200,Math.ceil(weight*18/50)*50);const high=recommended>config.max_words;
    const capacity=config.max_words/18;const groups=[];let group=[],used=0;
    for(const w of selection.words){const load=SELECTION_WEIGHTS.load[w.familiarity_level];if(group.length&&used+load>capacity){groups.push(group);group=[];used=0;}group.push(w.id);used+=load;}if(group.length)groups.push(group);
    return {high,weight,recommended_min_words:recommended,suggestions:high?[{action:'increase_length',min_words:recommended},{action:'split',parts:groups.length},{action:'reduce',message:'由你取消部分词；今日词与手动必选不会自动删除。'}]:[],groups:high?groups:[],note:'负载为启发式估算，并非文章质量评分。'};
  }
  function makeGeneration(selection,config,part={}) {
    return {id:id(),selection_id:selection.id,config,words:selection.words,...part,created_at:stamp(),instructions:`Use the ChatGPT host subscription model only. Write a coherent postgraduate English reading passage on ${config.topic}; ${config.min_words}–${config.max_words} words, ${config.difficulty} difficulty, ${config.syntax} syntax. ${part.plan_id?`This is part ${part.part_index+1} of ${part.part_count} in a fixed coverage plan; write a complete readable passage for this part. `:''}Preserve ALL fixed target words: ${selection.words.map(w=>w.word).join(', ')}. Naturally repeat familiarity 0/1 words twice where appropriate, varying collocations. Plan argument progression and paragraphs before prose. Return title, topic, article, syntax_features and quality_checks with naturalness_notes and argument_notes. Call tokenize_article with the FINAL prose, then build word_map for EVERY requires_mapping token and ALL target occurrences: token_index, lemma, part_of_speech, Chinese meaning, Chinese contextual_meaning, collocation, phonetic (accurate IPA), definitions (2–4 common senses with abbreviated part_of_speech and Chinese meaning), related_words (word/meaning word-family entries; empty if none or uncertain), synonyms (word/meaning including distinctions), and example (sentence/translation bilingual example). Never invent etymology. Different occurrences may have different meanings. Call validate_article and repair errors before save_article with this generation ID. Do not claim a saved or generated result until tools succeed. No paid API or external model calls.`};
  }
  function validateArticle(raw,selection,config) {
    check(raw&&typeof raw.article==='string'&&raw.article.trim()&&typeof raw.title==='string'&&raw.title.trim(),'生成结果缺少标题或正文。');
    const article=raw.article;const tokens=tokenize(article);const wordCount=tokens.length;
    if(wordCount<config.min_words||wordCount>config.max_words)fail('ARTICLE_LENGTH','生成篇幅超出配置范围，可重试。',{actual:wordCount,min:config.min_words,max:config.max_words});
    check(Array.isArray(raw.word_map)&&Array.isArray(raw.syntax_features)&&raw.quality_checks&&typeof raw.quality_checks.naturalness_notes==='string'&&typeof raw.quality_checks.argument_notes==='string','生成结果缺少完整释义或质量检查。');
    const maps=raw.word_map.map(original=>{
      const m={...original};if(m.token_index!==undefined){const token=tokens[m.token_index];check(Number.isInteger(m.token_index)&&!!token,'释义token_index无效。');m.start=token.start;m.end=token.end;m.surface_form=token.text;}
      check(Number.isInteger(m.start)&&Number.isInteger(m.end)&&m.start>=0&&m.end>m.start&&m.end<=article.length&&article.slice(m.start,m.end)===m.surface_form,'释义位置与正文不一致。');
      for(const key of ['lemma','part_of_speech','meaning','contextual_meaning'])check(typeof m[key]==='string'&&m[key].trim(),`释义缺少${key}。`);
      return {...m,occurrence_id:id(),target:false};
    }).sort((a,b)=>a.start-b.start);
    const spans=new Set();let previousEnd=-1;
    for(const m of maps){const span=`${m.start}:${m.end}`;check(!spans.has(span),'同一出现位置的释义重复。');check(m.start>=previousEnd,'释义位置发生重叠。');check(tokens.some(t=>t.start===m.start)&&tokens.some(t=>t.end===m.end),'释义必须对应完整词位置。');
      const coveredTokens=tokens.filter(t=>t.start>=m.start&&t.end<=m.end);check(coveredTokens.length===1||selection.words.some(w=>normalize(m.surface_form)===w.word),'多词释义只允许对应目标短语。');spans.add(span);previousEnd=m.end;
    }
    const coverage=[];
    for(const word of selection.words){
      const matches=[];const variants=forms(word.word);
      for(const token of tokens)if(variants.has(normalize(token.text)))matches.push(token);
      if(word.word.includes(' ')){const escaped=word.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');for(const match of article.matchAll(new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`,'giu')))matches.push({start:match.index,end:match.index+match[0].length,text:match[0]});}
      if(!matches.length)fail('ARTICLE_COVERAGE','文章遗漏目标词，未保存不完整结果。',{missing_word:word.word});
      for(const occurrence of matches){const map=maps.find(m=>m.start===occurrence.start&&m.end===occurrence.end);if(!map)fail('ARTICLE_MAPPING','目标词某处缺少即时释义，未保存。',{word:word.word,start:occurrence.start});
        if(normalize(map.lemma)!==word.word)fail('ARTICLE_LEMMA','目标词释义的原形与词库不一致，请修正释义或使用原词。',{word:word.word,surface_form:map.surface_form,lemma:map.lemma});
        if(normalize(map.surface_form)!==word.word&&!/^(?:v(?:[. ]|$)|verb\b|动词|n(?:[. ]|$)|noun\b|名词)/i.test(map.part_of_speech))fail('ARTICLE_INFLECTION','词形变化需要明确的名词或动词词性；不确定时使用原词。',{word:word.word,surface_form:map.surface_form});
        map.target=true;map.word_id=word.id;}
      coverage.push({word_id:word.id,word:word.word,count:matches.length,suggested_count:word.familiarity_level<=1?2:1,occurrence_ids:maps.filter(m=>m.word_id===word.id).map(m=>m.occurrence_id)});
    }
    // Content-token mapping completeness is explicit; function words do not require click affordances.
    const missing=tokens.filter(t=>!functionWords.has(normalize(t.text))&&!maps.some(m=>m.start<=t.start&&m.end>=t.end));
    if(missing.length)fail('ARTICLE_MAPPING','正文实义词仍缺少预生成释义，未保存。',{missing:missing.slice(0,20).map(t=>({word:t.text,start:t.start})),count:missing.length});
    for(const feature of raw.syntax_features)check(typeof feature.sentence==='string'&&article.includes(feature.sentence)&&typeof feature.feature==='string'&&typeof feature.explanation==='string','句子分析与正文不一致。');
    return {lesson_id:id(),title:raw.title.trim(),topic:raw.topic??config.topic,article,target_words:selection.words,word_map:maps,syntax_features:raw.syntax_features,coverage,quality_checks:{...raw.quality_checks,programmatic:{all_targets_present:true,all_content_tokens_mapped:true,word_count:wordCount},note:'模型审阅与程序完整性检查分开记录，不提供权威评分。'},config,selection_id:selection.id,created_at:stamp(),word_count:wordCount};
  }
  function dispatch(name,args) {
    switch(name) {
      case 'open_workspace': {
        const preferences=getPreferences();
        const active=preferences.generation?.id?repository.get('generation',preferences.generation.id):null;
        return {words:listWords().words,selection:currentSelection(),articles:dispatch('list_articles',{}).articles,preferences,active_generation:active?dispatch('get_generation',{generation_id:active.id}):null,model_path:'host_subscription_only',host_generation_required:true};
      }
      case 'list_words': return listWords(args);
      case 'search_words': return listWords({query:args.query});
      case 'get_preferences': return {preferences:getPreferences()};
      case 'save_preferences': {
        check(args.preferences&&typeof args.preferences==='object','偏好设置无效。');const preferences={...getPreferences(),...args.preferences};
        try{dateKey(stamp(),preferences.timezone);}catch{fail('INVALID_INPUT','时区无效。');}repository.put('preferences','current',preferences);return {preferences};
      }
      case 'add_words': {
        check(typeof args.text==='string'&&args.text.length<=50000,'请输入单词，单次文字不超过50000字符。');const source=args.source??'PASTE';check(sources.has(source),'导入来源无效。');
        const rows=args.text.split(/[\r\n,，;；、\t]+/).map(x=>x.trim()).filter(Boolean);
        const items=rows.flatMap(row=>{const split=row.match(/^([A-Za-z][A-Za-z’'\-]*(?: [A-Za-z][A-Za-z’'\-]*)*)\s*[:：–]\s*(.+)$/);if(split)return [{word:split[1],user_note:split[2]}];if(/[\u3400-\u9fff]/.test(row)){const match=row.match(/^([A-Za-z][A-Za-z’'\-]*)\s*(.*)$/);return match?[{word:match[1],user_note:match[2]}]:[{word:row,uncertain:true}];}return row.includes(' ')?row.split(/\s+/):[row];});
        return preview(items,source);
      }
      case 'import_words_from_image': { check(Array.isArray(args.recognized_items),'请让宿主识别图片后提供真实识别条目。');return preview(args.recognized_items,'IMAGE'); }
      case 'confirm_import': {
        const batch=repository.get('import',args.import_id)??fail('IMPORT_NOT_FOUND','导入确认已失效，请重新输入。');if(batch.confirmed)fail('IMPORT_ALREADY_CONFIRMED','这批词已经保存，不会重复加入。');
        check(Array.isArray(args.items),'请提供确认词表。');const seenIds=new Set(),seenWords=new Set();const words=[],events=[];
        for(const item of args.items){check(batch.items.some(x=>x.id===item.id)&&!seenIds.has(item.id),'确认条目不属于这次导入或重复。');seenIds.add(item.id);if(!item.included)continue;
          const word=normalize(item.word);check(word.length>0&&word.length<=120&&/^[\p{L}]+(?:['\- ][\p{L}]+)*$/u.test(word),'请核对单词拼写。');check(validLevel(item.level),'熟练度应为0～4。');if(seenWords.has(word))continue;seenWords.add(word);
          const before=repository.byNormalized(word,true);const existing=before&&!before.deleted;const timestamp=stamp();const staged=batch.items.find(x=>x.id===item.id);
          if(staged.word!==word&&existing)fail('IMPORT_REVIEW_REQUIRED','修改后的词已在词库，请重新输入该词核对降级与现有等级。',{word:before});
          if(staged.word===word&&((existing&&before.version!==staged.existing_version)||(!existing&&staged.existing)))fail('VERSION_CONFLICT','确认期间词库发生更新，请重新导入以核对等级。',{word:before});
          const after={...(before??{}),id:before?.id??id(),word,lemma:before?.lemma??word,meaning:before?.meaning??'',user_note:item.user_note??before?.user_note??'',familiarity_level:item.level,first_added_at:before?.add_count?before.first_added_at:timestamp,last_added_at:timestamp,add_count:(before?.add_count??0)+1,last_article_at:before?.last_article_at??null,article_count:before?.article_count??0,last_conversation_at:before?.last_conversation_at??null,conversation_count:before?.conversation_count??0,paused:before?.paused??false,version:(before?.version??0)+1,deleted:false};
          const e=event(existing?'READD':'ADD',batch.source,before,after,{import_id:batch.import_id,previous_level:before?.familiarity_level??null,proposed_level:item.level});words.push(after);events.push(e);
        }check(words.length>0,'请选择至少一个有效单词。');repository.put('import',batch.import_id,{...batch,confirmed:true,confirmed_at:stamp()});return {words,events,saved_count:words.length,undo_event_ids:events.map(e=>e.id)};
      }
      case 'update_familiarity': {
        const before=wordFor(args.word_id);if(before.version!==args.expected_version)fail('VERSION_CONFLICT','这个词已在另一处更新，请刷新后重试。',{word:before});
        check(args.level===undefined||validLevel(args.level),'熟练度应为0～4。');check(args.paused===undefined||typeof args.paused==='boolean','暂停值无效。');check(args.user_note===undefined||typeof args.user_note==='string','备注无效。');
        const after={...before,familiarity_level:args.level??before.familiarity_level,paused:args.paused??before.paused,user_note:args.user_note??before.user_note,version:before.version+1};if(after.familiarity_level>=2)after.learning_status=null;const e=event('LEVEL_CHANGE','MANUAL',before,after);return {word:after,event_id:e.id};
      }
      case 'remove_word': {
        const before=wordFor(args.word_id);if(before.version!==args.expected_version)fail('VERSION_CONFLICT','这个词已经更新，请刷新后重试。',{word:before});const after={...before,deleted:true,version:before.version+1};const e=event('REMOVE','MANUAL',before,after);return {removed:true,undo_event_ids:[e.id]};
      }
      case 'undo_event': {
        const original=repository.event(args.event_id)??fail('EVENT_NOT_FOUND','找不到这次操作。');check(['ADD','READD','LEVEL_CHANGE','REMOVE'].includes(original.type),'这次操作不可撤销。');
        if(repository.get('undone',original.id))fail('ALREADY_UNDONE','这次操作已经撤销。');const before=repository.word(original.word_id,true);
        if(!before||before.version!==original.metadata.after_version)fail('UNDO_CONFLICT','这个词之后发生了新操作；为保留新修改，不能直接撤销。',{word:before});
        const after={...(original.metadata.before??{...before,add_count:0}),deleted:original.metadata.before?!!original.metadata.before.deleted:true,version:before.version+1};const e=event('UNDO','MANUAL',before,after,{undo_of:original.id});repository.put('undone',original.id,{event_id:e.id});return {word:after,event_id:e.id};
      }
      case 'select_target_words': {const selection=saveSelection(buildSelection(args));return {selection,...(selection.mode!=='manual'&&selection.words.filter(w=>w.sources.includes('auto')).length<selection.auto_count?{warning:'符合条件的旧词较少，已选入所有可用候选。'}:{})};}
      case 'get_selection': return {selection:currentSelection()};
      case 'reroll_auto_words': {
        const previous=selectionFor(args.selection_id);const locked=previous.words.filter(w=>!w.sources.includes('auto'));const selection=buildSelection(previous,previous);
        // Today's set is frozen for this selection, including user cancellations and manual sources.
        selection.words=[...locked.map(w=>({...wordFor(w.id),sources:w.sources,reason:w.reason})),...selection.words.filter(w=>w.sources.includes('auto')&&!locked.some(x=>x.id===w.id))];
        const old=previous.words.filter(w=>w.sources.includes('auto')).map(w=>w.id),fresh=selection.words.filter(w=>w.sources.includes('auto')).map(w=>w.id);
        const warning=fresh.every(x=>old.includes(x))?'候选旧词不足，暂时没有可替换的新词。':fresh.length<selection.auto_count?'符合条件的旧词较少。':null;
        return {selection:saveSelection(selection),...(warning?{warning}:{})};
      }
      case 'save_selection': {
        const previous=selectionFor(args.selection_id),removed=new Set(args.remove_ids??[]),add=[...new Set(args.add_ids??[])].map(wordFor);
        const selection={...previous,words:previous.words.filter(w=>!removed.has(w.id)),manual_ids:previous.manual_ids.filter(x=>!removed.has(x)),excluded_ids:[...new Set([...previous.excluded_ids,...removed])],updated_at:stamp()};
        for(const w of add){const found=selection.words.find(x=>x.id===w.id);if(found){if(!found.sources.includes('manual'))found.sources.push('manual');found.sources=found.sources.filter(s=>s!=='auto');found.reason='手动必选';}else selection.words.push({...w,sources:['manual'],reason:'手动必选'});if(!selection.manual_ids.includes(w.id))selection.manual_ids.push(w.id);selection.excluded_ids=selection.excluded_ids.filter(x=>x!==w.id);}
        return {selection:saveSelection(selection)};
      }
      case 'assess_load': return assessLoad(selectionFor(args.selection_id),configFor(args.config));
      case 'prepare_article': {
        const original=selectionFor(args.selection_id);check(original.words.length>0,'请先加入目标词。');const selection={...original,words:original.words.map(w=>({...wordFor(w.id),sources:w.sources,reason:w.reason}))};const config=configFor(args.config);const load=assessLoad(selection,config);
        if(load.high)fail('HIGH_LOAD','这些词在当前篇幅中过于密集，请增加篇幅、按建议分组或减少目标词。',load);
        const generation=makeGeneration(selection,config);repository.put('generation',generation.id,generation);return {generation};
      }
      case 'prepare_split_articles': {
        const original=selectionFor(args.selection_id);check(original.words.length>0,'请先加入目标词。');const selection={...original,words:original.words.map(w=>({...wordFor(w.id),sources:w.sources,reason:w.reason}))};const config=configFor(args.config),load=assessLoad(selection,config);
        const groups=load.high?load.groups:[selection.words.map(w=>w.id)],planId=id(),parts=[];
        for(const [index,group] of groups.entries()){
          const words=group.map(wordId=>selection.words.find(w=>w.id===wordId));const partSelection={...selection,words};const partLoad=assessLoad(partSelection,config);
          if(partLoad.high)fail('HIGH_LOAD','当前篇幅仍不足以容纳分组，请增加每篇篇幅后重试。',{...partLoad,part_index:index});
          const generation=makeGeneration(partSelection,config,{plan_id:planId,part_index:index,part_count:groups.length});repository.put('generation',generation.id,generation);parts.push(generation);
        }
        const word_ids=selection.words.map(w=>w.id),covered=parts.flatMap(part=>part.words.map(w=>w.id));check(covered.length===word_ids.length&&new Set(covered).size===word_ids.length&&word_ids.every(wordId=>covered.includes(wordId)),'分篇覆盖计划不完整。');
        const plan={id:planId,selection_id:selection.id,parts,word_ids,created_at:stamp()};repository.put('split_plan',plan.id,plan);return {plan};
      }
      case 'tokenize_article': {check(typeof args.article==='string'&&args.article.length<=100000,'正文无效或过长。');const tokens=indexedTokens(args.article);return {tokens,word_count:tokens.length};}
      case 'validate_article': {
        const generation=repository.get('generation',args.generation_id)??fail('GENERATION_NOT_FOUND','文章准备记录不存在。');
        try {const normalized_article=validateArticle(args.draft,{id:generation.selection_id,words:generation.words},generation.config);return {valid:true,errors:[],normalized_article};}
        catch(error){if(!(error instanceof DomainError))throw error;return {valid:false,errors:[{code:error.code,message:error.message,details:error.details}],tokens:typeof args.draft?.article==='string'?indexedTokens(args.draft.article):[]};}
      }
      case 'get_generation': {
        const generation=repository.get('generation',args.generation_id)??fail('GENERATION_NOT_FOUND','文章准备记录不存在。');return {generation,status:generation.lesson_id?'saved':'prepared',...(generation.lesson_id?{article:articleFor(generation.lesson_id)}:{})};
      }
      case 'save_article': {
        const generation=repository.get('generation',args.generation_id)??fail('GENERATION_NOT_FOUND','文章准备记录不存在。');if(generation.lesson_id)return {article:articleFor(generation.lesson_id)};
        const article=validateArticle(args.draft,{id:generation.selection_id,words:generation.words},generation.config);if(generation.plan_id){article.plan_id=generation.plan_id;article.part_index=generation.part_index;article.part_count=generation.part_count;}repository.put('article',article.lesson_id,article);repository.put('generation',generation.id,{...generation,lesson_id:article.lesson_id});
        for(const w of article.target_words){const before=wordFor(w.id);const after={...before,last_article_at:stamp(),article_count:before.article_count+1,version:before.version+1};event('ARTICLE','SYSTEM',before,after,{lesson_id:article.lesson_id});}return {article};
      }
      case 'get_article': return {article:articleFor(args.lesson_id)};
      case 'list_articles': return {articles:repository.objects('article').sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(({lesson_id,title,topic,created_at,word_count})=>({lesson_id,title,topic,created_at,word_count}))};
      case 'record_word_feedback': {
        check(['unknown','vague','known'].includes(args.feedback),'反馈无效。');const article=articleFor(args.lesson_id);const occurrence=article.word_map.find(m=>m.occurrence_id===args.occurrence_id)??fail('OCCURRENCE_NOT_FOUND','这个词的释义位置不存在。');
        const before=occurrence.word_id?repository.word(occurrence.word_id):repository.byNormalized(normalize(occurrence.lemma));
        if(!before)return {suggestion:'这个词还不在词库，请先明确加入后再记录熟练度。',level:args.feedback==='unknown'?0:args.feedback==='vague'?2:3};
        check(Number.isInteger(args.expected_version)&&args.expected_version>=1,'词库反馈需要当前版本，请刷新词库后重试。');
        if(before.version!==args.expected_version)fail('VERSION_CONFLICT','这个词已在另一处更新，请查看最新等级后再次反馈。',{word:before});
        const level=args.feedback==='unknown'?0:args.feedback==='vague'?2:Math.max(3,before.familiarity_level);const after={...before,familiarity_level:level,version:before.version+1};if(after.familiarity_level>=2)after.learning_status=null;const e=event('LEVEL_CHANGE','MANUAL',before,after,{lesson_id:args.lesson_id,occurrence_id:args.occurrence_id,feedback:args.feedback});return {word:after,event_id:e.id,level};
      }
      case 'prepare_conversation': {
        const selection=args.selection_id?selectionFor(args.selection_id):{id:null,words:[]};const mode=args.mode??'balanced';check(['relaxed','balanced','intensive'].includes(mode),'交流模式无效。');const topic=String(args.topic??'学习、生活与未来').trim();
        const words=selection.words.map(w=>({...wordFor(w.id),sources:w.sources,reason:w.reason}));const variant=args.opening_variant??repository.objects('conversation').length;const customOpening=String(args.custom_opening??'').trim();check(customOpening.length<=2000,'开场白最多 2000 字符。');const opening=customOpening||conversationOpening(topic,variant);
        const conversation={id:id(),selection_id:selection.id,topic,mode,words,opening,custom_opening:customOpening,opening_variant:variant,auto_capture_new_words:true,turns:[],review:null,created_at:stamp()};conversation.context=conversationInstructions(conversation);repository.put('conversation',conversation.id,conversation);return {conversation};
      }
      case 'get_conversation_context': {
        const saved=repository.get('conversation',args.conversation_id)??fail('CONVERSATION_NOT_FOUND','交流上下文不存在。');
        return {conversation:{...saved,context:conversationInstructions(saved)}};
      }
      case 'capture_conversation_word': {
        const parsed=toolDefinitions.find(t=>t.name==='capture_conversation_word').inputSchema.safeParse(args);check(parsed.success,'请提供实际用户发言、解释和本轮标识。');
        const conversation=repository.get('conversation',args.conversation_id)??fail('CONVERSATION_NOT_FOUND','交流上下文不存在。');check(conversation.auto_capture_new_words===true,'这份交流上下文尚未启用生词收录，请重新开始交流。');
        const word=normalize(args.word),utterance=normalize(args.user_utterance);
        check(word.length<=120&&/^[a-z]+(?:['\- ][a-z]+)*$/i.test(word),'请提供有效的英语单词或短语。');
        const mentioned=word.includes(' ')?utterance.includes(word):tokenize(utterance).some(t=>forms(word).has(normalize(t.text)));
        check(mentioned,'用户实际发言中没有明确出现这个词，不能推测生词。');
        check(/什么(?:意思|含义)|啥(?:意思|含义)|不(?:懂|理解|明白|认识|知道|确定|会)|没(?:懂|理解|明白|掌握|学会)|忘(?:了|记)|解释|意思(?:是|不|没|[？?])|怎么(?:理解|用)|\bmeaning\b|\bwhat\b[^.!\n]{0,240}\bmeans?\b|\bexplain\b|\bdefine\b|\bclarify\b|(?:don'?t|do not|not|didn'?t|did not|can'?t|cannot)\s+(?:really\s+)?(?:understand|know|remember)|not sure|unfamiliar/i.test(utterance),'没有提问词义或明确未理解的依据；普通对话不能自动标记生词。');
        const key=createHash('sha256').update(stable([conversation.id,args.turn_id,word])).digest('hex');
        const prior=repository.get('conversation_learning',key);if(prior){const latest=repository.word(prior.captured_word.id);check(!!latest,'这次收录已撤销或移除，不会重复加入。');return {...prior,captured_word:latest,undo_event_ids:[],status:'already_recorded'};}
        const before=repository.byNormalized(word,true);check(!before?.deleted,'这个词已被移除，请明确重新加入后再记录。');
        if(before&&before.version!==args.expected_version)fail('VERSION_CONFLICT','这个词已有更新，请读取最新词条后重试。',{word:before});
        if(!before&&args.expected_version!==undefined)fail('VERSION_CONFLICT','词条状态已变化，请重新读取。');
        const timestamp=stamp(),after={...(before??{}),id:before?.id??id(),word,lemma:before?.lemma??word,meaning:before?.meaning||args.explanation,user_note:before?.user_note??'',familiarity_level:before?Math.min(before.familiarity_level,1):0,learning_status:'needs_review',conversation_note:args.explanation,last_learning_signal_at:timestamp,first_added_at:before?.first_added_at??timestamp,last_added_at:before?.last_added_at??timestamp,add_count:before?.add_count??1,last_article_at:before?.last_article_at??null,article_count:before?.article_count??0,last_conversation_at:before?.last_conversation_at??null,conversation_count:before?.conversation_count??0,paused:before?.paused??false,version:(before?.version??0)+1,deleted:false};
        const e=event(before?'LEVEL_CHANGE':'ADD','SYSTEM',before,after,{conversation_id:conversation.id,turn_id:args.turn_id,user_utterance:args.user_utterance,explanation:args.explanation,reason:'meaning_question'});
        const result={captured_word:after,event_id:e.id,undo_event_ids:[e.id],status:before?'marked_for_review':'added'};repository.put('conversation_learning',key,result);return result;
      }
      case 'record_conversation_usage': {
        const conversation=repository.get('conversation',args.conversation_id)??fail('CONVERSATION_NOT_FOUND','请先准备交流上下文。');check(['ai','user'].includes(args.actor),'请标注AI或用户实际使用。');check(typeof args.text==='string'&&args.text.length>0&&args.text.length<=50000,'请提供实际交流文字。');
        const turn_id=args.turn_id??args.request_id,turns=conversation.turns??[];
        const prior=turns.find(turn=>turn.turn_id===turn_id);
        if(prior){check(prior.actor===args.actor&&prior.text===args.text,'同一轮标识不能用于不同发言。');return {turn_id,matched_words:prior.matched_words,events:[]};}
        const text=normalize(args.text),tokens=tokenize(text).map(t=>normalize(t.text));const matched_words=[],events=[];
        for(const w of conversation.words){const variants=forms(w.word);const used=w.word.includes(' ')?new RegExp(`(?<![\\p{L}])${w.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}])`,'u').test(text):tokens.some(t=>variants.has(t));if(!used)continue;const before=repository.word(w.id);if(!before)continue;
          const after={...before,last_conversation_at:stamp(),conversation_count:before.conversation_count+1,version:before.version+1};events.push(event('CONVERSATION','SYSTEM',before,after,{conversation_id:conversation.id,actor:args.actor,text:args.text}));matched_words.push({word_id:w.id,word:w.word,actor:args.actor});}
        repository.put('conversation',conversation.id,{...conversation,turns:[...turns,{turn_id,actor:args.actor,text:args.text,matched_words,recorded_at:stamp()}]});
        return {turn_id,matched_words,events};
      }
      case 'save_conversation_review': {
        const parsed=toolDefinitions.find(t=>t.name==='save_conversation_review').inputSchema.safeParse(args);check(parsed.success,'请提供完整复盘、真实原句与改进建议。');
        const conversation=repository.get('conversation',args.conversation_id)??fail('CONVERSATION_NOT_FOUND','交流上下文不存在。');
        const turns=conversation.turns??[];check(turns.some(turn=>turn.actor==='user'),'尚未记录真实用户发言，无法复盘。');
        for(const gap of args.gaps){const turn=turns.find(turn=>turn.turn_id===gap.turn_id&&turn.actor==='user');check(turn&&turn.text.includes(gap.quote),'复盘原句必须来自对应的真实用户发言。');}
        const review={summary:args.summary,strengths:args.strengths,gaps:args.gaps,next_steps:args.next_steps,turn_count:turns.length,created_at:stamp()};
        repository.put('conversation',conversation.id,{...conversation,review});return {conversation_id:conversation.id,review};
      }
      case 'save_word_details': {
        const parsed=toolDefinitions.find(t=>t.name==='save_word_details').inputSchema.safeParse(args);check(parsed.success,'词典资料格式不完整，请提供音标、释义、同根词、近义词及双语例句。');
        const article=articleFor(args.lesson_id),occurrence=article.word_map.find(m=>m.occurrence_id===args.occurrence_id);check(!!occurrence,'这个词的释义位置不存在。');
        const details=parsed.data.details;
        repository.put('article',article.lesson_id,{...article,word_map:article.word_map.map(m=>m.occurrence_id===args.occurrence_id?{...m,...details}:m)});
        return {word_details:details,lesson_id:article.lesson_id,occurrence_id:occurrence.occurrence_id};
      }
      case 'save_sentence_analysis': {
        const article=articleFor(args.lesson_id);check(typeof args.sentence==='string'&&args.sentence.trim()&&article.article.includes(args.sentence),'请选择本文中的句子。');check(args.analysis&&typeof args.analysis==='object'&&!Array.isArray(args.analysis),'句子结构分析格式无效。');
        repository.put('analysis',`${args.lesson_id}:${args.sentence}`,args.analysis);const analyses=[...(article.sentence_analyses??[]).filter(x=>x.sentence!==args.sentence),{sentence:args.sentence,analysis:args.analysis}];repository.put('article',article.lesson_id,{...article,sentence_analyses:analyses});return {analysis:args.analysis};
      }
      default: fail('UNKNOWN_TOOL',`未知工具：${name}`);
    }
  }
  async function run(name,args) {
    const writes=WRITE.has(name);
    if(!writes)return dispatch(name,args);
    check(typeof args.request_id==='string'&&args.request_id.length>=1&&args.request_id.length<=200,'写操作需要唯一request_id。');
    const fingerprint=createHash('sha256').update(stable({name,args})).digest('hex');
    const prior=repository.request(args.request_id);if(prior){if(prior.fingerprint!==fingerprint)fail('REQUEST_CONFLICT','同一个请求标识已用于不同操作。');return prior.result;}
    return repository.transaction(()=>{const existing=repository.request(args.request_id);if(existing){if(existing.fingerprint!==fingerprint)fail('REQUEST_CONFLICT','请求标识冲突。');return existing.result;}const result=dispatch(name,args);repository.putRequest(args.request_id,fingerprint,result);return result;});
  }
  return {repository,close:()=>repository.close(),execute(name,args={}) { if(!WRITE.has(name))return Promise.resolve().then(()=>run(name,args));const task=queue.then(()=>run(name,args));queue=task.catch(()=>{});return task; }};
}
