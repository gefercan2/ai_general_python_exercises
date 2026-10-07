/* nlp.js — Lexia phases B + D: spaCy client + character mode.
   Delete its <script> line to disable: the app falls back to basic regex analysis. */
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ═════ PHASE B — spaCy client ═════ */
function splitParas(text){                       // must match the splitting inside analyse()
  const out = [];
  text.split(/\n{2,}/).forEach(b => { const t = b.trim(); if(t) out.push(t); });
  return out;
}

async function fetchNlp(paragraphs, lang, mode, entities){
  const r = await fetch('/api/nlp', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ paragraphs, lang, mode, entities })
  });
  const j = await r.json();
  if(!r.ok) throw new Error(j.error || 'linguistic analysis failed');
  return j;
}

function mergeNlp(list){                         // per-file results -> one corpus-level result
  if(list.length === 1) return list[0];
  const out = { lang:list[0].lang, model:list[0].model, tokens:[], sentences:0, forms:{}, entities:[] };
  const ents = new Map();
  let off = 0;
  list.forEach(n => {
    out.tokens = out.tokens.concat(n.tokens);
    out.sentences += n.sentences;
    Object.entries(n.forms || {}).forEach(([k, v]) => {
      const cur = new Set(out.forms[k] || []);
      v.forEach(x => cur.add(x));
      out.forms[k] = [...cur].slice(0, 8);
    });
    (n.entities || []).forEach(e => {
      const key = e.label + '|' + e.text;
      let r = ents.get(key);
      if(!r){ r = { text:e.text, label:e.label, count:0, lower:0, paras:[] }; ents.set(key, r); }
      r.count += e.count; r.lower += (e.lower || 0);
      e.paras.forEach(p => r.paras.push(p + off));   // shift paragraph indexes into merged numbering
    });
    off += n.tokens.length;
  });
  out.entities = [...ents.values()].sort((a, b) => b.count - a.count);
  return out;
}

async function buildNlp(files, opts){
  const engine = (document.getElementById('nlp-engine') || {}).value || 'auto';
  if(engine === 'regex' || !CAPS.backend || !(CAPS.nlp && CAPS.nlp.spacy)) return null;
  let lang = (document.getElementById('nlp-lang') || {}).value || 'auto';
  const mode = opts.stops ? 'content' : 'all';
  const wantEnts = opts.focus === 'literary';
  const per = [];
  for(const f of files){
    const res = await fetchNlp(splitParas(f.text), lang, mode, wantEnts);
    if(lang === 'auto') lang = res.lang;           // reuse the first file's language for the rest
    per.push(res);
  }
  return { perFile: per, merged: mergeNlp(per) };
}

/* ═════ PHASE D — characters ═════ */
function relatedTerms(data, paras, exclude, n){
  if(!data.ptoks) return [];
  const inP = {}; let totalP = 0;
  paras.forEach(pi => (data.ptoks[pi] || []).forEach(w => { if(w){ inP[w] = (inP[w] || 0) + 1; totalP++; } }));
  if(!totalP) return [];
  const totalAll = data.meta.totalWords || 1;
  const minC = totalP > 1500 ? 3 : 2;
  return Object.entries(inP)
    .filter(([w, c]) => c >= minC && !exclude.has(w) && (data.freq[w] || 0) >= minC)
    .map(([w, c]) => [w, c * Math.log((c / totalP) / (data.freq[w] / totalAll))])   // over-represented near this character
    .filter(x => x[1] > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, n || 8).map(x => x[0]);
}

function buildCharacterTopics(data, clusters){
  return clusters.map(c => {
    const aliases = c.aliases.map(a => a.text);
    const toks = (c.tokens || []).filter(w => data.freq[w] > 0);
    const terms = relatedTerms(data, c.paras, new Set(c.tokens || []), 8);
    const key = '@' + c.canonical.toLowerCase();
    data.forms[key] = aliases.map(s => s.toLowerCase());          // used by hlRegex() to highlight every alias
    return {
      name:c.canonical, llmName:c.canonical, key, hl:key,
      related:[...new Set([...toks, ...terms])].slice(0, 10),
      keys:[...new Set([...toks, ...terms])].slice(0, 10),
      paras:c.paras, freq:c.count, unit:'mentions', emoji:'◉',
      aliases, tokens:c.tokens || [], ambiguous:!!c.ambiguous, candidates:c.candidates || [], desc:''
    };
  });
}

async function enrichCharactersAuto(data){
  if(!(data.entities && data.entities.length)){            // no spaCy entities: old LLM-only path
    if(typeof enrichCharacters === 'function') await enrichCharacters(data);
    return;
  }
  const minC = +((document.getElementById('opt-minchar') || {}).value || 3);
  let res;
  try{
    const r = await fetch('/api/characters', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ entities:data.entities.filter(e => e.label === 'PERSON'), min_count:minC })
    });
    res = await r.json();
    if(!r.ok) throw new Error(res.error);
  }catch(e){
    console.warn('characters failed:', e);
    if(typeof llmToast === 'function') llmToast('Character detection failed: ' + e.message);
    return;
  }
  const chars = buildCharacterTopics(data, res.characters || []);
  if(!chars.length){
    if(typeof llmToast === 'function') llmToast('No recurring characters found — try lowering "min mentions".');
    return;                                                // keep existing topics rather than invent characters
  }
  data.topics = chars;
  if(CORPUS === data) renderChart(CORPUS);
  await refineCharacters(data);                            // LLM: merge leftovers, describe (no-op if LLM is off)
}

function charSnippets(data, ch, n){
  const idx = ch.paras;
  if(!idx.length) return [];
  const picks = [...new Set([idx[0], idx[Math.floor(idx.length / 2)], idx[idx.length - 1]])].slice(0, n || 3);
  const alts = ch.aliases.slice().sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const re = new RegExp('\\b(' + alts + ')\\b', 'i');
  const out = [];
  picks.forEach(pi => {
    const p = data.paragraphs[pi]; if(!p) return;
    const sents = p.raw.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || [p.raw];
    const s = sents.find(x => re.test(x));
    if(s) out.push(s.trim().slice(0, 220));
  });
  return out;
}

/* A merge is allowed only if it is plausible; the model can't join two different full names. */
function canMergeChars(a, b, all){
  const ta = a.tokens || [], tb = b.tokens || [];
  if(ta.length > 1 && tb.length > 1) return ta.every(w => tb.includes(w)) || tb.every(w => ta.includes(w));
  if(ta.some(w => tb.includes(w))) return true;
  const free = (s, o) => s.tokens.length === 1 &&
    !all.some(c => c !== s && c !== o && c.tokens.includes(s.tokens[0]));   // a nickname no other cluster uses
  return free(a, b) || free(b, a);
}

function mergeInto(data, lead, m){
  lead.aliases = [...new Set([...lead.aliases, ...m.aliases])];
  lead.freq += m.freq;
  lead.paras = [...new Set([...lead.paras, ...m.paras])].sort((a, b) => a - b);
  lead.tokens = [...new Set([...lead.tokens, ...m.tokens])];
  lead.ambiguous = lead.ambiguous && m.ambiguous;
  if(!lead.desc && m.desc) lead.desc = m.desc;
  data.forms[lead.key] = lead.aliases.map(s => s.toLowerCase());
  const toks = lead.tokens.filter(w => data.freq[w] > 0);
  lead.related = [...new Set([...toks, ...relatedTerms(data, lead.paras, new Set(lead.tokens), 8)])].slice(0, 10);
  lead.keys = lead.related;
}

async function refineCharacters(data){
  const top = data.topics.slice(0, 12);
  if(!top.length) return;
  const block = top.map((c, i) => {
    const q = charSnippets(data, c).map(s => '- "' + s + '"').join('\n') || '- (no quotation found)';
    const amb = c.ambiguous ? '\nNote: ambiguous name, could refer to: ' + c.candidates.join(', ') : '';
    return `Candidate ${i + 1}: ${c.name}\nVariants: ${c.aliases.slice(0, 6).join(', ')}\nMentions: ${c.freq}${amb}\nQuotations:\n${q}`;
  }).join('\n\n');
  const base = `You are helping analyse the characters of a literary or historical text. Below are candidate characters detected automatically, each with the name variants found and short quotations from the text.

Using ONLY the information given, do three things:
1. "merge": groups of candidate numbers that are definitely the same person (for example a nickname, a title-only form or a surname-only form of the same character). If you are not sure, do not merge.
2. "discard": numbers of candidates that are clearly NOT people (detection errors). If unsure, do not discard.
3. "descriptions": for each candidate, a description of at most 15 words based only on the quotations. Use "" if the quotations do not say enough.

Return ONLY JSON in exactly this shape:
{"merge":[[1,4]],"discard":[7],"descriptions":{"1":"...","2":"..."}}

${block}`;

  let parsed = null;
  for(let attempt = 0; attempt < 2 && !parsed; attempt++){
    const raw = await callLLM('characters-refine',
      attempt ? base + '\n\nIMPORTANT: output valid JSON only, in exactly the shape above.' : base, true);
    if(raw === null) return;                                // LLM off or unreachable: keep spaCy result
    parsed = safeJson(raw);
  }
  if(!parsed) return;

  const valid = i => Number.isInteger(i) && i >= 1 && i <= top.length;
  const maxFreq = Math.max(...top.map(c => c.freq));
  const gone = new Set();

  const dsc = (parsed.descriptions && typeof parsed.descriptions === 'object') ? parsed.descriptions : {};
  top.forEach((c, i) => {
    const d = dsc[String(i + 1)];
    if(typeof d !== 'string') return;
    const t = d.trim().replace(/^["']|["']$/g, '');
    if(t && t.length <= 160 && !/^(here|the following)/i.test(t)) c.desc = t;
  });

  (Array.isArray(parsed.discard) ? parsed.discard : []).forEach(i => {
    if(valid(i) && top[i - 1].freq < 0.5 * maxFreq) gone.add(i - 1);   // never discard a main character
  });

  (Array.isArray(parsed.merge) ? parsed.merge : []).forEach(group => {
    if(!Array.isArray(group)) return;
    const idxs = [...new Set(group.filter(valid).map(i => i - 1))].filter(i => !gone.has(i));
    if(idxs.length < 2) return;
    idxs.sort((a, b) => top[b].freq - top[a].freq);
    const lead = top[idxs[0]];
    idxs.slice(1).forEach(j => {
      if(gone.has(j) || !canMergeChars(lead, top[j], top)) return;
      mergeInto(data, lead, top[j]);
      gone.add(j);
    });
  });

  data.topics = data.topics.filter((c, idx) => !(idx < top.length && gone.has(idx)));
  data.topics.sort((a, b) => b.freq - a.freq);
  if(CORPUS === data){
    if(gone.size) renderChart(CORPUS); else patchTopicLabels(data);
  }
}
