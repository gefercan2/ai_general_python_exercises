const LLM_MODELS = { quick:'llama3.1:8b', balanced:'deepseek-r1:7b', deep:'gemma2:12b' };
let llmLevel = 'quick';
const llmCache = new Map();

function setLlmLevel(v){
  const map = {0:'quick', 1:'balanced', 2:'deep'};
  llmLevel = map[v] || 'quick';
  document.getElementById('llm-level-label').textContent = llmLevel+' · '+LLM_MODELS[llmLevel];
}

function cacheKey(task, model, text){ return task+'::'+model+'::'+text.slice(0,300); }

async function callLLM(task, prompt){
  const model = LLM_MODELS[llmLevel];
  const key = cacheKey(task, model, prompt);
  if(llmCache.has(key)) return llmCache.get(key);
  try{
    const res = await fetch('/llm/api/generate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model, prompt, stream:false })
    });
    if(!res.ok) throw new Error('LLM request failed');
    const data = await res.json();
    const text = (data.response||'').trim();
    llmCache.set(key, text);
    return text;
  }catch(err){ console.warn('LLM call failed:', err); return null; }
}

async function enrichTopics(data){
  if(!data.topics.length) return;
  const sample = data.paragraphs.slice(0,3).map(p=>p.raw).join(' ').slice(0,600);
  const wordList = data.topics.map(t=>t.name+': '+t.related.join(', ')).join('\n');
  const prompt = `Label these thematic clusters found in a text. One short label (2-3 words) per cluster, same order, one per line, no numbering.\n\nKeyword groups:\n${wordList}\n\nExcerpt:\n${sample}`;
  const out = await callLLM('topics', prompt);
  if(!out) return;
  const labels = out.split('\n').map(s=>s.replace(/^[-\d.\s]+/,'').trim()).filter(Boolean);
  data.topics.forEach((t,i)=>{ if(labels[i]) t.llmName = labels[i]; });
  if(CORPUS === data) renderChart(CORPUS);
}

async function summarizeParagraph(rawText){
  const prompt = `Summarize this paragraph in one plain sentence, under 25 words. Return only the sentence.\n\n${rawText}`;
  return callLLM('summary', prompt);
}

async function interpretCollocates(word, collocates){
  if(!collocates.length) return null;
  const list = collocates.map(c=>c.word).join(', ');
  const prompt = `The word "${word}" frequently appears near: ${list}. In one short sentence, describe what this suggests about its use in this text. Return only the sentence.`;
  return callLLM('collocate', prompt);
}
