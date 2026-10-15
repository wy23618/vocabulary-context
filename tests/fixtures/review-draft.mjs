// Original occurrence-specific glosses written by Codex's subscription model.
// DEVELOPMENT QA ONLY. This module is never imported by the production server/UI.
import { articleText, editorialChecks } from './review-passage.mjs';

// surface | lemma | POS | ordinary meaning | meaning in this passage | collocation
const entries=`universities|university|n.|大学|作为教育和评价机构的大学|universities assess learning
long|long|adv.|长时间地；长期以来|长期以来一直如此|have long treated
treated|treat|v.|对待；看作|把学生论文视为判断理解程度的依据|treat an essay as evidence
essay|essay|n.|论文；短文|学生提交的论述性作业|write an essay
evidence|evidence|n.|证据；依据|支撑对理解程度或结论的判断的依据|evidence of understanding
student|student|n.|学生|论文的写作者|a student understands
understands|understand|v.|理解；懂得|真正理解所学内容|understand an argument
conventional|conventional|adj.|惯常的；传统的|惯常采用的评价假设|a conventional assumption
assumption|assumption|n.|假设；未经证明的看法|论文可以证明学生理解程度的预设|a conventional assumption
becomes|become|v.|变得；成为|开始变得不再可靠|become less secure
secure|secure|adj.|安全的；可靠的|作为判断基础的可靠性|a secure assumption
assistant|assistant|n.|助手|能生成文本的人工智能助手|an AI assistant
produce|produce|v.|生产；生成|生成一段成形的论证|produce an argument
polished|polished|adj.|润色完善的；精致的|文字表达流畅、经过修饰的|a polished argument
argument|argument|n.|论证；争论|有组织地支持观点的论述|a polished argument
seconds|second|n.|秒|极短的生成时间|in seconds
yet|yet|conj.|然而；但是|转向更值得关注的问题|yet the question remains
compelling|compelling|adj.|有说服力的；引人关注的|值得认真思考的|a compelling question
question|question|n.|问题|关于应当如何使用AI的关键问题|a compelling question
whether|whether|conj.|是否|引出应不应该使用AI的选择|whether students should use AI
students|student|n.|学生|使用AI并接受学习评价的学生|students explain their reasoning
use|use|v.|使用；运用|使用人工智能辅助学习|use artificial intelligence
artificial|artificial|adj.|人工的；人造的|人工智能一词中的“人工”|artificial intelligence
intelligence|intelligence|n.|智力；智能|技术系统展现的智能能力|artificial intelligence
forms|form|n.|形式；种类|不同类型的辅助方式|forms of assistance
assistance|assistance|n.|帮助；协助|AI对学生学习和写作的辅助|forms of assistance
allow|allow|v.|允许；使得|使学生能够继续承担思考责任|allow learners to retain responsibility
retain|retain|v.|保留；保持|继续承担自己的思考责任|retain responsibility
responsibility|responsibility|n.|责任；职责|自己进行思考和判断的责任|responsibility for thinking
own|own|adj.|自己的|学生自己进行的思考|their own thinking
thinking|thinking|n.|思考；思想|学习者独立进行的思维活动|independent thinking
tool|tool|n.|工具|用于辅助学习的AI工具|a learning tool
suggests|suggest|v.|建议；提出|提出其他可能的解释|suggest alternative explanations
alternative|alternative|adj.|可替代的；其他可选择的|不同于最初解释的其他解释|alternative explanations
explanations|explanation|n.|解释；说明|对同一问题的不同理解方式|compare explanations
help|help|v.|帮助|帮助学习者发现理解上的缺陷|help a learner notice
learner|learner|n.|学习者|正在理解、判断和学习的人|the learner's judgment
notice|notice|v.|注意到；察觉|察觉原本未发现的理解弱点|notice a weakness
weakness|weakness|n.|弱点；不足|理解或论证中的薄弱之处|a weakness in reasoning
otherwise|otherwise|adv.|否则；在其他情况下|如果没有工具提出其他解释|otherwise remain hidden
remain|remain|v.|仍然是；保持|继续处于未被发现的状态|remain hidden
hidden|hidden|adj.|隐藏的；未显露的|尚未被学习者发现的|a hidden weakness
contrast|contrast|n.|对比；差异|引出提供完整答案这一相反情形|by contrast
supplies|supply|v.|提供；供应|直接提供一个完整答案|supply a complete answer
complete|complete|adj.|完整的；全部的|已经完成、不需再自行构建的|a complete answer
answer|answer|n.|答案；回答|由工具直接给出的答案|supply an answer
before|before|conj.|在……之前|学习者尚未尝试时|before an attempt is made
attempt|attempt|n.|尝试；努力|学习者自己先作出的尝试|make an attempt
made|make|v.|做出；制作|作出一次学习尝试|an attempt has been made
diminish|diminish|v.|减少；减弱|降低学习者投入的思考努力|diminish the effort
effort|effort|n.|努力；投入|形成理解所需的认知投入|intellectual effort
understanding|understanding|n.|理解；领会|对内容的实质理解|understanding develops
develops|develop|v.|发展；逐步形成|通过努力逐步形成|understanding develops
distinction|distinction|n.|区别；区分|启发思考与替代思考的差别|the distinction matters
matters|matter|v.|要紧；有重要性|这种区别具有重要意义|the distinction matters
because|because|conj.|因为|引出不能以流畅文字判断理解的原因|because language may conceal
fluent|fluent|adj.|流畅的；熟练的|表达顺畅但未必体现深入理解的|fluent language
language|language|n.|语言；语言表达|答案的文字表达|fluent language
conceal|conceal|v.|隐藏；掩盖|掩盖推理的浅薄|conceal shallow reasoning
shallow|shallow|adj.|浅的；肤浅的|缺少深入理解和论证的|shallow reasoning
reasoning|reasoning|n.|推理；论证过程|从依据推出结论的思维过程|make reasoning visible
repeat|repeat|v.|重复；复述|复述别人已经给出的结论|repeat a conclusion
conclusion|conclusion|n.|结论|论证所得出的判断|repeat a conclusion
still|still|adv.|仍然；依旧|即便能复述结论仍存在困难|still struggle
struggle|struggle|v.|艰难地尝试；费力|很难解释结论如何得到|struggle to explain
explain|explain|v.|解释；说明|说明结论或使用助手时的判断过程|explain one's reasoning
follows|follow|v.|跟随；由……推出|结论在逻辑上由证据推导而来|follow from the evidence
simply|simply|adv.|仅仅；只是|只采取禁止措施|simply prohibit
prohibiting|prohibit|v.|禁止|禁止学生使用这些AI系统|prohibit these systems
systems|system|n.|系统；体系|人工智能辅助系统|AI systems
impose|impose|v.|强加；施加|使学生和学校承担额外代价|impose costs
costs|cost|n.|成本；代价|禁止AI带来的管理和学习代价|impose costs
without|without|prep.|没有；不|在没有解决根本问题的情况下|without resolving the problem
resolving|resolve|v.|解决；化解|解决无法确认真实理解的问题|resolve a problem
problem|problem|n.|问题；难题|流畅答案不能证明真实理解的问题|resolve that problem
rules|rule|n.|规则；规定|禁止使用AI的规定|enforce rules
difficult|difficult|adj.|困难的；难以处理的|难以实际执行的|difficult to enforce
enforce|enforce|v.|执行；强制实施|确保禁用规定真正得到遵守|enforce rules
deny|deny|v.|否认；拒绝给予|使部分学生无法获得有用帮助|deny support to students
useful|useful|adj.|有用的；有益的|确实能帮助学习的|useful support
support|support|n.|支持；帮助|AI可以提供的学习辅助|useful support
preparation|preparation|n.|准备；准备程度|学生此前学习准备的程度|uneven preparation
uneven|uneven|adj.|不均衡的；参差不齐的|不同学生的学习准备存在差距|uneven preparation
approach|approach|n.|方法；处理方式|评价学生使用AI过程的方法|a compelling approach
require|require|v.|要求；需要|要求学生说明自己的判断过程|require learners to explain
learners|learner|n.|学习者|需要解释使用助手过程的学生|require learners to explain
evaluated|evaluate|v.|评价；评估|判断助手建议是否可靠或适用|evaluate suggestions
assistant's|assistant|n.|助手的|属于AI助手、由它提出的|an assistant's suggestions
suggestions|suggestion|n.|建议；意见|AI助手提供的建议|evaluate suggestions
claims|claim|n.|主张；论断|助手提出、需要核查的论断|reject claims
rejected|reject|v.|拒绝；不接受|认为某些论断不成立而不予采纳|reject a claim
changed|change|v.|改变；修改|核查资料后修改自己的内容|change after checking sources
after|after|conj.|在……之后|核查资料之后|after checking sources
checking|check|v.|检查；核实|核查信息来源及其可靠性|check the sources
sources|source|n.|来源；资料来源|作为论证依据的信息资料|check the sources
teachers|teacher|n.|教师|负责评价学习过程的教师|teachers assess reasoning
short|short|adj.|短的；简短的|篇幅或时间不长的讨论|a short discussion
discussion|discussion|n.|讨论；交流|帮助显示真实推理过程的口头讨论|retain a discussion
alongside|alongside|prep.|与……一起；在……旁边|在书面作业之外同时安排|alongside the written work
written|written|adj.|书面的；文字形式的|以文字形式提交的|written work
work|work|n.|工作；作品；作业|学生提交的书面作业|written work
making|make|v.|使得；制作|使推理过程可以被观察到|make reasoning visible
visible|visible|adj.|可见的；明显的|能够被教师明确观察到的|make reasoning visible
rather|rather|adv.|而是；宁可|用于rather than，强调避免另一做法|rather than assuming
assuming|assume|v.|假定；认为|仅凭最终作品就推定学生具有推理能力|assume from the final product
final|final|adj.|最后的；最终的|完成后提交的|the final product
product|product|n.|产品；成果|学生最终提交的写作成果|the final product
mean|mean|v.|意味着；意思是|并不意味着传统写作失去价值|this does not mean
writing|writing|n.|写作；书面表达|传统的学生写作活动|conventional writing
loses|lose|v.|失去；丧失|失去其教育价值|lose its value
value|value|n.|价值；重要性|写作本身的教育意义|the value of writing
means|mean|v.|意味着；意思是|意味着评价需要作出区分|it means that
assessment|assessment|n.|评估；评价|对学生学习和作业的评价|educational assessment
distinguish|distinguish|v.|区分；辨别|区分辅助思考与替代思考|distinguish assistance from substitution
substitution|substitution|n.|替代；代替|用技术取代学习者自己的判断|assistance versus substitution
technology|technology|n.|技术|辅助学习的AI技术|technology supports learning
reduces|reduce|v.|减少；降低|减少常规重复工作的投入|reduce routine effort
routine|routine|adj.|常规的；例行的|重复性、并非核心判断的|routine effort
while|while|conj.|当……时；与此同时；而|在减少常规工作时仍保留判断|while leaving judgment
leaving|leave|v.|留下；留给|把判断权留给学习者|leave judgment to the learner
judgment|judgment|n.|判断；判断力|学习者自己评估和决定的能力|independent judgment
widen|widen|v.|扩大；拓宽|扩大获得教育的机会|widen access to education
access|access|n.|获得的机会；进入权|接触并接受教育的机会|access to education
education|education|n.|教育|促进理解、判断和独立性的学习过程|access to education
replaces|replace|v.|取代；替换|替学习者完成本应由其作出的判断|replace judgment
precisely|precisely|adv.|恰恰；正是|恰恰削弱了教育所要培养的能力|precisely the independence
independence|independence|n.|独立性；自主性|自主思考和判断的能力|intellectual independence
intended|intend|v.|意图；打算|教育以培养独立性为目的|be intended to cultivate
cultivate|cultivate|v.|培养；培育|逐步培养独立判断的能力|cultivate independence`;
const glossary=new Map(entries.split('\n').map(row=>{const [surface,lemma,part_of_speech,meaning,contextual_meaning,collocation]=row.split('|');return [surface,{lemma,part_of_speech,meaning,contextual_meaning,collocation}];}));
const targets=new Set(['compelling','retain','diminish','impose','conventional']);
const occurrenceOverrides={
  compelling:[{contextual_meaning:'引人深思、值得认真探究的（问题）',collocation:'a compelling question'},{contextual_meaning:'更有说服力、更加有效的（处理方法）',collocation:'a more compelling approach'}],
  retain:[{contextual_meaning:'继续保有并承担自己思考的责任',collocation:'retain responsibility for their own thinking'},{contextual_meaning:'保留一个简短的讨论环节',collocation:'retain a short discussion'}],
  diminish:[{contextual_meaning:'减少学习者主动投入的认知努力',collocation:'diminish the effort'},{contextual_meaning:'削弱教育本来要培养的自主判断能力',collocation:'diminish independence'}],
  conventional:[{contextual_meaning:'惯常采用的（论文可以证明理解程度的）评价假设',collocation:'a conventional assumption'},{contextual_meaning:'传统的、以书面论述为主的写作活动',collocation:'conventional writing'}],
  effort:[{contextual_meaning:'学习者为形成理解而主动投入的认知努力',collocation:'the effort through which understanding develops'},{contextual_meaning:'例行、重复性工作的投入',collocation:'routine effort'}],
  evidence:[{contextual_meaning:'用于判断学生理解程度的依据',collocation:'an essay as evidence'},{contextual_meaning:'支持推导某一结论的证据',collocation:'follow from the evidence'}],
};

/** A real development reading with authored glosses; not a production model substitute. */
export async function buildReviewDraft(service) {
  const tokens=service?(await service.execute('tokenize_article',{article:articleText})).tokens:[...articleText.matchAll(/[\p{L}]+(?:['’\-][\p{L}]+)*/gu)].map((m,index)=>({index,surface_form:m[0]}));
  const seen=new Map();const word_map=[];
  for(const token of tokens){const key=token.surface_form.toLowerCase(),definition=glossary.get(key);if(!definition){if(token.requires_mapping)throw new Error(`Unreviewed content word: ${token.surface_form}`);continue;}
    const occurrence=seen.get(key)??0;seen.set(key,occurrence+1);word_map.push({token_index:token.index,surface_form:token.surface_form,...definition,...(occurrenceOverrides[key]?.[occurrence]??{}),target:targets.has(key)});
  }
  return {title:'When Assistance Leaves Room for Judgment',topic:'AI与大学学习',article:articleText,word_map,syntax_features:[
    {sentence:'Yet the most compelling question is not whether students should use artificial intelligence, but which forms of assistance allow them to retain responsibility for their own thinking.',feature:'并列表语从句与不定式补语',explanation:'主干为the question is not A, but B。whether和which分别引出两个表语从句；allow them to retain中to retain是宾语them后的不定式补语。重点转向辅助的形式。'},
    {sentence:'By contrast, a tool that supplies a complete answer before any attempt has been made can diminish the effort through which understanding develops.',feature:'定语从句、时间状语从句与介词前置',explanation:'主干为a tool can diminish the effort。that supplies修饰tool，其中before引出时间状语从句；through which understanding develops修饰effort，表示理解通过这种努力形成。'},
    {sentence:"A more compelling approach would require learners to explain how they evaluated an assistant's suggestions, which claims they rejected, and what they changed after checking the sources.",feature:'三个并列宾语从句与非谓语时间结构',explanation:'主干为an approach would require learners to explain。how、which、what引出explain后并列的宾语从句；after checking the sources表示核查资料后的修改。'},
    {sentence:'Teachers could retain a short discussion alongside the written work, making the reasoning visible rather than assuming it from the final product.',feature:'现在分词补充说明与rather than结构',explanation:'主干为Teachers could retain a short discussion。making补充说明保留讨论的作用；make的宾语reasoning后接形容词visible作宾语补语。rather than assuming强调不应仅凭成品推定推理能力。'},
  ],quality_checks:editorialChecks};
}
