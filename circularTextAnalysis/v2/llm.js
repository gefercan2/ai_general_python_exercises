/* llm.js v2 — Lexia: backend bridge, LLM calls, classical topics + LLM naming.
   Remove the <script src="llm.js"> line (or set LLM_ENABLED=false) to disable LLM features. */
const LLM_ENABLED = true;
const LLM_MODELS = { quick:'llama3.1:8b', balanced:'deepseek-r1:7b', deep:'gemma2:12b' };
const PROMPT_VERSION = '2';   // bump when you edit any prompt: invalidates old cached answers
const NUM_CTX = 8192;
let llmLevel = 'quick';
let analysisFocus = 'generic'; // 'generic' | 'literary'
let CAPS = { backend:false, parse:{}, topics:false, nlp:{}, memory:{}, ollama:{ up:false, models:[] } };

/* ═════ CAPABILITIES ═════ */
async function loadCapabilities(){
  try{
    const r = await fetch('/api/capabilities');
    if(!r.ok) throw new Error('no backend');
    CAPS = Object.assign({ backend:true }, await r.json());
  }catch(e){ CAPS.backend = false; }
  renderCapsNote();
  const s = document.getElementById('llm-slider');
  setLlmLevel(s ? s.value : 0);
}

function renderCapsNote(){
  const el = document.getElementById('caps-note');
  const nn = document.getElementById('nlp-note');
  const ok = b => b ? '✓' : '✗';
  const nlp = CAPS.nlp || {};
  if(el){
    el.textContent = !CAPS.backend ? 'backend offline — start the app with run.py'
      : `pdf ${ok(CAPS.parse.pdf)} · docx ${ok(CAPS.parse.docx)} · html ✓ · topics ${ok(CAPS.topics)} · spaCy ${ok(nlp.spacy)} · ollama ${ok(CAPS.ollama.up)}`;
  }
  if(nn){
    if(!CAPS.backend) nn.textContent = 'needs the Python backend (run.py)';
    else if(nlp.spacy) nn.textContent = 'models: ' + Object.entries(nlp.models).map(([l, m]) => l + ' → ' + m).join(', ');
    else if(nlp.installed) nn.textContent = 'spaCy found but no language model. Run: python3 -m spacy download en_core_web_sm';
    else nn.textContent = 'not installed — basic analysis is used. Optional: pip install spacy';
  }
}

function modelInstalled(name){
  const m = CAPS.ollama.models;
  if(!m.length) return true; // unknown: don't warn
  return m.some(x => x === name || x === name + ':latest');
}

function setLlmLevel(v){
  const map = {0:'quick', 1:'balanced', 2:'deep'};
  llmLevel = map[v] || 'quick';
  const name = LLM_MODELS[llmLevel];
  const warn = modelInstalled(name) ? '' : '  ⚠ not installed (run: ollama list)';
  document.getElementById('llm-level-label').textContent = llmLevel + ' · ' + name + warn;
}

function setAnalysisFocus(v){
  analysisFocus = v;
  document.getElementById('focus-generic').classList.toggle('active', v==='generic');
  document.getElementById('focus-literary').classList.toggle('active', v==='literary');
}

/* ═════ SMALL UI HELPERS ═════ */
let _lastToast = 0;
function llmToast(msg){
  const now = Date.now(); if(now - _lastToast < 20000) return; _lastToast = now;
  const d = document.createElement('div');
  d.textContent = '⚠ ' + msg;
  d.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:9999;' +
    'background:rgba(15,15,24,.96);border:0.5px solid var(--rose);color:var(--rose);' +
    'font:10px DM Mono,monospace;padding:9px 14px;border-radius:7px;max-width:80vw';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 7000);
}

function safeJson(t){
  if(!t) return null;
  try{ return JSON.parse(t); }catch(e){}
  const m = t.match(/\{[\s\S]*\}/);
  if(m){ try{ return JSON.parse(m[0]); }catch(e){} }
  return null;
}

/* ═════ PHASE A — FILE PARSING ═════ */
async function parseOnBackend(file){
  const r = await fetch('/api/parse?filename=' + encodeURIComponent(file.name), { method:'POST', body:file });
  const j = await r.json();
  if(!r.ok) throw new Error(j.error || 'could not read file');
  return j.text;
}

/* ═════ LLM CALL (cached in SQLite by the backend) ═════
   memKey (optional): enables the "learn from corrections" examples from memory.js */
async function callLLM(task, prompt, asJson, memKey){
  if(!LLM_ENABLED || !CAPS.backend) return null;
  if(memKey && typeof memoryAugment === 'function'){
    try{ prompt = await memoryAugment(task, prompt, memKey); }
    catch(e){ console.warn('memory skipped:', e); }
  }
  try{
    const r = await fetch('/api/llm', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ task, prompt, json:!!asJson, model:LLM_MODELS[llmLevel],
                             num_ctx:NUM_CTX, version:PROMPT_VERSION })
    });
    const j = await r.json();
    if(!r.ok){ console.warn('LLM:', j.error); llmToast(j.error || 'LLM error'); return null; }
    return j.response || null;
  }catch(e){ console.warn('LLM call failed', e); return null; }
}

/* ═════ PHASE E — ANNOTATION STORE ═════ */
const annStore = {
  async save(a){
    if(!CAPS.backend) return;
    try{ await fetch('/api/annotations', { method:'POST', headers:{'Content-Type':'application/json'},
                                           body: JSON.stringify(Object.assign({project:'default'}, a)) }); }
    catch(e){ console.warn('annotation save failed', e); }
  },
  async remove(id){
    if(!CAPS.backend) return;
    try{ await fetch('/api/annotations?id=' + encodeURIComponent(id), { method:'DELETE' }); }
    catch(e){ console.warn('annotation delete failed', e); }
  }
};

async function loadAnnotationsFromStore(){
  if(!CAPS.backend) return;
  try{
    const r = await fetch('/api/annotations?project=default');
    const j = await r.json();
    ANNOTATIONS = (j.annotations || []).map(a => ({
      id:a.id, source:a.source, paraIdx:a.para_idx, quote:a.quote, note:a.note, createdAt:a.created_at
    }));
  }catch(e){ console.warn('could not load annotations', e); }
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadCapabilities();
  await loadAnnotationsFromStore();
  if(typeof memInit === 'function') await memInit();
});

/* ═════ PHASE C — TOPICS: classical clustering first, LLM only names ═════ */
async function enrichTopics(data){
  try{
    if(analysisFocus === 'literary'){
      if(typeof enrichCharactersAuto === 'function') await enrichCharactersAuto(data);
      else if(LLM_ENABLED) await enrichCharacters(data);
      return;
    }
    if(CAPS.backend && CAPS.topics){ await enrichTopicsClassic(data); return; }
    if(LLM_ENABLED) await enrichTopicsLegacy(data);
  } finally {
    d3.selectAll('.topic-loading-msg').remove();
  }
}

async function enrichTopicsClassic(data){
  const paras = data.paragraphs.filter(p => !p.isTitle && !p.isSection)
    .map(p => ({ idx:p.idx, text: data.ptoks ? (data.ptoks[p.idx] || []).filter(Boolean).join(' ') : p.raw }));
  let res;
  try{
    const r = await fetch('/api/topics', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ paragraphs:paras, stopwords:[...STOPS] }) });
    res = await r.json();
    if(!r.ok) throw new Error(res.error);
  }catch(e){
    console.warn('topics backend failed:', e);
    if(LLM_ENABLED) return enrichTopicsLegacy(data);
    return;
  }
  const topics = buildTopicsFromClusters(data, res.topics || []);
  if(!topics.length){ if(LLM_ENABLED) return enrichTopicsLegacy(data); return; }
  data.topics = topics;
  if(CORPUS === data) renderChart(CORPUS);  // real clusters appear now, with provisional labels
  await nameTopics(data);                   // LLM labels patch in place
}

function buildTopicsFromClusters(data, clusters){
  const used = new Set();
  return clusters.map(c => {
    const related = (c.words || []).map(w => w.word).filter(w => data.freq[w] > 0).slice(0, 8);
    if(related.length < 3) return null;
    let name = related[0];
    if(used.has(name)) name = related[0] + ' · ' + related[1];
    used.add(name);
    return {
      name,                                      // stable key (highlighting uses it)
      llmName: related.slice(0, 2).join(' · '),  // provisional label until the LLM names it
      related, keys: related, paras: c.paras || [], cid: c.id, emoji: '◈', provisional: true,
      freq: related.reduce((s, w) => s + data.freq[w], 0)
    };
  }).filter(Boolean).sort((a, b) => b.freq - a.freq);
}

function cleanLabel(s){
  if(typeof s !== 'string') return null;
  s = s.replace(/^["'\s]+|["'\s.]+$/g, '').trim();
  if(!s || s.length > 34 || s.split(/\s+/).length > 4) return null;
  if(/^(here|these|the following|cluster|topic)\b/i.test(s)) return null;
  return s;
}

async function nameTopics(data){
  const topics = data.topics.filter(t => t.provisional);
  if(!topics.length) return;
  const block = topics.map((t, i) => {
    const ex = ((data.paragraphs[t.paras[0]] || {}).raw || '').replace(/\s+/g, ' ').slice(0, 240);
    return `Cluster ${i+1}\nKey words: ${t.related.join(', ')}\nTypical passage: "${ex}"`;
  }).join('\n\n');
  const base = `Name each cluster of related words found in a text. Give each a short label of 2 to 3 words describing the shared theme. Base every label on the key words and passage; do not invent themes they do not support. Return ONLY JSON in exactly this shape: {"labels":{"1":"label","2":"label"}}\n\n${block}`;

  for(let attempt = 0; attempt < 2; attempt++){
    const prompt = attempt ? base + '\n\nIMPORTANT: valid JSON only, one label per cluster, maximum 3 words each.' : base;
    const parsed = safeJson(await callLLM('topic-names', prompt, true,
      topics.map(t => t.related.slice(0, 6).join(', ')).join(' | ')));
    const labels = parsed && parsed.labels;
    if(!labels) continue;
    let applied = 0;
    topics.forEach((t, i) => {
      const lab = cleanLabel(labels[String(i + 1)]);
      if(lab){ t.llmName = lab; t.provisional = false; applied++; }
    });
    if(applied) break;
  }
  patchTopicLabels(data);
}

/* update bubble text in place (no re-render, so bubbles don't jump) */
function patchTopicLabels(data){
  d3.selectAll('.topic-bubble').each(function(d){
    const t = data.topics.find(x => x.name === d.name);
    if(!t) return;
    d.llmName = t.llmName;
    d.desc = t.desc;
    d3.select(this).select('.topic-label').text(t.llmName);
  });
}

/* old behaviour (LLM invents clusters) — only used when scikit-learn is missing */
async function enrichTopicsLegacy(data){
  if(!data.topics.length && !data.topWords.length) return;
  const topWords = data.topWords.slice(0, 25).map(d => d.word).join(', ');
  const prompt = `You are analysing a text corpus. Return ONLY valid JSON.
Identify 5 to 8 thematic clusters. Only use words from the "Frequent words" list in each "related" array.

Frequent words: ${topWords}

Sample text:
${sampleParagraphs(data)}

Shape: {"clusters":[{"name":"short label (2-3 words)","related":["word1","word2","word3"]}]}`;
  const parsed = safeJson(await callLLM('topics-legacy', prompt, true));
  if(!parsed) return;
  const clusters = (parsed.clusters || [])
    .map(c => ({ name:c.name, related:(c.related || []).filter(w => data.freq[w] > 0) }))
    .filter(c => c.related.length);
  if(!clusters.length) return;
  data.topics = clusters.map(c => ({
    name:c.related[0], llmName:c.name, related:c.related, emoji:'◈',
    freq:c.related.reduce((s, w) => s + (data.freq[w] || 0), 0)
  })).sort((a, b) => b.freq - a.freq);
  if(CORPUS === data) renderChart(CORPUS);
}

function sampleParagraphs(data){
  const p = data.paragraphs;
  if(!p.length) return '';
  return [p[0], p[Math.floor(p.length / 2)], p[p.length - 1]].filter(Boolean)
    .map(x => x.raw).join('\n\n').slice(0, 900);
}

/* ═════ LITERARY MODE (LLM-only fallback, used when spaCy entities are unavailable) ═════ */
async function enrichCharacters(data){
  const prompt = `You are analysing a literary or historical text. Return ONLY valid JSON.
Identify up to 8 characters or key personas mentioned, with terms associated with each (traits, relationships, roles).

Sample text:
${sampleParagraphs(data)}

Shape: {"characters":[{"name":"Character Name","related":["term1","term2","term3"]}]}`;
  const parsed = safeJson(await callLLM('characters', prompt, true));
  if(!parsed) return;
  const full = data.paragraphs.map(p => p.raw).join(' ').toLowerCase();
  const chars = (parsed.characters || []).map(c => {
    const n = (c.name || '').toLowerCase();
    if(!n) return null;
    const re = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
    const occ = (full.match(re) || []).length;
    if(!occ) return null;                     // verification: must actually occur in the text
    return { name:c.name, llmName:c.name, related:(c.related || []).slice(0, 6), freq:occ, emoji:'◉' };
  }).filter(Boolean);
  if(!chars.length) return;
  data.topics = chars.sort((a, b) => b.freq - a.freq);
  if(CORPUS === data) renderChart(CORPUS);
}

/* ═════ SUMMARIES, COLLOCATES, ANNOTATION COMMENTS ═════ */
async function summarizeParagraph(rawText){
  return callLLM('summary', `Summarize this paragraph in one plain sentence, under 25 words. Return only the sentence, no preamble.\n\n${rawText}`, false, rawText);
}
async function interpretCollocates(word, collocates){
  if(!collocates.length) return null;
  const list = collocates.map(c => c.word).join(', ');
  return callLLM('collocate', `The word "${word}" frequently appears near: ${list}. In one short sentence, describe what this suggests about its use in this text. Return only the sentence, no preamble.`, false, word + ': ' + list);
}
async function suggestAnnotationComment(quote, context){
  const ctx = context ? `\n\nNotes this reader wrote earlier on similar passages (for consistency; do not repeat them):\n${context}` : '';
  return callLLM('anncomment', `A reader selected this passage from a text:\n"${quote}"${ctx}\n\nWrite one short, insightful reading note on it (under 30 words). Return only the note, no preamble.`, false, quote);
}
