# Skill 行为前向走查

2026-10-14，依据当前 `skills/vocabulary-context/SKILL.md`、`server/schemas.mjs`、`server/service.mjs` 进行人工流程推演。本报告是工作流审阅，不是 ChatGPT 真机模型执行，也不是插件安装成功证明。

| 场景 | 必须采取的顺序/保留数据 | 本次修正 |
|---|---|---|
| 今日词 + 旧词，自定义 AI 大学文章，UI 已有 generation ID | get_generation → prepared 则直接使用冻结 words/config/instructions → prose → tokenize → validate → save；saved 则 get_article | 原来“Otherwise prepare”可能给已准备请求再建 generation；现明确不再准备、不得覆盖自定义主题或取当前另一词组 |
| 模糊纸质词本，有重复熟词 | 宿主读取真实图片 → recognized_items（中文 note、具体 uncertain）→ import preview → 显示去重/旧→新等级/不确定条目 → 人工确认 → confirm_import | 明确不确定条目不得悄悄接受；stage/confirm 使用不同 request ID，各自重试复用；不是把批内重复当重新加入 |
| 同一组直接交流 | prepare_conversation，不依赖 article → 当前宿主自由交流 → 下一回合记录已交付 AI 和实际用户文本，actor 分开 | 禁止记录 prepared opening/尚未发送的回答；每 actor completed turn 一个 ID；不能每回合重复提交全历史 |
| validate 缺释义映射，重试 | 读取 valid:false/errors.details/tokens → 原正文只补缺失映射 → 同 generation 重验 → 保存 raw draft | tokens 返回属性是 index，draft 输入是 token_index；修正映射复制；禁止把 normalized_article 的服务端附加字段传到 strict draft |
| UI sendMessage 成功，但未 save | get_generation → prepared 就显示未保存并继续已有生成链；saved + 持久文章才算完成 | 明确消息确认不是成功，重试不能换 generation；save response 丢失先查询再幂等重试 |

附加对齐：request 去重表的 ID 是全局主键，故不同工具操作必须不同 stable ID；同 ID 改输入会冲突。多词目标短语需使用 tokenizer 返回首末 start/end，并避免同位置重叠映射。正文修改后须重新分词、核对全部索引，不能沿用旧释义位置。

尚需真实模型走查：350–500 词正文全实义词的映射完整性、自然度及工具参数负担；拆篇时每组 generation 的创建、合并覆盖和原词组恢复；图片重复行的多条中文 note 合并策略（当前 preview 保留首次重复条目，后续 note 不自动合并）。本审阅未修改业务或 UI。
