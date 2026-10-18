import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import { conversationOpening, conversationLaunchMessage } from '../shared/conversation.mjs';
import { UI_VERSION } from '../shared/ui-version.mjs';
import { LevelGlyph, SelectMenu } from './controls.jsx';

const bridge = new App({ name: 'Vocabulary Context', version: '0.1.3' }, {}, { autoResize: false, strict: true });
let reportedHeight = 0;
function syncViewport(context = {}) {
  const bounds = context.containerDimensions;
  const cap = bounds?.height ?? bounds?.maxHeight ?? window.openai?.maxHeight;
  if (Number.isFinite(cap) && cap > 0) document.documentElement.style.setProperty('--host-height', `${cap}px`);
  const height = Math.round(document.querySelector('.app-shell')?.getBoundingClientRect().height ?? window.innerHeight);
  if (height > 0 && height !== reportedHeight) { reportedHeight = height; bridge.sendSizeChanged({ height }).catch(() => {}); }
}
const levels = ['Lv.1', 'Lv.2', 'Lv.3', 'Lv.4', 'Lv.5'];
const uid = () => crypto.randomUUID();
const defaults = { topic: 'AI 与大学学习', length: 'standard', difficulty: 'standard', syntax: 'standard' };
function sentenceOf(prose, item) {
  const before = prose.slice(0, item.start), previous = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '), before.lastIndexOf('\n'));
  const tail = prose.slice(item.end), next = tail.search(/[.!?](?:\s|$)/);
  return prose.slice(previous < 0 ? 0 : previous + (prose[previous] === '\n' ? 1 : 2), next < 0 ? prose.length : item.end + next + 1).trim();
}
const unpack = (result) => {
  let data = result.structuredContent;
  if (!data) for (const content of result.content ?? []) if (content.type === 'text') { try { data = JSON.parse(content.text); break; } catch {} }
  if (result.isError) { const error = new Error(data?.error?.message ?? data?.message ?? result.content?.find(x => x.type === 'text')?.text ?? '操作未完成，请重试。'); error.code = data?.error?.code ?? 'DOMAIN_ERROR'; throw error; }
  return data ?? {};
};
const call = async (name, args = {}) => unpack(await bridge.callServerTool({ name, arguments: args }, { timeout: 45000 }));
const uncertainWrites = new Map();
const write = async (name, args) => {
  const key = JSON.stringify([name, args]);
  const requestId = uncertainWrites.get(key) ?? uid(); uncertainWrites.set(key, requestId);
  try { const result = await call(name, { ...args, request_id: requestId }); uncertainWrites.delete(key); return result; }
  catch (error) { if (error.code) uncertainWrites.delete(key); throw error; }
};
function LevelSelect({ value, onChange, disabled, label = '熟练度' }) {
  return <div className={`level-control level-${value} ${disabled ? 'is-disabled' : ''}`} title={levels[value]}><div className="level-meter" aria-hidden="true">{levels.map((_, i) => <i key={i} className={i <= value ? 'filled' : ''} />)}<span>{value + 1}/5</span></div><select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))}>{levels.map((text, i) => <option key={i} value={i}>{text}</option>)}</select></div>;
}
function Empty({ title, children, action }) { return <div className="empty"><span className="empty-symbol" aria-hidden="true">↗</span><h2>{title}</h2><p>{children}</p>{action}</div>; }

function VocabularyApp() {
  const [hydrated, setHydrated] = useState(false), [builderOpen, setBuilderOpen] = useState(false);
  const [wordPage, setWordPage] = useState(1), [pageSize, setPageSize] = useState(12), [openingVariant, setOpeningVariant] = useState(0), [detailsPending, setDetailsPending] = useState(null);
  const detailsTimers = useRef([]);
  useEffect(() => () => detailsTimers.current.forEach(clearTimeout), []);
  const [ready, setReady] = useState(false), [dataConnected, setDataConnected] = useState(false), [host, setHost] = useState({});
  const [page, setPage] = useState('library'), [words, setWords] = useState([]), [shown, setShown] = useState([]), [articles, setArticles] = useState([]);
  const [selection, setSelection] = useState(null), [config, setConfig] = useState(defaults), [article, setArticle] = useState(null), [occurrence, setOccurrence] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(''), [undo, setUndo] = useState([]);
  const [importOpen, setImportOpen] = useState(false), [importText, setImportText] = useState(''), [preview, setPreview] = useState(null), [imageWaiting, setImageWaiting] = useState(false);
  const [filters, setFilters] = useState({ time: 'all', query: '', levels: [], forgotten: false }), [manualIds, setManualIds] = useState([]), [includeToday, setIncludeToday] = useState(true), [autoCount, setAutoCount] = useState(4);
  const [load, setLoad] = useState(null), [generation, setGeneration] = useState(null), [waiting, setWaiting] = useState(false), [splitPlan, setSplitPlan] = useState(null), [splitProgress, setSplitProgress] = useState(0);
  const [conversation, setConversation] = useState(null), [conversationTopic, setConversationTopic] = useState(''), [conversationMode, setConversationMode] = useState('balanced');
  const [customOpening, setCustomOpening] = useState(''), [voicePrepared, setVoicePrepared] = useState(false);
  const [conversationWordSearch, setConversationWordSearch] = useState('');
  const [analysis, setAnalysis] = useState(null), [reviewRequested, setReviewRequested] = useState(false);
  const incomingArticle = useRef(null), readingRef = useRef(null), wordTrigger = useRef(null), preferences = useRef({}), mounted = useRef(true), gate = useRef(false), pollTimer = useRef(null), preferenceTimer = useRef(null), filterSeq = useRef(0), analysisRequest = useRef(null), watchToken = useRef(0);
  useEffect(() => { setWordPage(1); }, [filters, pageSize]);
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const visiblePage = Math.min(wordPage, totalPages);
  const pageWords = shown.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  const effectiveTopic = conversationTopic.trim() || config.topic || '日常生活';
  const previewOpening = customOpening.trim() || conversationOpening(effectiveTopic, openingVariant);
  const conversationStale = conversation && (conversation.auto_capture_new_words !== true || conversation.topic !== effectiveTopic || conversation.mode !== conversationMode || conversation.selection_id !== (selection?.id ?? null) || conversation.opening !== previewOpening || JSON.stringify(conversation.words.map(w => w.id)) !== JSON.stringify(selection?.words.map(w => w.id) ?? []));
  const current = useRef({}); current.current = { page, config, article, occurrence, generation, splitPlan, filters, conversation, ready, hydrated, selection };
  const commitArticle = value => { if (current.current.article?.lesson_id === value.lesson_id && current.current.page === 'read') { setArticle(value); return; } clearTimeout(pollTimer.current); watchToken.current++; setArticle(value); setOccurrence(null); setPage('read'); setWaiting(false); setGeneration(null); setNotice('文章已保存，可以开始阅读。'); setArticles(items => [{ lesson_id: value.lesson_id, title: value.title, topic: value.topic, word_count: value.word_count, created_at: value.created_at }, ...items.filter(x => x.lesson_id !== value.lesson_id)]); call('list_words').then(data => setWords(data.words)).catch(() => {}); };
  const applyWorkspace = data => { setDataConnected(true); if (data.words) { setWords(data.words); setShown(data.words); } if ('selection' in data) { setSelection(data.selection); setManualIds(data.selection?.manual_ids ?? []); } if (data.articles) setArticles(data.articles); };
  const refresh = async () => { const data = await call('open_workspace'); applyWorkspace(data); return data; };
  const run = async (key, fn) => {
    if (gate.current) return;
    gate.current = true; setBusy(key); setError(''); setNotice('');
    try { return await fn(); } catch (e) {
      if (key === 'generate' || key === 'generate-split') setWaiting(false);
      if (key === 'image') setImageWaiting(false);
      if (e.code === 'VERSION_CONFLICT') { await refresh().catch(() => {}); setError(`${e.message} 已重新读取当前数据，请确认等级后再操作。`); }
      else if (['generate', 'generate-split', 'image', 'analysis', 'host-chat'].includes(key) && /unsupported|not support|method.?not.?found|timed? ?out|timeout|disconnect|connection|closed|-32601/i.test(e.message ?? '')) setError('宿主暂未接受此请求，或连接已经中断。任务与输入已保留；可在宿主聊天中继续，或重新连接后重试。');
      else if (/mcp error:\s*-32603|tool call error:[\s\S]*internal error|failed to fetch|networkerror|econnrefused|connection refused|timed? ?out|timeout/i.test(e.message ?? '')) { setDataConnected(false); setError('词库服务暂时不可达，尚未确认的操作没有显示为已保存。输入和当前页面已保留；服务恢复后点“重新连接”再试。'); }
      else setError(e.message || '连接暂时中断，请重试。');
    } finally { gate.current = false; if (mounted.current) setBusy(''); }
  };
  const notify = text => { setNotice(text); setError(''); };
  const reconnect = () => run('refresh', async () => { await refresh(); notify('已重新连接并读取保存数据。'); });
  const remember = partial => {
    preferences.current = { ...preferences.current, ...partial };
    clearTimeout(preferenceTimer.current);
    preferenceTimer.current = setTimeout(() => { if (current.current.ready && current.current.hydrated) { write('save_preferences', { preferences: preferences.current }).catch(() => setError('学习状态暂未同步；词库和文章仍已保存。')); try { window.openai?.setWidgetState?.(preferences.current); } catch {} } }, 900);
  };
  useEffect(() => {
    bridge.onhostcontextchanged = context => { if (context.theme) document.documentElement.dataset.theme = context.theme; if (context.containerDimensions) requestAnimationFrame(() => syncViewport(bridge.getHostContext())); };
    bridge.ontoolresult = result => {
      try {
        const data = unpack(result);
        if (data.review && data.conversation_id === current.current.conversation?.id) { setConversation(old => ({ ...old, review: data.review })); setReviewRequested(old => old === data.review.created_at ? old : false); }
        if (data.captured_word) {
          setWords(items => { const previous = items.find(item => item.id === data.captured_word.id); return previous?.version > data.captured_word.version ? items : [...items.filter(item => item.id !== data.captured_word.id), data.captured_word]; });
          if (data.status !== 'already_recorded') { setUndo(data.undo_event_ids ?? []); notify(`“${data.captured_word.word}”${data.status === 'added' ? '已收进词库' : '已标记需要复习'}。`); }
        }
        if (data.article?.lesson_id) {
          if (current.current.splitPlan) { setNotice('分篇中有文章已保存；整组覆盖将在全部保存后确认。'); setArticles(items => [{ lesson_id: data.article.lesson_id, title: data.article.title, topic: data.article.topic, created_at: data.article.created_at, word_count: data.article.word_count }, ...items.filter(item => item.lesson_id !== data.article.lesson_id)]); }
          else { incomingArticle.current = data.article; commitArticle(data.article); }
        }
        if (data.import_id && data.items) { setPreview(data); setImportOpen(true); setImageWaiting(false); setPage('library'); }
        if (data.word_details) {
          setArticle(old => old?.lesson_id === data.lesson_id ? { ...old, word_map: old.word_map.map(m => m.occurrence_id === data.occurrence_id ? { ...m, ...data.word_details } : m) } : old);
          setOccurrence(old => current.current.article?.lesson_id === data.lesson_id && old?.occurrence_id === data.occurrence_id ? { ...old, ...data.word_details } : old);
          setDetailsPending(old => old?.lesson_id === data.lesson_id && old?.occurrence_id === data.occurrence_id ? null : old);
          setNotice(old => old.startsWith('正在补全词典资料') ? '' : old);
        }
        if (data.analysis) {
          const pending = analysisRequest.current, visible = current.current;
          if (pending && visible.article?.lesson_id === pending.lesson_id && visible.occurrence && sentenceOf(visible.article.article, visible.occurrence) === pending.sentence) { setAnalysis(data.analysis); notify('句子结构已准备好。'); }
          if (pending) call('get_article', { lesson_id: pending.lesson_id }).then(saved => { if (current.current.article?.lesson_id === pending.lesson_id) setArticle(saved.article); }).catch(() => {});
        }
        if (data.words && !data.import_id) { if (data.saved_count !== undefined) refresh().catch(e => setError(e.message)); else { setWords(data.words); setShown(data.words); } }
        if (data.selection) setSelection(data.selection);
      } catch (e) { setError(e.message); }
    };
    const hostTimeout = setTimeout(() => { if (!current.current.ready) setError('尚未连接到支持交互界面的宿主。请在 ChatGPT 的应用连接中打开 Vocabulary Context。'); }, 12000);
    bridge.connect().then(async () => {
      if (!mounted.current) return;
      clearTimeout(hostTimeout); setReady(true); setHost(bridge.getHostCapabilities() ?? {});
      requestAnimationFrame(() => syncViewport(bridge.getHostContext()));
      document.documentElement.dataset.theme = bridge.getHostContext()?.theme ?? 'light';
      const data = await refresh(); const prefs = data.preferences ?? {}; preferences.current = prefs;
      if (!incomingArticle.current && ['library', 'practice', 'conversation', 'history'].includes(prefs.page)) setPage(prefs.page);
      if (prefs.config) setConfig({ ...defaults, ...prefs.config });
      if (prefs.filters) setFilters(prefs.filters);
      if (prefs.word_builder) { setIncludeToday(prefs.word_builder.include_today ?? true); setAutoCount(prefs.word_builder.review_count ?? 4); }
      if (data.active_generation?.status === 'prepared') setGeneration(data.active_generation.generation);
      if (prefs.split_plan) setSplitPlan(prefs.split_plan);
      if (prefs.selected_lesson && !incomingArticle.current) { const saved = await call('get_article', { lesson_id: prefs.selected_lesson }); if (!incomingArticle.current) { setArticle(saved.article); if (prefs.page === 'read') setPage('read'); } }
      if (prefs.conversation_id) { const saved = await call('get_conversation_context', { conversation_id: prefs.conversation_id }); setConversation(saved.conversation); setConversationTopic(saved.conversation.topic); setConversationMode(saved.conversation.mode); setOpeningVariant(saved.conversation.opening_variant ?? 0); setCustomOpening(saved.conversation.custom_opening ?? ''); }
      if (prefs.conversation_draft) { setConversationTopic(prefs.conversation_draft.topic ?? ''); setConversationMode(prefs.conversation_draft.mode ?? 'balanced'); setCustomOpening(prefs.conversation_draft.custom_opening ?? ''); setOpeningVariant(prefs.conversation_draft.opening_variant ?? 0); }
      if (incomingArticle.current && !prefs.split_plan) commitArticle(incomingArticle.current);
      setHydrated(true);
    }).catch(e => setError(e.message));
    return () => { mounted.current = false; clearTimeout(hostTimeout); clearTimeout(preferenceTimer.current); clearTimeout(pollTimer.current); };
  }, []);
  useEffect(() => { if (ready && hydrated) remember({ config, page, filters, selected_lesson: article?.lesson_id ?? null, generation, split_plan: splitPlan, conversation_id: conversation?.id ?? null }); }, [ready, hydrated, config, page, filters, article?.lesson_id, generation, splitPlan, conversation?.id]);
  useEffect(() => { if (ready && hydrated) remember({ word_builder: { include_today: includeToday, review_count: autoCount }, conversation_draft: { topic: conversationTopic, mode: conversationMode, custom_opening: customOpening, opening_variant: openingVariant } }); }, [ready, hydrated, includeToday, autoCount, conversationTopic, conversationMode, customOpening, openingVariant]);
  useEffect(() => { if (conversationStale) setVoicePrepared(false); }, [conversationStale]);
  useEffect(() => {
    if (!ready || page !== 'conversation' || !conversation?.id) return;
    let active = true, pending = false;
    const conversationId = conversation.id;
    const sync = async () => {
      if (pending) return;
      pending = true;
      try { const saved = await call('get_conversation_context', { conversation_id: conversationId }); if (active) { setConversation(saved.conversation); if (saved.conversation.review) setReviewRequested(old => old === saved.conversation.review.created_at ? old : false); } }
      catch (e) { if (active) setError(e.message); }
      finally { pending = false; }
    };
    sync(); const timer = setInterval(sync, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [ready, page, conversation?.id]);
  useEffect(() => { if (!ready) return; let timer; const resize = () => { clearTimeout(timer); timer = setTimeout(() => syncViewport(bridge.getHostContext()), 160); }; window.addEventListener('resize', resize); return () => { clearTimeout(timer); window.removeEventListener('resize', resize); }; }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const seq = ++filterSeq.current;
    const timer = setTimeout(() => call('list_words', filters).then(data => { if (seq === filterSeq.current) setShown(data.words ?? []); }).catch(e => setError(e.message)), 180);
    return () => clearTimeout(timer);
  }, [ready, filters, words]);
  useEffect(() => {
    if (!ready || !hydrated || page !== 'library') return;
    let active = true;
    call('list_words').then(result => { if (active) setWords(result.words ?? []); }).catch(e => setError(e.message));
    return () => { active = false; };
  }, [ready, hydrated, page]);
  useEffect(() => {
    if (page === 'read' && article && readingRef.current) readingRef.current.scrollTop = preferences.current.scrolls?.[article.lesson_id] ?? 0;
  }, [page, article?.lesson_id]);
  useEffect(() => {
    const close = e => { if (e.key === 'Escape') { if (occurrence) closeDefinition(); else if (importOpen) { setImportOpen(false); document.getElementById('import-opener')?.focus(); } } };
    document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close);
  }, [occurrence, importOpen]);
  useEffect(() => {
    if (!importOpen) return;
    const dialog = document.querySelector('.import-modal');
    if (dialog && !dialog.contains(document.activeElement)) (dialog.querySelector('textarea, button') ?? dialog).focus({ preventScroll: true });
  }, [importOpen]);
  useEffect(() => {
    if (!ready || !selection?.id) { setLoad(null); return; }
    let active = true;
    const timer = setTimeout(() => call('assess_load', { selection_id: selection.id, config }).then(value => { if (active) setLoad(value); }).catch(() => {}), 250);
    return () => { active = false; clearTimeout(timer); };
  }, [ready, selection, config]);
  const closeDefinition = () => { setOccurrence(null); wordTrigger.current?.focus({ preventScroll: true }); };
  const editWord = (word, changes) => run(`word-${word.id}`, async () => { const result = await write('update_familiarity', { word_id: word.id, expected_version: word.version, ...changes }); const replace = list => list.map(item => item.id === result.word.id ? result.word : item); setWords(replace); setShown(replace); if (result.event_id) setUndo([result.event_id]); notify('已保存。'); });
  const undoChange = () => run('undo', async () => { for (const eventId of [...undo].reverse()) { await write('undo_event', { event_id: eventId }); setUndo(ids => ids.filter(id => id !== eventId)); } await refresh(); notify('已撤销对应操作。'); });
  const stageText = () => run('import', async () => { const data = await write('add_words', { text: importText, source: importText.includes('\n') ? 'PASTE' : 'MANUAL' }); setPreview(data); });
  const confirmImport = () => run('confirm', async () => { const result = await write('confirm_import', { import_id: preview.import_id, items: preview.items.map(({ id, word, user_note, level, included }) => ({ id, word, user_note, level, included })) }); setUndo(result.undo_event_ids ?? []); setPreview(null); setImportText(''); setImportOpen(false); await refresh(); notify(`已保存 ${result.saved_count} 个词。`); });
  const uploadImage = async e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    await run('image', async () => {
      if (!window.openai?.uploadFile || !window.openai?.getFileDownloadUrl) throw new Error('此宿主尚未提供图片上传接口。请在 ChatGPT 聊天中附上图片并说“识别这些词，交给 Vocabulary Context 确认”。识别后会回到确认界面。');
      const uploaded = await window.openai.uploadFile(file); const fileId = uploaded.fileId ?? uploaded.file_id;
      if (!fileId) throw new Error('宿主未返回图片标识，请直接在聊天中附图。');
      await window.openai.setWidgetState?.({ modelContent: { image_import_pending: true, file_id: fileId }, privateContent: preferences.current, imageIds: [fileId] });
      const downloaded = await window.openai.getFileDownloadUrl({ fileId }); const url = downloaded.downloadUrl ?? downloaded.download_url;
      if (!url) throw new Error('宿主未返回可识别的图片地址，请直接在聊天中附图。');
      setImageWaiting(true);
      const result = await bridge.sendMessage({ role: 'user', content: [{ type: 'text', text: `请使用你当前的视觉能力识别这张图片中的英语单词及中文笔记：${url}。图片文件标识：${fileId}。识别后调用 Vocabulary Context 的 import_words_from_image，传 recognized_items（每项 word、user_note、uncertain）及唯一 request_id。不调用付费模型 API，不直接保存；让用户在插件确认。` }] });
      if (result.isError) throw new Error('宿主未接受图片识别请求，请在聊天中附图后重试。');
      notify('已请求 ChatGPT 识别图片。识别结果将先进入确认。');
    });
  };
  const choose = () => run('select', async () => { const result = await write('select_target_words', { mode: !includeToday && autoCount === 0 ? 'manual' : 'mixed', include_today: includeToday, manual_ids: manualIds, auto_count: autoCount, excluded_ids: selection?.excluded_ids ?? [] }); if (!result.selection.words.length) { notify('勾选几个词，或带上今日词、增加复习词数量。'); return; } setSelection(result.selection); notify(result.warning ?? '目标词组已保存。'); setPage('practice'); });
  const modifySelection = changes => run('selection-change', async () => { const result = await write('save_selection', { selection_id: selection.id, ...changes }); setSelection(result.selection); });
  const pollGeneration = async (id, started = Date.now(), token = watchToken.current) => {
    try {
      const data = await call('get_generation', { generation_id: id });
      if (token !== watchToken.current) return;
      if (data.article && data.status === 'saved') { commitArticle(data.article); return; }
      if (Date.now() - started > 180000) { setWaiting(false); notify('ChatGPT 还未返回保存后的文章。配置和任务已保留，可查看宿主聊天或继续检查。'); return; }
      pollTimer.current = setTimeout(() => pollGeneration(id, started, token), 4000);
    } catch (e) { setWaiting(false); setError(`暂时无法检查文章状态：${e.message}。任务已保留。`); }
  };
  const generate = () => run('generate', async () => {
    if (!selection?.words.length) throw new Error('先选择一组目标词。');
    if (load?.high) throw new Error('这组词对当前篇幅负载较高。请增加篇幅、减少目标词，或在宿主聊天中要求按建议拆篇。');
    const task = generation ?? (await write('prepare_article', { selection_id: selection.id, config })).generation;
    setGeneration(task); setWaiting(true); setNotice('ChatGPT 正在准备文章与逐处释义。配置和目标词已保留。');
    const sent = await bridge.sendMessage({ role: 'user', content: [{ type: 'text', text: `请现在为 Vocabulary Context 完成文章任务 ${task.id}。使用当前宿主模型与现有订阅，不使用 API。先遵守 prepare_article 返回的 generation.instructions，根据冻结目标词和配置写真实考研英语文章，然后调用 tokenize_article 为主要实义词及每个目标词出现提供 token_index 对应的具体语境释义。调用 validate_article，修复全部错误，再调用 save_article（generation_id=${task.id}，draft，唯一 request_id）。save_article 成功后界面会自动显示文章，不要重复调用 get_article 刷新界面。不要只返回写作提示或宣称已完成；自然使用保留的今日词与手动必选词。任务配置：${JSON.stringify(task.config)}；目标词：${task.words.map(w => w.word).join(', ')}。` }] });
    if (sent.isError) { setWaiting(false); throw new Error('宿主未接受生成请求；任务已保留。请在宿主聊天中让 Vocabulary Context 继续此任务。'); }
    clearTimeout(pollTimer.current); watchToken.current++; pollGeneration(task.id);
  });
  const continueGeneration = () => run('continue-generation', async () => { setWaiting(true); clearTimeout(pollTimer.current); watchToken.current++; await pollGeneration(generation.id); });
  const pollSplit = async (plan, started = Date.now(), token = watchToken.current) => {
    try {
      const results = await Promise.all(plan.parts.map(part => call('get_generation', { generation_id: part.id })));
      if (token !== watchToken.current) return;
      const saved = results.filter(result => result.status === 'saved' && result.article);
      setSplitProgress(saved.length);
      if (saved.length === plan.parts.length) {
        setSplitPlan(null); setWaiting(false); commitArticle(saved[0].article);
        const history = await call('list_articles'); setArticles(history.articles);
        setNotice(`整组目标词已分为 ${plan.parts.length} 篇并全部保存。其余文章可在历史文章中打开。`); return;
      }
      if (Date.now() - started > 180000) { setWaiting(false); notify(`已有 ${saved.length} / ${plan.parts.length} 篇保存；其余任务已保留，可继续检查。`); return; }
      pollTimer.current = setTimeout(() => pollSplit(plan, started, token), 4000);
    } catch (error) { setWaiting(false); setError(`分篇保存状态暂时不可达：${error.message}。整组任务已保留。`); }
  };
  const generateSplit = () => run('generate-split', async () => {
    const plan = splitPlan ?? (await write('prepare_split_articles', { selection_id: selection.id, config })).plan;
    setSplitPlan(plan); setGeneration(null); setWaiting(true); setSplitProgress(0);
    const groups = plan.parts.map((part, index) => `第${index + 1}篇 generation_id=${part.id}，主题=${part.config.topic}，篇幅=${part.config.min_words}–${part.config.max_words}词，冻结目标词：${part.words.map(word => word.word).join(', ')}。写作说明：${part.instructions}`).join('\n');
    const result = await bridge.sendMessage({ role: 'user', content: [{ type: 'text', text: `请使用当前宿主订阅模型为 Vocabulary Context 完成已准备的分篇计划 ${plan.id}，不使用付费 API。先调用 get_generation 检查每个任务，已经 saved 的跳过，仅继续 prepared 的任务。按以下冻结分组分别写自然考研阅读文章，保留整组所有今日词与手动词。每篇逐一调用 tokenize_article 为主要实义词及目标词所有出现提供真实语境释义，validate_article 并修复错误，save_article（对应 generation_id、draft、唯一 request_id）。逐篇实际保存，不能把一篇成功说成整组完成，全部保存后才报告整组覆盖。\n${groups}` }] });
    if (result.isError) { setWaiting(false); throw new Error('宿主未接受分篇请求；整组冻结任务已保留，可继续请求。'); }
    notify(`已请求 ChatGPT 准备 ${plan.parts.length} 篇文章；全部实际保存后才确认整组完成。`);
    clearTimeout(pollTimer.current); watchToken.current++; pollSplit(plan);
  });
  const feedback = value => run('feedback', async () => { const source = words.find(word => word.id === occurrence.word_id || word.word === occurrence.lemma?.normalize('NFKC').toLowerCase()); const result = await write('record_word_feedback', { lesson_id: article.lesson_id, occurrence_id: occurrence.occurrence_id, feedback: value, expected_version: source?.version }); if (result.word) setWords(list => list.map(item => item.id === result.word.id ? result.word : item)); if (result.event_id) setUndo([result.event_id]); notify(result.word ? `“${result.word.word}”已保存为 ${levels[result.word.familiarity_level]}。` : (result.suggestion ?? '已记录反馈；此词未加入词库。')); });
  const saveConversation = async () => {
    setVoicePrepared(false); setReviewRequested(false);
    const result = await write('prepare_conversation', { ...(selection ? { selection_id: selection.id } : {}), topic: effectiveTopic, mode: conversationMode, opening_variant: openingVariant, custom_opening: customOpening.trim() });
    setConversation(result.conversation); return result.conversation;
  };
  const startConversation = () => run('host-chat', async () => {
    setVoicePrepared(false);
    const active = !conversation || conversationStale ? await saveConversation() : conversation;
    const sent = await bridge.sendMessage({ role: 'user', content: [{ type: 'text', text: conversationLaunchMessage(active) }] });
    if (sent?.isError) throw new Error('练习主题未能发送到当前聊天，请重试。');
    setVoicePrepared(true);
  });
  const toggleConversationWord = word => run('conversation-words', async () => {
    const selected = selection?.words.some(item => item.id === word.id);
    const result = selection
      ? await write('save_selection', { selection_id: selection.id, ...(selected ? { remove_ids: [word.id] } : { add_ids: [word.id] }) })
      : await write('select_target_words', { mode: 'manual', include_today: false, auto_count: 0, manual_ids: [word.id] });
    setSelection(result.selection); setManualIds(result.selection.manual_ids ?? []);
  });
  const reviewConversation = () => run('review-chat', async () => {
    const result = await bridge.sendMessage({ role: 'user', content: [{ type: 'text', text: `结束本次 Vocabulary Context 英语练习并复盘，conversation_id=${conversation.id}。请使用本聊天已有的真实对话，不要让我粘贴。先 get_conversation_context，按稳定 turn_id 补记尚未记录的实际用户及已送达的 AI 发言（record_conversation_usage，区分 actor，不重复整段提交）；重新读取已记录发言，分析我没掌握的词义、语法、表达及理解问题，给出真实用户原句、改法、中文解释和下次练习建议，调用 save_conversation_review 保存。没用到的目标词不等于不会，不能从文字推测发音。如果看不到实际语音转写或工具不可用，明确说明缺少什么，不要编造记录或宣称复盘成功。` }] });
    if (result?.isError) throw new Error('宿主未接受复盘请求，请重试；已有交流记录已保留。');
    setReviewRequested(conversation.review?.created_at ?? 'pending'); notify('已请求复盘，分析保存后会显示在这里。');
  });
  const sentenceFor = item => sentenceOf(article.article, item);
  const analyze = () => run('analysis', async () => { const sentence = sentenceFor(occurrence); const cached = article.sentence_analyses?.find(item => item.sentence === sentence)?.analysis ?? article.syntax_features?.find(item => item.sentence === sentence); if (cached) { setAnalysis(cached); return; } analysisRequest.current = { lesson_id: article.lesson_id, sentence }; const result = await bridge.sendMessage({ role: 'user', content: [{ type: 'text', text: `请使用当前宿主模型分析 Vocabulary Context 已保存文章 ${article.lesson_id} 的此句：“${sentence}”。说明主干、从句、修饰、非谓语或插入语；不使用 API。完成后调用 save_sentence_analysis，lesson_id=${article.lesson_id}，sentence 原文，analysis 结构化结果，唯一 request_id。` }] }); if (result.isError) throw new Error('宿主未接受句子分析请求。'); notify('已请求 ChatGPT 分析此句。'); });
  const renderProse = () => {
    const text = article.article, map = [...(article.word_map ?? [])].sort((a, b) => a.start - b.start); const chunks = []; let offset = 0;
    for (const item of map) { if (item.start < offset || text.slice(item.start, item.end) !== item.surface_form) continue; chunks.push(text.slice(offset, item.start)); chunks.push(<span key={item.occurrence_id ?? item.start} role="button" tabIndex={0} className={`word ${item.target ? 'target-word' : ''} ${occurrence?.occurrence_id === item.occurrence_id ? 'active-word' : ''}`} aria-label={`查看 ${item.surface_form} 在此处的释义`} onClick={e => { if (window.getSelection()?.toString()) return; wordTrigger.current = e.currentTarget; setOccurrence(item); setAnalysis(null); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wordTrigger.current = e.currentTarget; setOccurrence(item); setAnalysis(null); } }}>{item.surface_form}</span>); offset = item.end; }
    chunks.push(text.slice(offset)); return chunks;
  };
  const enrichDefinition = () => run('word-details', async () => {
    const target = { lesson_id: article.lesson_id, occurrence_id: occurrence.occurrence_id };
    setDetailsPending(target);
    try {
      const sent = await bridge.sendMessage({ role: 'user', content: [{ type: 'text', text: '请使用当前宿主模型补全 Vocabulary Context 的词典卡片，不调用付费 API。先 get_article(' + JSON.stringify({ lesson_id: target.lesson_id }) + ')，找到 occurrence_id=' + target.occurrence_id + '，结合原句提供准确 IPA 音标 phonetic、2–4 个常见义项 definitions（part_of_speech 使用 n./v./adj./adv. 等缩写，meaning 中文）、related_words 同根词（word/meaning，不确定或没有则空数组）、synonyms 近义词（word/meaning，说明区别）和 example（sentence 英文、translation 中文）。不要编造词根。调用 save_word_details，lesson_id=' + target.lesson_id + '，occurrence_id=' + target.occurrence_id + '，details 为上述字段，唯一 request_id。' }] });
      if (sent.isError) throw new Error('宿主未接受词典补全请求，请重试。');
      notify('正在补全词典资料，完成后会保存在这篇文章中。');
      // Reload also supports hosts that do not deliver a tool-result notification.
      let completed = false;
      for (const delay of [4000, 10000, 20000, 40000, 70000, 110000]) detailsTimers.current.push(setTimeout(async () => {
        if (completed) return;
        try { const saved = await call('get_article', { lesson_id: target.lesson_id }); const item = saved.article.word_map.find(m => m.occurrence_id === target.occurrence_id);
          if (item?.phonetic && item?.example) { completed = true; if (current.current.article?.lesson_id === target.lesson_id) { setArticle(saved.article); setOccurrence(old => old?.occurrence_id === target.occurrence_id ? item : old); } setDetailsPending(old => old?.occurrence_id === target.occurrence_id ? null : old); setNotice(old => old.startsWith('正在补全词典资料') ? '' : old); }
        } catch {}
      }, delay));
      detailsTimers.current.push(setTimeout(() => setDetailsPending(old => old?.occurrence_id === target.occurrence_id ? null : old), 120000));
    } catch (e) { setDetailsPending(null); throw e; }
  });
  const disabled = !ready || Boolean(busy);
  const statusNotice = (error || notice || undo.length > 0) && <div className={`status-bar ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}><span>{error || notice}</span><div>{error && <button className="quiet" disabled={disabled} onClick={reconnect}>重新连接</button>}{undo.length > 0 && <button className="quiet" disabled={disabled} onClick={undoChange}>撤销上次操作</button>}<button className="icon-button" aria-label="收起提示" onClick={() => { setError(''); setNotice(''); setUndo([]); }}>×</button></div></div>;
  return <main className="app-shell">
    <header className="app-header"><div className="brand"><span className="brand-mark" aria-hidden="true">v<span>c</span></span><div><strong>Vocabulary Context</strong><span>让词汇回到语境</span></div></div><div className="header-actions">{bridge.getHostContext()?.availableDisplayModes?.includes('fullscreen') && <button className="quiet" onClick={() => bridge.requestDisplayMode({ mode: 'fullscreen' }).catch(e => setError(e.message))}>展开</button>}<span className="connection"><i className={dataConnected ? 'online' : ''} />{dataConnected ? '词库已连接' : error.includes('词库服务暂时不可达') ? '词库暂不可达' : ready ? '宿主已连接' : '连接中'}</span></div></header>
    <nav className="navigation" aria-label="学习任务">{[['library', '词库'], ['practice', '目标词与阅读'], ['conversation', '英语交流'], ['history', '历史文章']].map(([key, text]) => <button key={key} className={page === key || key === 'practice' && page === 'read' ? 'current' : ''} onClick={() => setPage(key)}>{text}</button>)}</nav>
    <div className="status-slot">{page !== 'read' && statusNotice}</div>
    {page === 'library' && <section className={`workspace library-workspace ${builderOpen ? 'show-builder' : ''}`}>
      <div className="library-main"><div className="section-heading"><div><p className="eyebrow">YOUR WORDS</p><h1>词库 <span className="muted-count">{words.length}</span></h1></div><label className="search-field"><span className="sr-only">搜索词库</span><input type="search" placeholder="搜索单词或笔记" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} /></label><button className="quiet builder-opener" onClick={() => setBuilderOpen(true)}>准备词组 →</button><button id="import-opener" className="primary" disabled={disabled} onClick={() => { setImportOpen(true); setError(''); }}>＋ 加入单词</button></div>
        <div className="filters"><SelectMenu label="加入时间" value={filters.time} onChange={time => setFilters({ ...filters, time })} options={[{ value: 'all', label: '全部时间' }, { value: 'today', label: '今天' }, { value: 'yesterday', label: '昨天' }, { value: '7days', label: '近 7 天' }, { value: 'earlier', label: '更早' }]} /><details className="filter-details"><summary>熟练度{filters.levels.length ? ` · ${filters.levels.length} 档` : ''}</summary><div className="level-options">{levels.map((text, i) => <label key={i}><input type="checkbox" checked={filters.levels.includes(i)} onChange={e => setFilters({ ...filters, levels: e.target.checked ? [...filters.levels, i] : filters.levels.filter(x => x !== i) })} /><LevelGlyph value={i} /><span>{text}</span></label>)}</div></details><label className="check-label"><input type="checkbox" checked={filters.forgotten} onChange={e => setFilters({ ...filters, forgotten: e.target.checked })} />反复遗忘</label></div>
        <p className="filter-note">五格进度表示熟练度，点击即可调整；勾选的词跨页保留。</p>
        {!shown.length ? <Empty title={words.length ? '暂时没有匹配的词' : '从今天的几个词开始'} action={!words.length && <button className="primary" disabled={disabled} onClick={() => setImportOpen(true)}>加入今天的词</button>}>{words.length ? '换一个筛选条件，或搜索其他词。' : '粘贴单词，或让 ChatGPT 识别单词本照片。先确认，再保存。'}</Empty> : <div className="word-list">{pageWords.map(word => <div className={`word-row ${word.paused ? 'paused' : ''}`} key={word.id}><label className="word-check"><input type="checkbox" checked={manualIds.includes(word.id)} onChange={e => setManualIds(e.target.checked ? [...manualIds, word.id] : manualIds.filter(id => id !== word.id))} /><span><strong>{word.word}</strong><small>{word.user_note || word.meaning || (word.add_count > 1 ? `再次加入 ${word.add_count - 1} 次` : '等待放回语境')}{word.paused ? ' · 暂停自动选入' : ''}{word.learning_status === 'needs_review' && <b className="conversation-word-badge">对话生词</b>}</small></span></label><LevelSelect value={word.familiarity_level} label={`${word.word} 熟练度`} disabled={disabled} onChange={level => editWord(word, { level })} /><details className="row-more"><summary aria-label={`${word.word} 更多操作`}>···</summary><div className="row-menu"><button disabled={disabled} onClick={() => editWord(word, { paused: !word.paused })}>{word.paused ? '恢复自动选入' : '暂停自动选入'}</button><button className="danger" disabled={disabled} onClick={() => run('remove', async () => { const result = await write('remove_word', { word_id: word.id, expected_version: word.version }); setUndo(result.undo_event_ids ?? []); await refresh(); notify(`已移除 ${word.word}，可撤销。`); })}>移出词库</button></div></details></div>)}</div>}
        {shown.length > 0 && <nav className="pagination" aria-label="词库分页"><span className="page-count">共 {shown.length} 词 · {((visiblePage - 1) * pageSize) + 1}–{Math.min(visiblePage * pageSize, shown.length)}</span><label><span className="sr-only">每页词数</span><select aria-label="每页词数" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>{[12, 24, 48].map(n => <option key={n} value={n}>每页 {n} 词</option>)}</select></label><div className="page-buttons"><button aria-label="上一页" disabled={visiblePage === 1} onClick={() => setWordPage(visiblePage - 1)}>←</button><span aria-live="polite">{visiblePage} / {totalPages}</span><button aria-label="下一页" disabled={visiblePage === totalPages} onClick={() => setWordPage(visiblePage + 1)}>→</button></div></nav>}
      </div><aside className="selection-builder"><button className="quiet builder-closer" onClick={() => setBuilderOpen(false)}>← 返回词库</button><p className="eyebrow">YOUR NEXT SESSION</p><h2>这次学哪些词</h2><p className="muted">勾选想学的词，再搭配一点复习。</p><div className="builder-choices"><label className="check-label"><input type="checkbox" checked={includeToday} onChange={e => setIncludeToday(e.target.checked)} />带上今天加入的词</label><label className="stack-label">复习几个旧词 <input aria-label="复习旧词数量" type="number" min="0" max="40" value={autoCount} onChange={e => setAutoCount(Math.max(0, Math.min(40, Number(e.target.value))))} /></label><p className="muted small">优先复习容易忘记、较久没见的词。设为 0 就不加旧词。</p></div><div className="manual-summary"><strong>你勾选了 {manualIds.length} 个词</strong><div className="selected-chips">{words.filter(w => manualIds.includes(w.id)).map(w => <span key={w.id}>{w.word}<button aria-label={'取消勾选 ' + w.word} onClick={() => setManualIds(ids => ids.filter(id => id !== w.id))}>×</button></span>)}</div>{!manualIds.length && <p>在词库中勾选，想学的词都会保留。</p>}</div><button className="primary full-width" disabled={disabled || !words.length || (!includeToday && autoCount === 0 && !manualIds.length)} onClick={choose}>{busy === 'select' ? '正在选择…' : '选择目标词'}</button>{selection && <button className="quiet full-width" onClick={() => setPage('practice')}>继续已保存的 {selection.words.length} 个词 →</button>}</aside>
    </section>}
    {page === 'practice' && <section className="workspace practice-workspace"><div className="section-heading"><div><p className="eyebrow">READ IN CONTEXT</p><h1>阅读，从这组词开始</h1></div><button className="quiet" onClick={() => setPage('library')}>返回选词</button></div>{!selection?.words.length ? <Empty title="还没有选择目标词" action={<button className="primary" onClick={() => setPage('library')}>去词库选词</button>}>先选择今天的词，也可以加几枚旧词。阅读与交流都可以从这里开始。</Empty> : <div className="practice-grid"><div className="article-configuration"><label className="stack-label">主题 <input value={config.topic} onChange={e => setConfig({ ...config, topic: e.target.value })} placeholder="例如：AI 与大学学习" /></label><label className="stack-label">篇幅 <select aria-label="篇幅" value={config.length} onChange={e => setConfig({ ...config, length: e.target.value })}><option value="short">短篇 · 200–300 词</option><option value="standard">标准 · 350–500 词</option><option value="long">长篇 · 550–750 词</option><option value="custom">自定义篇幅</option></select></label>{config.length === 'custom' && <div className="two-fields"><label>至少 <input type="number" min="100" max="2000" value={config.min_words ?? 350} onChange={e => setConfig({ ...config, min_words: Number(e.target.value) })} /></label><label>至多 <input type="number" min="100" max="2000" value={config.max_words ?? 500} onChange={e => setConfig({ ...config, max_words: Number(e.target.value) })} /></label></div>}<details className="advanced"><summary>难度与句法 <span>{config.difficulty === 'standard' ? '考研标准' : config.difficulty === 'easy' ? '稍简单' : '稍难'}</span></summary><div className="two-fields"><label className="stack-label">难度 <select aria-label="文章难度" value={config.difficulty} onChange={e => setConfig({ ...config, difficulty: e.target.value })}><option value="easy">稍简单</option><option value="standard">考研标准</option><option value="hard">稍难</option></select></label><label className="stack-label">句法 <select aria-label="句法" value={config.syntax} onChange={e => setConfig({ ...config, syntax: e.target.value })}><option value="natural">自然阅读</option><option value="standard">考研标准</option><option value="intensive">长难句强化</option></select></label></div></details>{load?.high && <div className="load-warning"><strong>这些词需要更多阅读空间</strong><p>按当前熟练度与复现次数，建议至少约 {load.recommended_min_words} 词。今日词和手动词不会被擅自移除。</p><button disabled={disabled} onClick={() => setConfig({ ...config, length: 'custom', min_words: load.recommended_min_words, max_words: Math.ceil(load.recommended_min_words * 1.25) })}>增加篇幅</button><button onClick={() => setPage('library')}>调整词组</button><button className="primary" disabled={disabled || waiting} onClick={generateSplit}>{busy === 'generate-split' ? '正在分组…' : '分为多篇生成'}</button><details><summary>拆篇建议</summary><p>{load.groups?.length ? load.groups.map((ids, index) => <span className="split-group" key={index}>第 {index + 1} 篇：{ids.map(id => selection.words.find(word => word.id === id)?.word ?? '').join(' · ')}</span>) : '可在宿主聊天中要求把整组词拆为多篇，每篇列明覆盖的词。'}</p></details></div>}<button className="primary generation-button" disabled={disabled || waiting || Boolean(splitPlan) || Boolean(load?.high) || !config.topic.trim()} onClick={generate}>{waiting ? '等待 ChatGPT 完成文章…' : busy === 'generate' ? '正在准备…' : generation ? '继续完成已准备的文章' : '用这组词生成文章'}</button><p className="muted small">围绕目标词生成文章与语境释义，完成后自动保存，随时可以重读。</p>{splitPlan && <div className="pending-task" role="status"><p>分篇计划：已保存 {splitProgress} / {splitPlan.parts.length} 篇。每篇目标词已冻结，整组完成后再确认覆盖。</p>{!waiting && <><button disabled={disabled} onClick={() => { setWaiting(true); clearTimeout(pollTimer.current); watchToken.current++; pollSplit(splitPlan); }}>继续检查全部文章</button><button className="quiet" disabled={disabled} onClick={generateSplit}>继续请求未完成的分篇</button></>}</div>}{generation && !waiting && <div className="pending-task"><p>有一份尚未返回的文章任务，仍使用准备时的目标词与配置。</p><button disabled={disabled} onClick={continueGeneration}>继续检查保存结果</button><button className="quiet" disabled={disabled} onClick={() => { setGeneration(null); clearTimeout(pollTimer.current); notify('已放下等待中的任务；现在可以使用当前配置重新准备。'); }}>放下此任务，使用新配置</button></div>}{waiting && <div className="pending-task" role="status"><span className="loading-dot" />正在等待 ChatGPT 生成正文与释义，完成后自动显示。<button className="quiet" onClick={() => { clearTimeout(pollTimer.current); watchToken.current++; setWaiting(false); }}>暂时停止检查</button></div>}<button className="quiet" onClick={() => { setConversationTopic(config.topic); setPage('conversation'); }}>同一组词，直接进入交流 →</button></div><aside className="target-summary"><div className="summary-heading"><h2>当前目标词 <span>{selection.words.length}</span></h2><button className="quiet" disabled={disabled} onClick={() => run('reroll', async () => { const result = await write('reroll_auto_words', { selection_id: selection.id }); setSelection(result.selection); notify(result.warning ?? '已更换可替换的旧词；今日词和手动必选词保留。'); })}>换一批旧词</button></div><div className="target-list">{selection.words.map(word => <div className="target-row" key={word.id}><div><strong>{word.word}</strong><small>{word.reason || sourceLabels(word.sources)}</small></div><button className="icon-button" aria-label={`从目标词移除 ${word.word}`} disabled={disabled} onClick={() => modifySelection({ remove_ids: [word.id] })}>×</button></div>)}</div><details className="add-target"><summary>手动补词</summary><select aria-label="选择要补入的词" defaultValue="" disabled={disabled} onChange={e => { if (e.target.value) modifySelection({ add_ids: [e.target.value] }); e.target.value = ''; }}><option value="">从词库选择…</option>{words.filter(w => !selection.words.some(target => target.id === w.id)).map(w => <option key={w.id} value={w.id}>{w.word} · {levels[w.familiarity_level]}</option>)}</select><button className="quiet" onClick={() => setPage('library')}>搜索词库</button></details></aside></div>}</section>}
    {page === 'read' && article && <section className="reader-workspace"><div className="reader-toolbar"><button className="quiet" onClick={() => setPage('practice')}>← 目标词与配置</button><span>{article.word_count} 词 · 已保存</span><button className="quiet" onClick={() => { setConversationTopic(article.topic); setPage('conversation'); }}>同组词交流 →</button></div><div className="reader-layout"><article ref={readingRef} className="article-pane" onScroll={e => { const scrolls = { ...preferences.current.scrolls, [article.lesson_id]: e.currentTarget.scrollTop }; remember({ scrolls }); }}><p className="eyebrow">{article.topic}</p><h1>{article.title}</h1><div className="article-meta">暖绿色细线标出目标词。点击有映射的词即可查阅此处释义。</div><div className="prose">{renderProse()}</div>{article.quality_checks && <details className="reading-notes"><summary>文章写作说明</summary><p>{article.quality_checks.argument_notes}</p><p>{article.quality_checks.naturalness_notes}</p><small>由宿主模型作表达检查，不是考研质量评分。</small></details>}</article><aside className={`definition-panel ${occurrence ? 'has-definition' : ''}`} aria-label="语境释义">{statusNotice}{occurrence ? <><div className="definition-heading"><p className="eyebrow">IN THIS CONTEXT</p><button className="icon-button" aria-label="关闭释义并返回所选词" onClick={closeDefinition}>×</button></div><h2>{occurrence.surface_form}</h2><div className="pronunciation"><span className="pos-badge">{posLabel(occurrence.part_of_speech)}</span><span>{occurrence.phonetic || '音标待补全'}</span></div>{occurrence.lemma.toLowerCase() !== occurrence.surface_form.toLowerCase() && <p className="lemma-note">原形 · {occurrence.lemma}</p>}<p className="general-meaning">{occurrence.meaning}</p><div className="contextual-meaning"><span>本文</span><p>{occurrence.contextual_meaning}</p></div>{occurrence.collocation && <div className="collocation"><span>搭配</span><p>{occurrence.collocation}</p></div>}<DictionaryDetails item={occurrence} sentence={sentenceFor(occurrence)} />{(!occurrence.phonetic || !occurrence.definitions?.length || !occurrence.related_words || !occurrence.synonyms || !occurrence.example) && <button className="enrich-button full-width" disabled={disabled || detailsPending?.occurrence_id === occurrence.occurrence_id} onClick={enrichDefinition}>{detailsPending?.occurrence_id === occurrence.occurrence_id ? '正在补全词典资料…' : '补全音标、词族与例句 ↗'}</button>}<div className="feedback-controls"><p>这个词，你现在的感觉？</p><div>{[['unknown', '再学一次', '保存为 Lv.1'], ['vague', '有点印象', '保存为 Lv.3'], ['known', '能理解', '至少保存为 Lv.4']].map(([key, text, title]) => <button key={key} disabled={disabled} title={title} onClick={() => feedback(key)}>{text}</button>)}</div><small>明确反馈才改等级；查词本身不改。非词库词只提供建议。</small></div><button className="quiet syntax-button" disabled={disabled} onClick={analyze}>{busy === 'analysis' ? '正在请求…' : '查看这一句的结构'}</button>{analysis && <div className="sentence-analysis"><strong>句子结构</strong><Analysis value={analysis} /></div>}</> : <div className="definition-empty"><span aria-hidden="true">Aa</span><h2>把意思放回这一句</h2><p>点击正文中的词，释义会在这里切换。</p><small>查阅已经保存的释义，无需等待生成。</small></div>}</aside></div></section>}
    {page === 'conversation' && <section className="workspace conversation-workspace">
      <div className="section-heading"><div><p className="eyebrow">THINK · SPEAK · CONNECT</p><h1>英语交流</h1></div><button className="quiet" onClick={() => setPage('practice')}>查看同组词</button></div>
      <div className="conversation-grid">
        <div><p className="intro-copy">从你的想法出发，<br />让词汇自然进入交流。</p>
          <label className="stack-label">话题 <input value={conversationTopic} onChange={e => { setConversationTopic(e.target.value); setCustomOpening(''); setOpeningVariant(0); }} placeholder={config.topic || '自由交流，也可以指定话题'} /></label>
          <label className="stack-label">节奏 <select aria-label="交流节奏" value={conversationMode} onChange={e => setConversationMode(e.target.value)}><option value="relaxed">轻松 · 跟随话题</option><option value="balanced">均衡 · 自然加入词汇锚点</option><option value="intensive">强化 · 多一些目标词机会</option></select></label>
          <details className="conversation-picker"><summary>选词（可选） · 已选 {selection?.words.length ?? 0} 个</summary><p className="muted small">在这里搜索、勾选即可。不选词也能直接聊。</p><div className="selected-chips">{selection?.words.map(word => <span key={word.id}>{word.word}<button disabled={disabled} aria-label={'本次不练 ' + word.word} onClick={() => toggleConversationWord(word)}>×</button></span>)}</div><input type="search" aria-label="搜索交流用词" placeholder="搜索单词或笔记" value={conversationWordSearch} onChange={e => setConversationWordSearch(e.target.value)} /><div className="conversation-picker-list">{words.filter(word => (word.word + ' ' + (word.user_note || word.meaning || '')).toLowerCase().includes(conversationWordSearch.trim().toLowerCase())).sort((a, b) => Number(selection?.words.some(w => w.id === b.id) ?? false) - Number(selection?.words.some(w => w.id === a.id) ?? false)).slice(0, 40).map(word => <label className="check-label" key={word.id}><input type="checkbox" aria-label={'交流用词 ' + word.word} disabled={disabled} checked={selection?.words.some(item => item.id === word.id) ?? false} onChange={() => toggleConversationWord(word)} /><span><strong>{word.word}</strong><small>{word.user_note || word.meaning}</small></span></label>)}</div>{!words.length && <p className="muted small">词库暂时为空，可以先直接交流。</p>}{words.length > 40 && <p className="muted small">最多显示 40 个匹配词，可搜索其他词。</p>}</details>
          <p className="muted small">点“开始交流”会把主题、开场白和目标词发送到当前聊天。等 ChatGPT 回复“好，我们开始吧。”后，手动点击语音按钮，按选定的开场白开始交流。</p><p className="learning-capture-note">明确表示不懂的词会自动收录；说“结束练习”后按当前聊天可见的真实发言记录并复盘。</p>
        </div>
        <aside className="conversation-context"><p className="eyebrow">YOUR NEXT CONVERSATION</p><div className="conversation-preview"><span className="preview-tag">开场预览</span><h2>{effectiveTopic || '从你感兴趣的事聊起'}</h2><label className="stack-label">开场问题 · 可直接修改<textarea className="opening" aria-label="自定义开场白" value={previewOpening} maxLength={2000} rows={4} onChange={e => setCustomOpening(e.target.value)} /></label><button className="quiet" onClick={() => { setCustomOpening(''); setOpeningVariant(v => v + 1); }}>换个推荐开场 ↻</button></div>
          <details className="conversation-word-set"><summary>目标词 · {selection?.words.length ?? 0}</summary><p className="word-cloud">{selection?.words.map(w => w.word).join(' · ')}</p></details>
          <div className="conversation-action"><button className="primary full-width" disabled={disabled} onClick={startConversation}>{busy === 'host-chat' ? '正在发送练习主题…' : voicePrepared ? '重新发送本次话题' : '开始交流'}</button>{voicePrepared && <div className="voice-ready" role="status"><strong>练习主题已发送到聊天</strong><p>等 ChatGPT 回复“好，我们开始吧。”后，手动点击语音按钮开始。</p><small>本次主题：{conversation?.topic} · 英语交流。若语音等待你先说话，说一句“开始吧”。</small></div>}</div>
          {conversation && <div className="conversation-review"><h3>聊后复盘</h3><p className="muted small">结束练习后由 ChatGPT 自动记录并分析。没有出现复盘时，可点下方按钮，无需粘贴。</p><button disabled={disabled || reviewRequested} onClick={reviewConversation}>{reviewRequested ? '等待分析保存…' : '结束并复盘'}</button>{reviewRequested && <button className="quiet" onClick={() => setReviewRequested(false)}>暂时停止等待</button>}{conversation.review ? <><p>{conversation.review.summary}</p>{(conversation.turns?.length ?? 0) > conversation.review.turn_count && <p className="muted small">复盘后又有新发言，可再次复盘。</p>}{conversation.review.strengths.length > 0 && <div><strong>做得好的地方</strong><ul>{conversation.review.strengths.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}{conversation.review.gaps.map((gap, i) => <div className="review-gap" key={i}><strong>{{ vocabulary: '词汇', grammar: '语法', expression: '表达', comprehension: '理解' }[gap.kind]}</strong><blockquote>{gap.quote}</blockquote><p>{gap.correction}</p><p className="muted small">{gap.explanation}</p></div>)}{conversation.review.gaps.length === 0 && <p className="muted small">本次记录没有足够依据标记具体薄弱点。</p>}{conversation.review.next_steps.length > 0 && <div><strong>下次练什么</strong><ul>{conversation.review.next_steps.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}</> : <p className="muted small">等待真实发言与分析结果。仅准备练习不会生成掌握情况。</p>}</div>}
          {!selection?.words.length && <p className="muted small">本次自由交流，随时可在词库加入练习词。</p>}
        </aside>
      </div>
    </section>}    {page === 'history' && <section className="workspace history-workspace"><div className="section-heading"><div><p className="eyebrow">RETURN TO A CONTEXT</p><h1>历史文章</h1></div><button className="quiet" disabled={disabled} onClick={() => run('history', async () => { const result = await call('list_articles'); setArticles(result.articles); })}>刷新</button></div>{articles.length ? <div className="history-list">{articles.map(item => <button key={item.lesson_id} disabled={disabled} onClick={() => run('open-article', async () => { const result = await call('get_article', { lesson_id: item.lesson_id }); setArticle(result.article); setOccurrence(null); setPage('read'); })}><div><span>{item.topic}</span><h2>{item.title}</h2><small>{item.word_count} 词 · {new Date(item.created_at).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small></div><span aria-hidden="true">↗</span></button>)}</div> : <Empty title="给词汇留下一段可重读的语境" action={<button className="primary" onClick={() => setPage('practice')}>准备第一篇文章</button>}>生成并保存的文章会留在这里，包括每处词义映射与阅读位置。</Empty>}</section>}
    {importOpen && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) setImportOpen(false); }}><section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onKeyDown={e => { if (e.key !== 'Tab') return; const list = [...e.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')]; if (!list.length) return; if (e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1).focus(); } else if (!e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0].focus(); } }}><div className="section-heading"><div><p className="eyebrow">ADD & CONFIRM</p><h2 id="import-title">{preview ? '确认这些词，再加入词库' : '加入今天的词'}</h2></div><button className="icon-button" aria-label="关闭单词导入" disabled={Boolean(busy)} onClick={() => setImportOpen(false)}>×</button></div>{error.includes('词库服务暂时不可达') && <div className="modal-reconnect" role="status"><span>词库暂不可达</span><button className="quiet" disabled={disabled} onClick={reconnect}>重新连接词库</button></div>}{preview ? <><div className="import-summary"><strong>{preview.items.length} 个候选词</strong><span>{preview.new_count} 新词 · {preview.existing_count} 已存在{preview.duplicate_count ? ` · 已合并 ${preview.duplicate_count} 个批内重复` : ''}</span></div><div className="import-items">{preview.items.map((item, index) => <div key={item.id} className={`import-row ${item.uncertain ? 'uncertain' : ''}`}><label className="check-label"><input aria-label={`确认加入 ${item.word}`} type="checkbox" checked={item.included} onChange={e => setPreview({ ...preview, items: preview.items.map((x, i) => i === index ? { ...x, included: e.target.checked } : x) })} /></label><div className="import-word-fields"><input aria-label={`编辑候选词 ${index + 1}`} value={item.word} onChange={e => setPreview({ ...preview, items: preview.items.map((x, i) => i === index ? { ...x, word: e.target.value } : x) })} /><input className="note-input" aria-label={`${item.word} 中文笔记`} placeholder="中文笔记（可选）" value={item.user_note ?? ''} onChange={e => setPreview({ ...preview, items: preview.items.map((x, i) => i === index ? { ...x, user_note: e.target.value } : x) })} /><small>{item.uncertain ? '请核对识别结果 · ' : ''}{item.existing ? `已存在 · 再次加入 ${item.previous_level} → ${item.level}` : '新词'}{item.existing && item.previous_level !== item.level && <button className="restore-level" onClick={() => setPreview({ ...preview, items: preview.items.map((x, i) => i === index ? { ...x, level: x.previous_level } : x) })}>恢复原等级</button>}</small></div><LevelSelect label={`${item.word} 加入后熟练度`} value={item.level} onChange={level => setPreview({ ...preview, items: preview.items.map((x, i) => i === index ? { ...x, level } : x) })} /></div>)}</div><div className="modal-footer"><button className="quiet" disabled={disabled} onClick={() => setPreview(null)}>重新输入</button><button className="primary" disabled={disabled || !preview.items.some(x => x.included && x.word.trim())} onClick={confirmImport}>{busy === 'confirm' ? '正在保存…' : `确认加入 ${preview.items.filter(x => x.included).length} 个词`}</button></div></> : <><p className="muted">每行一个词，也可用空格、逗号或分号分隔。合法连字符会保留。</p><textarea autoFocus aria-label="输入或粘贴单词" value={importText} onChange={e => setImportText(e.target.value)} rows={7} placeholder={'compelling\nretain\ndiminish\nimpose\nconventional'} /><div className="import-image-help"><label className="file-button"><input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={uploadImage} />从图片识别</label><span>{imageWaiting ? '等待宿主识别，结果不会直接保存。' : '也可在 ChatGPT 聊天中附上单词本照片，要求先确认。'}</span></div><div className="modal-footer"><span className="muted small">再次主动加入会适度降级；批内重复只计一次。</span><button className="primary" disabled={disabled || !importText.trim()} onClick={stageText}>{busy === 'import' ? '整理中…' : '检查并确认'}</button></div></>}{error && <div className="modal-error" role="alert"><span>{error}</span></div>}</section></div>}
    <footer className="app-footer"><span>{busy ? '正在保存或同步，请稍候…' : '词库与文章保存在连接的服务中；两端访问同一服务即可同步。'}</span><small data-ui-version={UI_VERSION}>界面 v{UI_VERSION}</small></footer>
  </main>;
}
function posLabel(value = '') {
  const key = value.trim().toLowerCase().replace(/\.$/, '');
  return ({ noun: 'n.', 名词: 'n.', verb: 'v.', 动词: 'v.', adjective: 'adj.', 形容词: 'adj.', adverb: 'adv.', 副词: 'adv.', preposition: 'prep.', 介词: 'prep.', conjunction: 'conj.', 连词: 'conj.', pronoun: 'pron.', 代词: 'pron.', determiner: 'det.', 'past participle': 'v. / 过去分词', 'present participle': 'v. / 现在分词' })[key] ?? value;
}
function DictionaryDetails({ item, sentence }) {
  return <div className="dictionary-details">
    {item.definitions?.length > 0 && <section className="dictionary-section"><h3>常见义项</h3><ol className="sense-list">{item.definitions.map((sense, i) => <li key={i}><span className="pos-badge">{posLabel(sense.part_of_speech)}</span><span>{sense.meaning}</span></li>)}</ol></section>}
    {[[item.related_words, '同根词', 'word-family'], [item.synonyms, '近义词 · 辨析', 'synonyms']].map(([entries, title, key]) => entries && <section key={key} className="dictionary-section"><h3>{title}</h3>{entries.length ? <div className="related-list">{entries.map((entry, i) => <div key={i}><strong>{entry.word}</strong><span>{entry.meaning}</span></div>)}</div> : <p className="muted small">暂无合适的{key === 'word-family' ? '同根词' : '近义词'}。</p>}</section>)}
    <section className="dictionary-section example-card"><h3>{item.example ? '例句' : '本文原句'}</h3><p lang="en">{item.example?.sentence || sentence}</p>{item.example?.translation && <p className="example-translation">{item.example.translation}</p>}</section>
  </div>;
}
function sourceLabels(sources = []) { return sources.map(source => ({ today: '今日词', manual: '手动必选', auto: '自动补充旧词', TODAY: '今日词', MANUAL: '手动必选', AUTO: '自动补充旧词' })[source] ?? source).join(' · '); }
function Analysis({ value }) { if (typeof value === 'string') return <p>{value}</p>; return <div>{Object.entries(value ?? {}).map(([key, text]) => <p key={key}><span>{({ sentence: '原句', feature: '结构', explanation: '说明', main_clause: '主干', clauses: '从句', modifiers: '修饰', nonfinite: '非谓语', parenthetical: '插入语' })[key] ?? key}</span><br />{typeof text === 'string' ? text : JSON.stringify(text)}</p>)}</div>; }
createRoot(document.getElementById('root')).render(<VocabularyApp />);
