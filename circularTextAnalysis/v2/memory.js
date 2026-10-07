/* memory.js — Lexia phases F + G: cross-references and learning from corrections.
   To disable: delete its <script> line (and lexia_memory.py). The app runs as before. */
const MEM_ENABLED = true;
const MEM_PROJECT = 'default';
let memOn = false;       // cross-reference index on/off
let learnOn = true;      // learn-from-corrections on/off
let MEM_SIM = null;      // similarity between the loaded files
let _memSig = null, _memTimer = null, _memBusy = false, _memAgain = false;
let _ctxToken = 0, _wpToken = 0, _annSug = null;

const $m = id => document.getElementById(id);
const memEsc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const memClip = (s, n) => (s || '').length > n ? s.slice(0, n - 1).trimEnd() + '…' : (s || '');

function memAvailable(){ return !!(MEM_ENABLED && CAPS.backend && CAPS.memory && CAPS.memory.available); }
function memModel(){ const s = $m('mem-model'); return s ? s.value : 'nomic-embed-text'; }
function memMin(){ const s = $m('mem-min'); return s ? (+s.value) / 100 : 0.55; }

function memSplit(text){            // MUST match the paragraph splitting inside analyse()
  const out = [];
  text.split(/\n{2,}/).forEach(b => { const t = b.trim(); if(t) out.push(t); });
  return out;
}

async function memPost(path, body){
  const r = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  let j = {}; try{ j = await r.json(); }catch(e){}
  if(!r.ok) throw new Error(j.error || ('request failed (' + r.status + ')'));
  return j;
}

function memSetNote(t, err){
  const el = $m('mem-note'); if(!el) return;
  el.textContent = t; el.style.color = err ? 'var(--rose)' : 'var(--t3)';
  if(typeof growBody === 'function') growBody('body-a');
}

/* ═════ INIT / TOGGLES ═════ */
async function memInit(){
  const row = $m('mem-row'); if(!row) return;
  if(!MEM_ENABLED || !CAPS.backend){ row.style.display = 'none'; return; }
  if(!memAvailable()){
    $m('mem-xref').disabled = true; $m('mem-learn').disabled = true;
    memSetNote('memory add-on not found (lexia_memory.py is missing next to run.py)');
    return;
  }
  try{
    const sm = localStorage.getItem('lexia_mem_model'), sel = $m('mem-model');
    if(sm && [...sel.options].some(o => o.value === sm)) sel.value = sm;
    learnOn = localStorage.getItem('lexia_learn') !== '0';
    memOn = localStorage.getItem('lexia_xref') === '1';
  }catch(e){}
  $m('mem-learn').checked = learnOn; $m('mem-xref').checked = memOn;
  await memRefreshStatus();
  if(memOn){ memIndexFiles(); memSyncNotes(ANNOTATIONS); }
}

async function memRefreshStatus(){
  if(!memAvailable() || _memBusy) return;
  try{
    const r = await fetch('/api/memory/status?project=' + MEM_PROJECT + '&model=' + encodeURIComponent(memModel()));
    const s = await r.json(); if(!r.ok) throw new Error(s.error);
    const bits = [];
    if(memOn) bits.push(s.docs.length + ' file(s), ' + s.passages + ' passages indexed');
    bits.push(s.notes + ' note(s), ' + s.feedback + ' correction(s) remembered');
    const missing = memOn && !modelInstalled(memModel());
    memSetNote((missing ? '⚠ model not installed — run: ollama pull ' + memModel() + '\n' : '') + bits.join(' · ') +
               '\ntip: double-click a topic bubble to rename it', missing);
  }catch(e){ memSetNote(e.message, true); }
}

function memToggleXref(on){
  memOn = !!on && memAvailable();
  try{ localStorage.setItem('lexia_xref', memOn ? '1' : '0'); }catch(e){}
  _memSig = null;
  if(memOn){ memIndexFiles(); memSyncNotes(ANNOTATIONS); }
  else{ MEM_SIM = null; if(currentStage === 1) renderNetworkGraph(); memRefreshStatus(); }
}
function memToggleLearn(on){
  learnOn = !!on;
  try{ localStorage.setItem('lexia_learn', learnOn ? '1' : '0'); }catch(e){}
}
function memModelChanged(){
  try{ localStorage.setItem('lexia_mem_model', memModel()); }catch(e){}
  _memSig = null; MEM_SIM = null;
  if(memOn){ memIndexFiles(); memSyncNotes(ANNOTATIONS); } else memRefreshStatus();
}

async function memForget(){
  try{
    if(confirm('Clear the cross-reference index? (Your files and annotations are not touched.)')){
      await memPost('/api/memory/forget', { project:MEM_PROJECT, what:'index' });
      MEM_SIM = null; _memSig = null; memOn = false; $m('mem-xref').checked = false;
      try{ localStorage.setItem('lexia_xref', '0'); }catch(e){}
      if(currentStage === 1) renderNetworkGraph();
    }
    if(confirm('Also forget what the app learned from your corrections?'))
      await memPost('/api/memory/forget', { project:MEM_PROJECT, what:'feedback' });
    await memRefreshStatus();
  }catch(e){ memSetNote(e.message, true); }
}

/* ═════ PHASE F — INDEXING + FILE SIMILARITY NETWORK ═════ */
function memSig(){ return FILES.map(f => f.name + ':' + f.text.length).join('|'); }

function memOnFilesChanged(){       // called from renderNetworkGraph() and runAnalysis()
  if(!memOn || !memAvailable() || memSig() === _memSig) return;
  clearTimeout(_memTimer);
  _memTimer = setTimeout(memIndexFiles, 1500);
}

async function memWaitJob(id, onProgress){
  for(;;){
    const r = await fetch('/api/memory/job?id=' + encodeURIComponent(id));
    const j = await r.json();
    if(!r.ok) throw new Error(j.error || 'indexing job lost');
    if(j.state === 'done') return j;
    if(j.state === 'error') throw new Error(j.error || 'indexing failed');
    onProgress(j);
    await new Promise(res => setTimeout(res, 700));
  }
}

async function memIndexFiles(){
  if(!memOn || !memAvailable()) return;
  if(_memBusy){ _memAgain = true; return; }
  _memBusy = true;
  const sig = memSig();
  let ok = false;
  try{
    const files = FILES.slice();
    for(let i = 0; i < files.length; i++){
      const f = files[i], tag = 'indexing ' + (i + 1) + '/' + files.length + ': ' + f.name;
      memSetNote(tag + '…');
      const r = await memPost('/api/memory/index',
        { project:MEM_PROJECT, name:f.name, model:memModel(), paragraphs:memSplit(f.text) });
      if(r.job) await memWaitJob(r.job, j => memSetNote(tag + ' (' + j.done + '/' + j.total + ')'));
    }
    _memSig = sig;                  // set BEFORE re-rendering the network, so it does not retrigger
    await memLoadSimilarity();
    ok = true;
  }catch(e){
    _memSig = null;
    memSetNote(e.message, true);
  }finally{
    _memBusy = false;
    if(_memAgain){ _memAgain = false; memOnFilesChanged(); }
  }
  if(ok) memRefreshStatus();
}

function memPairKey(a, b){ return [a, b].sort().join('\u0001'); }

async function memLoadSimilarity(){
  if(FILES.length < 2){ MEM_SIM = null; if(currentStage === 1) renderNetworkGraph(); return; }
  const r = await memPost('/api/memory/similarity',
    { project:MEM_PROJECT, model:memModel(), names:FILES.map(f => f.name) });
  const vals = r.pairs.map(p => p.score);
  if(!vals.length) MEM_SIM = null;
  else{
    MEM_SIM = { pairs:{}, min:Math.min(...vals), max:Math.max(...vals), method:r.method };
    r.pairs.forEach(p => { MEM_SIM.pairs[memPairKey(p.a, p.b)] = p.score; });
  }
  if(currentStage === 1) renderNetworkGraph();
}

function memLinkWeight(a, b){       // used by renderNetworkGraph()
  if(!MEM_SIM) return null;
  const s = MEM_SIM.pairs[memPairKey(a, b)];
  if(s === undefined) return null;
  const span = MEM_SIM.max - MEM_SIM.min;
  return { score:s, norm: span > 1e-6 ? (s - MEM_SIM.min) / span : 0.5 };
}

async function memSearch(o){
  return memPost('/api/memory/search', { project:MEM_PROJECT, model:memModel(), min_score:memMin(),
    k:o.k || 4, kinds:o.kinds || ['chunk'], query:o.query, exclude:o.exclude || null });
}

/* ═════ PHASE F — WHERE A PASSAGE LIVES / OPENING IT ═════ */
function memLocate(mergedIdx){      // paragraph number shown in the context reader -> (file, paragraph in file)
  if(!CORPUS || !CORPUS.docs) return null;
  if(CORPUS.perFile && CORPUS.perFile.length > 1 && ctxFileIdx !== null && ctxFileIdx !== undefined && CORPUS.perFile[ctxFileIdx])
    return { doc:CORPUS.perFile[ctxFileIdx].name, para:mergedIdx };   // compare mode: the index is already file-local
  let off = 0;
  for(const d of CORPUS.docs){
    if(mergedIdx < off + d.n) return { doc:d.name, para:mergedIdx - off };
    off += d.n;
  }
  return null;
}
function memCanOpen(doc){ return !!(CORPUS && CORPUS.docs && CORPUS.docs.some(d => d.name === doc)); }

function memOpenInText(doc, para){
  if(!memCanOpen(doc)) return false;
  let fileIdx = 0, target = para;
  if(CORPUS.perFile && CORPUS.perFile.length > 1){            // compare mode: one tab per file
    fileIdx = CORPUS.perFile.findIndex(f => f.name === doc);
    if(fileIdx < 0) return false;
  }else{                                                      // merged text: add the earlier files' paragraphs
    for(const d of CORPUS.docs){ if(d.name === doc) break; target += d.n; }
  }
  ctxFileIdx = fileIdx; ctxParaIdx = target; ctxHighlight = null; ftActiveFileIdx = fileIdx;
  goToStage(3); renderFullTextTabs(); renderFullText(fileIdx, null, target);
  return true;
}

/* ═════ CONTEXT READER: summary (with feedback) + similar passages ═════ */
async function renderCtxExtras(p, paraIdx){
  const sumEl = $m('ctx-llm-summary'), fbEl = $m('ctx-fb'), relEl = $m('ctx-related');
  const token = ++_ctxToken;
  sumEl.textContent = ''; sumEl.style.opacity = ''; fbEl.innerHTML = ''; relEl.innerHTML = '';
  memRelated(p.raw, paraIdx, relEl, token);                   // runs in parallel with the summary
  if(!(LLM_ENABLED && CAPS.backend)) return;
  let text = null, source = 'model';
  try{
    const ov = await memOverride('summary', p.raw);
    if(ov && ov.text){ text = ov.text; source = ov.edited ? 'edited' : 'approved'; }
    else text = await summarizeParagraph(p.raw);
  }catch(e){ console.warn(e); }
  if(token !== _ctxToken || !text) return;
  sumEl.textContent = '» ' + text;
  renderFeedbackBar(fbEl, { task:'summary', input:p.raw, output:text, source, el:sumEl, grow:'ctx-body' });
  growBody('ctx-body');
}

async function memRelated(text, paraIdx, relEl, token){
  if(!memOn || !memAvailable()) return;
  const head = '<div class="rel-title">similar passages</div>';
  relEl.innerHTML = head + '<div class="rel-empty">searching…</div>'; growBody('ctx-body');
  let res;
  try{
    const loc = memLocate(paraIdx);
    res = await memSearch({ query:text, kinds:['chunk'], k:4,
                            exclude: loc ? { doc:loc.doc, para:loc.para, radius:1 } : null });
  }catch(e){
    if(token === _ctxToken){ relEl.innerHTML = head + '<div class="rel-empty">' + memEsc(e.message) + '</div>'; growBody('ctx-body'); }
    return;
  }
  if(token !== _ctxToken) return;
  if(!res.hits.length){
    relEl.innerHTML = head + '<div class="rel-empty">' +
      (res.indexed ? 'nothing above the match strictness — lower it in the config tab' : 'not indexed yet — wait for indexing to finish') + '</div>';
    growBody('ctx-body'); return;
  }
  relEl.innerHTML = head + res.hits.map(h =>
    `<div class="rel-item">
       <div class="rel-head"><span>${memEsc(h.doc)} · ¶${h.para + 1}</span><span class="rel-score">${h.score.toFixed(2)}</span></div>
       <div class="rel-text">${memEsc(h.text)}</div>
       ${memCanOpen(h.doc) ? `<span class="rel-open" data-doc="${memEsc(h.doc)}" data-para="${h.para}">read in context →</span>` : ''}
     </div>`).join('');
  relEl.querySelectorAll('.rel-item').forEach(el => el.addEventListener('click', ev => {
    const o = ev.target.closest('.rel-open');
    if(o){ ev.stopPropagation(); memOpenInText(o.dataset.doc, +o.dataset.para); return; }
    el.classList.toggle('open'); growBody('ctx-body');
  }));
  growBody('ctx-body');
}

/* ═════ WORD PANEL: collocate reading (with feedback) ═════ */
async function renderWordExtras(word, cols){
  const noteEl = $m('wp-llm-note'), fbEl = $m('wp-fb');
  const token = ++_wpToken;
  noteEl.textContent = ''; noteEl.style.opacity = ''; fbEl.innerHTML = '';
  if(!cols.length || !LLM_ENABLED || !CAPS.backend) return;
  const key = word + ': ' + cols.map(c => c.word).join(', ');
  let text = null, source = 'model';
  try{
    const ov = await memOverride('collocate', key);
    if(ov && ov.text){ text = ov.text; source = ov.edited ? 'edited' : 'approved'; }
    else text = await interpretCollocates(word, cols);
  }catch(e){ console.warn(e); }
  if(token !== _wpToken || !text) return;
  noteEl.textContent = '» ' + text;
  renderFeedbackBar(fbEl, { task:'collocate', input:key, output:text, source, el:noteEl, grow:'word-body' });
  growBody('word-body');
}

/* ═════ PHASE G — FEEDBACK ═════ */
async function memOverride(task, input){
  if(!learnOn || !memAvailable()) return null;
  try{ return await memPost('/api/memory/override', { project:MEM_PROJECT, task, query:input }); }
  catch(e){ return null; }
}

function memFeedback(o){
  if(!learnOn || !memAvailable()) return Promise.resolve();
  return memPost('/api/memory/feedback', Object.assign({ project:MEM_PROJECT, model: memOn ? memModel() : '' }, o))
    .then(() => memRefreshStatus()).catch(e => console.warn('feedback not saved:', e.message));
}

function renderFeedbackBar(host, o){
  host.innerHTML = '';
  if(!learnOn || !memAvailable()) return;
  const bar = document.createElement('div'); bar.className = 'fb-bar'; host.appendChild(bar);
  const grow = () => { if(o.grow && typeof growBody === 'function') growBody(o.grow); };
  const msg = t => { bar.innerHTML = '<span class="fb-tag">' + memEsc(t) + '</span>'; grow(); };
  const btn = (label, fn) => {
    const s = document.createElement('span'); s.className = 'fb-btn'; s.textContent = label;
    s.addEventListener('click', ev => { ev.stopPropagation(); fn(); }); bar.appendChild(s);
  };
  const current = () => o.el.textContent.replace(/^»\s*/, '');

  function main(){
    bar.innerHTML = '';
    if(o.source === 'edited') bar.insertAdjacentHTML('beforeend', '<span class="fb-tag">your edit</span>');
    if(o.source === 'approved') bar.insertAdjacentHTML('beforeend', '<span class="fb-tag">approved earlier</span>');
    btn('✓ good', () => { memFeedback({ task:o.task, input:o.input, output:current(), final:current(), action:'accept' }); msg('saved'); });
    btn('✎ edit', edit);
    btn('✗ poor', () => {
      memFeedback({ task:o.task, input:o.input, output:current(), final:'', action:'reject' });
      o.el.style.opacity = '.4'; msg('noted — I will avoid this');
    });
    grow();
  }
  function edit(){
    const before = current();
    o.el.textContent = before; o.el.contentEditable = 'true'; o.el.focus();
    bar.innerHTML = '';
    btn('save', () => finish(true)); btn('cancel', () => finish(false));
    o.el.onkeydown = ev => {
      if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
      if(ev.key === 'Escape'){ finish(false); }
    };
    function finish(save){
      o.el.onkeydown = null; o.el.contentEditable = 'false';
      const t = o.el.textContent.replace(/\s+/g, ' ').trim();
      if(save && t){
        o.el.textContent = '» ' + t;
        memFeedback({ task:o.task, input:o.input, output:before, final:t, action: t === before ? 'accept' : 'edit' });
        msg('saved — I will remember this');
      }else{ o.el.textContent = '» ' + before; main(); }
    }
  }
  main();
}

/* few-shot injection: called by callLLM() in llm.js */
const MEM_TASKS = {
  'summary':     { what:'one-sentence paragraph summaries', inp:'Paragraph', out:'Summary' },
  'collocate':   { what:'one-sentence readings of a word and its neighbours', inp:'Word and neighbours', out:'Reading' },
  'anncomment':  { what:'short reading notes on a passage', inp:'Passage', out:'Note' },
  'topic-names': { what:'short theme labels for clusters of words', inp:'Key words', out:'Label' },
};
async function memoryAugment(task, prompt, memKey){
  if(!learnOn || !memAvailable() || !MEM_TASKS[task]) return prompt;
  const j = await memPost('/api/memory/examples',
    { project:MEM_PROJECT, task, query:memKey, limit:3, model: memOn ? memModel() : '' });
  const ex = j.examples || [], rej = j.rejected || [];
  if(!ex.length && !rej.length) return prompt;
  const T = MEM_TASKS[task];
  let pre = '';
  if(ex.length) pre += `This reader has approved or corrected these ${T.what} before. Match their wording, tone and level of detail, but never copy their content, and still follow the output format requested in the task below.\n\n` +
    ex.map(e => `${T.inp}: ${e.input}\n${T.out}: ${e.output}`).join('\n\n') + '\n\n';
  if(rej.length) pre += 'The reader rejected these answers for this exact input, so write something clearly different:\n' +
    rej.map(r => '- ' + r).join('\n') + '\n\n';
  return pre + 'Now the task:\n' + prompt;
}

/* double-click a topic bubble to rename it */
function memOnDblClick(e){
  const b = e.target.closest && e.target.closest('.topic-bubble');
  if(!b || !CORPUS) return;
  e.stopPropagation(); e.preventDefault();               // also blocks d3's double-click zoom
  const d = d3.select(b).datum();
  const cur = d.llmName || d.name;
  const next = prompt('Rename this label:', cur);
  if(next === null) return;
  const lab = next.trim().replace(/\s+/g, ' ').slice(0, 40);
  if(!lab || lab === cur) return;
  const t = CORPUS.topics.find(x => x.name === d.name); if(!t) return;
  t.llmName = lab; t.provisional = false;
  if(typeof patchTopicLabels === 'function') patchTopicLabels(CORPUS);
  if(t.unit !== 'mentions')                              // character names are not "topic label" training data
    memFeedback({ task:'topic-names', input:(t.related || []).join(', '), output:cur, final:lab, action:'edit' });
}
window.addEventListener('DOMContentLoaded', () => {
  const svg = $m('chart-svg');
  if(svg) svg.addEventListener('dblclick', memOnDblClick, true);
});

/* ═════ ANNOTATIONS: earlier notes, suggestion context, notes index, implicit feedback ═════ */
async function memSyncNotes(list){
  if(!memOn || !memAvailable() || !list || !list.length) return;
  try{
    await memPost('/api/memory/notes/sync', { project:MEM_PROJECT, model:memModel(),
      notes:list.map(a => ({ id:a.id, source:a.source, para:a.paraIdx, quote:a.quote,
                             note: a.note === '(no note)' ? '' : a.note })) });
  }catch(e){ console.warn('note sync failed', e); }
}

async function memRelatedNotesText(quote){
  if(!memOn || !memAvailable()) return '';
  try{
    const r = await memSearch({ query:quote, kinds:['note'], k:3 });
    return r.hits.filter(h => h.extra)
      .map(h => '- "' + memClip(h.text, 120) + '" → ' + memClip(h.extra, 160)).join('\n');
  }catch(e){ return ''; }
}

async function memAnnOpen(){        // called when the annotation popup opens
  _annSug = null;
  const el = $m('ann-related'); if(!el) return;
  el.innerHTML = '';
  if(!memOn || !memAvailable() || !pendingSelection) return;
  const quote = pendingSelection.quote;
  try{
    const res = await memSearch({ query:quote, kinds:['note'], k:3 });
    if(!pendingSelection || pendingSelection.quote !== quote || !res.hits.length) return;
    el.innerHTML = '<div class="rel-title">earlier notes on similar passages</div>' + res.hits.map(h =>
      `<div class="rel-item" style="cursor:default">
         <div class="rel-head"><span>${memEsc(h.doc)} · ¶${h.para + 1}</span><span class="rel-score">${h.score.toFixed(2)}</span></div>
         <div class="rel-text" style="font-style:italic">“${memEsc(memClip(h.text, 110))}”</div>
         ${h.extra ? `<div class="rel-text" style="color:var(--t1);max-height:none">${memEsc(memClip(h.extra, 180))}</div>` : ''}
       </div>`).join('');
  }catch(e){}
}

function memAnnSuggested(quote, text){ _annSug = { quote, text }; }

function memAnnSaved(entry){        // saving is the feedback: unchanged = accepted, changed = edited
  if(_annSug && _annSug.quote === entry.quote && entry.note !== '(no note)'){
    memFeedback({ task:'anncomment', input:entry.quote, output:_annSug.text, final:entry.note,
                  action: entry.note.trim() === _annSug.text.trim() ? 'accept' : 'edit' });
  }
  _annSug = null;
  if(memOn) memSyncNotes([entry]);
}

function memAnnDeleted(id){
  if(!memAvailable()) return;
  fetch('/api/memory/note?project=' + MEM_PROJECT + '&id=' + encodeURIComponent(id), { method:'DELETE' }).catch(() => {});
}
