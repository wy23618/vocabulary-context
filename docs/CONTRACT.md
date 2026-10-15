# Internal implementation contract

Node 24 ESM; SQLite via node:sqlite, one shared service, repository abstraction. Chinese UI, calm warm green. No standalone website: web/ is an MCP resource component; a local harness exists only for testing. Stage one desktop and tablet landscape.

Every business tool returns an object. Server wraps it as MCP structuredContent + concise text. Error: throw DomainError with code/message/details; MCP isError true. Writes require request_id, same ID + same arguments returns same result, conflicting args rejected. Sources MANUAL/PASTE/IMAGE/SYSTEM. SQLite path configured by VOCAB_DATA_DIR outside plugin cache, default project data/.

Backend interface: createService({ dataDir, now?, random? }) -> { execute(name,args), close(), repository }. Runtime model work is exclusively the actual host subscription model. No model API keys, no API client, no OCR API. UI uses standard ui/message to request host generation, receives eventual saved article via tool-result. Service owns validation + final article offsets and persistence. UI does not call HTTP directly, only bridge tools.

Word fields: id, word, lemma, meaning, user_note, familiarity_level 0..4, first_added_at, last_added_at, add_count, last_article_at, article_count, last_conversation_at, conversation_count, paused, version. All identifiers strings.

Tool inputs/results (agree before changes):
- open_workspace {} -> {words, selection, articles, preferences, model_available}; server can assemble via list_words/get_selection/list_articles/get_preferences.
- add_words {text,source?,request_id} -> {import_id,items:[{id,word,user_note,level,previous_level,existing,uncertain,included}],new_count,existing_count,duplicate_count}; stages only.
- import_words_from_image {recognized_items:[{word,user_note?,uncertain?}],request_id} -> same preview. Recognition by actual host vision; no auto save.
- confirm_import {import_id,items:[{id,word,user_note?,level,included}],request_id} -> {words,events,saved_count,undo_event_ids}.
- list_words {time?:today/yesterday/7days/earlier/all,levels?:number[],query?,forgotten?} -> {words,time_range?}.
- search_words {query} -> {words}.
- update_familiarity {word_id,level?,paused?,user_note?,expected_version,request_id} -> {word,event_id}.
- remove_word {word_id,expected_version,request_id} -> {removed,undo_event_ids} (soft delete).
- undo_event {event_id,request_id} -> {word,event_id}; avoid overwriting newer changes; conflict returned.
- select_target_words {mode?:auto/manual/mixed,manual_ids?:string[],excluded_ids?:string[],auto_count?:number,request_id} -> {selection:{id,mode,words:[Word + sources:string[] + reason],manual_ids,excluded_ids,auto_count},warning?}.
- get_selection {} -> {selection:null|Selection}.
- reroll_auto_words {selection_id,request_id} -> {selection,warning?}; keep today/manual, do not silently replace locked words.
- save_selection {selection_id,remove_ids?:string[],add_ids?:string[],request_id} -> {selection}.
- assess_load {selection_id,config} -> {high,weight,recommended_min_words,suggestions,groups?}.
- prepare_article {selection_id,config:{topic,length:short/standard/long/custom,min_words?,max_words?,difficulty,syntax},request_id} -> {generation:{id,selection_id,config,words,instructions}}. Actual config syntax natural/standard/intensive, difficulty easy/standard/hard. Frozen targets/config.
- prepare_split_articles {selection_id,config,request_id} -> {plan:{id,selection_id,parts:[generation],word_ids}}. Full union of selected anchors, no selection edits; partial saved parts do not mean whole plan completion.
- validate_article {generation_id,draft:ArticleRaw} -> {valid,errors,normalized_article?}. No save or usage mutation. Host fixes returned errors.
- save_article {generation_id,draft:ArticleRaw,request_id} -> {article}. Strict coverage/mapping validation, atomic save and word events only on success. No fake prose or server model calls.
- get_article {lesson_id} -> {article}; list_articles {} -> {articles:[{lesson_id,title,topic,created_at,word_count}]}.
- record_word_feedback {lesson_id,occurrence_id,feedback:unknown/vague/known,expected_version?,request_id} -> {word?,event_id?,level?,suggestion?}; unknown=0, vague=2, known=max(current,3); version required for existing library word; no click-based mutations. Non-library feedback returns suggestion without adding.
- prepare_conversation {selection_id,topic?,mode?:relaxed/balanced/intensive,request_id} -> {conversation:{id,topic,mode,words,opening,context}} (no usage events).
- get_conversation_context {conversation_id} -> {conversation}.
- record_conversation_usage {conversation_id,text,actor:ai/user,request_id} -> {matched_words,events}; only actual transcript.
- save_sentence_analysis {lesson_id,sentence,analysis,request_id} -> {analysis}; host generated, verify sentence belongs to article.
- get_preferences {} -> {preferences}; save_preferences {preferences,request_id} -> {preferences}; retain config, selected lesson and reading scroll.

Article host raw JSON: {title,topic,article:string,word_map:[{start,end,surface_form,lemma,part_of_speech,meaning,contextual_meaning,collocation,target}],syntax_features:[{sentence,feature,explanation}],quality_checks:{naturalness_notes:string,argument_notes:string}}. Offsets JS UTF-16 exact slice. To avoid host arithmetic, accept token_index entries mapped from programmatically returned tokenize_article tool. tokenize_article {article}->{tokens:[{index,start,end,surface_form,requires_mapping}],word_count}. validate_article may expose tokens in errors to let host repair. All target occurrences and content words mapped. Service appends occurrence_id,lesson_id,target_words,coverage,created_at,word_count. No model quality scores; editorial checks provided by host model labelled as such. Existing click lookup entirely local.

Implementation ownership: backend agent server/repository.mjs, server/service.mjs + tests/business.test.mjs; UI agent web/ + scripts/build.mjs; root server/index.mjs, server/model.mjs, server/schemas.mjs, auth, manifests, integration tests, docs. Host audit agent docs/HOST-SUPPORT.md. No editing other owners' files until coordination.
