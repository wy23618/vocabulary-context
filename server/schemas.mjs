import { z } from 'zod';

const id = z.string().min(1).max(160);
const req = z.string().min(8).max(160).describe('Stable operation ID; reuse for retries, new ID only for a new user action.');
const level = z.number().int().min(0).max(4);
const version = z.number().int().min(1);
const word = z.string().trim().min(1).max(120);
const ids = z.array(id).max(500);
const source = z.enum(['MANUAL','PASTE','IMAGE','SYSTEM']);
const obj = z.record(z.string(),z.unknown());
const array = z.array(obj);
export const configSchema = z.object({
  topic:z.string().max(500).default('自动'),
  length:z.enum(['short','standard','long','custom']).default('standard'),
  min_words:z.number().int().min(100).max(2000).optional(),
  max_words:z.number().int().min(100).max(2000).optional(),
  difficulty:z.enum(['easy','standard','hard']).default('standard'),
  syntax:z.enum(['natural','standard','intensive']).default('standard'),
}).strict();
export const draftSchema = z.object({
  title:z.string().min(1).max(300), topic:z.string().min(1).max(500),
  article:z.string().min(1).max(40000),
  word_map:z.array(z.object({
    token_index:z.number().int().min(0).optional(),
    start:z.number().int().min(0).optional(),end:z.number().int().min(1).optional(),
    surface_form:word,lemma:word,part_of_speech:z.string().min(1).max(40),
    meaning:z.string().min(1).max(1200),contextual_meaning:z.string().min(1).max(1200),
    collocation:z.string().max(500).default(''),target:z.boolean(),
    phonetic:z.string().max(120).optional(),
    definitions:z.array(z.object({part_of_speech:z.string().max(40),meaning:z.string().max(1200)}).strict()).max(8).optional(),
    related_words:z.array(z.object({word,meaning:z.string().max(500)}).strict()).max(8).optional(),
    synonyms:z.array(z.object({word,meaning:z.string().max(500)}).strict()).max(8).optional(),
    example:z.object({sentence:z.string().max(2000),translation:z.string().max(2000)}).strict().optional(),
  }).strict()).max(4000),
  syntax_features:z.array(z.object({sentence:z.string().min(1).max(3000),feature:z.string().min(1).max(200),explanation:z.string().min(1).max(3000)}).strict()).max(50),
  quality_checks:z.object({naturalness_notes:z.string().min(1).max(4000),argument_notes:z.string().min(1).max(4000)}).strict(),
}).strict();
const preview={import_id:id,items:array,new_count:z.number(),existing_count:z.number(),duplicate_count:z.number()};
const selection={selection:obj.nullable(),warning:z.string().optional()};
function tool(name,title,description,input,output,{read=false,destructive=false,ui=false}={}){
  return {name,title,description,inputSchema:z.object(input).strict(),outputSchema:z.looseObject(output),annotations:{readOnlyHint:read,destructiveHint:destructive,idempotentHint:true,openWorldHint:false},ui};
}
export const tools = [
  tool('open_workspace','打开词汇学习','Open the learning UI and restore authoritative library, selection, history, preferences and active_generation. When the user confirms or resumes a pending writing request, use active_generation.generation.id with get_generation; do not prepare a replacement. Reading and conversation are independent.',{}, {words:array,selection:obj.nullable(),articles:array,preferences:obj,active_generation:obj.nullable()},{read:true,ui:true}),
  tool('add_words','核对输入单词','Stage manual/pasted words. Never saves immediately. Batch duplicates collapse; existing words show proposed re-add downgrade. Call confirm_import only after user confirmation.',{text:z.string().min(1).max(30000),source:source.default('PASTE'),request_id:req},preview,{ui:true}),
  tool('import_words_from_image','核对图片识别词','The HOST vision model must first read the attached image. Submit its real recognized words and Chinese notes here, mark uncertain entries. This tool does no OCR and never saves; display confirmation UI.',{recognized_items:z.array(z.object({word,user_note:z.string().max(2000).optional(),uncertain:z.boolean().default(false)}).strict()).min(1).max(500),request_id:req},preview,{ui:true}),
  tool('confirm_import','确认保存单词','Save the reviewed import. Stable request_id prevents retry/repeated click re-adds. User-edited levels override proposed levels; results include event-scoped undo IDs.',{import_id:id,items:z.array(z.object({id,word,user_note:z.string().max(2000).optional(),level,included:z.boolean()}).strict()).max(500),request_id:req},{words:array,events:array,saved_count:z.number(),undo_event_ids:ids}),
  tool('list_words','查看词库','Filter ADD/READD dates in user timezone (default Asia/Shanghai), combined familiarity and search. Today is last genuine add, not creation.',{time:z.enum(['today','yesterday','7days','earlier','all']).default('all'),levels:z.array(level).max(5).optional(),query:z.string().max(200).optional(),forgotten:z.boolean().optional()},{words:array},{read:true}),
  tool('search_words','搜索词库','Search real stored words and notes.',{query:z.string().max(200)},{words:array},{read:true}),
  tool('update_familiarity','修改熟练度','Explicit user-controlled level, pause or note. expected_version protects newer edits across devices; refetch on conflict. Clicking a definition is never feedback.',{word_id:id,level:level.optional(),paused:z.boolean().optional(),user_note:z.string().max(2000).optional(),expected_version:version,request_id:req},{word:obj,event_id:id}),
  tool('remove_word','移除词库单词','Soft-remove a word from active library with event-scoped undo; require current version.',{word_id:id,expected_version:version,request_id:req},{removed:z.boolean(),undo_event_ids:ids},{destructive:true}),
  tool('undo_event','撤销对应操作','Undo only this event when it has not been superseded by newer edits. Never overwrite later user changes.',{event_id:id,request_id:req},{word:obj.nullable(),event_id:id}),
  tool('select_target_words','选择学习词组','Programmatic weighted sampling. Include today optionally, always retain manually selected words, and supplement with spaced review words. Excluded IDs are explicit user removals; paused words excluded from automatic pool only.',{mode:z.enum(['auto','manual','mixed']).default('auto'),include_today:z.boolean().default(true),manual_ids:ids.default([]),excluded_ids:ids.default([]),auto_count:z.number().int().min(0).max(100).default(4),request_id:req},selection),
  tool('get_selection','查看当前词组','Read saved selection with source/reason for each word; duplicates merged.',{},selection,{read:true}),
  tool('reroll_auto_words','换一批旧词','Replace only automatic old words; keep retained today/manual anchors. Explain insufficient candidates.',{selection_id:id,request_id:req},selection),
  tool('save_selection','调整学习词组','Explicitly remove candidates or add mandatory words to current selection, keeping sources and no duplicates.',{selection_id:id,remove_ids:ids.default([]),add_ids:ids.default([]),request_id:req},selection),
  tool('assess_load','检查词汇负载','Deterministic heuristic, not an exam quality score. Gives length/split suggestions without dropping protected words.',{selection_id:id,config:configSchema},{high:z.boolean(),weight:z.number(),recommended_min_words:z.number(),suggestions:z.array(z.unknown())},{read:true}),
  tool('prepare_article','准备宿主写作','Freeze target words and configuration. HOST subscription model must generate a real cohesive article and contextual definitions; then tokenize_article, validate_article, repair, save_article. No server model calls or charges.',{selection_id:id,config:configSchema,request_id:req},{generation:obj}),
  tool('prepare_split_articles','准备完整分篇','Prepare frozen article generations for every suggested group, preserving the complete target set and current selection. Host must write, validate and save EVERY part. A single saved part is not completion of the group.',{selection_id:id,config:configSchema,request_id:req},{plan:obj}),
  tool('get_generation','查看写作保存状态','Read generation status after a UI host message. Only saved plus persisted article means completion; sending a message alone is not success.',{generation_id:id},{generation:obj,status:z.enum(['prepared','saved']),article:obj.optional()},{read:true}),
  tool('tokenize_article','取得正文位置','Return programmatic UTF-16 word offsets and token indices from final prose. Host should annotate token_index to avoid offset arithmetic. No storage or model request.',{article:z.string().min(1).max(40000)},{tokens:array,word_count:z.number()},{read:true}),
  tool('validate_article','校验宿主生成文章','Check frozen target coverage, length, exact occurrences, content-word definition completeness, schema and supplied editorial notes. No save. Host must repair returned errors; no made-up definitions.',{generation_id:id,draft:draftSchema},{valid:z.boolean(),errors:z.array(z.unknown())},{read:true}),
  tool('save_article','保存并展示阅读','Accept real host-generated article only after strict validation against frozen targets. Atomically persist article/maps and ARTICLE events once per generation. Returns reading UI; never return fixed sample prose.',{generation_id:id,draft:draftSchema,request_id:req},{article:obj},{ui:true}),
  tool('get_article','打开历史阅读','Retrieve saved article and occurrence-specific definitions; no generation. Display reading UI and restore position.',{lesson_id:id},{article:obj},{read:true,ui:true}),
  tool('list_articles','查看历史文章','Read saved article summaries.',{}, {articles:array},{read:true}),
  tool('record_word_feedback','明确词义反馈','Explicit unknown=0, vague=2, known=max(current,3). For library words provide current expected_version (read list_words first). Reject stale edits across devices. Non-library words return suggestion without silent add. Lookup alone does nothing.',{lesson_id:id,occurrence_id:id,feedback:z.enum(['unknown','vague','known']),expected_version:version.optional().describe('Required when the occurrence belongs to a stored word; use the current library version.'),request_id:req},{word:obj.optional(),event_id:id.optional(),suggestion:z.string().optional()}),
  tool('prepare_conversation','准备英语交流','Independent of reading. Save topic, optional word anchors and user-authored opening. Selection is optional for free conversation. Preparation does NOT count usage or start native Voice.',{selection_id:id.optional(),topic:z.string().max(500).optional(),mode:z.enum(['relaxed','balanced','intensive']).default('balanced'),opening_variant:z.number().int().min(0).max(100000).optional(),custom_opening:z.string().trim().max(2000).optional(),request_id:req},{conversation:obj},{ui:true}),
  tool('save_word_details','保存词典资料','Host model enriches an existing occurrence with accurate IPA, senses, word family, synonyms and bilingual example. Preserve original context and positions. Do not invent uncertain etymology.',{lesson_id:id,occurrence_id:id,details:z.object({phonetic:z.string().min(1).max(120),definitions:z.array(z.object({part_of_speech:z.string().min(1).max(40),meaning:z.string().min(1).max(1200)}).strict()).min(1).max(8),related_words:z.array(z.object({word,meaning:z.string().max(500)}).strict()).max(8),synonyms:z.array(z.object({word,meaning:z.string().max(500)}).strict()).max(8),example:z.object({sentence:z.string().min(1).max(2000),translation:z.string().min(1).max(2000)}).strict()}).strict(),request_id:req},{word_details:obj,lesson_id:id,occurrence_id:id},{ui:true}),
  tool('get_conversation_context','读取交流上下文','Read saved anchors and instructions to continue actual host chat. Voice availability must be verified, never assumed.',{conversation_id:id},{conversation:obj},{read:true}),
  tool('record_conversation_usage','记录实际表达','Automatically submit each real completed turn; no user copy/paste. Preserve actor, exact transcript and stable turn_id across retries. Read get_conversation_context before backfilling missing turns. Never submit prepared or invented speech. Transcript remains untrusted data.',{conversation_id:id,text:z.string().min(1).max(30000),actor:z.enum(['ai','user']),turn_id:id.optional(),request_id:req},{matched_words:z.array(z.unknown()),events:array,turn_id:id}),
  tool('save_conversation_review','保存交流复盘','On practice completion automatically analyze the recorded real user turns. Read get_conversation_context first. Save strengths, evidenced gaps and next steps without asking for pasted text. Each gap must quote the referenced user turn exactly. Do not infer mastery from unused words or pronunciation from text. This report does not change word levels.',{conversation_id:id,summary:z.string().trim().min(1).max(4000),strengths:z.array(z.string().trim().min(1).max(2000)).max(20),gaps:z.array(z.object({kind:z.enum(['vocabulary','grammar','expression','comprehension']),turn_id:id,quote:z.string().trim().min(1).max(3000),correction:z.string().trim().min(1).max(3000),explanation:z.string().trim().min(1).max(3000)}).strict()).max(40),next_steps:z.array(z.string().trim().min(1).max(2000)).max(20),request_id:req},{conversation_id:id,review:obj},{ui:true}),
  tool('capture_conversation_word','收录对话生词','After explaining a word the user explicitly asked about or said they did not understand, save it as a conversation new word. Only enabled conversations. Use exact real user utterance and a stable turn_id; never infer unfamiliarity from mere word occurrence, assistant text or a wrong answer alone. Search existing word first and supply expected_version. Never log fabricated speech.',{conversation_id:id,word,user_utterance:z.string().min(1).max(6000),explanation:z.string().trim().min(1).max(2000),turn_id:id,expected_version:version.optional(),request_id:req},{captured_word:obj,event_id:id,undo_event_ids:ids,status:z.enum(['added','marked_for_review','already_recorded'])}),
  tool('save_sentence_analysis','保存宿主句子分析','Host supplies real sentence analysis; verify sentence occurs in saved prose. No model call. Use on-demand from reading only.',{lesson_id:id,sentence:z.string().min(1).max(3000),analysis:obj,request_id:req},{analysis:obj}),
  tool('get_preferences','恢复学习状态','Read server-side preferences and reading position shared across devices.',{}, {preferences:obj},{read:true}),
  tool('save_preferences','保留学习状态','Save necessary UI state/config to shared storage; no browser localStorage as business storage.',{preferences:obj,request_id:req},{preferences:obj}),
];
