/* ═════════════════════════════════════
   STATE
═════════════════════════════════════ */
let FILES=[], CORPUS=null, selectedTopic=null;
const ANALYSIS_CACHE = new Map();
const ANALYSIS_CACHE_MAX = 8;
let ctxParaIdx=null, ctxHighlight=null;
let d3Zoom=null, mainZG=null;
let fileIdCounter=0;
let selectedFileIds=new Set();
let currentStage=1;
let ctxFileIdx=0;
let ftActiveFileIdx=0;
let ANNOTATIONS=[];
let annIdCounter=0;
let pendingSelection=null; /* {source, paraIdx, quote} awaiting save */
  

/* ── ONE STATE — every chart view and panel is derived from this ── */
const STATE = {
  sel: null,        /* {fileIdx, idx} selected C2 paragraph, or null                  */
  dialDeg: 0,       /* dial target rotation (deg) — derived from sel, kept for shortest-path */
  rings: { c1:true, cloud:true, grid:true, c2:true, c3:true, c4:true },  /* ring filters */
  hl: null          /* active highlight from a word / topic ('word' | 'topic' | null) */
};
let ringBoundsByFile=[];     /* [fileIdx] → {ri, ro, fullAngle, fileName, data, paraAngles} */
let chartGRef=null;          /* chartG group, so a single ring can be redrawn */
let C1VIEW=null;             /* handles to C1 bubbles + cloud dial for the view functions */
let GRID_INNER_R=null;       /* innermost radius used by the measure grid (ticks + labels) */

/* ═════════════════════════════════════
   STAGE NAVIGATION
═════════════════════════════════════ */
function escHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* highlight regex covering inflected forms (lemma 'run' -> run/runs/running) and character aliases */
function hlRegex(word){
  const set=new Set();
  if(word[0]!=='@') set.add(word);
  const f=CORPUS&&CORPUS.forms&&CORPUS.forms[word];
  if(f) f.forEach(x=>set.add(x));
  if(!set.size) set.add(word);
  const alts=[...set].sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  return new RegExp('\\b('+alts.join('|')+')\\b','gi');
}

/* highlight regex covering inflected forms (lemma 'run' -> run/runs/running) and character aliases */
function hlRegex(word){
  const set=new Set();
  if(word[0]!=='@') set.add(word);
  const f=CORPUS&&CORPUS.forms&&CORPUS.forms[word];
  if(f) f.forEach(x=>set.add(x));
  if(!set.size) set.add(word);
  const alts=[...set].sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  return new RegExp('\\b('+alts.join('|')+')\\b','gi');
}

function showTopicLoading(){
  const g = d3.select('#chart-svg .chart-content');
  if(g.empty()) return;
  g.append('text').attr('class','topic-loading-msg')
    .attr('text-anchor','middle').attr('dominant-baseline','central')
    .style('font-family','DM Mono,monospace').style('font-size','10px')
    .style('fill','var(--t2)').style('opacity',.7)
    .text('loading topics…');
}

function goToStage(n){
  hideTip();
  currentStage = n;
  document.getElementById('stage_01').classList.toggle('open', n===1);
  document.getElementById('stage_03').classList.toggle('open', n===3);
  document.getElementById('layer-ui-1').style.display = n===1 ? 'block' : 'none';
  document.getElementById('layer-ui-2').style.display = n===2 ? 'block' : 'none';
  if(n!==3){
    document.getElementById('ann-btn').style.display='none';
    document.getElementById('ann-popup').style.display='none';
    pendingSelection=null;
  }
  if(n===1){ setNetworkVisible(true); renderNetworkGraph(); }
}

/* ═════════════════════════════════════
   NETWORK GRAPH (file nodes)
═════════════════════════════════════ */

let NET_SIM = null;   /* running force simulation of the network graph */

/* show/hide the network column; hiding also stops the simulation */
function setNetworkVisible(on){
  document.getElementById('s1-network').classList.toggle('net-hidden', !on);
  if(!on && NET_SIM) NET_SIM.stop();
}

function renderNetworkGraph(){
  if(typeof memOnFilesChanged==='function') memOnFilesChanged();
  const svg = d3.select('#network_place');
  const box = document.getElementById('s1-network');
  const W = box.clientWidth  || window.innerWidth*.4;
  const H = box.clientHeight || window.innerHeight;
  svg.attr('width',W).attr('height',H);
  svg.selectAll('*').remove();
  if(NET_SIM){ NET_SIM.stop(); NET_SIM = null; }
  document.getElementById('s1-net-hint').style.display = FILES.length ? 'block' : 'none';
  if(!FILES.length) return;

  /* ── PARAMETERS ── */
  const NODE_R_MIN = 14;
  const NODE_R_MAX = Math.min(44, Math.min(W,H)*.09);
  const LINK_DIST  = Math.min(150, Math.min(W,H)*.28);

  const nodes = FILES.map(f => ({...f, wc: f.text.split(/\s+/).filter(Boolean).length}));
  const maxWc = d3.max(nodes, d => d.wc) || 1;
  const rScale = d3.scaleSqrt().domain([0,maxWc]).range([NODE_R_MIN, NODE_R_MAX]);

  const links = [];
  for(let i=0;i<nodes.length;i++)
    for(let j=i+1;j<nodes.length;j++)
      links.push({source:nodes[i].id, target:nodes[j].id,
        w:(typeof memLinkWeight==='function')?memLinkWeight(nodes[i].name,nodes[j].name):null});
  const weighted=links.some(l=>l.w);

  const zg = svg.append('g').attr('class','net-zoom-g');
  const g  = zg.append('g').attr('transform',`translate(${W/2},${H/2})`);

  const sim = d3.forceSimulation(nodes)
    .force('charge',  d3.forceManyBody().strength(-260))
    .force('center',  d3.forceCenter(0,0))
    .force('collide', d3.forceCollide(d => rScale(d.wc)+14))
    .force('link',    d3.forceLink(links).id(d => d.id)
      .distance(d => d.w ? LINK_DIST*(1.7-.9*d.w.norm) : LINK_DIST)
      .strength(d => d.w ? 0.1+0.5*d.w.norm : 0.2));
  NET_SIM = sim;

  const link = g.selectAll('.nlink').data(links).enter().append('line')
    .attr('class','nlink')
    .attr('stroke',d=>d.w ? `rgba(126,184,201,${0.15+0.6*d.w.norm})` : 'rgba(200,169,110,.14)')
    .attr('stroke-width',d=>d.w ? 0.8+3.2*d.w.norm : 0.6);

  const llabel=g.selectAll('.nlabel')
    .data(links.filter(d=>d.w&&(links.length<=6||d.w.norm>=0.5))).enter().append('text')
    .attr('class','nlabel').attr('text-anchor','middle')
    .style('font-family','DM Mono,monospace').style('font-size','8px')
    .style('fill','var(--teal)').style('pointer-events','none')
    .text(d=>d.w.score.toFixed(2));

  const node = g.selectAll('.fnode').data(nodes, d => d.id).enter().append('g')
    .attr('class','fnode').style('cursor','pointer')
    .call(d3.drag()
      .on('start',(e,d)=>{if(!e.active)sim.alphaTarget(.3).restart();d.fx=d.x;d.fy=d.y;})
      .on('drag', (e,d)=>{d.fx=e.x;d.fy=e.y;})
      .on('end',  (e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}));

  node.append('circle').attr('class','fnode-ring')
    .attr('r',d=>rScale(d.wc)+8).attr('fill','none')
    .attr('stroke','var(--teal)').attr('stroke-width',2)
    .attr('opacity',d=>selectedFileIds.has(d.id)?1:0);

  node.append('circle').attr('class','fnode-body')
    .attr('r',d=>rScale(d.wc)).attr('fill','rgba(200,169,110,.14)')
    .attr('stroke','rgba(200,169,110,.5)').attr('stroke-width',1);

  node.append('text').text(d=>d.name.length>14?d.name.slice(0,12)+'…':d.name)
    .attr('text-anchor','middle').attr('dominant-baseline','central')
    .style('font-family','DM Mono,monospace').style('font-size','8px')
    .style('fill','var(--t1)').style('pointer-events','none');

  node.append('text').text(d=>fmtNum(d.wc)+' w')
    .attr('text-anchor','middle').attr('dominant-baseline','central')
    .attr('y', d=>rScale(d.wc)+14)
    .style('font-family','DM Mono,monospace').style('font-size','7px')
    .style('fill','var(--t3)').style('pointer-events','none');

  node.on('click',(e,d)=>{
    e.stopPropagation();
    if(selectedFileIds.has(d.id)) selectedFileIds.delete(d.id);
    else selectedFileIds.add(d.id);
    svg.selectAll('.fnode-ring').attr('opacity',dd=>selectedFileIds.has(dd.id)?1:0);
  });

  node.on('mousemove',(e,d)=>tip(`<div class="tt-lbl">text</div>
    <div class="tt-val">${d.name}</div>
    <div class="tt-sub">${fmtNum(d.wc)} words · ${fmtNum(d.size)} chars</div>
    <div class="tt-sub">${selectedFileIds.has(d.id)?'✓ selected · click to remove':'click to include'}</div>`,e))
  .on('mouseleave',hideTip);

  sim.on('tick',()=>{
    link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
        .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    llabel.attr('x',d=>(d.source.x+d.target.x)/2).attr('y',d=>(d.source.y+d.target.y)/2-3);
    node.attr('transform',d=>`translate(${d.x},${d.y})`);
  });

  if(weighted){
    svg.append('text').attr('x',20).attr('y',H-20)
      .style('font-family','DM Mono,monospace').style('font-size','9px').style('fill','var(--t3)')
      .text('edge width = passage similarity (embeddings) · numbers are raw scores, compare them with each other');
  }

  const netZoom = d3.zoom().scaleExtent([.3,4]).on('zoom', ev => zg.attr('transform', ev.transform));
  svg.call(netZoom);
  svg.on('mousedown.cur', () => svg.classed('panning', true))
     .on('mouseup.cur',   () => svg.classed('panning', false));
}

/* ═════════════════════════════════════
   TEXT SOURCES + PER-TEXT COLOURS
═════════════════════════════════════ */
/* one colour per text (r,g,b) — used by C2 rings, ring labels and reader buttons */
const FILE_RGB = ['126,184,201','155,127,199','126,201,155','201,126,126','201,192,126','126,155,201','201,160,126'];

function fileRGB(i){
  const multi = CORPUS && CORPUS.perFile && CORPUS.perFile.length > 1;
  return multi ? FILE_RGB[i % FILE_RGB.length] : FILE_RGB[0];
}

/* Reader sources:
   compare mode → one per text (same indices as the C2 rings)
   corpus mode  → merged corpus first (index 0 = chart index), then each text */
function readerSources(){
  if(!CORPUS) return [];
  if(CORPUS.perFile.length > 1) return CORPUS.perFile;
  const list = [CORPUS.perFile[0]];
  if(CORPUS.texts && CORPUS.texts.length > 1) list.push(...CORPUS.texts);
  return list;
}
function readerSrc(i){
  return readerSources()[i] || {name:'corpus', data:CORPUS};
}
function readerRGB(i){
  const compare = CORPUS.perFile.length > 1;
  return compare ? FILE_RGB[i % FILE_RGB.length]
       : (i === 0 ? '200,169,110' : FILE_RGB[(i-1) % FILE_RGB.length]);
}



/* ═════════════════════════════════════
   FULL TEXT READER (stage 3)
═════════════════════════════════════ */
function showFullText(){
  if(!CORPUS||ctxParaIdx===null)return;
  ftActiveFileIdx = ctxFileIdx || 0;
  goToStage(3);
  renderFullTextTabs();
  renderFullText(ftActiveFileIdx, ctxHighlight, ctxParaIdx);
}

function goStage3FromChart(){
  if(!CORPUS)return;
  if(ctxParaIdx===null){ ctxParaIdx=0; ctxHighlight=null; ctxFileIdx=0; }
  ftActiveFileIdx = ctxFileIdx || 0;
  goToStage(3);
  renderFullTextTabs();
  renderFullText(ftActiveFileIdx, ctxHighlight, ctxParaIdx);
}

/* Build one tab per loaded file — only shown when >1 file is in CORPUS.perFile */
/* One button per text (plus "merged corpus" in corpus mode) */
function renderFullTextTabs(){
  const bar  = document.getElementById('ft-tabs');
  const srcs = readerSources();
  if(srcs.length <= 1){ bar.style.display='none'; bar.innerHTML=''; return; }
  bar.style.display = 'flex';
  bar.innerHTML = srcs.map((s,i) => {
    const w = s.data.paragraphs.reduce((a,p) => a + p.wordCount, 0);
    return `<button class="ft-tab-btn${i===ftActiveFileIdx?' active':''}" onclick="switchFtTab(${i})">
      <span class="ft-sw" style="background:rgb(${readerRGB(i)})"></span>${s.name}<span class="ft-wc">${fmtNum(w)} w</span>
    </button>`;
  }).join('');
}

function switchFtTab(i){
  ftActiveFileIdx=i;
  renderFullTextTabs();
  document.getElementById('ann-btn').style.display='none';
  document.getElementById('ann-popup').style.display='none';
  pendingSelection=null;
  /* only apply the original highlight/scroll-focus on the tab it came from */
  const focus = (i===ctxFileIdx) ? ctxParaIdx : 0;
  const hl    = (i===ctxFileIdx) ? ctxHighlight : null;
  renderFullText(i, hl, focus);
}

function renderFullText(fileIdx, highlightWord, focusParaIdx){
  const {data:src, name:srcName} = readerSrc(fileIdx);
  const main=document.getElementById('main_column');
  const sidebar=document.getElementById('text_sidebar');
  main.innerHTML='';
  src.paragraphs.forEach((p,i)=>{
    const div=document.createElement('div');
    div.className='ft-para'+(p.isTitle?' ft-title':p.isSection?' ft-section':'');
    div.id='ft-p'+i;
    let txt=p.raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if(highlightWord){
      const re=hlRegex(highlightWord);
      txt=txt.replace(re,'<em>$1</em>');
    }
    /* wrap any saved annotation quotes for this source+paragraph in <mark> */
    ANNOTATIONS.filter(a=>a.source===srcName && a.paraIdx===i).forEach(a=>{
      const esc=a.quote.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const safe=esc.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const re=new RegExp('('+safe+')');
      if(re.test(txt) && !txt.includes('data-ann-id="'+a.id+'"')){
        txt=txt.replace(re, `<mark class="ann-mark" data-ann-id="${a.id}" onclick="jumpToAnnotation('${a.id}')">$1</mark>`);
      }
    });
    div.innerHTML=txt;
    main.appendChild(div);
  });

  const m=src.meta;
  sidebar.innerHTML=`
    <div class="ts-title">document specs</div>
    <div class="ts-row"><span>words</span><span>${fmtNum(m.totalWords)}</span></div>
    <div class="ts-row"><span>unique</span><span>${fmtNum(m.uniqueTypes)}</span></div>
    <div class="ts-row"><span>paragraphs</span><span>${m.paragraphCount}</span></div>
    <div class="ts-row"><span>sentences</span><span>${fmtNum(m.sentences)}</span></div>
    <div class="ts-row"><span>avg sentence</span><span>${m.avgSentenceLen} w</span></div>
    <div class="ts-row"><span>readability</span><span>${m.readability} (${m.flesch})</span></div>
    <div class="ts-row"><span>citations</span><span>${m.citationCount}</span></div>

    <div class="ts-title" style="margin-top:20px">annotations — ${srcName}</div>
    <div id="ts-annotations-wrap"></div>

    <div class="ts-title" style="margin-top:20px">export analysis</div>
    <div class="ts-export-row">
      <button class="ts-export-btn" onclick="saveSpecFile('csv')">↓ specs .csv</button>
      <button class="ts-export-btn" onclick="saveSpecFile('txt')">↓ specs .txt</button>
    </div>
    <div class="ts-export-row">
      <button class="ts-export-btn" onclick="saveChartSVG()">↓ chart .svg</button>
    </div>
    <div class="ts-export-row">
      <button class="ts-export-btn" onclick="saveAnnotationsTxt()">↓ annotations .txt</button>
    </div>
  `;
  renderAnnotationsList(fileIdx);
  if(focusParaIdx!==null && focusParaIdx!==undefined){
    setTimeout(()=>{
      const t=document.getElementById('ft-p'+focusParaIdx);
      if(t) t.scrollIntoView({block:'center'});
    },50);
  }
}

/* ═════════════════════════════════════
   TEXT ANNOTATIONS
═════════════════════════════════════ */
document.addEventListener('mouseup', e=>{
  if(currentStage!==3)return;
  if(e.target.closest('#ann-popup')||e.target.closest('#ann-btn'))return;

  const sel=window.getSelection();
  const btn=document.getElementById('ann-btn');
  if(!sel || sel.isCollapsed || sel.rangeCount===0){ btn.style.display='none'; return; }

  const text=sel.toString().trim();
  if(text.length<2){ btn.style.display='none'; return; }

  const range=sel.getRangeAt(0);
  const paraEl=range.commonAncestorContainer.nodeType===1
    ? range.commonAncestorContainer.closest('.ft-para')
    : range.commonAncestorContainer.parentElement.closest('.ft-para');
  if(!paraEl){ btn.style.display='none'; return; }

  const paraIdx=parseInt(paraEl.id.replace('ft-p',''),10);
   const srcName = readerSrc(ftActiveFileIdx).name;

  pendingSelection={source:srcName, paraIdx, quote:text};

  const rect=range.getBoundingClientRect();
  btn.style.left=Math.round(rect.left+rect.width/2-40)+'px';
  btn.style.top=Math.round(rect.top-36+window.scrollY)+'px';
  btn.style.display='block';
});

function openAnnPopup(){
  if(!pendingSelection)return;
  document.getElementById('ann-btn').style.display='none';
  const popup=document.getElementById('ann-popup');
  document.getElementById('ann-popup-quote').textContent='"'+pendingSelection.quote+'"';
  document.getElementById('ann-popup-text').value='';
  const btn=document.getElementById('ann-btn');
  let left=parseInt(btn.style.left,10)||40;
  let top=(parseInt(btn.style.top,10)||40)+34;
  left=Math.min(left, window.innerWidth-280);
  top=Math.min(top, window.innerHeight-220);
  popup.style.left=Math.max(10,left)+'px';
  popup.style.top=Math.max(10,top)+'px';
  popup.style.display='block';
  document.getElementById('ann-popup-text').focus();
  if(typeof memAnnOpen==='function') memAnnOpen();
}

function closeAnnPopup(){
  document.getElementById('ann-popup').style.display='none';
  pendingSelection=null;
  window.getSelection().removeAllRanges();
}

function saveAnnotation(){
  if(!pendingSelection)return;
  const note=document.getElementById('ann-popup-text').value.trim();
  const entry={
    id:'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    source:pendingSelection.source,
    paraIdx:pendingSelection.paraIdx,
    quote:pendingSelection.quote,
    note: note || '(no note)',
    createdAt: new Date().toISOString(),
  };
  ANNOTATIONS.push(entry);
  annStore.save(entry);
  if(typeof memAnnSaved==='function') memAnnSaved(entry);
  closeAnnPopup();
  renderFullText(ftActiveFileIdx, ctxHighlight, null);
}

function deleteAnnotation(id){
  ANNOTATIONS=ANNOTATIONS.filter(a=>a.id!==id);
  annStore.remove(id);
  if(typeof memAnnDeleted==='function') memAnnDeleted(id);
  renderFullText(ftActiveFileIdx, ctxHighlight, null);
}

/* ✦ suggest: remembers earlier approvals and uses similar earlier notes as context */
async function requestAnnSuggestion(){
  if(!pendingSelection) return;
  const btn = document.getElementById('ann-suggest');
  const ta = document.getElementById('ann-popup-text');
  const quote = pendingSelection.quote;
  btn.textContent = '…'; btn.disabled = true;
  let text = null;
  const ov = (typeof memOverride==='function') ? await memOverride('anncomment', quote) : null;
  if(ov && ov.text) text = ov.text;
  else{
    const context = (typeof memRelatedNotesText==='function') ? await memRelatedNotesText(quote) : '';
    text = await suggestAnnotationComment(quote, context);
  }
  btn.textContent = '✦ suggest'; btn.disabled = false;
  if(!pendingSelection || pendingSelection.quote !== quote) return;
  if(text){
    ta.value = text;
    if(typeof memAnnSuggested==='function') memAnnSuggested(quote, text);
  }
}

function jumpToAnnotation(id){
  const a=ANNOTATIONS.find(x=>x.id===id); if(!a)return;
  document.querySelectorAll('.ann-mark').forEach(m=>m.classList.remove('ann-active'));
  const mark=document.querySelector(`.ann-mark[data-ann-id="${id}"]`);
  if(mark){ mark.classList.add('ann-active'); mark.scrollIntoView({block:'center'}); }
}

function renderAnnotationsList(fileIdx){
  const wrap=document.getElementById('ts-annotations-wrap');
  if(!wrap)return;
  const srcName = readerSrc(fileIdx).name;
  const list=ANNOTATIONS.filter(a=>a.source===srcName);
  if(!list.length){ wrap.innerHTML='<div class="ann-empty">no annotations yet — select text to add one</div>'; return; }
  wrap.innerHTML=list.map(a=>{
    const dt=new Date(a.createdAt);
    const stamp=dt.toLocaleDateString()+' '+dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    return `
      <div class="ann-item">
        <div class="ann-item-quote" onclick="jumpToAnnotation('${a.id}')">"${a.quote}"</div>
        <div class="ann-item-note">${a.note}</div>
        <div class="ann-item-meta">
          <span>¶${a.paraIdx+1} · ${stamp}</span>
          <span class="ann-item-del" onclick="deleteAnnotation('${a.id}')">×</span>
        </div>
      </div>`;
  }).join('');
}

function saveAnnotationsTxt(){
  if(!ANNOTATIONS.length){ alert('No annotations to save yet.'); return; }
  const bySource={};
  ANNOTATIONS.forEach(a=>{ (bySource[a.source]=bySource[a.source]||[]).push(a); });

  let out='LEXIA — TEXT ANNOTATIONS\n'+('='.repeat(40))+'\n\n';
  Object.keys(bySource).forEach(src=>{
    out+='SOURCE: '+src+'\n'+('-'.repeat(40))+'\n\n';
    bySource[src]
      .sort((a,b)=>a.paraIdx-b.paraIdx)
      .forEach(a=>{
        const dt=new Date(a.createdAt);
        const stamp=dt.toLocaleDateString()+' '+dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        out+=`[${stamp}] ¶${a.paraIdx+1}\n`;
        out+=`"${a.quote}"\n`;
        out+=`Note: ${a.note}\n\n`;
      });
    out+='\n';
  });
  saveTextFile('lexia_annotations.txt', out, 'text/plain');
}




/* ═════════════════════════════════════
   EXPORT — SPECS (csv/txt) & CHART (svg)
═════════════════════════════════════ */

/* Saves text content to disk. Uses the native save dialog (File System
   Access API) when available; falls back to a normal browser download
   (which still shows a "save as" dialog in most browser settings). */
async function saveTextFile(filename, content, mimeType){
  if(window.showSaveFilePicker){
    try{
      const ext='.'+filename.split('.').pop();
      const handle=await window.showSaveFilePicker({
        suggestedName:filename,
        types:[{description:'File', accept:{[mimeType]:[ext]}}]
      });
      const writable=await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    }catch(err){
      if(err.name==='AbortError')return; /* user cancelled the dialog */
      /* otherwise fall through to the download fallback below */
    }
  }
  const blob=new Blob([content],{type:mimeType});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Export the currently viewed file's analysis specs as csv or txt */
function saveSpecFile(format){
  if(!CORPUS)return;
  const {data:src, name} = readerSrc(ftActiveFileIdx);
  const m=src.meta;

  const rows=[
    ['metric','value'],
    ['file', name],
    ['words', m.totalWords],
    ['unique types', m.uniqueTypes],
    ['vocab density %', m.vocabDensity],
    ['sentences', m.sentences],
    ['avg sentence length', m.avgSentenceLen],
    ['paragraphs', m.paragraphCount],
    ['readability', m.readability],
    ['flesch score', m.flesch],
    ['citations', m.citationCount],
  ];

  const base=(name.replace(/\.[^.]+$/,'').replace(/[^\w\-]+/g,'_')||'analysis');

  if(format==='csv'){
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    saveTextFile(base+'_specs.csv', csv, 'text/csv');
  }else{
    const txt=rows.map(r=>r[0]+': '+r[1]).join('\n');
    saveTextFile(base+'_specs.txt', txt, 'text/plain');
  }
}

/* Export the concentric chart as a standalone SVG file */
function saveChartSVG(){
  const svgEl=document.getElementById('chart-svg');
  if(!svgEl)return;

  const clone=svgEl.cloneNode(true);
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');

  /* Inline the CSS custom properties used by the chart so colours still
     resolve when the file is opened outside this page. */
  const rootStyles=getComputedStyle(document.documentElement);
  const varNames=['--bg','--s1','--b1','--b2','--b3','--t1','--t2','--t3','--t4',
                   '--gold','--gold2','--teal','--violet','--rose','--sage'];
  let varCss=':root{';
  varNames.forEach(v=>{ varCss+=`${v}:${rootStyles.getPropertyValue(v).trim()};`; });
  varCss+='}';
  const styleTag=document.createElementNS('http://www.w3.org/2000/svg','style');
  styleTag.textContent=varCss;
  clone.insertBefore(styleTag, clone.firstChild);

  /* Solid background rect so the export isn't transparent */
  const bgRect=document.createElementNS('http://www.w3.org/2000/svg','rect');
  bgRect.setAttribute('x','0'); bgRect.setAttribute('y','0');
  bgRect.setAttribute('width', clone.getAttribute('width')||window.innerWidth);
  bgRect.setAttribute('height', clone.getAttribute('height')||window.innerHeight);
  bgRect.setAttribute('fill','var(--bg)');
  clone.insertBefore(bgRect, styleTag.nextSibling);

  const serializer=new XMLSerializer();
  let src=serializer.serializeToString(clone);
  if(!/^<\?xml/.test(src)) src='<?xml version="1.0" standalone="no"?>\r\n'+src;
  saveTextFile('lexia_chart.svg', src, 'image/svg+xml');
}






/* ═════════════════════════════════════
   PANEL BODY TOGGLE
═════════════════════════════════════ */
 
function setPanelTab(){ growBody('body-a'); }

function toggleBody(bodyId, cgId, hdrId){
  const b=document.getElementById(bodyId);
  if(!b)return;
  const willOpen=b.style.maxHeight==='0px'||b.style.maxHeight==='0';
  b.style.maxHeight=willOpen?(b.scrollHeight+60)+'px':'0';
  b.style.opacity=willOpen?'1':'0';
  b.classList.toggle('open',willOpen);
  const cg=document.getElementById(cgId); if(cg)cg.classList.toggle('open',willOpen);
  const h=document.getElementById(hdrId); if(h)h.classList.toggle('hopen',willOpen);
}
function openBody(bodyId, cgId, hdrId){
  const b=document.getElementById(bodyId); if(!b)return;
  b.style.maxHeight=(b.scrollHeight+60)+'px'; b.style.opacity='1'; b.classList.add('open');
  const cg=document.getElementById(cgId); if(cg)cg.classList.add('open');
  const h=document.getElementById(hdrId); if(h)h.classList.add('hopen');
}
/* Recompute an already-open panel's max-height to fit its current content.
   Needed because panel-body's max-height is only set once (on open/toggle) —
   if content grows afterwards (e.g. more files added to the ingest list),
   the fixed max-height clips the new content instead of the panel growing. */
function growBody(bodyId){
  const b=document.getElementById(bodyId); if(!b)return;
  if(!b.classList.contains('open'))return; // collapsed panels stay collapsed
  b.style.maxHeight=(b.scrollHeight+100)+'px';
}

/* ═════════════════════════════════════
   DRAGGABLE PANELS
═════════════════════════════════════ */
function makeDraggable(panelId, handleId){
  const panel=document.getElementById(panelId);
  const handle=document.getElementById(handleId);
  if(!panel||!handle)return;
  let dragging=false, ox=0, oy=0;

  handle.addEventListener('pointerdown',e=>{
    if(e.target.closest('.tog')||e.target.closest('button')||e.target.closest('span[onclick]'))return;
    dragging=true;
    handle.setPointerCapture(e.pointerId);
    const r=panel.getBoundingClientRect();
    // Anchor panel with fixed positioning
    panel.style.position='absolute';
    panel.style.transform='none';
    panel.style.left=r.left+'px'; panel.style.top=r.top+'px';
    panel.style.right='auto'; panel.style.bottom='auto';
    panel.style.zIndex='500';
    ox=e.clientX-r.left; oy=e.clientY-r.top;
    e.preventDefault();
  });
  handle.addEventListener('pointermove',e=>{
    if(!dragging)return;
    let nx=e.clientX-ox, ny=e.clientY-oy;
    nx=Math.max(0,Math.min(window.innerWidth-panel.offsetWidth,nx));
    ny=Math.max(0,Math.min(window.innerHeight-panel.offsetHeight,ny));
    panel.style.left=nx+'px'; panel.style.top=ny+'px';
    checkOverChart(panel);
  });
  handle.addEventListener('pointerup',()=>{dragging=false});
}

function checkOverChart(panel){
  const r=panel.getBoundingClientRect();
  const pcx=r.left+r.width/2, pcy=r.top+r.height/2;
  const dist=Math.hypot(pcx-window.innerWidth/2, pcy-window.innerHeight/2);
  const threshold=Math.min(window.innerWidth,window.innerHeight)*.42;
  panel.classList.toggle('over-chart', dist<threshold);
}

function initDraggables(){
  [
   // ['upload-panel','hdr-a'],
    ['stats-panel','hdr-stats'],
    ['zoom-panel','hdr-zoom'],
    ['legend-panel','hdr-legend'],
    ['word-panel','hdr-word'],
    ['ctx-panel','hdr-ctx'],
    ['filter-panel','hdr-filter'],
  ].forEach(([p,h])=>makeDraggable(p,h));
}

/* ═════════════════════════════════════
   DRAG & DROP
═════════════════════════════════════ */
/* ── ANALYSIS MODE ─────────────────────────────────────────────────────
   'corpus'  : all files merged into one long text → single C2 ring,
               combined NLP (good for series, sagas, thematic reading).
   'compare' : each file gets its own C2 ring, proportional to word count
               → per-file paragraph donuts side-by-side (default for
               multi-document comparison).
   analysisMode is read in runAnalysis() to decide how to build CORPUS.
────────────────────────────────────────────────────────────────────────*/
let analysisMode = 'corpus';
let modeTouched  = false;   /* true once the user clicks a mode button → no more auto-switching */

function setMode(m, fromUser = true){
  if(fromUser) modeTouched = true;
  analysisMode = m;
  document.getElementById('mode-corpus').classList.toggle('active', m==='corpus');
  document.getElementById('mode-compare').classList.toggle('active', m==='compare');
  document.getElementById('mode-desc').textContent = m==='corpus'
    ? 'Analyze a single file or merge many files into one single chart (useful if your files belong to a same corpus, i.e chapters, etc)'
    : 'Upload various files and compare them. You can select which files to analyze clicking them in the bubble graph. To deselect a file, click it again. ';
}

/* ── UNIFIED INGEST ZONE ─────────────────────────────────────────────*/
function dzOver(e){
  e.preventDefault();
  document.getElementById('ingest-zone').classList.add('dz-over');
}
function dzLeave(){
  document.getElementById('ingest-zone').classList.remove('dz-over');
}
function dzDrop(e){
  e.preventDefault(); dzLeave();
  ingestFiles(Array.from(e.dataTransfer.files));
}

/* Clicking the zone: if click lands on the textarea itself, let it
   focus normally. If it lands on the hint overlay or the zone border,
   open the file picker instead. */
function ingestZoneClick(e){
  if(e.target.id==='paste-area') return; /* textarea handles its own click */
  document.getElementById('file-input').click();
}

document.getElementById('file-input').addEventListener('change', e=>{
  ingestFiles(Array.from(e.target.files));
  e.target.value='';
});

/* Hide/show the placeholder hint based on textarea content */
function updateIngestHint(){
  const ta=document.getElementById('paste-area');
  const hint=document.getElementById('ingest-hint');
  hint.classList.toggle('hidden', ta.value.trim().length>0 || FILES.length>0);
}

let pasteTimer=null;
function pasteInput(el){
  updateIngestHint();
  clearTimeout(pasteTimer);
  pasteTimer=setTimeout(()=>{
    const txt=el.value.trim(); if(txt.length<20)return;
    const ex=FILES.findIndex(f=>f.name==='[pasted text]');
    const entry={id: ex>=0?FILES[ex].id:fileIdCounter++, name:'[pasted text]',text:txt,size:txt.length};
    if(ex>=0)FILES[ex]=entry; else FILES.push(entry);
    renderFilesList();updateCorpusStats();showConfigBlock();growBody('body-a');
    renderNetworkGraph();
  },600);
}

function ingestFiles(files){files.forEach(readFile)}
/* .txt/.md/.csv are read in the browser; .pdf/.docx/.html go through the Python backend */
function readFile(file){
  const pw=document.getElementById('prog-wrap'),pf=document.getElementById('prog-fill'),pl=document.getElementById('prog-label');
  pw.style.display='flex'; pl.textContent='reading '+file.name+'…'; pf.style.width='0%';
  let p=0;
  const iv=setInterval(()=>{p=Math.min(p+Math.random()*22+6,88);pf.style.width=p+'%'},60);

  const finish=(text)=>{
    clearInterval(iv); pf.style.width='100%'; pl.textContent='✓ done';
    setTimeout(()=>{pw.style.display='none';pf.style.width='0%'},400);
    text=String(text).replace(/\r\n?/g,'\n');   /* Windows line endings would hide paragraph breaks */
    const ex=FILES.findIndex(f=>f.name===file.name);
    const entry={id: ex>=0?FILES[ex].id:fileIdCounter++, name:file.name, text:text, size:file.size};
    if(ex>=0)FILES[ex]=entry; else FILES.push(entry);
    renderFilesList();updateCorpusStats();showConfigBlock();growBody('body-a');
    renderNetworkGraph();
  };
  const fail=(msg)=>{
    clearInterval(iv); pl.textContent='✗ '+msg;
    setTimeout(()=>{pw.style.display='none';pf.style.width='0%'},4500);
  };

  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(['pdf','docx','html','htm'].includes(ext)){
    if(typeof CAPS==='undefined'||!CAPS.backend) return fail('start run.py to open .'+ext+' files');
    parseOnBackend(file).then(finish).catch(e=>fail(e.message));
  }else{
    const reader=new FileReader();
    reader.onload=ev=>finish(ev.target.result);
    reader.readAsText(file,'UTF-8');
  }
}

function removeFile(idx){
  const removedId=FILES[idx].id;
  selectedFileIds.delete(removedId);
  FILES.splice(idx,1); renderFilesList(); updateCorpusStats();
  if(!FILES.length){
    document.getElementById('next-to-config').style.display='none';
    document.getElementById('reset-corpus').style.display='none';
  }
  growBody('body-a');
  renderNetworkGraph();
}

function resetCorpus(){
  FILES=[]; CORPUS=null; selectedTopic=null; ctxParaIdx=null;
  selectedFileIds=new Set();
  ANNOTATIONS=[];
  renderNetworkGraph();
  document.getElementById('files-list').innerHTML='';
  document.getElementById('paste-area').value='';
  document.getElementById('corpus-stats').style.display='none';
  document.getElementById('next-to-config').style.display='none';
  document.getElementById('reset-corpus').style.display='none';
  document.getElementById('stats-panel').style.display='none';
  document.getElementById('legend-panel').style.display='none';
  document.getElementById('word-panel').style.display='none';
  document.getElementById('ctx-panel').style.display='none';
  document.getElementById('empty').style.display='flex';
  d3.select('#chart-svg').selectAll('*').remove();
  ['sn1','sn2','sn3'].forEach(id=>{const n=document.getElementById(id);n.classList.remove('done','active')});
  analysisMode='corpus';
  setMode('corpus', false); modeTouched = false;
  setPanelTab('ingest');
  updateIngestHint();
  openBody('body-a','cg-a','hdr-a');
}

function renderFilesList(){
  const el=document.getElementById('files-list'); el.innerHTML='';
  FILES.forEach((f,i)=>{
    const d=document.createElement('div'); d.className='fi';
    const sz=f.size>1024?Math.round(f.size/1024)+'kb':f.size+'b';
    d.innerHTML=`<div class="fi-dot"></div><span class="fi-name" title="${f.name}">${f.name}</span><span class="fi-size">${sz}</span><span class="fi-rm" onclick="removeFile(${i})">×</span>`;
    el.appendChild(d);
  });
  document.getElementById('reset-corpus').style.display=FILES.length?'block':'none';
  updateIngestHint();
}

function updateCorpusStats(){
  const el=document.getElementById('corpus-stats');
  if(!FILES.length){el.style.display='none';return;}
  el.style.display='flex';
  const tot=FILES.reduce((s,f)=>s+f.text.length,0);
  document.getElementById('st-files').textContent=FILES.length;
  document.getElementById('st-chars').textContent=fmtNum(tot);
}

function showConfigBlock(){
    if(!modeTouched) setMode(FILES.length > 1 ? 'compare' : 'corpus', false);
  document.getElementById('next-to-config').style.display = FILES.length ? 'block' : 'none';
  const tot=FILES.reduce((s,f)=>s+f.text.split(/\s+/).filter(Boolean).length,0);
  document.getElementById('run-meta').innerHTML=FILES.map(f=>`<span class="hi">${f.name}</span>`).join(', ')+`<br>~${fmtNum(tot)} words`;
}

/* ═════════════════════════════════════
   NLP ENGINE
═════════════════════════════════════ */
const STOPS=new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with',
'by','from','is','was','are','were','be','been','have','has','had','do','does','did','that',
'this','it','he','she','they','we','you','i','not','as','so','if','its','his','her','their',
'our','my','your','which','who','what','when','where','how','all','no','up','out','there',
'can','will','would','could','should','may','might','shall','just','also','than','then','more',
'some','into','about','over','after','before','through','between','during','each','both','very',
'such','these','those','any','many','much','most','other','another','one','two','three','first',
'last','long','great','little','good','new','old','high','own','same','right','large','used',
'well','way','even','back','because','come','albeit','notwithstanding','however','related','must','hitherto',
'here','made','only','therefore','yet','see','else','while','still','us','him','them']);

/* ── CLOUD WORDS (dial) ──────────────────────────────────────────────
   CLOUD_MIN words by frequency, then greedy set-cover so EVERY paragraph
   contains at least one cloud word. Paragraphs with no content words
   (e.g. only stopwords) cannot be covered and are skipped.            */
const CLOUD_TOKEN_RE = /\b[a-záéíóúüñ']{2,}\b/g;   /* same tokeniser as fullWords */
const CLOUD_MIN      = 28;                           /* base size of the cloud      */

/* ── CLOUD WORDS (dial) ──────────────────────────────────────────────
   1) REQUIRED: a minimal greedy set cover → every paragraph contains at
      least one of these words (placed first, so they survive tight space).
   2) OPTIONAL: most frequent words, topping the cloud up to CLOUD_MIN.
      These are the first to be dropped when the dial runs out of room.  */
function paraTokens(data, p){            /* lemmas when spaCy ran, else the raw tokeniser */
  if(data && data.ptoks && data.ptoks[p.idx]) return data.ptoks[p.idx].filter(Boolean);
  return p.raw.toLowerCase().match(CLOUD_TOKEN_RE)||[];
}

function buildCloudWords(paragraphs, freq, ptokOf){
  const paraSets = paragraphs.map(p =>
    new Set((ptokOf ? ptokOf(p).filter(Boolean) : (p.raw.toLowerCase().match(CLOUD_TOKEN_RE)||[])).filter(w => freq[w] > 0)));

  const req = new Set();
  const uncovered = new Set(paraSets.map((s,i) => s.size ? i : -1).filter(i => i >= 0));
  while(uncovered.size){
    const gain = {};
    uncovered.forEach(i => paraSets[i].forEach(w => gain[w] = (gain[w]||0) + 2));
    let best = null, bg = 0;
    for(const w in gain){
      if(gain[w] > bg || (gain[w] === bg && freq[w] > freq[best])){ best = w; bg = gain[w]; }
    }
    if(!best) break;
    req.add(best);
    [...uncovered].forEach(i => { if(paraSets[i].has(best)) uncovered.delete(i); });
  }

  const out = [...req].map(w => ({word:w, count:freq[w], req:true}));
  const byFreq = Object.entries(freq).sort((a,b) => b[1]-a[1]);
  for(const [w,c] of byFreq){
    if(out.length >= CLOUD_MIN) break;
    if(!req.has(w)) out.push({word:w, count:c, req:false});
  }
  return out.sort((a,b) => b.count - a.count);
}


function analyse(text,opts,nlp){
  const paragraphs=[];
  text.split(/\n{2,}/).forEach((blk,i)=>{
    const t=blk.trim(); if(!t)return;
    const wc=t.split(/\s+/).filter(Boolean).length;
    const isTitle=(i===0&&wc<15)||/^#{1,4}\s/.test(t)||/^[A-Z][A-Z\s]{5,40}$/.test(t.trim());
    const isSection=!isTitle&&wc<20;
    paragraphs.push({idx:paragraphs.length,raw:t,wordCount:wc,isTitle,isSection});
  });

  /* spaCy lemmas when available, else the regex tokeniser.
     nlp.tokens[i] = lemma list of paragraph i; '' = dropped token (keeps positions true). */
  if(nlp && !(nlp.tokens && nlp.tokens.length===paragraphs.length)){
    console.warn('spaCy result does not match the paragraphs; using the regex tokeniser'); nlp=null;
  }
  let fullWords, filtered;
  if(nlp){
    fullWords=nlp.tokens.flat();
    filtered=fullWords.filter(Boolean);
  }else{
    fullWords=text.toLowerCase().match(/\b[a-záéíóúüñ']{2,}\b/g)||[];
    filtered=opts.stops?fullWords.filter(w=>!STOPS.has(w)):fullWords;
  }
  const ptok=p=>nlp?nlp.tokens[p.idx]:(p.raw.toLowerCase().match(/\b[a-z']{2,}\b/g)||[]);

  const freq={};
  filtered.forEach(w=>{freq[w]=(freq[w]||0)+1});
  const df={};
  paragraphs.forEach(p=>{new Set(ptok(p).filter(Boolean)).forEach(w=>{df[w]=(df[w]||0)+1})});
  const N=paragraphs.length||1;
  const tfidf={};
  Object.entries(freq).forEach(([w,f])=>{tfidf[w]=f*Math.log((N+1)/((df[w]||0)+1))});

   const topWords=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,opts.topWords)
    .map(([word,count])=>({word,count,tfidf:+(tfidf[word]||0).toFixed(2)}));

  /* trackSet drives which words get C3 dots and word-detail panels.
     Always include the top-N words PLUS every topic keyword seed that
     actually appears in the text — so clicking any topic bubble always
     finds matching dots in C3, even if the seed word ranks below top-N. */
  const topicSeeds=new Set([
    'story','narrative','voice','words',
     'time','day','days','century','period','history','moment', 'memory',
    'city','house','room','place','home','space','region','area',
    'man','woman','people','person','child','family','society','community',
    'think','thought','mind','know','believe','feel','consciousness','idea',
    'light','dark','sun','water','sky','earth','night','air','world','nature',
    'love','life','death','fear','hope','pain','heart','soul','dream','experience',
    'research','study','analysis','result','evidence','theory','system',
    'language','word','text','meaning','symbol','discourse','expression',
  ]);
  const trackSet=new Set([
    ...topWords.map(d=>d.word),
    /* Add seeds only when they actually occur in this corpus */
    ...[...topicSeeds].filter(w=>freq[w]>0),
  ]);

  /* character mode: give every part of a detected person's name its own C3 dots */
  if(nlp && opts.focus==='literary'){
    nlp.entities.filter(e=>e.label==='PERSON').slice(0,15)
      .forEach(e=>e.text.toLowerCase().split(/\s+/).forEach(w=>{ if(freq[w]>0) trackSet.add(w); }));
  }

  const cloudWords=buildCloudWords(paragraphs,freq,nlp?ptok:null);

  const WIN=opts.win,collObj={};
  filtered.forEach((w,i)=>{
    if(!trackSet.has(w))return;
    if(!collObj[w])collObj[w]={};
    for(let d=-WIN;d<=WIN;d++){if(!d)continue;const nw=filtered[i+d];if(nw&&nw!==w&&!STOPS.has(nw))collObj[w][nw]=(collObj[w][nw]||0)+1}
  });
  const collocateMap={};
  Object.entries(collObj).forEach(([w,m])=>{collocateMap[w]=Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([cw,cnt])=>({word:cw,count:cnt}))});

  const wordPositions=[],wordParas={};
  let gt=0;
  paragraphs.forEach((p,pi)=>{
    const ptoks=ptok(p);
    ptoks.forEach((w,ti)=>{
      if(trackSet.has(w)){
        const pos=Math.min((gt+ti)/(fullWords.length||1),.9999);
        wordPositions.push({word:w,position:pos,paraIdx:pi,tokIdx:ti,paraToks:ptoks.length,paraIsTitle:p.isTitle,paraIsSection:p.isSection});
        if(!wordParas[w])wordParas[w]=[];
        if(!wordParas[w].includes(pi))wordParas[w].push(pi);
      }
    });
    gt+=ptoks.length;
  });

 const topicDefs = [
  { name: 'Narration',emoji: '◈', keys: [ 'said', 'told', 'asked', 'spoke', 'story', 'narrative', 'voice', 'words', 'storytelling', 'tale', 'episode', 'sequence',
      'recount', 'plot', 'narrator', 'perspective', 'chronicle', 'dialogue', 'monologue', 'account', 'anecdote', 'exposition', 'prose', 'description', 'allegory', 'fable', 'memoir', 'myth', 'legend', 'relate', 'speak', 'utter', 'recap', 'yarn', 'repertoire', 'retelling', 'reminiscence'
    ] },
  {name: 'Time',emoji: '◷',keys: ['year', 'years', 'time', 'day', 'days', 'century', 'period', 'history', 'moment','era', 'epoch', 'decade', 'minute', 
  'second', 'hour', 'duration', 'interval', 'future', 'past', 'present', 'temporality', 'schedule', 'timeline', 'chronology', 'age', 'season', 'instant', 'delay', 'eternity', 'tempo', 'clock', 'calendar', 'span', 'lapse', 'interim'
    ] },
  { name: 'Space', emoji: '◉',keys: [ 'city', 'house', 'room', 'place', 'home', 'space', 'region', 'area', 'geography', 'map', 'spatial',
      'location', 'territory', 'domain', 'boundary', 'zone', 'vicinity', 'distance', 'dimension', 'site', 'landscape', 'environment', 'building', 'address', 'district', 'locale', 'premise', 'position', 'breadth', 'expanse', 'field', 'setting', 'venue', 'neighborhood', 'spot', 'topography'
    ] },
  { name: 'People',emoji: '◎', keys: ['man', 'woman', 'people', 'person', 'child', 'family', 'society', 'community', 'voice', 'nation', 'country',
      'individual', 'human', 'group', 'populace', 'citizen', 'public', 'tribe', 'culture', 'generation', 'peer', 'crowd', 'kin', 'relative', 'ancestor', 'neighbor', 'fellow', 'youth', 'adult', 'mankind', 'civilization', 'identity', 'folk', 'demographic', 'population', 'humanity'
    ]},
  { name: 'Mind', emoji: '◇',keys: ['think', 'thought', 'mind', 'know', 'believe', 'feel', 'consciousness', 'memory', 'idea',
      'intellect', 'perception', 'reasoning', 'cognition', 'awareness', 'logic', 'intuition', 'psyche', 'comprehension', 'imagination', 'concept', 'insight', 'mental', 'contemplate', 'reflect', 'psychoanalysis', 'focus', 'intent', 'understanding', 'subconscious', 'brain', 'judgment', 'opinion', 'recollect', 'notion'
    ]},
  {
    name: 'Nature', emoji: '◌', keys: [ 'light', 'dark', 'sun', 'water', 'sky', 'earth', 'night', 'air', 'world', 'land', 'sea', 'forest', 'mountain', 'fauna', 'nature',
      'flora', 'ocean', 'river', 'weather', 'climate', 'ecosystem', 'wilderness', 'wind', 'rain', 'storm', 'soil', 'valley', 'organism', 'wildlife', 'environment', 'element', 'cloud', 'tree', 'flower', 'star', 'desert', 'habitat', 'biodiversity', 'terrain', 'wave'
    ] },
  { name: 'Action', emoji: '◆',keys: [ 'came', 'went', 'made', 'come', 'take', 'stage', 'actor', 'protagonist', 'momentum', 'impulse', 'began', 'found', 'used', 'become',
      'move', 'run', 'jump', 'perform', 'execute', 'drive', 'initiate', 'pursue', 'strike', 'achieve', 'conduct', 'operate', 'force', 'behavior', 'strive', 'effort', 'dynamism', 'gesture', 'maneuver', 'engage', 'react', 'launch', 'deliver', 'act', 'exertion'
    ] },
  {
    name: 'Emotion',emoji: '◍',keys: ['love', 'life', 'death', 'fear', 'hope', 'pain', 'heart', 'soul', 'happiness', 'sadness', 'melancholy', 'rage', 'emotional', 'experience',
      'grief', 'joy', 'anger', 'anxiety', 'compassion', 'passion', 'despair', 'empathy', 'jealousy', 'delight', 'sorrow', 'affection', 'terror', 'regret', 'euphoria', 'frustration', 'shame', 'pride', 'tenderness', 'sentiment', 'attachment', 'feeling', 'anguish', 'warmth', 'bliss'
    ] },
  { name: 'Knowledge', emoji: '◈', keys: ['research', 'study', 'analysis', 'result', 'evidence', 'theory', 'system',
      'data', 'finding', 'hypothesis', 'investigation', 'methodology', 'fact', 'scholarship', 'science', 'discovery', 'academic', 'insight', 'discipline', 'expertise', 'information', 'experiment', 'proof', 'concept', 'logic', 'model', 'principle', 'evaluation', 'observation', 'empirical', 'inquiry', 'erudition'
    ] },
  {name: 'Language',emoji: '◐',keys: ['language', 'word', 'paragraph', 'comment', 'glossary', 'linguistic', 'verb', 'adjective', 'sentence', 'text', 'meaning', 'symbol', 'discourse', 'expression',
      'grammar', 'vocabulary', 'noun', 'phrase', 'syntax', 'phonetics', 'semantics', 'dialect', 'idiom', 'etymology', 'translation', 'rhetoric', 'dialect', 'speech', 'alphabet', 'communication', 'term', 'articulation', 'gloss', 'literal', 'metaphor', 'literacy', 'script', 'vernacular', 'pronunciation'
    ] }
];
  const topics=topicDefs.map(t=>{
    const matched=t.keys.filter(k=>freq[k]>0);
    return{...t,freq:matched.reduce((s,k)=>s+(freq[k]||0),0),related:matched.sort((a,b)=>(freq[b]||0)-(freq[a]||0)).slice(0,6)};
  }).filter(t=>t.freq>0).sort((a,b)=>b.freq-a.freq);

  const citations=[];
  if(opts.cites){
    paragraphs.forEach((p,pi)=>{
      const pat=/\(([A-Z][a-záéíóú\-]+(?:\s+(?:and|&)\s+[A-Z][a-záéíóú\-]+)?(?:\s+et\s+al\.?)?),?\s*(\d{4}[a-z]?)\)/g;
      let m;
      while((m=pat.exec(p.raw))!==null)
        citations.push({ref:m[0],author:m[1],year:m[2]||'',paraIdx:pi,paraFraction:pi/(paragraphs.length||1),context:p.raw.trim().slice(0,130)+'…'});
    });
  }

  const sents=text.split(/[.!?]+/).filter(s=>s.trim().split(/\s+/).length>2);
  const syl=w=>{w=w.toLowerCase().replace(/[^a-z]/g,'');let c=0;w.replace(/[aeiouy]{1,2}/g,()=>c++);return Math.max(c,1)};
  const nSent=nlp?nlp.sentences:sents.length;
  const asl=nSent?fullWords.length/nSent:0;
  const asw=filtered.length?filtered.reduce((s,w)=>s+syl(w),0)/filtered.length:0;
  const flesch=Math.max(0,Math.min(100,206.835-1.015*asl-84.6*asw));

  return{paragraphs,topWords,trackSet,collocateMap,wordPositions,wordParas,topics,citations,cloudWords,freq,tfidf,
    ptoks:nlp?nlp.tokens:null, entities:nlp?nlp.entities:[], forms:nlp?nlp.forms:{},
    meta:{totalWords:filtered.length,uniqueTypes:Object.keys(freq).length,sentences:nSent,engine:nlp?'spaCy/'+nlp.lang:'basic',
      avgSentenceLen:+asl.toFixed(1),vocabDensity:+(Object.keys(freq).length/(filtered.length||1)*100).toFixed(1),
      flesch:+flesch.toFixed(0),readability:flesch>70?'easy':flesch>50?'standard':flesch>30?'difficult':'very difficult',
      paragraphCount:paragraphs.length,citationCount:citations.length}};
}

/* ═════════════════════════════════════
   ANALYSIS CACHE
   Keeps expensive NLP results keyed by source text + options. Re-running
   the same corpus or resizing the chart no longer repeats tokenisation,
   TF-IDF, collocation and topic calculations.
═════════════════════════════════════ */
function analyseCached(text, opts, nlp){
  const key = [text.length, text, opts.topWords, opts.win, opts.stops ? 1 : 0, opts.cites ? 1 : 0, opts.focus||'',
    nlp ? (nlp.model||'')+':'+nlp.sentences+':'+nlp.tokens.length : 'regex'].join('|');
  const hit = ANALYSIS_CACHE.get(key);
  if(hit) return hit;
  const result = analyse(text, opts, nlp);
  ANALYSIS_CACHE.set(key, result);
  while(ANALYSIS_CACHE.size > ANALYSIS_CACHE_MAX){
    const first = ANALYSIS_CACHE.keys().next().value;
    ANALYSIS_CACHE.delete(first);
  }
  return result;
}

/* ═════════════════════════════════════
   RUN
═════════════════════════════════════ */
async function runAnalysis(){
  if(!FILES.length)return;
  setNetworkVisible(false);   /* network disappears as soon as analysis starts */
  const activeFiles = selectedFileIds.size>0 ? FILES.filter(f=>selectedFileIds.has(f.id)) : FILES;
  const btn=document.getElementById('run-btn');
  btn.disabled=true; btn.textContent='◌ processing…';
  document.getElementById('aticker').style.display='flex';
  document.getElementById('phase-bar').style.display='block';
  selectedTopic=null; ctxParaIdx=null; STATE.sel=null; STATE.dialDeg=0;

  const opts={
    topWords:+document.getElementById('opt-words').value,
    win:+document.getElementById('opt-win').value,
    stops:document.getElementById('opt-stops').checked,
    cites:document.getElementById('opt-cites').checked,
    focus:(typeof analysisFocus!=='undefined')?analysisFocus:'generic',
  };

  const pf=document.getElementById('phase-fill'),lbl=document.getElementById('atick-lbl');
  pf.style.width='8%'; lbl.textContent='preparing…';
  await new Promise(r=>setTimeout(r,20));

  try{
    /* Phase B: optional spaCy pass (falls back silently to the regex analysis) */
    let nlpAll=null, nlpList=null;
    if(typeof buildNlp==='function'){
      lbl.textContent='linguistic analysis…'; pf.style.width='30%';
      try{
        const r=await buildNlp(activeFiles,opts);
        if(r){ nlpAll=r.merged; nlpList=r.perFile; }
      }catch(e){
        console.warn('spaCy skipped:',e.message);
        if(typeof llmToast==='function') llmToast('Linguistic engine: '+e.message+' — using basic analysis');
      }
    }
    pf.style.width='55%'; lbl.textContent='analysing corpus…';

    /* CORPUS mode: all files concatenated → one analysis, one C2 ring (perFile has one entry);
       CORPUS.texts = each file analysed on its own, for the reader tabs.
       COMPARE mode: merged analysis for the globals (topics, cloud, C3) plus one analysis per file / ring. */
    const mergedText = activeFiles.map(f=>f.text).join('\n\n');
    CORPUS = analyseCached(mergedText, opts, nlpAll);
    if(analysisMode === 'corpus' || activeFiles.length === 1){
      CORPUS.perFile = [{
        name: activeFiles.length===1 ? activeFiles[0].name : 'merged corpus',
        data: CORPUS
      }];
      CORPUS.texts = activeFiles.length > 1
        ? activeFiles.map((f,i) => ({name:f.name, data:analyseCached(f.text, opts, nlpList?nlpList[i]:null)}))
        : CORPUS.perFile;
    } else {
      CORPUS.perFile = activeFiles.map((f,i)=>({
        name: f.name,
        data: analyseCached(f.text, opts, nlpList?nlpList[i]:null)
      }));
      CORPUS.texts = CORPUS.perFile;
    }
    if(typeof memSplit==='function'){
      CORPUS.docs=activeFiles.map(f=>({name:f.name,n:memSplit(f.text).length}));
      if(typeof memOnFilesChanged==='function') memOnFilesChanged();
    }

    pf.style.width='100%'; lbl.textContent='rendering…';
    ['sn2','sn3'].forEach(id=>document.getElementById(id).classList.add('done'));
    document.getElementById('sn2').classList.remove('active');
    renderStatsPanel(CORPUS.meta);
    document.getElementById('stats-panel').style.display='block';
    document.getElementById('legend-panel').style.display='flex';
    document.getElementById('empty').style.display='none';
    renderChart(CORPUS);
    showTopicLoading();
    if(typeof enrichTopics==='function') enrichTopics(CORPUS);
    btn.disabled=false; btn.textContent='◎ re-analyse';
    document.getElementById('aticker').style.display='none';
    setTimeout(()=>{document.getElementById('phase-bar').style.display='none';pf.style.width='0%'},400);
    document.querySelectorAll('.panel').forEach(checkOverChart);
    goToStage(2);
  }catch(err){
    console.error(err);
    btn.disabled=false; btn.textContent='CREATE CHART';
    document.getElementById('aticker').style.display='none';
    document.getElementById('phase-bar').style.display='none';
    setNetworkVisible(true);
  }
}

function renderStatsPanel(m){
  const rows=[['words',fmtNum(m.totalWords)],['unique',fmtNum(m.uniqueTypes)],['density',m.vocabDensity+'%'],
    ['sentences',fmtNum(m.sentences)],['avg len',m.avgSentenceLen+' w'],['paragraphs',m.paragraphCount],
    ['readability',m.readability+' ('+m.flesch+')'],['citations',m.citationCount],['engine',m.engine||'basic']];
  document.getElementById('stats-rows').innerHTML=rows.map(([k,v])=>
    `<div class="sp-row"><span class="sp-k">${k}</span><span class="sp-v">${v}</span></div>`).join('');
}

/* ═════════════════════════════════════
   CONTEXT PANEL
═════════════════════════════════════ */
/* showCtxPanel(paraIdx, hlWord, fileIdx)
   fileIdx is optional; when provided it shows the source-file name
   in the context reader header (useful when multiple files loaded).  */

/* Resolve which analysed text a paragraph index refers to:
   a per-file ring (fileIdx given) or the merged corpus (C3 / C4 / topics). */
 /* Resolve which analysed text a paragraph index refers to:
   a per-file ring (fileIdx given) or the merged corpus (C3 / C4 / topics). */

function ctxSource(fileIdx){
  return (fileIdx!==null && fileIdx!==undefined && CORPUS.perFile && CORPUS.perFile[fileIdx])
    ? CORPUS.perFile[fileIdx].data : CORPUS;
}


function showCtxPanel(paraIdx, hlWord, fileIdx){
  if(!CORPUS)return;
  const hasFile = fileIdx!==undefined && fileIdx!==null;
  const src = hasFile ? ctxSource(fileIdx) : CORPUS;
  const p = src.paragraphs[paraIdx]; if(!p)return;
  ctxParaIdx = paraIdx; ctxHighlight = hlWord||null;
  ctxFileIdx = hasFile ? fileIdx : (CORPUS.perFile && CORPUS.perFile.length===1 ? 0 : null);

  const tag = p.isTitle?'title':p.isSection?'section header':`paragraph ${paraIdx+1} / ${src.paragraphs.length}`;
  let meta = tag+' · '+p.wordCount+' words';
  if(CORPUS.perFile && CORPUS.perFile.length>1){
    const fname = hasFile ? CORPUS.perFile[fileIdx].name : 'merged corpus';
    meta += ' · <span style="color:var(--teal)">'+fname+'</span>';
  }
  document.getElementById('ctx-meta').innerHTML = meta;

  let html = p.raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if(ctxHighlight){
    html = html.replace(hlRegex(ctxHighlight),'<em>$1</em>');
  }
  document.getElementById('ctx-text').innerHTML = html;
  if(typeof renderCtxExtras==='function') renderCtxExtras(p, paraIdx);
  else document.getElementById('ctx-llm-summary').textContent='';
  const panel = document.getElementById('ctx-panel');
  panel.style.display = 'flex';
  openBody('ctx-body','cg-ctx','hdr-ctx');
  checkOverChart(panel);
  viewSelMarker();
}


/* prev/next moves the SHARED selection when the reader is on a ring paragraph,
   so ring highlight, dial and bubbles follow along. */
function ctxNav(dir){
  if(ctxParaIdx===null||!CORPUS)return;
  const next = ctxParaIdx + dir;
  const src  = ctxSource(ctxFileIdx);
  if(next<0 || next>=src.paragraphs.length) return;
  if(ctxFileIdx!==null) selectParagraph(ctxFileIdx, next, false);
  else                  showCtxPanel(next, ctxHighlight);
}


function closeCtxPanel(){document.getElementById('ctx-panel').style.display='none';ctxParaIdx=null;viewSelMarker()}


/* ═════════════════════════════════════
   WORD DETAIL
═════════════════════════════════════ */
/* Word-detail panel scoped to ONE paragraph's most frequent word —
   triggered whenever a C2 paragraph segment is selected. */
function showParaWordDetail(paraIdx, fileIdx){
  if(!CORPUS)return;
  const src = (CORPUS.perFile && CORPUS.perFile[fileIdx]) ? CORPUS.perFile[fileIdx].data : CORPUS;
  const p = src.paragraphs && src.paragraphs[paraIdx]; if(!p)return;
  const toks=(src.ptoks ? src.ptoks[paraIdx].filter(Boolean) : (p.raw.toLowerCase().match(/\b[a-z']{2,}\b/g)||[]).filter(w=>!STOPS.has(w)));
  if(!toks.length)return;
  const freq={};
  toks.forEach(w=>freq[w]=(freq[w]||0)+1);
  const topWord=Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0];
  const localData={
    freq,
    tfidf: src.tfidf || {},
    collocateMap: src.collocateMap || {},
    wordParas: {[topWord]: [paraIdx]},
  };
  showWordPanel(topWord, localData);
}

function showWordPanel(word, data){
  document.getElementById('word-panel').style.display='block';
  document.getElementById('wp-word').textContent=word;
  document.getElementById('wp-freq').textContent='×'+(data.freq[word]||0)+' occurrences';
  document.getElementById('wp-tfidf').textContent=(data.tfidf[word]||0).toFixed(3);
  const cols=data.collocateMap[word]||[];
  document.getElementById('wp-collocates').innerHTML=cols.length
    ?cols.map(c=>`<span class="wp-tag">${c.word} <span class="c-t3">×${c.count}</span></span>`).join('')
    :'<span style="font-size:9px;color:var(--t3)">none found</span>';
  if(typeof renderWordExtras==='function') renderWordExtras(word, cols);
  else document.getElementById('wp-llm-note').textContent='';
  const paras=data.wordParas[word]||[];
  document.getElementById('wp-paras').innerHTML=paras.slice(0,8).map(pi=>
    `<span class="wp-tag" onclick="showCtxPanel(${pi},'${word}')">¶${pi+1}</span>`).join('')+
    (paras.length>8?`<span class="wp-tag c-t3">+${paras.length-8}</span>`:'');
  openBody('word-body','cg-word','hdr-word');
  checkOverChart(document.getElementById('word-panel'));
  applyWordHighlight(word);
}
function closeWordPanel(){
  document.getElementById('word-panel').style.display='none';
  clearHighlights();
}

/* ═════════════════════════════════════
   HIGHLIGHT SYSTEM
═════════════════════════════════════ */
/* ═════════════════════════════════════════════════════════════════════
   HIGHLIGHT SYSTEM
   ─────────────────────────────────────────────────────────────────────
   Three targets are highlighted together:
     • .word-dot   (C3 circles) — opacity + radius change
     • .cloud-word (C1 word-cloud text labels) — opacity change
     • .topic-bubble (C1 force bubbles) — opacity change

   Word-cloud text nodes carry data-word attribute set at render time
   so they can be selected by word name without D3 datum overhead.
═════════════════════════════════════════════════════════════════════ */
function applyWordHighlight(word){
    STATE.hl = 'word'; viewFocus();
  /* C3 dots: dim non-matching, enlarge matching */
  d3.selectAll('.word-dot')
    .transition().duration(200)
    .attr('opacity', d => d.word===word ? 1 : .16)
    .attr('r', d => d.word===word
      ? (d.paraIsTitle ? 7 : 5.5)    /* selected: clearly enlarged */
      : (d.paraIsTitle ? 2.5 : 2));  /* others: shrunk so selection stands out */

  /* C1 word-cloud labels: brighten matching word, dim others */
  d3.selectAll('.cloud-word')
    .transition().duration(200)
    .style('fill-opacity', function(){
      return this.getAttribute('data-word')===word ? 1 : .42;
    })
    .style('font-size', function(){
      /* Keep the existing font-size but add 3px to the matching word */
      const cur = parseFloat(this.getAttribute('data-base-fs')||
                             this.style.fontSize||'9');
      return (this.getAttribute('data-word')===word ? cur+5 : cur)+'px';
    });

  /* C1 topic bubbles: brighten if they relate to this word */
  d3.selectAll('.topic-bubble')
    .transition().duration(200)
    .attr('opacity', d => (d.related||[]).includes(word) ? 1 : .12);
}

function applyTopicHighlight(topicName){
  if(selectedTopic===topicName){ clearHighlights(); return; }
  selectedTopic = topicName;
    STATE.hl = 'topic'; viewFocus();
  const topic = CORPUS.topics.find(t=>t.name===topicName);
  if(!topic){ clearHighlights(); return; }
  const tWords = new Set(topic.related);

  /* C3 dots */
  d3.selectAll('.word-dot')
    .transition().duration(220)
    .attr('opacity', d => tWords.has(d.word) ? 1 : .05)
    .attr('r', d => tWords.has(d.word)
      ? (d.paraIsTitle ? 6.5 : 4.8) : 2);

  /* C1 word-cloud labels */
  d3.selectAll('.cloud-word')
    .transition().duration(220)
    .style('fill-opacity', function(){
      return tWords.has(this.getAttribute('data-word')) ? 1 : .1;
    });

  /* C1 topic bubbles */
  d3.selectAll('.topic-bubble')
    .transition().duration(220)
    .attr('opacity', d => d.name===topicName ? 1 : .1);

  /* Open context panel at the topic's first relevant paragraph
     (clusters and characters carry their own paragraph list) */
  const firstPara=(topic.paras&&topic.paras.length)?topic.paras[0]
                 :(topic.related.length?CORPUS.wordParas[topic.related[0]]?.[0]:undefined);
  if(firstPara!==undefined) showCtxPanel(firstPara, topic.hl||topic.related[0]);
}

function clearHighlights(){
  selectedTopic = null;
    STATE.hl = null; viewFocus();

  d3.selectAll('.word-dot')
    .transition().duration(200)
    .attr('opacity', 1)
    .attr('r', d => d.paraIsTitle?4.5 : d.paraIsSection?3.5 : 2.8);

  d3.selectAll('.cloud-word')
    .transition().duration(200)
    .style('fill-opacity', .68)
    .style('font-size', function(){
      return (this.getAttribute('data-base-fs')||'19')+'px';
    });

  d3.selectAll('.topic-bubble')
    .transition().duration(200).attr('opacity',1);
}



/* ═════════════════════════════════════
   TOOLTIP
═════════════════════════════════════ */
const TIP=document.getElementById('tip');
function tip(html,e){TIP.style.display='block';TIP.innerHTML=html;moveTip(e)}
function moveTip(e){
  let x=e.clientX+16,y=e.clientY-12;
  if(x+280>window.innerWidth)x=e.clientX-285;
  if(y+TIP.offsetHeight>window.innerHeight)y=e.clientY-TIP.offsetHeight-10;
  TIP.style.left=x+'px';TIP.style.top=y+'px';
}
function hideTip(){TIP.style.display='none'}

/* ═════════════════════════════════════════════════════════════════════
   PARALLAX — each ring shifts slightly more/less than the pan
   ─────────────────────────────────────────────────────────────────────
   PARALLAX_ON   : master switch.
   PARALLAX[key] : extra shift as a fraction of the pan distance.
                   0     = moves exactly with the pan (no parallax)
                   > 0   = moves ahead of the pan (feels closer)
                   < 0   = lags behind the pan (feels farther)
                   stars sit outside the zoom group, so for them the value
                   is the WHOLE drift (e.g. .06 = 6 % of the pan).
   PARALLAX_MAX  : cap on any layer's extra shift, in screen px.
═════════════════════════════════════════════════════════════════════ */
const PARALLAX_ON  = true;
const PARALLAX_MAX = 40;
const PARALLAX = {
  stars : 0.02,
  c1    : -0.01,
  cloud : -0.015,
  grid  : 0.00,
  c2    : 0.015,
  c3    : 0.02,
  c4    : 0.03,
};
const PARALLAX_LAYERS = {
  c1:'.c1-topics', cloud:'.cloud-belt', grid:'.measure-grid',
  c2:'.c2-ring',   c3:'.c3-ring',       c4:'.c4-ring',
};
let PARALLAX_PAN = {dx:0, dy:0, k:1};

/* pan offset = distance of the chart centre from the viewport centre (screen px) */
function updateParallax(t){
  const svg = d3.select('#chart-svg');
  PARALLAX_PAN = {
    dx: t.x - (+svg.attr('width'))/2,
    dy: t.y - (+svg.attr('height'))/2,
    k:  t.k,
  };
  applyParallax();
}

function applyParallax(){
  if(!mainZG) return;
  const {dx, dy, k} = PARALLAX_PAN;
  const on    = PARALLAX_ON ? 1 : 0;
  const clamp = v => Math.max(-PARALLAX_MAX, Math.min(PARALLAX_MAX, v));

  Object.entries(PARALLAX_LAYERS).forEach(([key, sel]) => {
    const f = (PARALLAX[key] || 0) * on;
    const X = clamp(dx*f) / k, Y = clamp(dy*f) / k;     // screen px → zoom-group units
    mainZG.selectAll(sel).each(function(){
      /* chartG is rotate(-90): a screen shift (X,Y) is (−Y, X) inside it */
      const inChart = this.closest('.chart-content') !== null;
      d3.select(this).attr('transform', inChart ? `translate(${-Y},${X})` : `translate(${X},${Y})`);
    });
  });

  d3.select('#chart-svg .star-field').attr('transform',
    `translate(${clamp(dx*PARALLAX.stars*on)},${clamp(dy*PARALLAX.stars*on)})`);
}


/* ═════════════════════════════════════
   D3 ZOOM + PAN
   ─────────────────────────────────────
   KEY FIX: D3 zoom always starts from its own internal identity transform.
   If the zoomable <g> has a CSS/attr translate already baked in when zoom
   is attached, the first interaction snaps back to the origin (jumpy).
   Solution: DO NOT pre-translate mainZG. Instead, pass the viewport centre
   (cx,cy) into initZoom and bake it as the zoom's initial translate, so D3
   owns the full transform from the very first interaction.
═════════════════════════════════════ */
function initZoom(svg, zg, cx, cy){
  /* Build the identity-at-centre transform so D3 zoom starts exactly
     where the chart is visually positioned (centred in the viewport). */
  const startTransform = d3.zoomIdentity.translate(cx, cy);

  d3Zoom = d3.zoom()
    .scaleExtent([.12, 10])
    /* Prevent zoom from firing when the pointer is over a UI panel. */
    .filter(e => {
      if(e.target.closest && e.target.closest('.panel')) return false;
      return true;
    })
    .on('zoom', ev => {
      zg.attr('transform', ev.transform);
      document.getElementById('zlabel').textContent =
        Math.round(ev.transform.k * 100) + '%';
      updateParallax(ev.transform);
    });

  /* Attach zoom behaviour to SVG. */
  svg.call(d3Zoom);

  /* Immediately tell D3 zoom about the starting position WITHOUT
     triggering a transition — this prevents the initial snap. */
  svg.call(d3Zoom.transform, startTransform);

  /* Cursor feedback during panning. */
  svg.on('mousedown.cur', () => svg.classed('panning', true))
     .on('mouseup.cur',   () => svg.classed('panning', false));
       applyParallax();   /* re-apply to rings recreated by redrawRing */
}

/* zoomBy: scale relative to current centre — smooth 300ms transition. */
function zoomBy(delta){
  if(d3Zoom) d3.select('#chart-svg').transition().duration(300)
    .call(d3Zoom.scaleBy, 1 + delta);
}

/* zoomReset: return to the initial centred position (not 0,0 identity). */
function zoomReset(){
  if(!d3Zoom) return;
  const svg  = d3.select('#chart-svg');
  const W    = +svg.attr('width');
  const H    = +svg.attr('height');
  const home = d3.zoomIdentity.translate(W/2, H/2); /* same as startTransform */
  svg.transition().duration(400).call(d3Zoom.transform, home);
  document.getElementById('zlabel').textContent = '100%';
}


/* ═════════════════════════════════════
   CLICK OUTSIDE → CLEAR HIGHLIGHTS
═════════════════════════════════════ */
document.getElementById('chart-svg').addEventListener('click',e=>{
  if(e.target.tagName==='svg'||e.target.tagName==='rect'){
    clearHighlights();
    if(STATE.sel){ const prev = STATE.sel; STATE.sel = null; renderViews({prev, redraw:true}); }
  }
});


/* ═════════════════════════════════════════════════════════════════════
   STATE → VIEWS
   One state (STATE), many views. Every interaction changes STATE and
   calls renderViews(); each view reads STATE and updates itself.
═════════════════════════════════════════════════════════════════════ */
const VIEW_ANIM_MS = 700;                 /* dial + bubble transition length */
const VIEW_EASE    = d3.easeCubicInOut;
const RING_SEL = {                        /* filter key → SVG group selector */
  c1:'.c1-topics', cloud:'.cloud-belt', grid:'.measure-grid',
  c2:'.c2-ring',   c3:'.c3-ring',       c4:'.c4-ring',
};

/* ── ACTIONS (the only places STATE changes) ── */
function selectParagraph(fileIdx, idx, toggle = true){
  const prev = STATE.sel;
  const same = prev && prev.fileIdx===fileIdx && prev.idx===idx;
  STATE.sel  = (same && toggle) ? null : {fileIdx, idx};
  if(!STATE.sel) clearHighlights();          /* deselecting returns the chart to idle */
  renderViews({prev, redraw:true, panels:!!STATE.sel});
}
function setRing(key, on){ STATE.rings[key] = on; viewFilters(); }

/* ── RENDER ALL VIEWS ── */
function renderViews(opt = {}){
  if(opt.redraw) viewRings(opt.prev);
  viewDial(opt.instant);
  viewBubbles(opt.instant);
  viewFilters();
  if(opt.panels) viewPanels();
  viewFocus(opt.instant);   /* ← 10.b */
  viewSelMarker();
  applyParallax();
}

/* ── shared helper: angle + word counts of the selected paragraph ── */
function selContext(sel){
  const rb = ringBoundsByFile[sel.fileIdx];
  if(!rb || !rb.paraAngles) return null;
  const span = rb.paraAngles[sel.idx], p = rb.data.paragraphs[sel.idx];
  if(!span || !p) return null;
  const counts = {};
  paraTokens(rb.data, p).forEach(w => counts[w] = (counts[w]||0) + 1);
  return { theta:(span.sa + span.ea)/2, counts };   /* theta in d3.arc convention */
}

/* ── VIEW: C2 rings (only the rings whose selection changed) ── */
function viewRings(prev){
  const ids = new Set();
  if(prev)      ids.add(prev.fileIdx);
  if(STATE.sel) ids.add(STATE.sel.fileIdx);
  ids.forEach(redrawRing);
}

/* ── VIEW: word-cloud dial ── */
function orientCloudWords(dDeg){
  /* keep every word readable on screen: chartG is rotate(-90), so the final
     screen angle is dDeg + θ − 90 + flip → flip when sin(dDeg+θ) < 0 */
  C1VIEW.cloudItems.forEach(it => {
    const thDeg = it.th*180/Math.PI;
    const flip  = Math.sin((dDeg + thDeg)*Math.PI/180) < 0 ? 180 : 0;
    it.el.attr('transform', `rotate(${thDeg + flip},${it.x},${it.y})`);
  });
}

function viewDial(instant){
  if(!C1VIEW) return;
  let target, active = null;
  if(!STATE.sel){
    target = 0;
  } else {
    const ctx = selContext(STATE.sel); if(!ctx) return;
    C1VIEW.cloudItems.forEach(it => {
      const c = ctx.counts[it.word] || 0;
      if(c && (!active || c > ctx.counts[active.word] ||
              (c === ctx.counts[active.word] && it.count > active.count))) active = it;
    });
    if(!active) return;                                  /* no cloud word in paragraph → dial stays */
    target = (ctx.theta - active.th)*180/Math.PI;        /* bring the word to the paragraph */
  }

  const from  = C1VIEW.curDeg;
  const delta = (((target - from) % 360) + 540) % 360 - 180;   /* shortest path */
  STATE.dialDeg = from + delta;

  C1VIEW.cloudItems.forEach(it => it.el.style('font-weight', it===active ? 600 : null));

  const apply = d => { C1VIEW.curDeg = d; C1VIEW.dialG.attr('transform',`rotate(${d})`); orientCloudWords(d); };
  C1VIEW.dialG.interrupt('dial');
  if(instant || Math.abs(delta) < .01){ apply(STATE.dialDeg); return; }
  C1VIEW.dialG.transition('dial').duration(VIEW_ANIM_MS).ease(VIEW_EASE)
    .tween('rotate', () => t => apply(from + delta*t));
}

/* ── VIEW: topic bubbles ── */
function solveBubbles(nodes, forceR, anchor){
  const sim = nodes.map(n => ({r:n.r, x:n.tx ?? n.bx, y:n.ty ?? n.by}));
  const a = sim[nodes.indexOf(anchor.node)];
  a.fx = anchor.x; a.fy = anchor.y;
  const s = d3.forceSimulation(sim)
    .force('collide', d3.forceCollide(d => d.r + 3).strength(.93).iterations(2))
    .force('charge',  d3.forceManyBody().strength(-14))
    .force('x', d3.forceX(0).strength(.07))
    .force('y', d3.forceY(0).strength(.07))
    .stop();
  for(let i = 0; i < 90; i++){
    s.tick();
    sim.forEach(d => {                                   /* keep bubbles inside C1 */
      const lim = forceR - d.r - 2, dist = Math.hypot(d.x, d.y);
      if(dist > lim){ d.x *= lim/dist; d.y *= lim/dist; }
    });
  }
  return sim.map(d => ({x:d.x, y:d.y}));
}

/* ── VIEW: topic Voronoi ── the pertinent topic's site is pinned at the disc
   edge facing the selected paragraph; the cells are recomputed every frame. */
function viewBubbles(instant){
  if(!C1VIEW || !C1VIEW.nodes.length) return;
  const {nodes, forceR} = C1VIEW;
  let best = null, targets;

  if(STATE.sel){
    const ctx = selContext(STATE.sel); if(!ctx) return;
    let bs = 0;
    nodes.forEach(n => {
      const sc = (n.keys||[]).reduce((s,k) => s + (ctx.counts[k]||0), 0);
      if(sc > bs){ bs = sc; best = n; }
    });
    if(!best) return;                                   /* no topic in paragraph → cells stay */
    const rho = forceR - best.r - 4;
    targets = solveBubbles(nodes, forceR,
      {node:best, x:Math.sin(ctx.theta)*rho, y:-Math.cos(ctx.theta)*rho});
  } else {
    targets = nodes.map(n => ({x:n.bx, y:n.by}));       /* rest layout */
  }

  nodes.forEach((n,i) => { n.sx = n.cx; n.sy = n.cy; n.tx = targets[i].x; n.ty = targets[i].y; });

  C1VIEW.cells.select('.cell-shape')
    .attr('fill', d => d === best ? C1VIEW.cellActiveFill : C1VIEW.cellFill);

  C1VIEW.cellsG.interrupt('move');
  if(instant){
    nodes.forEach(n => { n.cx = n.tx; n.cy = n.ty; });
    drawC1Cells();
    return;
  }
  C1VIEW.cellsG.transition('move').duration(VIEW_ANIM_MS).ease(VIEW_EASE)
    .tween('cells', () => t => {
      nodes.forEach(n => { n.cx = n.sx + (n.tx - n.sx)*t; n.cy = n.sy + (n.ty - n.sy)*t; });
      drawC1Cells();
    });
}



/* ── VIEW: ring filters ── */
function viewFilters(){
  if(mainZG){
    Object.entries(RING_SEL).forEach(([k, sel]) =>
      mainZG.selectAll(sel).style('display', STATE.rings[k] ? null : 'none'));
  }
  Object.keys(RING_SEL).forEach(k => {
    const cb = document.getElementById('rf-'+k); if(cb) cb.checked = STATE.rings[k];
  });
}

/* ── VIEW: chart focus ── the chart rests at IDLE_OPACITY and
   goes to full opacity while anything is selected or highlighted. */
const IDLE_OPACITY = 0.5;
const FOCUS_MS     = 300;
function viewFocus(instant){
  if(!mainZG) return;
  const target = (STATE.sel || STATE.hl) ? 1 : IDLE_OPACITY;
  mainZG.interrupt('focus');
  if(instant) mainZG.style('opacity', target);
  else        mainZG.transition('focus').duration(FOCUS_MS).style('opacity', target);
}


/* ── VIEW: red dot ── always marks the paragraph that is selected / open in the context reader.
   Lives in its own group inside chartG, so ring redraws never erase it. */
function selectedSpan(){
  if(!CORPUS) return null;
  if(STATE.sel){
    const rb = ringBoundsByFile[STATE.sel.fileIdx];
    const s = rb && rb.paraAngles && rb.paraAngles[STATE.sel.idx];
    return s ? {rb, s} : null;
  }
  if(ctxParaIdx === null || ctxParaIdx === undefined) return null;
  const multi = CORPUS.perFile && CORPUS.perFile.length > 1;
  if(multi && ctxFileIdx !== null && ctxFileIdx !== undefined){
    const rb = ringBoundsByFile[ctxFileIdx];
    const s = rb && rb.paraAngles && rb.paraAngles[ctxParaIdx];
    return s ? {rb, s} : null;
  }
  const s = mergedParaSpan(ctxParaIdx);
  if(!s) return null;
  const f = multi ? ringBoundsByFile.findIndex(r => r && r.paraAngles && Object.values(r.paraAngles).includes(s)) : 0;
  const rb = ringBoundsByFile[f < 0 ? 0 : f];
  return rb ? {rb, s} : null;
}

function viewSelMarker(){
  if(!chartGRef) return;
  chartGRef.select('.sel-marker').remove();
  const hit = selectedSpan(); if(!hit) return;
  const {rb, s} = hit;
  const a = (s.sa + s.ea)/2, r = rb.ro + 7;
  const x = Math.sin(a)*r, y = -Math.cos(a)*r;
  const mk = chartGRef.append('g').attr('class','sel-marker').attr('transform',`translate(${x},${y})`);
  mk.append('circle').attr('class','sm-pulse').attr('r',4.5).attr('fill','#ff2d2d');
  mk.append('circle').attr('r',4.5).attr('fill','#ff2d2d').attr('stroke','#fff').attr('stroke-width',1);
}

/* ── VIEW: panels ── */
function viewPanels(){
  if(!STATE.sel) return;
  showCtxPanel(STATE.sel.idx, null, STATE.sel.fileIdx);
  showParaWordDetail(STATE.sel.idx, STATE.sel.fileIdx);
}






/* ═════════════════════════════════════
   CHART RENDER
═════════════════════════════════════ */
function renderChart(data){
  const W=window.innerWidth, H=window.innerHeight;
  const svg=d3.select('#chart-svg').attr('width',W).attr('height',H);
  svg.selectAll('*').remove();

  // Transparent click catcher
  svg.append('rect').attr('width',W).attr('height',H).attr('fill','transparent');

  // defs
  const defs=svg.append('defs');
  const gf=defs.append('filter').attr('id','glow').attr('x','-50%').attr('y','-50%').attr('width','200%').attr('height','200%');
  gf.append('feGaussianBlur').attr('stdDeviation','2.5').attr('result','blur');
  const fm=gf.append('feMerge');
  fm.append('feMergeNode').attr('in','blur');fm.append('feMergeNode').attr('in','SourceGraphic');

  // Star field (outside zoom group)
    const starG=svg.append('g').attr('class','star-field').style('pointer-events','none');
  d3.range(90).forEach(()=>starG.append('circle')
    .attr('cx',Math.random()*W).attr('cy',Math.random()*H)
    .attr('r',Math.random()*.65+.2).attr('fill','white').attr('opacity',Math.random()*.22+.04));

    /* mainZG is the zoomable group. The inner chartG is rotated 90° so
     rings align vertically (parallel to Y axis, top = 12 o'clock).
     D3 zoom transforms mainZG; chartG's rotation is fixed inside it.  */
  mainZG = svg.append('g');
  const chartG = mainZG.append('g').attr('class','chart-content').attr('transform','rotate(-90)');


  /* ── RING RADII ─────────────────────────────────────────────────────
     All radii are fractions of `base` so the chart scales with the window.

     base  : master scale — fraction of the shorter viewport dimension.
              Raise (e.g. .48) to fill more of the screen.
              Lower (e.g. .36) to shrink everything.

     R1    : radius of the C1 force-bubble zone (solid disc, clipped).
              Make larger to give topic bubbles more breathing room.

     R2i/o : inner and outer edges of the C2 paragraph donut.
              Gap (R2o-R2i) controls the donut's radial thickness.

     R3i/o : inner and outer edges of the C3 word-dot ring.
              Keep R3i slightly > R2o (≥ 4px gap) to avoid overlap.

     R4i/o : inner and outer edges of the C4 citations ring.
              Keep R4i slightly > R3o (≥ 4px gap).

     RCi/o : word-cloud belt between C1 and C2.
              RCi starts just outside C1 (R1+gap).
              RCo ends just inside C2 (R2i-gap).
  /* ── MASTER SCALE ───────────────────────────────────────────────────
     base: fraction of the shorter viewport side.
     Raise to fill more screen; lower to shrink everything.           */
  const base = Math.min(W,H) * 1.1;

  /* ── C1: topic force bubble zone ───────────────────────────────── */
  const R1  = base * .19;   /* C1 disc — smaller leaves a wider belt for the word dial */

  /* ── C2: paragraph donut band ───────────────────────────────────────
     The full C2 band spans R2i → R2BAND_OUT.
     With multiple files this band is subdivided (see below).
     ringH  : fixed radial thickness of ONE file's ring.
     gap    : clear space between consecutive rings.
     The outermost ring's outer edge = R2BAND_OUT regardless of count.  */
  const R2i        = base * .35;   /* inner edge of innermost ring      */
  const ringH      = base * .03;  /* radial height — same for all rings */
  const ringGap    = base * .012;  /* gap between consecutive rings      */
  const nFiles     = (data.perFile && data.perFile.length > 1)
                     ? data.perFile.length : 1;
  /* Outer edge of the whole C2 band — grows with file count */
  const R2BAND_OUT = R2i + nFiles * ringH + (nFiles - 1) * ringGap;

  /* ── C3: word-dot ring — starts just outside C2 band ────────────── */
  const R3i = R2BAND_OUT + base * .02;   /* ≥ 4px clear gap from C2     */
  const R3o = R3i        + base * .095;

  /* ── C4: citations ring — starts just outside C3 ────────────────── */
  const R4i = R3o + base * .015;
  const R4o = R4i + base * .08;

  /* ── Word-cloud belt — between C1 outer edge and C2 inner edge ──── */
  const RCi = R1  + base * .01;
  const RCo = R2i - base * .07;

  /* ── RENDER RINGS ────────────────────────────────────────────────── */
  
  renderC4(chartG, data, R4i, R4o, R2BAND_OUT);
  chartGRef = chartG;
  ringBoundsByFile = [];

  if(data.perFile && data.perFile.length > 1){
    /* rings sized by RAW word count — same unit as the grid labels */
    const maxW = Math.max(...data.perFile.map(f => rawWords(f.data))) || 1;
    const sorted = data.perFile
      .map((pf, origIdx) => ({...pf, origIdx}))
      .sort((a,b) => rawWords(b.data) - rawWords(a.data));
    sorted.forEach((pf, i) => {
      const ro = R2BAND_OUT - i * (ringH + ringGap);
      const ri = ro - ringH;
      const fullAngle = Math.PI * 2 * (rawWords(pf.data) / maxW);
      ringBoundsByFile[pf.origIdx] = {fileIdx:pf.origIdx, ri, ro, fullAngle, fileName:pf.name, data:pf.data};
      renderC2(chartG, pf.data, ri, ro, fullAngle, pf.origIdx, pf.name);
    });
    renderRingLabels(ringGap);
  } else {
    ringBoundsByFile[0] = {fileIdx:0, ri:R2i, ro:R2BAND_OUT, fullAngle:Math.PI*2, fileName:FILES[0]?.name||'', data};
    renderC2(chartG, data, R2i, R2BAND_OUT, Math.PI * 2, 0, FILES[0]?.name || '');
  }
  renderMeasureGrid(chartG, R2i);   /* after C2 so it can read the drawn paragraph angles */
  renderC3(chartG, data, R3i, R3o); /* after C2 — dots follow the drawn paragraph arcs */
  renderC1(chartG, data, R1, RCi, RCo);

  /* Outer decorative dashed circles */
  [R4o + base*.018, R4o + base*.038].forEach((r,i) =>
    chartG.append('circle').attr('r',r).attr('fill','none')
      .attr('stroke',`rgba(255,255,255,${.025 - i*.01})`)
      .attr('stroke-width',.5).attr('stroke-dasharray','3 10'));

  /* Pass viewport centre so zoom starts the chart visually centred */
  initZoom(svg, mainZG, W/2, H/2);
  renderViews({instant:true});   /* re-apply STATE (dial, bubbles, filters) after any re-render */

}


/* ═════════════════════════════════════════════════════════════════════
   C1 — TOPIC VORONOI + WORD-CLOUD DIAL
   Topics are Voronoi cells (one site per topic) clipped to the C1 disc.
   Sites are spaced by a collide force sized by topic score, so stronger
   topics get larger cells. Cells move only through viewBubbles().
═════════════════════════════════════════════════════════════════════ */
function renderC1(g, data, forceR, cloudRi, cloudRo){

  /* ═══ 1 · TOPIC VORONOI ═══════════════════════════════════════════ */
  const MAX_TOPICS       = 9;
  const CELL_FILL        = 'rgba(200,169,110,.10)';   /* every cell — same colour            */
  const CELL_ACTIVE_FILL = 'rgba(200,169,110,.30)';   /* cell pertinent to selected paragraph */
  const CELL_STROKE      = 'rgba(200,169,110,.55)';
  const CELL_STROKE_W    = 0.6;
  const DISC_FILL        = 'rgba(8,8,14,.78)';
  const LABEL_COLOR      = 'rgba(234,232,226,.85)';
  const LABEL_MIN_PX     = 6.5;
  const LABEL_MAX_PX     = 10;
  const SHOW_EMOJI       = true;
  const SHOW_SCORE       = true;

  /* ═══ 2 · WORD-CLOUD DIAL ═════════════════════════════════════════ */

  const TAU = Math.PI*2;

  /* ── topic sites ── */
  const maxF   = d3.max(data.topics, d => d.freq) || 1;
  const rScale = d3.scaleSqrt().domain([0,maxF]).range([9, forceR*.33]);
  const nodes  = data.topics.slice(0, MAX_TOPICS).map((d,i) => ({...d, r:rScale(d.freq),
    x:Math.cos(i*2.4)*forceR*.2, y:Math.sin(i*2.4)*forceR*.2}));

  const clipId = 'c1c'+Math.round(Math.random()*1e6);
  g.append('defs').append('clipPath').attr('id',clipId).append('circle').attr('r',forceR);
  const c1 = g.append('g').attr('class','c1-topics').attr('clip-path',`url(#${clipId})`);
  c1.append('circle').attr('r',forceR).attr('fill',DISC_FILL);

  if(nodes.length){
    const sim = d3.forceSimulation(nodes)
      .force('center',  d3.forceCenter(0,0))
      .force('collide', d3.forceCollide(d => d.r+3).strength(.93))
      .force('charge',  d3.forceManyBody().strength(-14))
      .force('x', d3.forceX(0).strength(.07)).force('y', d3.forceY(0).strength(.07))
      .stop();
    for(let i=0;i<120;i++) sim.tick();
    nodes.forEach(d => {
      const lim = forceR*.85, m = Math.hypot(d.x, d.y);
      if(m > lim){ d.x *= lim/m; d.y *= lim/m; }
      d.bx = d.tx = d.cx = d.x;          /* rest · target · current */
      d.by = d.ty = d.cy = d.y;
    });
  }

  /* ── cells ── */
  const cellsG = c1.append('g').attr('class','c1-cells');
  const cells  = cellsG.selectAll('.topic-bubble').data(nodes).enter().append('g')
    .attr('class','topic-bubble').style('cursor','pointer');   /* class kept for the highlight system */

  cells.append('path').attr('class','cell-shape')
    .attr('fill', CELL_FILL)
    .attr('stroke', CELL_STROKE).attr('stroke-width', CELL_STROKE_W)
    .attr('stroke-linejoin','round');

  const lfs    = d => Math.max(LABEL_MIN_PX, Math.min(LABEL_MAX_PX, d.r*.3));
  const labels = cells.append('g').attr('class','cell-label').style('pointer-events','none');
  if(SHOW_EMOJI) labels.append('text').text(d => d.emoji)
    .attr('text-anchor','middle').attr('dominant-baseline','central').attr('y', d => -lfs(d)*1.35)
    .style('font-size', d => lfs(d)*1.3+'px').style('fill', LABEL_COLOR).style('opacity', .6);
  labels.append('text').attr('class','topic-label').text(d => d.llmName||d.name)
    .attr('text-anchor','middle').attr('dominant-baseline','central')
    .style('font-family','DM Mono,monospace').style('font-size', d => lfs(d)+'px')
    .style('letter-spacing','.04em').style('fill', LABEL_COLOR);
  if(SHOW_SCORE) labels.append('text').text(d => d.freq)
    .attr('text-anchor','middle').attr('dominant-baseline','central').attr('y', d => lfs(d)*1.3)
    .style('font-family','DM Mono,monospace').style('font-size','7px')
    .style('fill', LABEL_COLOR).style('opacity', .4);

  cells
    .on('mousemove',(e,d)=>tip(`<div class="tt-lbl">${d.unit==='mentions'?'character':'topic cluster'}</div>
      <div class="tt-val">${d.emoji} ${escHtml(d.llmName||d.name)}</div>
      ${d.desc?`<div class="tt-sub" style="font-style:italic;color:var(--t1)">${escHtml(d.desc)}</div>`:''}
      <div class="tt-sub">${d.unit||'score'}: ${d.freq} · click to highlight C3</div>
      ${d.aliases&&d.aliases.length>1?`<div class="tt-sub">also: ${d.aliases.slice(0,5).map(escHtml).join(', ')}</div>`:''}
      <div class="tt-tags">${d.related.map(w=>`<span class="tt-tag">${escHtml(w)}</span>`).join('')}</div>`,e))
    .on('mouseleave',hideTip)
    .on('click',(e,d)=>{e.stopPropagation();applyTopicHighlight(d.name)});

  c1.append('circle').attr('r',forceR).attr('fill','none')
    .attr('stroke', CELL_STROKE).attr('stroke-width', CELL_STROKE_W);

   const {dialG, items} = renderCloudDial(g, data, cloudRi, cloudRo);

  C1VIEW = {nodes, cells, cellsG, forceR, dialG, cloudItems:items, curDeg:STATE.dialDeg,
            cellFill:CELL_FILL, cellActiveFill:CELL_ACTIVE_FILL};
  drawC1Cells();
  orientCloudWords(STATE.dialDeg);
}

/* Recompute the Voronoi from the sites' current positions (cx, cy) and
   place each label at its cell's centroid (cell clamped to the disc). */
function drawC1Cells(){
  if(!C1VIEW || !C1VIEW.nodes.length) return;
  const {nodes, forceR, cells} = C1VIEW;
  const vor = d3.Delaunay.from(nodes, d => d.cx, d => d.cy)
    .voronoi([-forceR, -forceR, forceR, forceR]);
  const lim = forceR*.94;

  cells.each(function(d, i){
    const sel = d3.select(this);
    sel.select('.cell-shape').attr('d', vor.renderCell(i) || '');
    let lx = d.cx, ly = d.cy;
    const poly = vor.cellPolygon(i);
    if(poly){
      const clamped = poly.map(([x,y]) => { const m = Math.hypot(x,y); return m > lim ? [x*lim/m, y*lim/m] : [x,y]; });
      [lx, ly] = d3.polygonCentroid(clamped);
    }
    sel.select('.cell-label').attr('transform', `translate(${lx},${ly})`);
  });
}


/* ═════════════════════════════════════════════════════════════════════
   WORD-CLOUD DIAL — collision-free tangential layout
   Each word is a polar box (radial height × angular width, including the
   outward bulge of straight text on a curve). Required words (paragraph
   cover) are placed first; if they don't all fit, the whole scale shrinks
   step by step. Optional words that still don't fit are left out.
═════════════════════════════════════════════════════════════════════ */
const CLOUD_MEASURE = document.createElement('canvas').getContext('2d');

function renderCloudDial(g, data, ri, ro){

  /* ── PARAMETERS ── */
  const CLOUD_COLOR  = '#ceb27e';  /* every word — same colour                         */
  const SIZE_MODE    = 'linear';   /* 'linear': rarest → FS_MIN, most frequent → FS_MAX
                                      'strict': size = FS_MAX × count/max (floor FS_MIN)  */
  const FS_MIN       = 9;          /* px                                                */
  const FS_MAX       = 24;         /* px                                                */
  const INNER_INSET  = 4;          /* px clear of the C1 disc                           */
  const OUTER_PAD    = 2;          /* px clear of the measure grid                      */
  const PAD_PX       = 6;          /* min gap between neighbouring words along the arc  */
  const LINE_H       = 1.05;       /* radial height of a word = font-size × this        */
  const ANGLE_STEPS  = 48;        /* candidate angles tried per word                   */
  const RADIAL_STEPS = 4;          /* candidate radii tried per angle                   */
  const SHRINK       = 0.9;        /* scale step when required words don't fit          */
  const MIN_SCALE    = 0.55;       /* never shrink below this                           */
  /* fill-opacity .68 — clearHighlights() restores that value */
  /* ─────────────────────────────────────────────────────── */

  const TAU = Math.PI*2, GOLDEN = Math.PI*(3 - Math.sqrt(5));
  const bri = ri + INNER_INSET;
  const bro = Math.min(ro, GRID_INNER_R ?? ro) - OUTER_PAD;
  const words = data.cloudWords || [];

  const maxC = d3.max(words, w => w.count) || 1;
  const minC = d3.min(words, w => w.count) || 1;
  const lin  = d3.scaleLinear().domain([minC === maxC ? 0 : minC, maxC]).range([FS_MIN, FS_MAX]);
  const baseFs = c => SIZE_MODE === 'strict' ? Math.max(FS_MIN, FS_MAX*c/maxC) : lin(c);

  const widthCache = new Map();
  const textW = (w, fs) => {
    const key = w + '|' + fs.toFixed(2);
    const cached = widthCache.get(key);
    if(cached !== undefined) return cached;
    CLOUD_MEASURE.font = `italic ${fs}px Fraunces, Georgia, serif`;
    const width = CLOUD_MEASURE.measureText(w).width;
    widthCache.set(key, width);
    return width;
  };
  const hit = (a, b) => {
    if(a.r1 <= b.r0 || b.r1 <= a.r0) return false;
    let d = Math.abs(a.th - b.th) % TAU; if(d > Math.PI) d = TAU - d;
    return d < a.half + b.half;
  };

  function place(scale){
    const boxes = [], out = [];
    const order = [...words].sort((a,b) => (b.req === true) - (a.req === true) || b.count - a.count);
    order.forEach((wd, i) => {
      const fs = baseFs(wd.count) * scale;
      const h  = fs * LINE_H;
      const w  = textW(wd.word, fs)*1.08 + PAD_PX;     /* +8 % leaves room for the bold active word */
      if(h > bro - bri) return;
      const pref = (i*GOLDEN) % TAU;                    /* spread words evenly round the dial */
      for(let ai = 0; ai < ANGLE_STEPS; ai++){
        const off = (ai % 2 ? 1 : -1) * Math.ceil(ai/2) * TAU/ANGLE_STEPS;
        const th  = ((pref + off) % TAU + TAU) % TAU;
        for(let k = 0; k < RADIAL_STEPS; k++){
          const r     = bri + h/2 + (bro - bri - h)*(k/((RADIAL_STEPS - 1) || 1));
          const bulge = w*w/(8*r);                      /* straight text on a curve pokes outward */
          if(r + h/2 + bulge > bro) continue;
          const box = {r0:r - h/2, r1:r + h/2 + bulge, th, half:Math.atan((w/2)/(r - h/2))};
          if(boxes.every(b => !hit(b, box))){
            boxes.push(box);
            out.push({...wd, fs, th, r});
            return;
          }
        }
      }
    });
    return out;
  }

  const reqCount = words.filter(w => w.req).length;
  let scale = 1, placed = place(scale);
  while(placed.filter(p => p.req).length < reqCount && scale*SHRINK >= MIN_SCALE){
    scale *= SHRINK;
    placed = place(scale);
  }
  const dropped = words.length - placed.length;
  if(dropped) console.info(`word dial: ${dropped} word(s) left out for lack of room (scale ${scale.toFixed(2)})`);

  const cloudBelt = g.append('g').attr('class','cloud-belt');
  const dialG = cloudBelt.append('g').attr('class','cloud-dial').attr('transform',`rotate(${STATE.dialDeg})`);
  const items = [];

  placed.forEach(p => {
    const x = Math.sin(p.th)*p.r, y = -Math.cos(p.th)*p.r;
    const el = dialG.append('text')
      .attr('class','cloud-word')
      .attr('data-word', p.word)
      .attr('data-base-fs', p.fs.toFixed(1))
      .attr('x',x).attr('y',y)
      .attr('text-anchor','middle').attr('dominant-baseline','central')
      .style('font-family','Fraunces,serif').style('font-style','italic')
      .style('font-size', p.fs+'px')
      .style('fill', CLOUD_COLOR)
      .style('fill-opacity', .68).style('cursor','pointer').style('user-select','none')
      .text(p.word)
      .on('mousemove',e=>tip(`<div class="tt-lbl">word cloud</div>
        <div class="tt-val">${p.word}</div><div class="tt-sub">×${p.count}</div>`,e))
      .on('mouseleave',hideTip)
      .on('click',e=>{e.stopPropagation();if(CORPUS)showWordPanel(p.word,CORPUS)});
    items.push({word:p.word, count:p.count, th:p.th, x, y, el});
  });

  return {dialG, items};
}


/* ═════════════════════════════════════════════════════════════════════
   MEASURE GRID — word-count scale nested inside the C2 band
   Reads the paragraph angles renderC2 actually drew (ringBoundsByFile[].paraAngles),
   so ticks are exact by construction — no duplicated layout constants.
   Must be called AFTER the C2 rings are rendered.
═════════════════════════════════════════════════════════════════════ */
function renderMeasureGrid(g, rParaIn){

  /* ═══ 1 · REFERENCE ═════════════════════════════════════════════ */
  const REFERENCE          = 'largest';  // compare mode: 'largest' = biggest text (outer ring) · 'adjacent' = innermost ring

  /* ═══ 2 · RING ══════════════════════════════════════════════════ */
  const SHOW_RING          = true;
  const RING_RADIUS_FACTOR = 0.926;      // ring radius = rParaIn × this
  const RING_SPAN          = 'measured'; // 'measured' = ends with the last paragraph · 'full' = whole circle
  const RING_COLOR         = '#ffffff';
  const RING_WIDTH         = 0.5;
  const RING_OPACITY       = 1;

  /* ═══ 3 · TICKS ═════════════════════════════════════════════════ */
  const SHOW_TICKS         = true;
  const TICK_DIRECTION     = 'in';       // 'in' · 'out' · 'center'
  const TICK_MAJOR_LEN     = 8;          // px
  const TICK_MID_LEN       = 5;          // px (0 = hide)
  const TICK_MINOR_LEN     = 2.5;        // px (0 = hide)
  const MINOR_PER_MAJOR    = 10;
  const TICK_COLOR         = '#ffffff';
  const TICK_WIDTH_MAJOR   = 0.5;
  const TICK_WIDTH_MINOR   = 0.35;
  const TARGET_TICK_COUNT  = 12;
  const SHOW_END_TICK      = true;       // major tick at the exact last word of the reference text

  /* ═══ 4 · LABELS ════════════════════════════════════════════════ */
  const SHOW_LABELS        = true;
  const SHOW_ZERO_LABEL    = false;
  const LABEL_SIDE         = 'in';       // 'in' · 'out'
  const LABEL_GAP          = 4;          // px between tick tip and label edge (approx.)
  const LABEL_COLOR        = 'rgba(255,255,255,.4)';
  const LABEL_SIZE_PX      = 6.5;
  /* ─────────────────────────────────────────────────────────────── */

  const pt = (a, r) => [Math.sin(a)*r, -Math.cos(a)*r];   // d3.arc convention (same as C2)

  /* ── reference ring: the one actually drawn for the chosen text ── */
  const rings = ringBoundsByFile.filter(rb => rb && rb.paraAngles);
  if(!rings.length) return;
  const ref = REFERENCE === 'largest'
    ? rings.reduce((a,b) => (b.fullAngle > a.fullAngle ||
                            (b.fullAngle === a.fullAngle && b.ro > a.ro)) ? b : a)
    : rings.reduce((a,b) => b.ri < a.ri ? b : a);

  /* ── word → angle spans, straight from the drawn paragraph arcs ── */
  const spans = [];
  let cum = 0;
  ref.data.paragraphs.forEach((p, i) => {
    const s = ref.paraAngles[i];
    if(s) spans.push({w0:cum, w1:cum + p.wordCount, a0:s.sa, a1:s.ea});
    cum += p.wordCount;
  });
  if(!spans.length || !cum) return;
  const totalWords = cum;
  const startAngle = spans[0].a0;
  const endAngle   = spans[spans.length-1].a1;

  const wordToAngle = v => {
    for(const s of spans)
      if(v <= s.w1) return s.a0 + (v - s.w0)/((s.w1 - s.w0) || 1)*(s.a1 - s.a0);
    return endAngle;
  };

  /* ── geometry ── */
  const R   = rParaIn * RING_RADIUS_FACTOR;
  const ext = len => TICK_DIRECTION==='in'  ? [R-len, R]
                   : TICK_DIRECTION==='out' ? [R, R+len]
                   :                          [R-len/2, R+len/2];
    /* publish the grid's inner edge so the cloud dial never overlaps ticks or labels */
  const [gLo] = ext(TICK_MAJOR_LEN);
  GRID_INNER_R = (SHOW_LABELS && LABEL_SIDE === 'in')
    ? Math.min(gLo, R) - LABEL_GAP - LABEL_SIZE_PX - 12
    : Math.min(gLo, R) - 2;

  const grid = g.append('g').attr('class','measure-grid').style('pointer-events','none');

  /* ── RING ── */
  if(SHOW_RING){
    const ring = RING_SPAN === 'full'
      ? grid.append('circle').attr('r', R)
      : grid.append('path').attr('d', (() => {
          const p = d3.path();                       // d3.path: 0 = 3 o'clock → shift −π/2
          p.arc(0, 0, R, startAngle - Math.PI/2, endAngle - Math.PI/2);
          return p.toString();
        })());
    ring.attr('fill','none')
      .attr('stroke', RING_COLOR)
      .attr('stroke-width', RING_WIDTH)
      .attr('stroke-opacity', RING_OPACITY);
  }

  /* ── tick list ── */
  const niceStep = raw => {
    const e = Math.floor(Math.log10(raw)), b = raw/Math.pow(10,e);
    return (b<1.5 ? 1 : b<3 ? 2 : b<7 ? 5 : 10) * Math.pow(10,e);
  };
  const step     = Math.max(1, niceStep(totalWords/TARGET_TICK_COUNT));
  const useMinor = MINOR_PER_MAJOR > 1 && step/MINOR_PER_MAJOR >= 1
                && (TICK_MINOR_LEN > 0 || TICK_MID_LEN > 0);
  const sub  = useMinor ? MINOR_PER_MAJOR : 1;
  const half = sub % 2 === 0 ? sub/2 : 0;

  const ticks = [];
  for(let i = 0; i*step/sub <= totalWords + 1e-9; i++){
    ticks.push({
      v: Math.round(i*step/sub*1e6)/1e6,
      level: i % sub === 0 ? 'major' : (half && i % half === 0) ? 'mid' : 'minor'
    });
  }
  if(SHOW_END_TICK && ticks[ticks.length-1].v !== totalWords){
    const lastMajor = [...ticks].reverse().find(t => t.level==='major');
    if(lastMajor && totalWords - lastMajor.v < step*.4) lastMajor.noLabel = true;
    ticks.push({v: totalWords, level: 'major'});
  }

  /* ── TICKS ── */
  const lenOf = l => l==='major' ? TICK_MAJOR_LEN : l==='mid' ? TICK_MID_LEN : TICK_MINOR_LEN;
  if(SHOW_TICKS){
    ticks.forEach(t => {
      const len = lenOf(t.level); if(len <= 0) return;
      const a = wordToAngle(t.v);
      const [r0, r1] = ext(len);
      const [x0, y0] = pt(a, r0), [x1, y1] = pt(a, r1);
      grid.append('line')
        .attr('x1',x0).attr('y1',y0).attr('x2',x1).attr('y2',y1)
        .attr('stroke', TICK_COLOR)
        .attr('stroke-width', t.level==='major' ? TICK_WIDTH_MAJOR : TICK_WIDTH_MINOR);
    });
  }

  /* ── LABELS ── */
  if(SHOW_LABELS){
    const [rLo, rHi] = ext(TICK_MAJOR_LEN);
    const rLabel = LABEL_SIDE === 'in'
      ? Math.min(rLo, R) - LABEL_GAP - LABEL_SIZE_PX/2
      : Math.max(rHi, R) + LABEL_GAP + LABEL_SIZE_PX/2;

    ticks
      .filter(t => t.level==='major' && !t.noLabel && (t.v > 0 || SHOW_ZERO_LABEL))
      .forEach(t => {
        const [x, y] = pt(wordToAngle(t.v), rLabel);
        grid.append('text')
          .attr('x', x).attr('y', y)
          .attr('text-anchor','middle').attr('dominant-baseline','central')
          .style('transform-box','fill-box')
          .style('transform-origin','center')
          .style('transform','rotate(90deg)')
          .style('font-family','DM Mono,monospace')
          .style('font-size', LABEL_SIZE_PX+'px')
          .style('fill', LABEL_COLOR)
          .text(fmtNum(Math.round(t.v)));
      });
  }
}


/* ═════════════════════════════════════════════════════════════════════
   C2 — PARAGRAPH DONUT
   VISUAL PARAMETERS (adjust here):
     WORD_THRESHOLD : word count below which word-mode activates (per-word arcs)
     END_GAP_DEG    : degrees of empty space kept between ring end and start
                      even when the file fills the full 360°. Default 8°.
                      Increase for a more obvious gap; set to 0 to disable.
     START_LINE_LEN : radial length of the white marker line at 12 o'clock
                      (before the chart is rotated). In SVG user units (px at scale 1).
     LABEL_OFFSET   : distance from the ring outer edge to the title text baseline.
═════════════════════════════════════════════════════════════════════ */
/* ═════════════════════════════════════════════════════════════════════
   C2 — PARAGRAPH RING
   Angle = paragraph position/length · radial height = sentence metric.
═════════════════════════════════════════════════════════════════════ */
function renderC2(g, data, rIn, rOut, fullAngle, fileIdx, fileName){

  /* ── PARAMETERS ─────────────────────────────────────────────── */
  const WORD_THRESHOLD = 1200;   /* per-word arcs below this word count               */
  const END_GAP_DEG    = 8;      /* empty gap kept at the end of the ring             */
  const START_LINE_LEN = 14;     /* px length of the white start marker               */
  const HEIGHT_METRIC  = 'asl';  /* radial height: 'asl' avg sentence length ·
                                    'sentences' sentence count · 'words' · 'off'      */
  const HEIGHT_MIN     = 0.3;    /* smallest paragraph height, fraction of the band   */
  const HOVER_GROW     = 4;      /* px outward on hover                               */
  const SEL_GROW       = 3;      /* px outward for the selected paragraph             */
  const SEL_FILL       = 'rgba(126,196,138,.6)';
  const SEL_STROKE     = 'var(--gold2)';
  /* ──────────────────────────────────────────────────────────── */

  const TAU         = Math.PI*2;
  const usableAngle = Math.max(.01, fullAngle - END_GAP_DEG/360*TAU);
  const paras       = data.paragraphs;
  const total       = (data.meta ? data.meta.totalWords : paras.reduce((s,p)=>s+p.wordCount,0)) || 1;
  const wordMode    = total < WORD_THRESHOLD;
  const safeIdx     = parseInt(fileIdx,10) || 0;
  const multiFile   = CORPUS.perFile && CORPUS.perFile.length > 1;

  /* ── colours ── */
  const fc = fileRGB(safeIdx);
  const paraFill   = p => p.isTitle   ? 'rgba(200,169,110,.52)'
                        : p.isSection ? 'rgba(200,169,110,.26)'
                        :               `rgba(${fc},.22)`;
  const paraStroke = p => p.isTitle   ? 'rgba(200,169,110,.75)'
                        : p.isSection ? 'rgba(200,169,110,.40)'
                        :               `rgba(${fc},.32)`;

  /* ── radial height per paragraph ── */
  const hMax = HEIGHT_METRIC === 'off' ? 1 : globalMaxMetric(HEIGHT_METRIC);
  const rOutOf = {};
  paras.forEach(p => {
    const f = HEIGHT_METRIC === 'off' ? 1
      : HEIGHT_MIN + (1 - HEIGHT_MIN)*Math.min(1, paraMetric(p, HEIGHT_METRIC)/hMax);
    rOutOf[p.idx] = rIn + (rOut - rIn)*f;
  });

  /* ── segments ── */
  const segs = [];
  if(wordMode){
    const ww = 1/total, bodyGap = ww*1.5, secGap = ww*4, titleGap = ww*6;
    paras.forEach(p => {
      for(let wi = 0; wi < p.wordCount; wi++)
        segs.push({type:'para', word:wi, idx:p.idx, raw:p.raw, wordCount:p.wordCount,
                   isTitle:p.isTitle, isSection:p.isSection, weight:ww});
      segs.push({type:'space', idx:p.idx, weight:p.isTitle?titleGap : p.isSection?secGap : bodyGap});
    });
  } else {
    paras.forEach(p => {
      segs.push({type:'para', ...p, weight:Math.max(p.wordCount/total, .004)});
      segs.push({type:'space', idx:p.idx, weight:p.isTitle?.022 : p.isSection?.015 : .006});
    });
  }

  /* ── angles (d3.arc convention; ring starts at the top of the screen) ── */
  const tW = segs.reduce((s,d) => s + d.weight, 0);
  const startA = Math.PI/2;
  let angle = startA;
  segs.forEach(d => { d.sa = angle; d.ea = angle + (d.weight/tW)*usableAngle; angle = d.ea; });

  /* record each paragraph's angular span (dial, Voronoi, grid read this) */
  const paraAngles = {};
  segs.forEach(d => {
    if(d.type !== 'para') return;
    const s = paraAngles[d.idx];
    if(s) s.ea = d.ea; else paraAngles[d.idx] = {sa:d.sa, ea:d.ea};
  });
  if(ringBoundsByFile[safeIdx]) ringBoundsByFile[safeIdx].paraAngles = paraAngles;

  /* ── arcs ── */
  const cr     = wordMode ? 0 : 1.5;
  const arcGen = d3.arc().innerRadius(o => o.ri).outerRadius(o => o.ro).cornerRadius(cr);
  const arcFor = (d, grow = 0, inGrow = 0) =>
    arcGen({startAngle:d.sa, endAngle:d.ea, ri:rIn - inGrow, ro:rOutOf[d.idx] + grow});

  const c2 = g.append('g').attr('class','c2-ring c2-ring-f'+safeIdx);

  /* white track: from the start marker to the end of the last paragraph */
  const lastEnd = d3.max(Object.values(paraAngles), s => s.ea) ?? (startA + usableAngle);
  c2.append('path')
    .attr('d', d3.arc().innerRadius(rIn).outerRadius(rOut)({startAngle:startA, endAngle:lastEnd}))
    .attr('fill','rgba(255,255,255,.018)')
    .attr('stroke','rgba(255,255,255,.3)').attr('stroke-width',.5);

  const strokeW    = wordMode ? (multiFile ? .15 : .25) : .5;
  const isSelected = d => STATE.sel && STATE.sel.fileIdx===safeIdx && STATE.sel.idx===d.idx;

  c2.selectAll('.pseg-f'+safeIdx).data(segs).enter().append('path')
    .attr('class','pseg pseg-f'+safeIdx)
    .attr('data-idx', d => d.idx).attr('data-file', safeIdx)
    .attr('d', d => (d.type==='para' && isSelected(d)) ? arcFor(d, SEL_GROW) : arcFor(d))
    .attr('fill', d => {
      if(d.type === 'space') return 'transparent';
      if(isSelected(d)) return SEL_FILL;
      const base = paraFill(d);
      if(!wordMode || d.word % 2 === 0) return base;
      return base.replace(/[\d.]+\)$/, m => Math.max(0, parseFloat(m) - .05) + ')');
    })
    .attr('stroke', d => d.type==='space' ? 'none' : (isSelected(d) ? SEL_STROKE : paraStroke(d)))
    .attr('stroke-width', d => (d.type==='para' && isSelected(d)) ? 1.2 : strokeW)
    .style('cursor', d => d.type==='para' ? 'pointer' : 'default')
    .on('mouseover', function(e,d){
      if(d.type !== 'para' || isSelected(d)) return;
      d3.select(this).attr('d', arcFor(d, HOVER_GROW, 2));
    })
    .on('mouseout', function(e,d){
      if(d.type !== 'para' || isSelected(d)) return;
      d3.select(this).attr('d', arcFor(d));
    })
    .on('mousemove', (e,d) => {
      if(d.type !== 'para') return;
      const p       = paras[d.idx];
      const tag     = d.isTitle ? 'title' : d.isSection ? 'section' : `¶${d.idx+1}`;
      const preview = d.raw.trim().split(/\s+/).slice(0,9).join(' ') + '…';
      const extra   = wordMode ? ` · word ${(d.word||0)+1}` : '';
      const src     = fileName ? `<div class="tt-sub" style="color:var(--teal)">${fileName}</div>` : '';
      tip(`<div class="tt-lbl">${tag}${extra}</div>${src}
           <div class="tt-sub" style="font-size:10px;line-height:1.5">${preview}</div>
           <div class="tt-sub">${d.wordCount} w · ${paraMetric(p,'sentences')} sent. · avg ${paraMetric(p,'asl').toFixed(1)} w/sent.</div>
           <div class="tt-sub">click to select</div>`, e);
    })
    .on('mouseleave', hideTip)
    .on('click', (e,d) => {
      if(d.type !== 'para') return;
      e.stopPropagation();
      selectParagraph(safeIdx, d.idx);
    });

  c2.append('circle').attr('r',rIn).attr('fill','none')
    .attr('stroke',`rgba(${fc},.15)`).attr('stroke-width',.5);

  /* start marker */
  const lx0 = Math.sin(startA)*rIn,                    ly0 = -Math.cos(startA)*rIn;
  const lx1 = Math.sin(startA)*(rOut + START_LINE_LEN), ly1 = -Math.cos(startA)*(rOut + START_LINE_LEN);
  c2.append('line')
    .attr('x1',lx0).attr('y1',ly0).attr('x2',lx1).attr('y2',ly1)
    .attr('stroke','rgba(255,255,255,.65)').attr('stroke-width',1).attr('stroke-linecap','round');
}

/* Redraw a single ring in place when a paragraph is selected/deselected,
   instead of re-rendering the whole chart. */
function redrawRing(fileIdx){
  if(!chartGRef)return;
  const rb = ringBoundsByFile[fileIdx]; if(!rb)return;
  chartGRef.select('.c2-ring-f'+fileIdx).remove();
  renderC2(chartGRef, rb.data, rb.ri, rb.ro, rb.fullAngle, rb.fileIdx, rb.fileName);
}

/* ═════════════════════════════════════════════════════════════════════
   C2 RING LABELS (compare mode)
   Each text's name runs along the arc in the gap just inside its ring,
   starting at the ring's start point (top) and going clockwise.
   Drawn in mainZG (unrotated), so glyphs need no counter-rotation.
═════════════════════════════════════════════════════════════════════ */
function renderRingLabels(gapPx){

  /* ── PARAMETERS ── */
  const LABEL_SIZE   = Math.min(7, gapPx * .75);  /* px — capped so it fits in the ring gap */
  const START_OFFSET = 8;                         /* px along the arc from 12 o'clock       */
  const LABEL_ALPHA  = .85;
  const SHOW_WORDS   = true;                      /* append "· N w" to each label           */

  const layer = mainZG.append('g')
    .attr('class','c2-ring c2-labels')            /* hidden together with C2 by the filter */
    .style('pointer-events','none');

  ringBoundsByFile.forEach((rb, i) => {
    if(!rb) return;
    const rho = rb.ri - gapPx/2;
    const id  = 'c2lbl-'+i+'-'+Math.round(Math.random()*1e6);
    layer.append('path').attr('id', id).attr('fill','none')
      .attr('d', `M0,${-rho} A${rho},${rho} 0 1 1 0,${rho} A${rho},${rho} 0 1 1 0,${-rho}`);
    const words = rb.data.paragraphs.reduce((a,p) => a + p.wordCount, 0);
    layer.append('text')
      .style('font-family','DM Mono,monospace')
      .style('font-size', LABEL_SIZE+'px')
      .style('letter-spacing','.06em')
      .style('fill', `rgba(${fileRGB(rb.fileIdx)},${LABEL_ALPHA})`)
      .attr('dominant-baseline','central')
      .append('textPath')
        .attr('href', '#'+id).attr('xlink:href', '#'+id)
        .attr('startOffset', START_OFFSET)
        .text(rb.fileName + (SHOW_WORDS ? ` · ${fmtNum(words)} w` : ''));
  });
}

/* ═════════════════════════════════════
   C3 — WORD OCCURRENCE TRAIL
   Each dot sits at its word's place inside its paragraph's C2 arc,
   so the trail starts at the start marker and ends with the last paragraph.
   Must be rendered AFTER the C2 rings (reads their paragraph angles).
═════════════════════════════════════ */
function renderC3(g, data, rIn, rOut){

  /* ── PARAMETERS ── */
  const DOT_COLOR          = '#9b7fc7';
  const DOT_FILL_OPACITY   = .82;
  const DOT_STROKE_OPACITY = .3;
  const BAND_FRAC          = .44;   /* fraction of the C3 band dots may stack into */
  const STACK_RES          = 170;   /* angular bucketing for stacking (higher = finer) */

  const rBand = (rOut - rIn)*BAND_FRAC;
  const c3 = g.append('g').attr('class','c3-ring');

  c3.append('circle').attr('r',(rIn+rOut)/2).attr('fill','none')
    .attr('stroke','rgba(155,127,199,.06)').attr('stroke-width',rOut-rIn);
  c3.append('circle').attr('r',rIn).attr('fill','none').attr('stroke','rgba(155,127,199,.14)').attr('stroke-width',.5);
  c3.append('circle').attr('r',rOut).attr('fill','none').attr('stroke','rgba(155,127,199,.2)').attr('stroke-width',.5);

  /* angle = paragraph arc start + token fraction × arc length (d3.arc convention) */
  const pts = [];
  data.wordPositions.forEach(d => {
    const span = mergedParaSpan(d.paraIdx); if(!span) return;
    const f = ((d.tokIdx ?? 0) + .5) / (d.paraToks || 1);
    pts.push({...d, a: span.sa + f*(span.ea - span.sa)});
  });

  /* Keep the SVG scene bounded. Preserve title/section occurrences and
     then sample the remaining occurrences evenly. This prevents very long
     documents from creating tens of thousands of SVG circles. */
  const MAX_C3_DOTS = 2500;
  if(pts.length > MAX_C3_DOTS){
    const priority = pts.filter(d => d.paraIsTitle || d.paraIsSection);
    const normal = pts.filter(d => !d.paraIsTitle && !d.paraIsSection);
    const room = Math.max(0, MAX_C3_DOTS - priority.length);
    const sampled = room >= normal.length ? normal : normal.filter((d,i) =>
      i % Math.ceil(normal.length / room) === 0);
    pts.length = 0;
    pts.push(...priority.slice(0, MAX_C3_DOTS), ...sampled.slice(0, Math.max(0, MAX_C3_DOTS-priority.length)));
  }

  const byB = {};
  pts.forEach(d => {
    d.key = Math.round(d.a*STACK_RES)/STACK_RES;
    (byB[d.key] = byB[d.key] || []).push(d);
  });

  c3.selectAll('.word-dot').data(pts).enter().append('circle')
    .attr('class','word-dot')
    .each(function(d){
      const stack = byB[d.key], si = stack.indexOf(d);
      const r = rIn + rBand*(si + .05)/Math.max(stack.length,1) + rBand*.1;
      d3.select(this).attr('cx', Math.sin(d.a)*r).attr('cy', -Math.cos(d.a)*r);
    })
    .attr('r', d => d.paraIsTitle ? 4.5 : d.paraIsSection ? 3.5 : 2.8)
    .attr('fill', DOT_COLOR).attr('fill-opacity', DOT_FILL_OPACITY)
    .attr('stroke', DOT_COLOR).attr('stroke-opacity', DOT_STROKE_OPACITY).attr('stroke-width', .8)
    .style('cursor','pointer')
    .on('mousemove',(e,d)=>{
      const cols = (data.collocateMap[d.word]||[]).slice(0,4).map(c=>c.word).join(', ') || '—';
      tip(`<div class="tt-lbl">occurrence</div><div class="tt-val">${d.word}</div>
           <div class="tt-sub">¶${d.paraIdx+1} · ${(d.position*100).toFixed(1)}%</div>
           <div class="tt-sub">collocates: ${cols}</div>`,e);
    })
    .on('mouseleave',hideTip)
    .on('click',(e,d)=>{e.stopPropagation();showWordPanel(d.word,CORPUS);showCtxPanel(d.paraIdx,d.word)});
}



/* ═════════════════════════════════════
   C4 — CITATIONS
═════════════════════════════════════ */
/* ═════════════════════════════════════════════════════════════════════
   C4 — CITATIONS  (square icons)
   ─────────────────────────────────────────────────────────────────────
   Citation markers are drawn as small rotated squares (diamonds) so
   they are unambiguously different from the circular word-dot bubbles
   in C3.  Each square is an SVG <rect> rotated 45° around its centre.
═════════════════════════════════════════════════════════════════════ */
function renderC4(g, data, rIn, rOut, c2Radius){
  if(!data.citations.length) return;

  const rMid = (rIn+rOut)/2;
    const c4   = g.append('g').attr('class','c4-ring');

  /* Background glow ring */
  c4.append('circle').attr('r',rMid).attr('fill','none')
    .attr('stroke','rgba(201,126,126,.05)').attr('stroke-width',rOut-rIn);
  c4.append('circle').attr('r',rIn).attr('fill','none')
    .attr('stroke','rgba(201,126,126,.13)').attr('stroke-width',.5);
  c4.append('circle').attr('r',rOut).attr('fill','none')
    .attr('stroke','rgba(201,126,126,.2)').attr('stroke-width',.5);

  /* Dashed connector lines — span from the C2 paragraph ring all the way
     out to each citation's marker, tying it visibly to its paragraph. */
  const byPara = {};
  data.citations.forEach(c => {
    if(!byPara[c.paraIdx]) byPara[c.paraIdx]=[];
    byPara[c.paraIdx].push(c);
  });
  const innerStart = c2Radius!==undefined ? c2Radius : rIn;
  new Set(data.citations.map(c=>c.paraIdx)).forEach(pi => {
    const a = (pi/(data.paragraphs.length||1))*Math.PI*2 - Math.PI/2;
    c4.append('line')
      .attr('x1',Math.cos(a)*innerStart).attr('y1',Math.sin(a)*innerStart)
      .attr('x2',Math.cos(a)*(rOut+4)).attr('y2',Math.sin(a)*(rOut+4))
      .attr('stroke','rgba(201,126,126,.14)').attr('stroke-width',.5)
      .attr('stroke-dasharray','2 4');
  });

  /* Citation groups — one per citation */
  const cg = c4.selectAll('.cite-g').data(data.citations).enter()
    .append('g').attr('class','cite-g')
    .attr('transform', d => {
      const stack = byPara[d.paraIdx], si = stack.indexOf(d);
      const a     = d.paraFraction*Math.PI*2 - Math.PI/2;
      const r     = rIn + (rOut-rIn)*(.2 + si*.3);
      return `translate(${Math.cos(a)*r},${Math.sin(a)*r})`;
    })
    .style('cursor','pointer');

  /* Outer glow halo — soft circle behind the square */
  cg.append('circle').attr('r',19)
    .attr('fill','rgba(201,126,126,.07)').attr('stroke','none');

  /* ── SQUARE ICON (rect rotated 45° = diamond) ──────────────────────
     SVG <rect> with half-size=4px, rotated 45° around its own centre.
     This gives a clean diamond/square shape clearly distinct from
     the circular word dots in C3.                                     */
  const SQ = 2.5;   /* half side-length in px — adjust to resize */
  cg.append('rect')
    .attr('x', -SQ).attr('y', -SQ)
    .attr('width',  SQ*2).attr('height', SQ*2)
    .attr('rx', 0).attr('ry', 0)
    .attr('transform','rotate(45)')
    .attr('fill','rgba(201,126,126,.78)')
    .attr('stroke','rgba(201,126,126,.95)')
    .attr('stroke-width', 1.2);

  /* Author surname label radiating outward */
  cg.append('text')
    .text(d => {
      const m = d.author ? d.author.split(',')[0].split(' ').pop() : '?';
      return m.length>9 ? m.slice(0,8)+'…' : m;
    })
    .attr('text-anchor', d =>
      Math.cos(d.paraFraction*Math.PI*2-Math.PI/2)>0 ? 'start' : 'end')
    .attr('dominant-baseline','central')
    .attr('dx', d =>
      Math.cos(d.paraFraction*Math.PI*2-Math.PI/2)>0 ? 10 : -10)
    .style('font-size','7.5px')
    .style('fill','rgba(201,126,126,.85)')
    .style('pointer-events','none');

  /* Interactions */
  cg.on('mousemove', (e,d) =>
      tip(`<div class="tt-lbl">citation ◼</div>
           <div class="tt-val">${d.ref}</div>
           <div class="tt-sub">¶${d.paraIdx+1} · ${d.year||'—'}</div>
           <div class="tt-sub" style="font-style:italic;margin-top:4px">${d.context}</div>`,e))
    .on('mouseleave', hideTip)
    .on('click', (e,d) => {
      e.stopPropagation();
      showCtxPanel(d.paraIdx, d.author);
    });
}

/* ═════════════════════════════════════
   HELPERS
═════════════════════════════════════ */
function fmtNum(n){return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n)}
let resizeTimer=null;
window.addEventListener('resize',()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{
    if(CORPUS && currentStage===2) renderChart(CORPUS);
    if(currentStage===1) renderNetworkGraph();
  },150);
});
/* raw word count of an analysed text — the same unit the C2 ring and grid labels use */
function rawWords(d){ return d.paragraphs.reduce((s,p) => s + p.wordCount, 0); }/* paragraph metric used for C2 radial height */

/* Angular span on the C2 ring of a MERGED-corpus paragraph index.
   Corpus mode: ring 0. Compare mode: the merged text is the files joined in
   perFile order, so the index is mapped to its file's ring + local index. */
function mergedParaSpan(pi){
  const pf = CORPUS && CORPUS.perFile; if(!pf) return null;
  if(pf.length === 1) return ringBoundsByFile[0]?.paraAngles?.[pi] || null;
  let off = 0;
  for(let f = 0; f < pf.length; f++){
    const n = pf[f].data.paragraphs.length;
    if(pi < off + n) return ringBoundsByFile[f]?.paraAngles?.[pi - off] || null;
    off += n;
  }
  return null;
}

function paraMetric(p, metric){
  if(metric === 'words') return p.wordCount;
  if(p._sents === undefined)
    p._sents = Math.max(1, p.raw.split(/[.!?]+/).filter(s => s.trim()).length);
  return metric === 'sentences' ? p._sents : p.wordCount / p._sents;   /* 'asl' */
}
/* max over every text on screen, so heights compare across compare-mode rings */
function globalMaxMetric(metric){
  const srcs = (CORPUS && CORPUS.perFile) ? CORPUS.perFile.map(f => f.data) : [];
  let m = 0;
  srcs.forEach(d => d.paragraphs.forEach(p => { m = Math.max(m, paraMetric(p, metric)); }));
  return m || 1;
}



/* ═════════════════════════════════════
   INIT + DEMO
═════════════════════════════════════ */
window.addEventListener('DOMContentLoaded',()=>{
  initDraggables();

  // Position panels at default positions
  const pos=(id,t,r,b,l)=>{
    const el=document.getElementById(id);
    if(t!==null)el.style.top=t+'px'; if(r!==null)el.style.right=r+'px';
    if(b!==null)el.style.bottom=b+'px'; if(l!==null)el.style.left=l+'px';
    if(r!==null)el.style.left='auto'; if(b!==null)el.style.top='auto';
  };
  pos('zoom-panel',null,18,18,null);
  pos('legend-panel',null,18,18,null);
  pos('stats-panel',null,null,18,18);
  pos('word-panel',Math.round(window.innerHeight/2-120),18,null,null);
  const cp=document.getElementById('ctx-panel');
  cp.style.bottom='18px'; cp.style.left=Math.round(window.innerWidth/2-200)+'px';

  // Demo
/* setTimeout(()=>{
    FILES=[{id:fileIdCounter++, name:'demo_memory.txt', text:DEMO, size:DEMO.length}];
    renderFilesList();updateCorpusStats();showConfigBlock();growBody('body-a');
    renderNetworkGraph();
  },300); */
});

const DEMO=`UNESCO Courier ; Sept, 1987 ; Article; Print friendly

# The angel with the arquebus 
Baroque art in Latin America
Miguel Rojas Mix





ONE of the most typical figures of Latin American baroque art is that of a dandified angel with swan's wings and a broad-brimmed hat with a feather in it. He is richly clad in a garment with lace ruffles and a greatcoat with a gold and silver lining, and he holds a heavy arquebus.

Although found only in Andean painting, the "Angel with the Arquebus' is a supremely representative feature of the baroque art of Latin America, which is at once a magnificent and theatrical form of art, and also a style whose purpose was to induce the Indian to accept the power of God and the king and, through religion and force of arms, to make him part of colonial society. One of its most common themes was the system of mestizaje, or ethnic intermixture, in which people were placed in castes according to their origin and the colour of their skin.

Baroque art in Latin America has left an indelible mark on the individual and on the course of history. Even today, many writers consider themselves to be baroque writers. In fact, baroque art is the art of the New World. The mixture of Iberian (in which there was already an Arab element) with Indian and Black elements produced a distinctive style which some have called Indo-Hispanic, some creole (criollo), or mestizo. In accordance with its regional characteristics, it has also been called "Andean Baroque' and "Poblano Baroque' (after the Mexican town of Puebla).

A proselytizing art, Baroque was the "Bible of the poor', the gospel conveyed to the Indian's mind by images. While the Protestants preached simplicity and modesty, used no images and made no attempt at evangelization, the Council of Trent (1545-1563) took a stand against pagan images, extolled the Eucharist, the Virgin and the Pope, advocated evangelization and the cult of the saints, and laid down rules to the effect that the saints should be portrayed in a setting suggestive of martyrdom and ecstasy. As late as 1782, instructions were still being issued for artists which repeated the Council's resolutions concerning iconography and set forth detailed rules on the degree of nudity that was permissible for each saint, the age at which he should be depicted and the attitude in which he should be shown.

The baroque style was a perfect way of conveying to the Indians the idea that they should accept their new destiny. Classical art in an art of moderation and balance, an art that is concerned with general principles, and seeks what is universal. Its characters are rhetorical figures. Baroque art is the opposite; it expresses what order and moderation cannot express--emotion, grief, ecstasy and faith. Its representation of mystical feelings is close to everyday life, and its examples are taken from actuality. Its Christs are sacred actors in a human tragedy. Carved in wood painted the colour of flesh, with real hair, eyelashes and eyelids, with glass eyes and real clothing, they are more like characters in a waxworks exhibition than scared images. In the "Christ of Sorrows', the subject most frequently treated in Latin America, sorrow is dramatized in a paroxysm of grief. The figure is covered with blood (made of scarlet cochineal and pitch) so that the viewer almost feels the pain of the wounds, and the face and body are distorted by deep suffering. The convincing realism of the pain, which is in no sense symbolic, was intended to show the Indians that their trials were as nothing compared to the sufferings of Christ.

In its early period, Latin American baroque art was thoroughly European in character. Most of the sixteen- and seventeenth-century paintings are by European artists who worked for the New World, or copies of engravings brought from Europe. Yet even then there was a certain intermixture of styles. The plans of the cathedrals were of Roman or Spanish origin, but they were considerably modified in the course of execution. And of course the "plateresque' or Spanish Renaissance style was a product of the intermixture of the mudejar style and late Gothic.

The second period of Latin American Baroque began when local artists emerged. Although ideas and works of art continued to be imported, certain changes and the emphasis placed on certain themes reveal a growing independence. Because of the prevailing taste for pictures that told a story, a touching story, with an element of fantasy, art of this period is often called "primitive' art. The wood carvings known in the Nahuatl language as tequitqui reveal the sensibility of the Indian. The combination of realism and abstraction in these carvings shows the persistence of pre-Columbian ideas.

Iconography was also modified by the Black sensibility. Baroque art (and especially recoco art) used the Black as a decorative feature. In Europe he was a figure holding a lamp, or, in tapestries, a counterpoint to the white horse whose reins he held. In Latin America Blacks were at first depicted as sumptuously liveried servants or as figures wearing motley. In both cases they added a picturesque note. As sensibility is a form of narcissism, an African element was bound to appear in Latin America to lend dignity to the popular image. Its failure to do so would have been an act of self-abnegation by the artists themselves, who were mestizos, mulattoes or Blacks. Thus African gods slipped surreptitiously into the cult of the saints, and in many cases a darker complexion, rendered by the mixture of wax and paint used to depict the flesh of the Virgin or the angels, was enough to make them recognizable as Blacks from Brazil, Colombia or other regions with a large African population.

The Latin American element in baroque art did not, however, simply consist of modification or stylistic exaggeration. The ultrabaroque or churrigueresque style nowhere reached such a pitch of ostentation as it did in Latin America, especially Mexico, but many of the motifs that artists in the New World began to use were quite different in spirit: decorative forms such as masks with Aymara or Quechua faces, known as indatides, or the delicately gilded frames with carvings of macaws, capybaras, monkeys and other creatures, in settings of papayas, pineapples and banana trees. Such motifs were depicted with a "flat' technique, as if the artists refused to accept the illusion of volume and space known to Western art.

Other highlights of Latin American Baroque are the screens that are distinctive features of churches in the New World, but whose filigreed carving recalls mudejar taste; other creole saints as well as the Angel with the Arquebus; Matamoros images, in which Indians are portrayed instead of Moors, and which should really be called Mataindios in Latin America; depictions of the Magi in which colonial artists include not only a Black king, but sometimes a mestizo and an Indian, so that the subject becomes a metaphor of race; the guitar-playing sirens beside the doors of San Lorenzo de Potosi, in Bolivia, and in the choir of San Miguel de Pomata, in Peru; the creole Virgins--the morenas (Black women) or mamacitas (little mothers) as the Indians call them. In the church of San Juan on the shores of Lake Titicaca, the child Jesus is shown wearing a poncho and a cap like those the Aymara children in the district wear, and to avoid any possible confusion is labelled with the inscription "I am Jesus'. Innumerable painted panels show Incas in gala dress, while others show impoverished Indians. And of course there are many specifically colonial characters and themes, such as Santa Rosa de Lima (1586-1617), a saint much portrayed by eighteenth-century painters, and the "Christ of the Earthquakes', who is venerated in the cathedral of Cuzco and in many other Andean churches, a Christian way of exorcizing the fears of a people that has always felt threatened by the gods of Nature.

Baroque art in Latin America is not a mere transposition of Spanish or Portuguese art. It is a hybrid art. And it embraces more than two cultures, for along with the Spanish tradition it received the Arab heritage in the form of the mudejar style. It is said that the Indian contribution is shown in a preference for a range of pure colours and in the use of abstraction in the portrayal of figures. But the Black influence can also be seen, both in the dark complexion of angels and Virgins and in the syncretism of African gods with the traditional Christian saints. A marvellously enriched style emerged from all these influences, the style of an art that was fundamental to a new world. Such is the art we know as "Latin American Baroque'.

Photo: Left, portal of the church of San Francisco, La Paz, Bolivia, an outstanding example of Andean Baroque. Construction began in 1743. The decoration with anthropomorphic and animal motifs is typical of Latin American "churrigueresque' architecture. Above, facade of the Jesuit church, known as La Compan ia, in Quito, Ecuador. Completed in 1765, the church incorporates twisted columns and other Spanish and Italian features. The interior is decorated with magnificent gilded wood carvings in local style and other Spanish and Italian features. The interior is decorated with magnificent gilded wood carvings in local style.

Photo: The work of Andean sculptors in Peru, Ecuador and Bolivia ranges from imitations of Spanish religious sculpture to depictions of local themes. Above, detail of a crucifix by Gaspar de Sangurima in the monastery of the Immaculate Conception, Cuenca, Ecuador. Christ is portrayed in the realistic style typical of Spanish sculptors, with a stream of blood flowing from His side. Right, Peruvian statue of the baby Jesus dressed as an Indian, with cap and poncho.




COPYRIGHT 1987 UNESCO COPYRIGHT 2004 Gale Group


#arthistory #latam #baroque #art  #peru 
Trauma disrupts normal memory processes in distinctive ways. Intrusive memories, flashbacks, and dissociation represent failures of normal integration. The body, Bessel van der Kolk has argued, keeps the score of these unprocessed experiences (van der Kolk, 2014). The treatment of traumatic memory requires understanding both the psychological and neurobiological dimensions of the disorder.

Social memory extends beyond the individual. Communities construct shared narratives that bind members together and define collective identity. These narratives are transmitted across generations through ritual, story, and material culture. The study of collective memory reveals how the past is always shaped by present concerns and power relations (Halbwachs, 1925).

The future of memory research lies at the intersection of neuroscience, psychology, and philosophy. New imaging technologies allow us to observe the brain in the act of remembering, bringing us closer to understanding one of the most fundamental aspects of human existence. The challenge is to integrate findings across multiple levels of analysis, from the molecular to the social.`;
