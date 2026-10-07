
/* ═════════════════════════════════════
   STATE
═════════════════════════════════════ */
let FILES=[], CORPUS=null, selectedTopic=null;
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

/* ═════════════════════════════════════
   STAGE NAVIGATION
═════════════════════════════════════ */
function goToStage(n){
  currentStage=n;
  document.getElementById('stage_01').style.display = n===1 ? 'block' : 'none';
  document.getElementById('stage_02').style.display = n===2 ? 'block' : 'none';
  document.getElementById('stage_03').style.display = n===3 ? 'flex'  : 'none';
  document.getElementById('layer-ui-1').style.display = n===1 ? 'block' : 'none';
  document.getElementById('layer-ui-2').style.display = n===2 ? 'block' : 'none';
  if(n!==3){
    document.getElementById('ann-btn').style.display='none';
    document.getElementById('ann-popup').style.display='none';
    pendingSelection=null;
  }
  if(n===1) renderNetworkGraph();
}

/* ═════════════════════════════════════
   NETWORK GRAPH (file nodes)
═════════════════════════════════════ */

function renderNetworkGraph(){
  const svg=d3.select('#network_place');
  const W=window.innerWidth, H=window.innerHeight;
  svg.attr('width',W).attr('height',H);
  svg.selectAll('*').remove();
  if(!FILES.length)return;

  const nodes=FILES.map(f=>({...f, wc: f.text.split(/\s+/).filter(Boolean).length}));
  const maxWc=d3.max(nodes,d=>d.wc)||1;
  const rScale=d3.scaleSqrt().domain([0,maxWc]).range([14,44]);

  const links=[];
  for(let i=0;i<nodes.length;i++)
    for(let j=i+1;j<nodes.length;j++)
      links.push({source:nodes[i].id, target:nodes[j].id});

  /* zg is the pan/zoom target; g holds the centred, force-simulated content */
  const zg=svg.append('g').attr('class','net-zoom-g');
  const g=zg.append('g').attr('transform',`translate(${W/2},${H/2})`);

  const sim=d3.forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(0,0))
    .force('collide', d3.forceCollide(d=>rScale(d.wc)+14))
    .force('link', d3.forceLink(links).id(d=>d.id).distance(150).strength(.2));

  const link=g.selectAll('.nlink').data(links).enter().append('line')
    .attr('class','nlink')
    .attr('stroke','rgba(200,169,110,.14)')
    .attr('stroke-width',.6);

  const node=g.selectAll('.fnode').data(nodes,d=>d.id).enter().append('g')
    .attr('class','fnode')
    .style('cursor','pointer')
    .call(d3.drag()
      .on('start',(e,d)=>{if(!e.active)sim.alphaTarget(.3).restart();d.fx=d.x;d.fy=d.y;})
      .on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y;})
      .on('end',(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}));

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

  sim.on('tick',()=>{
    link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
        .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    node.attr('transform',d=>`translate(${d.x},${d.y})`);
  });

  /* zoom + pan for the network graph */
  const netZoom=d3.zoom()
    .scaleExtent([.3,4])
    .on('zoom', ev => zg.attr('transform', ev.transform));
  svg.call(netZoom);
  svg.on('mousedown.cur', () => svg.classed('panning', true))
     .on('mouseup.cur',   () => svg.classed('panning', false));
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
function renderFullTextTabs(){
  const bar=document.getElementById('ft-tabs');
  const files = (CORPUS && CORPUS.perFile) ? CORPUS.perFile : [];
  if(files.length<=1){ bar.style.display='none'; bar.innerHTML=''; return; }
  bar.style.display='flex';
  bar.innerHTML = files.map((f,i)=>
    `<button class="ft-tab-btn${i===ftActiveFileIdx?' active':''}" onclick="switchFtTab(${i})">${f.name}</button>`
  ).join('');
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
  const src = (CORPUS.perFile && CORPUS.perFile[fileIdx]) ? CORPUS.perFile[fileIdx].data : CORPUS;
  const srcName = (CORPUS.perFile && CORPUS.perFile[fileIdx]) ? CORPUS.perFile[fileIdx].name : 'corpus';
  const main=document.getElementById('main_column');
  const sidebar=document.getElementById('text_sidebar');
  main.innerHTML='';
  src.paragraphs.forEach((p,i)=>{
    const div=document.createElement('div');
    div.className='ft-para'+(p.isTitle?' ft-title':p.isSection?' ft-section':'');
    div.id='ft-p'+i;
    let txt=p.raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if(highlightWord){
      const re=new RegExp('\\b('+highlightWord.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')\\b','gi');
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
  const srcName = (CORPUS.perFile && CORPUS.perFile[ftActiveFileIdx])
    ? CORPUS.perFile[ftActiveFileIdx].name : 'corpus';

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
}

function closeAnnPopup(){
  document.getElementById('ann-popup').style.display='none';
  pendingSelection=null;
  window.getSelection().removeAllRanges();
}

function saveAnnotation(){
  if(!pendingSelection)return;
  const note=document.getElementById('ann-popup-text').value.trim();
  ANNOTATIONS.push({
    id:'a'+(annIdCounter++),
    source:pendingSelection.source,
    paraIdx:pendingSelection.paraIdx,
    quote:pendingSelection.quote,
    note: note || '(no note)',
    createdAt: new Date().toISOString(),
  });
  closeAnnPopup();
  /* re-render current tab so the new <mark> shows up */
  renderFullText(ftActiveFileIdx, ctxHighlight, null);
}

function deleteAnnotation(id){
  ANNOTATIONS=ANNOTATIONS.filter(a=>a.id!==id);
  renderFullText(ftActiveFileIdx, ctxHighlight, null);
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
  const srcName = (CORPUS.perFile && CORPUS.perFile[fileIdx]) ? CORPUS.perFile[fileIdx].name : 'corpus';
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
  const hasPerFile=CORPUS.perFile && CORPUS.perFile[ftActiveFileIdx];
  const src = hasPerFile ? CORPUS.perFile[ftActiveFileIdx].data : CORPUS;
  const name = hasPerFile ? CORPUS.perFile[ftActiveFileIdx].name : 'corpus';
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
function setPanelTab(tab){
  document.getElementById('ptab-ingest').classList.toggle('active', tab==='ingest');
  document.getElementById('ptab-config').classList.toggle('active', tab==='config');
  document.getElementById('ptab-body-ingest').style.display = tab==='ingest' ? 'flex' : 'none';
  document.getElementById('ptab-body-config').style.display = tab==='config' ? 'flex' : 'none';
  growBody('body-a');
}

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
    ['upload-panel','hdr-a'],
    ['stats-panel','hdr-stats'],
    ['zoom-panel','hdr-zoom'],
    ['legend-panel','hdr-legend'],
    ['word-panel','hdr-word'],
    ['ctx-panel','hdr-ctx'],
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
let analysisMode = 'corpus';  /* default — works for single file too */

function setMode(m){
  analysisMode = m;
  document.getElementById('mode-corpus').classList.toggle('active', m==='corpus');
  document.getElementById('mode-compare').classList.toggle('active', m==='compare');
  document.getElementById('mode-desc').textContent = m==='corpus'
    ? 'corpus: merge all files into one analysis'
    : 'compare: separate ring per file, sized by word count';
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
function readFile(file){
  const pw=document.getElementById('prog-wrap'),pf=document.getElementById('prog-fill'),pl=document.getElementById('prog-label');
  pw.style.display='flex'; pl.textContent='reading '+file.name+'…'; pf.style.width='0%';
  let p=0;
  const iv=setInterval(()=>{p=Math.min(p+Math.random()*22+6,88);pf.style.width=p+'%'},60);
  const reader=new FileReader();
  reader.onload=ev=>{
    clearInterval(iv); pf.style.width='100%'; pl.textContent='✓ done';
    setTimeout(()=>{pw.style.display='none';pf.style.width='0%'},400);
    const ex=FILES.findIndex(f=>f.name===file.name);
    const entry={id: ex>=0?FILES[ex].id:fileIdCounter++, name:file.name,text:ev.target.result,size:file.size};
    if(ex>=0)FILES[ex]=entry; else FILES.push(entry);
    renderFilesList();updateCorpusStats();showConfigBlock();growBody('body-a');
    renderNetworkGraph();
  };
  reader.readAsText(file,'UTF-8');
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
  setMode('corpus');
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
  document.getElementById('next-to-config').style.display = FILES.length ? 'block' : 'none';
  const tot=FILES.reduce((s,f)=>s+f.text.split(/\s+/).filter(Boolean).length,0);
  document.getElementById('run-meta').innerHTML=FILES.map(f=>`<span class="hi">${f.name}</span>`).join(', ')+`<br>~${fmtNum(tot)} words`;
}

/* ═════════════════════════════════════
   NLP ENGINE
═════════════════════════════════════ */
const STOPS=new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','was','are','were','be','been','have','has','had','do','does','did','that','this','it','he','she','they','we','you','i','not','as','so','if','its','his','her','their','our','my','your','which','who','what','when','where','how','all','no','up','out','there','can','will','would','could','should','may','might','shall','just','also','than','then','more','some','into','about','over','after','before','through','between','during','each','both','very','such','these','those','any','many','much','most','other','another','one','two','three','first','last','long','great','little','good','new','old','high','own','same','right','large','used','well','way','even','back','because','come','here','made','only','see','still','us','him','them']);

function analyse(text,opts){
  const paragraphs=[];
  text.split(/\n{2,}/).forEach((blk,i)=>{
    const t=blk.trim(); if(!t)return;
    const wc=t.split(/\s+/).filter(Boolean).length;
    const isTitle=(i===0&&wc<15)||/^#{1,4}\s/.test(t)||/^[A-Z][A-Z\s]{5,40}$/.test(t.trim());
    const isSection=!isTitle&&wc<20;
    paragraphs.push({idx:paragraphs.length,raw:t,wordCount:wc,isTitle,isSection});
  });

  const fullWords=text.toLowerCase().match(/\b[a-záéíóúüñ']{2,}\b/g)||[];
  const filtered=opts.stops?fullWords.filter(w=>!STOPS.has(w)):fullWords;

  const freq={};
  filtered.forEach(w=>{freq[w]=(freq[w]||0)+1});
  const df={};
  paragraphs.forEach(p=>{new Set((p.raw.toLowerCase().match(/\b[a-z']{2,}\b/g)||[])).forEach(w=>{df[w]=(df[w]||0)+1})});
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
    'said','told','asked','spoke','story','narrative','voice','words',
    'year','years','time','day','days','century','period','history','moment',
    'city','house','room','place','home','space','region','area',
    'man','woman','people','person','child','family','society','community',
    'think','thought','mind','know','believe','feel','consciousness','memory','idea',
    'light','dark','sun','water','sky','earth','night','air','world','nature',
    'came','went','made','come','take','began','found','used','become',
    'love','life','death','fear','hope','pain','heart','soul','dream','experience',
    'research','study','analysis','result','evidence','theory','system',
    'language','word','text','meaning','symbol','discourse','expression',
  ]);
  const trackSet=new Set([
    ...topWords.map(d=>d.word),
    /* Add seeds only when they actually occur in this corpus */
    ...[...topicSeeds].filter(w=>freq[w]>0),
  ]);

  const cloudWords=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,35).map(([word,count])=>({word,count}));

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
    const ptoks=p.raw.toLowerCase().match(/\b[a-z']{2,}\b/g)||[];
    ptoks.forEach((w,ti)=>{
      if(trackSet.has(w)){
        const pos=Math.min((gt+ti)/(fullWords.length||1),.9999);
        wordPositions.push({word:w,position:pos,paraIdx:pi,paraIsTitle:p.isTitle,paraIsSection:p.isSection});
        if(!wordParas[w])wordParas[w]=[];
        if(!wordParas[w].includes(pi))wordParas[w].push(pi);
      }
    });
    gt+=ptoks.length;
  });

  const topicDefs=[
    {name:'Narration',emoji:'◈',keys:['said','told','asked','spoke','story','narrative','voice','words']},
    {name:'Time',emoji:'◷',keys:['year','years','time','day','days','century','period','history','moment']},
    {name:'Space',emoji:'◉',keys:['city','house','room','place','home','space','region','area']},
    {name:'People',emoji:'◎',keys:['man','woman','people','person','child','family','society','community']},
    {name:'Mind',emoji:'◇',keys:['think','thought','mind','know','believe','feel','consciousness','memory','idea']},
    {name:'Nature',emoji:'◌',keys:['light','dark','sun','water','sky','earth','night','air','world','nature']},
    {name:'Action',emoji:'◆',keys:['came','went','made','come','take','began','found','used','become']},
    {name:'Emotion',emoji:'◍',keys:['love','life','death','fear','hope','pain','heart','soul','dream','experience']},
    {name:'Knowledge',emoji:'◈',keys:['research','study','analysis','result','evidence','theory','system']},
    {name:'Language',emoji:'◐',keys:['language','word','text','meaning','symbol','discourse','expression']},
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
  const asl=sents.length?fullWords.length/sents.length:0;
  const asw=filtered.length?filtered.reduce((s,w)=>s+syl(w),0)/filtered.length:0;
  const flesch=Math.max(0,Math.min(100,206.835-1.015*asl-84.6*asw));

  return{paragraphs,topWords,trackSet,collocateMap,wordPositions,wordParas,topics,citations,cloudWords,freq,tfidf,
    meta:{totalWords:filtered.length,uniqueTypes:Object.keys(freq).length,sentences:sents.length,
      avgSentenceLen:+asl.toFixed(1),vocabDensity:+(Object.keys(freq).length/(filtered.length||1)*100).toFixed(1),
      flesch:+flesch.toFixed(0),readability:flesch>70?'easy':flesch>50?'standard':flesch>30?'difficult':'very difficult',
      paragraphCount:paragraphs.length,citationCount:citations.length}};
}

/* ═════════════════════════════════════
   RUN
═════════════════════════════════════ */
function runAnalysis(){
  if(!FILES.length)return;
  const activeFiles = selectedFileIds.size>0 ? FILES.filter(f=>selectedFileIds.has(f.id)) : FILES;
  const btn=document.getElementById('run-btn');
  btn.disabled=true; btn.textContent='◌ processing…';
  document.getElementById('aticker').style.display='flex';
  document.getElementById('phase-bar').style.display='block';
  selectedTopic=null; ctxParaIdx=null;

  const opts={
    topWords:+document.getElementById('opt-words').value,
    win:+document.getElementById('opt-win').value,
    stops:document.getElementById('opt-stops').checked,
    cites:document.getElementById('opt-cites').checked,
  };

  const phases=[[5,'tokenizing…'],[22,'freq & tf-idf…'],[42,'co-occurrence…'],[60,'topics…'],[76,'positions…'],[90,'citations…'],[97,'rendering…']];
  let pi=0;
  const pf=document.getElementById('phase-fill'),lbl=document.getElementById('atick-lbl');
  const iv=setInterval(()=>{if(pi<phases.length){pf.style.width=phases[pi][0]+'%';lbl.textContent=phases[pi][1];pi++}},220);

  setTimeout(()=>{
    clearInterval(iv); pf.style.width='100%';
        /* Analyse all files together for NLP (topics, word cloud, TF-IDF). */
        /* Combined corpus: topics, word cloud, C3 dots — all files merged. */
     /* ── BUILD CORPUS based on chosen analysisMode ─────────────────────
       CORPUS MODE  (merge): all files concatenated → one analysis, one C2
         ring. perFile is a single-entry array pointing at the same data,
         so the ring-drawing code still works without special-casing.

       COMPARE MODE (separate): files analysed together for NLP globals
         (topics, word cloud, C3 dots = most meaningful cross-document),
         but each file also gets its own paragraph analysis for individual
         C2 rings — one per file, sized proportionally by word count.
    ────────────────────────────────────────────────────────────────────*/
    if(analysisMode === 'corpus' || activeFiles.length === 1){
      const mergedText = activeFiles.map(f=>f.text).join('\n\n');
      CORPUS = analyse(mergedText, opts);
      CORPUS.perFile = [{
        name: activeFiles.length===1 ? activeFiles[0].name : 'merged corpus',
        data: CORPUS
      }];
    } else {
      const mergedText = activeFiles.map(f=>f.text).join('\n\n');
      CORPUS = analyse(mergedText, opts);
      CORPUS.perFile = activeFiles.map(f=>({
        name: f.name,
        data: analyse(f.text, opts)
      }));
    }
 

    ['sn2','sn3'].forEach(id=>document.getElementById(id).classList.add('done'));
    document.getElementById('sn2').classList.remove('active');
    renderStatsPanel(CORPUS.meta);
    document.getElementById('stats-panel').style.display='block';
    document.getElementById('legend-panel').style.display='flex';
    document.getElementById('empty').style.display='none';
    renderChart(CORPUS);
    enrichTopics(CORPUS);
    btn.disabled=false; btn.textContent='◎ re-analyse';
    document.getElementById('aticker').style.display='none';
    setTimeout(()=>{document.getElementById('phase-bar').style.display='none';pf.style.width='0%'},400);
    document.querySelectorAll('.panel').forEach(checkOverChart);
    goToStage(2);
  },1650);
}

function renderStatsPanel(m){
  const rows=[['words',fmtNum(m.totalWords)],['unique',fmtNum(m.uniqueTypes)],['density',m.vocabDensity+'%'],
    ['sentences',fmtNum(m.sentences)],['avg len',m.avgSentenceLen+' w'],['paragraphs',m.paragraphCount],
    ['readability',m.readability+' ('+m.flesch+')'],['citations',m.citationCount]];
  document.getElementById('stats-rows').innerHTML=rows.map(([k,v])=>
    `<div class="sp-row"><span class="sp-k">${k}</span><span class="sp-v">${v}</span></div>`).join('');
}

/* ═════════════════════════════════════
   CONTEXT PANEL
═════════════════════════════════════ */
/* showCtxPanel(paraIdx, hlWord, fileIdx)
   fileIdx is optional; when provided it shows the source-file name
   in the context reader header (useful when multiple files loaded).  */

function showCtxPanel(paraIdx, hlWord, fileIdx){
  if(!CORPUS)return;
  const p=CORPUS.paragraphs[paraIdx]; if(!p)return;
  ctxParaIdx=paraIdx; ctxHighlight=hlWord||null;
  ctxFileIdx = (fileIdx!==undefined && fileIdx!==null) ? fileIdx : 0;

  /* Build metadata line: type · word count [ · source file ] */
  const tag=p.isTitle?'title':p.isSection?'section header':`paragraph ${paraIdx+1} / ${CORPUS.paragraphs.length}`;
  let meta=tag+' · '+p.wordCount+' words';
  /* Show file name only when more than one file was loaded */
  if(CORPUS.perFile && CORPUS.perFile.length>1){
    const fname=(fileIdx!==undefined && CORPUS.perFile[fileIdx])
      ? CORPUS.perFile[fileIdx].name
      : (FILES[0]?.name||'');
    if(fname) meta+=' · <span style="color:var(--teal)">'+fname+'</span>';
  }
  document.getElementById('ctx-meta').innerHTML=meta;

  let html=p.raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if(ctxHighlight){
    const re=new RegExp('\\b('+ctxHighlight.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')\\b','gi');
    html=html.replace(re,'<em>$1</em>');
  }
  document.getElementById('ctx-text').innerHTML=html;
  document.getElementById('ctx-llm-summary').textContent='';
summarizeParagraph(p.raw).then(s=>{
  if(s && ctxParaIdx===paraIdx) document.getElementById('ctx-llm-summary').textContent='» '+s;
});

  const panel=document.getElementById('ctx-panel');
  panel.style.display='flex';
  openBody('ctx-body','cg-ctx','hdr-ctx');
  checkOverChart(panel);
}

function closeCtxPanel(){document.getElementById('ctx-panel').style.display='none';ctxParaIdx=null}
function ctxNav(dir){
  if(ctxParaIdx===null||!CORPUS)return;
  const next=ctxParaIdx+dir;
  if(next>=0&&next<CORPUS.paragraphs.length)showCtxPanel(next,ctxHighlight);
}

/* ═════════════════════════════════════
   WORD DETAIL
═════════════════════════════════════ */
function showWordPanel(word, data){
  document.getElementById('word-panel').style.display='flex';
  document.getElementById('wp-word').textContent=word;
  document.getElementById('wp-freq').textContent='×'+(data.freq[word]||0)+' occurrences';
  document.getElementById('wp-tfidf').textContent=(data.tfidf[word]||0).toFixed(3);
  const cols=data.collocateMap[word]||[];
  document.getElementById('wp-collocates').innerHTML=cols.length
    ?cols.map(c=>`<span class="wp-tag">${c.word} <span class="c-t3">×${c.count}</span></span>`).join('')
    :'<span style="font-size:9px;color:var(--t3)">none found</span>';
  document.getElementById('wp-llm-note').textContent='';
if(cols.length) interpretCollocates(word, cols).then(s=>{
  if(s) document.getElementById('wp-llm-note').textContent='» '+s;
});
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
  /* C3 dots: dim non-matching, enlarge matching */
  d3.selectAll('.word-dot')
    .transition().duration(200)
    .attr('opacity', d => d.word===word ? 1 : .06)
    .attr('r', d => d.word===word
      ? (d.paraIsTitle ? 7 : 5.5)    /* selected: clearly enlarged */
      : (d.paraIsTitle ? 2.5 : 2));  /* others: shrunk so selection stands out */

  /* C1 word-cloud labels: brighten matching word, dim others */
  d3.selectAll('.cloud-word')
    .transition().duration(200)
    .style('fill-opacity', function(){
      return this.getAttribute('data-word')===word ? 1 : .12;
    })
    .style('font-size', function(){
      /* Keep the existing font-size but add 3px to the matching word */
      const cur = parseFloat(this.getAttribute('data-base-fs')||
                             this.style.fontSize||'9');
      return (this.getAttribute('data-word')===word ? cur-3 : cur)+'px';
    });

  /* C1 topic bubbles: brighten if they relate to this word */
  d3.selectAll('.topic-bubble')
    .transition().duration(200)
    .attr('opacity', d => (d.related||[]).includes(word) ? 1 : .12);
}

function applyTopicHighlight(topicName){
  if(selectedTopic===topicName){ clearHighlights(); return; }
  selectedTopic = topicName;
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

  /* Open context panel at first relevant paragraph */
  if(topic.related.length && CORPUS.wordParas[topic.related[0]]?.length){
    showCtxPanel(CORPUS.wordParas[topic.related[0]][0], topic.related[0]);
  }
}

function clearHighlights(){
  selectedTopic = null;

  d3.selectAll('.word-dot')
    .transition().duration(200)
    .attr('opacity', 1)
    .attr('r', d => d.paraIsTitle?4.5 : d.paraIsSection?3.5 : 2.8);

  d3.selectAll('.cloud-word')
    .transition().duration(200)
    .style('fill-opacity', .68)
    .style('font-size', function(){
      return (this.getAttribute('data-base-fs')||'9')+'px';
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
      /* Apply D3's transform directly to the group — no extra translate. */
      zg.attr('transform', ev.transform);
      document.getElementById('zlabel').textContent =
        Math.round(ev.transform.k * 100) + '%';
    });

  /* Attach zoom behaviour to SVG. */
  svg.call(d3Zoom);

  /* Immediately tell D3 zoom about the starting position WITHOUT
     triggering a transition — this prevents the initial snap. */
  svg.call(d3Zoom.transform, startTransform);

  /* Cursor feedback during panning. */
  svg.on('mousedown.cur', () => svg.classed('panning', true))
     .on('mouseup.cur',   () => svg.classed('panning', false));
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
  if(e.target.tagName==='svg'||e.target.tagName==='rect'){clearHighlights()}
});







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
  const starG=svg.append('g').style('pointer-events','none');
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
  const base = Math.min(W,H) * .99;

  /* ── C1: topic force bubble zone ───────────────────────────────── */
  const R1  = base * .225;

  /* ── C2: paragraph donut band ───────────────────────────────────────
     The full C2 band spans R2i → R2BAND_OUT.
     With multiple files this band is subdivided (see below).
     ringH  : fixed radial thickness of ONE file's ring.
     gap    : clear space between consecutive rings.
     The outermost ring's outer edge = R2BAND_OUT regardless of count.  */
  const R2i        = base * .35;   /* inner edge of innermost ring      */
  const ringH      = base * .038;  /* radial height — same for all rings */
  const ringGap    = base * .012;  /* gap between consecutive rings      */
  const nFiles     = (data.perFile && data.perFile.length > 1)
                     ? data.perFile.length : 1;
  /* Outer edge of the whole C2 band — grows with file count */
  const R2BAND_OUT = R2i + nFiles * ringH + (nFiles - 1) * ringGap;

  /* ── C3: word-dot ring — starts just outside C2 band ────────────── */
  const R3i = R2BAND_OUT + base * .02;   /* ≥ 4px clear gap from C2     */
  const R3o = R3i        + base * .075;

  /* ── C4: citations ring — starts just outside C3 ────────────────── */
  const R4i = R3o + base * .015;
  const R4o = R4i + base * .08;

  /* ── Word-cloud belt — between C1 outer edge and C2 inner edge ──── */
  const RCi = R1  + base * .01;
  const RCo = R2i - base * .01;

  /* ── RENDER RINGS ────────────────────────────────────────────────── */
  renderC4(chartG, data, R4i, R4o);
  renderC3(chartG, data, R3i, R3o);

  if(data.perFile && data.perFile.length > 1){
    const maxW = Math.max(...data.perFile.map(f => f.data.meta.totalWords));
    const sorted = [...data.perFile]
      .sort((a,b) => b.data.meta.totalWords - a.data.meta.totalWords);
    sorted.forEach((pf, i) => {
      const ro = R2BAND_OUT - i * (ringH + ringGap);
      const ri = ro - ringH;
      const fullAngle = Math.PI * 2 * (pf.data.meta.totalWords / maxW);
      renderC2(chartG, pf.data, ri, ro, fullAngle, i, pf.name);
    });
  } else {
    renderC2(chartG, data, R2i, R2BAND_OUT, Math.PI * 2, 0, FILES[0]?.name || '');
  }

  renderC1(chartG, data, R1, RCi, RCo);

  /* Outer decorative dashed circles */
  [R4o + base*.018, R4o + base*.038].forEach((r,i) =>
    chartG.append('circle').attr('r',r).attr('fill','none')
      .attr('stroke',`rgba(255,255,255,${.025 - i*.01})`)
      .attr('stroke-width',.5).attr('stroke-dasharray','3 10'));

  /* Pass viewport centre so zoom starts the chart visually centred */
  initZoom(svg, mainZG, W/2, H/2);

}








/* ═════════════════════════════════════
   C1 — TOPIC FORCE + WORD CLOUD BELT
═════════════════════════════════════ */
function renderC1(g,data,forceR,cloudRi,cloudRo){
  const pal=['#c8a96e','#e2c48a','#d4a860','#be9050','#a87840','#8c6030','#f0d090','#b08020','#9b7fc7','#7eb8c9'];
  const colScale=d3.scaleOrdinal().domain(data.topics.map(d=>d.name)).range(pal);
  const maxF=d3.max(data.topics,d=>d.freq)||1;
  const rScale=d3.scaleSqrt().domain([0,maxF]).range([9,forceR*.33]);
  const nodes=data.topics.slice(0,9).map(d=>({...d,r:rScale(d.freq),x:(Math.random()-.5)*forceR*.4,y:(Math.random()-.5)*forceR*.4}));

  const clipId='c1c'+Math.round(Math.random()*9999);
  g.append('defs').append('clipPath').attr('id',clipId).append('circle').attr('r',forceR);
  const c1=g.append('g').attr('clip-path',`url(#${clipId})`);

  c1.append('circle').attr('r',forceR).attr('fill','rgba(8,8,14,.78)').attr('stroke','rgba(200,169,110,.14)').attr('stroke-width',.5);
  c1.append('circle').attr('r',forceR*.93).attr('fill','none').attr('stroke','rgba(200,169,110,.05)').attr('stroke-width',6);

  const sim=d3.forceSimulation(nodes)
    .force('center',d3.forceCenter(0,0))
    .force('collide',d3.forceCollide(d=>d.r+3).strength(.93))
    .force('charge',d3.forceManyBody().strength(-14))
    .force('x',d3.forceX(0).strength(.07)).force('y',d3.forceY(0).strength(.07))
    .stop();
  for(let i=0;i<250;i++)sim.tick();

  nodes.forEach((a,ai)=>nodes.forEach((b,bi)=>{
    if(bi<=ai)return;
    c1.append('line').attr('x1',a.x).attr('y1',a.y).attr('x2',b.x).attr('y2',b.y)
      .attr('stroke','rgba(200,169,110,.04)').attr('stroke-width',.5);
  }));

  const bubbles=c1.selectAll('.topic-bubble').data(nodes).enter().append('g')
    .attr('class','topic-bubble').attr('transform',d=>`translate(${d.x},${d.y})`).style('cursor','pointer');

  bubbles.append('circle').attr('r',d=>d.r+1).attr('fill',d=>colScale(d.name)).attr('fill-opacity',.07).attr('stroke','none');
  bubbles.append('circle').attr('r',d=>d.r)
    .attr('fill',d=>colScale(d.name)).attr('fill-opacity',.72)
    .attr('stroke',d=>colScale(d.name)).attr('stroke-opacity',.45).attr('stroke-width',1);
  bubbles.append('text').text(d=>d.r>13?d.emoji:'')
    .attr('text-anchor','middle').attr('dominant-baseline','central').attr('y',d=>d.r>22?-d.r*.28:0)
    .style('font-size',d=>Math.min(d.r*.55,14)+'px').style('fill','rgba(255,255,255,.65)').style('pointer-events','none');
  bubbles.append('text').text(d=>d.r>18?d.name:'')
    .attr('text-anchor','middle').attr('dominant-baseline','central').attr('y',d=>d.r>22?d.r*.22:0)
    .style('font-family','DM Mono,monospace').style('font-size',d=>Math.min(d.r*.29,9.5)+'px')
    .style('fill','rgba(255,255,255,.7)').style('pointer-events','none');
  bubbles.append('text').text(d=>d.r>27?d.freq:'')
    .attr('text-anchor','middle').attr('y',d=>d.r*.57)
    .style('font-size','7.5px').style('fill','rgba(255,255,255,.28)').style('pointer-events','none');

  bubbles
    .on('mousemove',(e,d)=>tip(`<div class="tt-lbl">topic cluster</div>
      <div class="tt-val">${d.emoji} ${d.name}</div>
      <div class="tt-sub">score: ${d.freq} · click to highlight C3</div>
      <div class="tt-tags">${d.related.map(w=>`<span class="tt-tag">${w}</span>`).join('')}</div>`,e))
    .on('mouseleave',hideTip)
    .on('click',(e,d)=>{e.stopPropagation();applyTopicHighlight(d.name)});

  c1.append('circle').attr('r',forceR).attr('fill','none').attr('stroke','rgba(200,169,110,.2)').attr('stroke-width',.5);

  /* ── WORD CLOUD BELT (between C1 and C2) ── */
  const cloudBelt=g.append('g').attr('class','cloud-belt');
  const cloudWords=data.cloudWords.slice(0,28);
  const maxC=cloudWords[0]?.count||1;
  const fScale=d3.scaleSqrt().domain([1,maxC]).range([6.5,14.5]);
  const cloudPal=['#c8a96e','#e2c48a','#7eb8c9','#9b7fc7','#7ec99b','#c97e7e','#d4a860','#a0c8d4','#b8a0d4','#a0d4b8','#d4c8a0','#a0b8d4'];
  const beltW=cloudRo-cloudRi;

  cloudWords.forEach((wd,i)=>{
    const angle=(i/cloudWords.length)*Math.PI*2-Math.PI/2;
    // Stagger radius in 3 lanes
    const lane=i%3;
    const r=cloudRi+4+lane*(beltW-8)/2.5;
    const x=Math.cos(angle)*r, y=Math.sin(angle)*r;
    const fs=fScale(wd.count);
    // Tangential text (perpendicular to radius)
    let rot=(angle*180/Math.PI)+90;
    // Keep text upright
    if(Math.cos(angle)<0)rot+=180;

    cloudBelt.append('text')
      .attr('class','cloud-word')            /* targeted by highlight system */
      .attr('data-word', wd.word)            /* word identity for selection  */
      .attr('data-base-fs', fs.toFixed(1))  /* base font-size for restore   */
      .attr('x',x).attr('y',y)
      .attr('text-anchor','middle').attr('dominant-baseline','central')
      /* The CSS counter-rotation rule is excluded for .cloud-word elements.
         So here we only need the tangential rotation for the chart's -90°
         parent: the word should be perpendicular to the radius.
         rot = (angle in degrees) + 90  gives tangential direction.
         Then we add another +90 to cancel the parent chartG rotate(-90).  */
      .attr('transform',`rotate(${rot},${x},${y})`)
      .style('font-family','Fraunces,serif').style('font-style','italic')
      .style('font-size', fs+'px')
      .style('fill', cloudPal[i%cloudPal.length])
      .style('fill-opacity',.68).style('cursor','pointer').style('user-select','none')
      .text(wd.word)
      .on('mousemove',e=>tip(`<div class="tt-lbl">word cloud</div>
        <div class="tt-val">${wd.word}</div><div class="tt-sub">×${wd.count}</div>`,e))
      .on('mouseleave',hideTip)
      .on('click',e=>{e.stopPropagation();if(CORPUS)showWordPanel(wd.word,CORPUS)});
      
  });
}













/* ═════════════════════════════════════════════════════════════════════
   C2 — PARAGRAPH DONUT
   ─────────────────────────────────────────────────────────────────────
   VISUAL PARAMETERS (adjust here):
     WORD_THRESHOLD : word count below which word-mode activates (per-word arcs)
     END_GAP_DEG    : degrees of empty space kept between ring end and start
                      even when the file fills the full 360°. Default 8°.
                      Increase for a more obvious gap; set to 0 to disable.
     START_LINE_LEN : radial length of the white marker line at 12 o'clock
                      (before the chart is rotated). In SVG user units (px at scale 1).
     LABEL_OFFSET   : distance from the ring outer edge to the title text baseline.
═════════════════════════════════════════════════════════════════════ */
function renderC2(g, data, rIn, rOut, fullAngle, fileIdx, fileName){

  /* ── VISUAL PARAMETERS ─────────────────────────────────────────── */
  const WORD_THRESHOLD = 1000;   /* switch to per-word arcs below this count  */
  const END_GAP_DEG    = 8;      /* reserved gap in degrees at end of ring    */
  const START_LINE_LEN = 14;     /* px length of the white start marker line  */
  const LABEL_OFFSET   = 12;     /* px from ring outer edge to title text     */

  /* Convert gap to radians and subtract from fullAngle so there is
     always a visible break between the last and first arc segment.   */
  const END_GAP_RAD = (END_GAP_DEG / 360) * Math.PI * 2;
  const usableAngle = Math.max(0.01, fullAngle - END_GAP_RAD);

  const paras      = data.paragraphs;
  const totalWords = data.meta ? data.meta.totalWords
                   : paras.reduce((s,p) => s+p.wordCount, 0);
  const total      = totalWords || 1;

  /* ── MODE ──────────────────────────────────────────────────────── */
  const wordMode = total < WORD_THRESHOLD;

  /* ── COLOUR HELPERS ─────────────────────────────────────────────── */
  const paraFill   = p => p.isTitle   ? 'rgba(200,169,110,.52)'
                        : p.isSection ? 'rgba(200,169,110,.26)'
                        :               'rgba(126,184,201,.20)';
  const paraStroke = p => p.isTitle   ? 'rgba(200,169,110,.75)'
                        : p.isSection ? 'rgba(200,169,110,.40)'
                        :               'rgba(126,184,201,.28)';

  /* ── BUILD SEGMENT LIST ─────────────────────────────────────────── */
  const segs = [];
  const isMulti = data.perFile ? false : (CORPUS.perFile && CORPUS.perFile.length > 1);

  if(wordMode){
    const ww      = 1 / total;
    const bodyGap = ww * 1.5, secGap = ww * 4, titleGap = ww * 6;
    paras.forEach(p => {
      /* In multi-file mode show half-size words to reduce visual clutter */
      for(let wi=0; wi<p.wordCount; wi++)
        segs.push({type:'para', word:wi, idx:p.idx, raw:p.raw,
          wordCount:p.wordCount, isTitle:p.isTitle,
          isSection:p.isSection, weight:ww});
      segs.push({type:'space', idx:p.idx,
        weight: p.isTitle?titleGap : p.isSection?secGap : bodyGap});
    });
  } else {
    paras.forEach(p => {
      segs.push({type:'para', ...p,
        weight: Math.max(p.wordCount/total, .004)});
      segs.push({type:'space', idx:p.idx,
        weight: p.isTitle?.022 : p.isSection?.015 : .006});
    });
  }

  /* ── ASSIGN ANGLES ──────────────────────────────────────────────────
     startA = −π/2 → 12 o'clock on the unrotated chart.
     After the chart group is rotated −90°, 12 o'clock maps to the
     leftmost point of the ring (9 o'clock visually), which after the
     parent rotate(-90) becomes the TOP of the screen — i.e. the ring
     starts at the top of the vertical axis as requested.
     usableAngle leaves END_GAP_DEG of empty space.                   */
  const tW     = segs.reduce((s,d) => s+d.weight, 0);
  const startA = -Math.PI/-2;
  let   angle  = startA;
  segs.forEach(d => {
    d.sa = angle;
    d.ea = angle + (d.weight/tW) * usableAngle;
    angle = d.ea;
  });

  /* ── ARC GENERATORS ─────────────────────────────────────────────── */
  const cr   = wordMode ? 0 : 1.5;
  const arc  = d3.arc().innerRadius(rIn).outerRadius(rOut).cornerRadius(cr);
  const arcH = d3.arc().innerRadius(rIn-3).outerRadius(rOut+5).cornerRadius(cr);

  const c2 = g.append('g');

  /* Ghost track for the full ring including the gap */
  const ghostArc = d3.arc().innerRadius(rIn).outerRadius(rOut).cornerRadius(0);
  c2.append('path')
    .attr('d', ghostArc({startAngle: startA, endAngle: startA + Math.PI*2}))
    .attr('fill','rgba(255,255,255,.018)')
    .attr('stroke','rgba(255,255,255,.03)').attr('stroke-width',.5);

  /* Background ring glow */
  c2.append('circle').attr('r',(rIn+rOut)/2).attr('fill','none')
    .attr('stroke','rgba(126,184,201,.03)').attr('stroke-width',rOut-rIn);

  /* ── DRAW ARCS ─────────────────────────────────────────────────── */
  const safeIdx = parseInt(fileIdx, 10) || 0;
  /* Multi-file: shrink word-arc stroke to half so rings stay readable */
  const multiFile = CORPUS.perFile && CORPUS.perFile.length > 1;
  const strokeW   = wordMode ? (multiFile ? .15 : .25) : .5;

  c2.selectAll('.pseg-f'+safeIdx).data(segs).enter().append('path')
    .attr('class','pseg pseg-f'+safeIdx)
    .attr('d', d => arc({startAngle:d.sa, endAngle:d.ea}))
    .attr('fill', d => {
      if(d.type==='space') return 'transparent';
      if(!wordMode) return paraFill(d);
      const base = paraFill(d);
      return d.word%2===0 ? base
        : base.replace(/[\d.]+\)$/, m => (Math.max(0,parseFloat(m)-.05))+')');
    })
    .attr('stroke', d => d.type==='space' ? 'none' : paraStroke(d))
    .attr('stroke-width', strokeW)
    .style('cursor', d => d.type==='para' ? 'pointer' : 'default')
    .on('mouseover', function(e,d){
      if(d.type!=='para') return;
      d3.select(this).attr('d', arcH({startAngle:d.sa, endAngle:d.ea}));
    })
    .on('mouseout', function(e,d){
      d3.select(this).attr('d', arc({startAngle:d.sa, endAngle:d.ea}));
    })
    .on('mousemove', (e,d) => {
      if(d.type!=='para') return;
      const tag     = d.isTitle?'title':d.isSection?'section':`¶${d.idx+1}`;
      const preview = d.raw.trim().split(/\s+/).slice(0,9).join(' ')+'…';
      const extra   = wordMode ? ` · word ${(d.word||0)+1}` : '';
      const src     = fileName
        ? `<div class="tt-sub" style="color:var(--teal)">${fileName}</div>` : '';
      tip(`<div class="tt-lbl">${tag}${extra}</div>${src}
           <div class="tt-sub" style="font-size:10px;line-height:1.5">${preview}</div>
           <div class="tt-sub">${d.wordCount} w · click to read</div>`, e);
    })
    .on('mouseleave', hideTip)
    .on('click', (e,d) => {
      if(d.type==='para'){ e.stopPropagation(); showCtxPanel(d.idx, null, fileIdx); }
    });

  /* Ring borders */
  c2.append('circle').attr('r',rIn).attr('fill','none')
    .attr('stroke','rgba(126,184,201,.15)').attr('stroke-width',.5);
  c2.append('circle').attr('r',rOut).attr('fill','none')
    .attr('stroke','rgba(126,184,201,.22)').attr('stroke-width',.5);

  /* ── START MARKER: white vertical line at 12 o'clock ────────────────
     The ring starts at angle startA = −π/2 (top of unit circle).
     A short radial line marks the start point visually.
     The label (file/doc title) is placed just past the outer edge.
     NOTE: because the parent group is rotate(-90), "up" in SVG space
     is rightward on screen — the label renders correctly since SVG
     text is not affected by the parent rotation in terms of glyph
     direction (browsers keep text upright unless explicitly rotated). */
  const lx0 = Math.sin(startA) * rIn;
  const ly0 = Math.cos(startA) * rIn;
  const lx1 = Math.sin(startA) * (rOut + START_LINE_LEN);
  const ly1 = Math.cos(startA) * (rOut + START_LINE_LEN);

  c2.append('line')
    .attr('x1', lx0).attr('y1', ly0)
    .attr('x2', lx1).attr('y2', ly1)
    .attr('stroke','rgba(255,255,255,.65)')
    .attr('stroke-width', 1)
    .attr('stroke-linecap','round');



  /* Mode label (innermost ring or single file only) */
  if(safeIdx === 0){
    /* Place at 6 o'clock of the ring (opposite of start marker) so it
       doesn't overlap the title. Counter-rotate for readability.      */
    const mlx = Math.cos(startA + Math.PI) * (rIn - 8);
    const mly = Math.sin(startA + Math.PI) * (rIn - 8);
    c2.append('text')
      .attr('x', mlx).attr('y', mly)
      .attr('text-anchor','middle')
      .attr('transform', `rotate(90,${mlx},${mly})`)
      .style('font-family','DM Mono,monospace').style('font-size','6.5px')
      .style('fill','rgba(126,184,201,.28)').style('pointer-events','none')
      .text(wordMode ? 'word·mode' : 'para·mode');
  }
}











/* ═════════════════════════════════════
   C3 — WORD OCCURRENCE TRAIL
═════════════════════════════════════ */
function renderC3(g,data,rIn,rOut){
  const rBand=(rOut-rIn)*.44;
  const wCols={};
  const pal=['#9b7fc7','#7eb8c9','#c8a96e','#7ec99b','#c97e7e','#c9a07e','#7eb8a0','#b87ec9','#7e9bc9','#c9c07e'];
  data.topWords.forEach((d,i)=>{wCols[d.word]=pal[i%pal.length]});

  const c3=g.append('g');
  c3.append('circle').attr('r',(rIn+rOut)/2).attr('fill','none')
    .attr('stroke','rgba(155,127,199,.06)').attr('stroke-width',rOut-rIn);
  c3.append('circle').attr('r',rIn).attr('fill','none').attr('stroke','rgba(155,127,199,.14)').attr('stroke-width',.5);
  c3.append('circle').attr('r',rOut).attr('fill','none').attr('stroke','rgba(155,127,199,.2)').attr('stroke-width',.5);

  /* ── INNER RING WORD LABELS ────────────────────────────────────────
     Labels sit just inside the C3 inner boundary.
     Reading direction follows the circle geometry:

     RIGHT side (cos > 0): text reads top-left → bottom-right.
       The label's left end is nearest the centre → text-anchor:'start',
       no rotation needed — the natural reading direction is correct.

     LEFT side (cos < 0): text reads top-right → bottom-left,
       mirroring the right side so both sides "flow away" from 12 o'clock.
       We rotate the text 180° around its anchor point so the baseline
       still faces outward but glyphs run right-to-left as you go down
       the left arc — matching the requested left/top→right/bottom flow
       on the left half.

     TOP/BOTTOM (|cos| ≤ 0.1): centered, no rotation.
  ─────────────────────────────────────────────────────────────────── */
  data.topWords.slice(0,12).forEach((wd,i)=>{
    const a   = (i/12)*Math.PI*2 - Math.PI/2;
    const cos = Math.cos(a);
    const lx  = cos*(rIn-11);
    const ly  = Math.sin(a)*(rIn-11);

    /* Anchor and rotation depend on which side of the circle */
    let anchor = 'middle', rot = 0;
    if(cos >  0.1){ anchor='start';  rot=0;   }  /* right half */
    if(cos < -0.1){ anchor='end';    rot=180; }  /* left half — flip */

    c3.append('text').text(wd.word)
      .attr('x', lx).attr('y', ly)
      .attr('text-anchor', anchor)
      .attr('dominant-baseline','central')
      .attr('transform', rot ? `rotate(${rot},${lx},${ly})` : null)
      .style('font-size','7px')
      .style('fill', wCols[wd.word]||'rgba(255,255,255,.2)')
      .style('opacity',.44)
      .style('pointer-events','none');
  });

  const byB={};
  data.wordPositions.forEach(d=>{
    const key=Math.round((d.position*Math.PI*2-Math.PI/2)*170)/170;
    if(!byB[key])byB[key]=[];byB[key].push(d);
  });

  c3.selectAll('.word-dot').data(data.wordPositions).enter().append('circle')
    .attr('class','word-dot')
    .each(function(d){
      const a=d.position*Math.PI*2-Math.PI/2;
      const key=Math.round(a*170)/170;
      const stack=byB[key],si=stack.indexOf(d);
      const r=rIn+rBand*(si+.05)/Math.max(stack.length,1)+rBand*.1;
      d3.select(this).attr('cx',Math.cos(a)*r).attr('cy',Math.sin(a)*r);
    })
    .attr('r',d=>d.paraIsTitle?4.5:d.paraIsSection?3.5:2.8)
    .attr('fill',d=>wCols[d.word]||'rgba(155,127,199,.7)').attr('fill-opacity',.82)
    .attr('stroke',d=>wCols[d.word]||'rgba(155,127,199,.4)').attr('stroke-opacity',.3).attr('stroke-width',.8)
    .style('cursor','pointer')
    .on('mousemove',(e,d)=>{
      const cols=(data.collocateMap[d.word]||[]).slice(0,4).map(c=>c.word).join(', ')||'—';
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
function renderC4(g, data, rIn, rOut){
  if(!data.citations.length) return;

  const rMid = (rIn+rOut)/0.2;
  const c4   = g.append('g');

  /* Background glow ring */
  c4.append('circle').attr('r',rMid).attr('fill','none')
    .attr('stroke','rgba(201,126,126,.05)').attr('stroke-width',rOut-rIn);
  c4.append('circle').attr('r',rIn).attr('fill','none')
    .attr('stroke','rgba(201,126,126,.13)').attr('stroke-width',.5);
  c4.append('circle').attr('r',rOut).attr('fill','none')
    .attr('stroke','rgba(201,126,126,.2)').attr('stroke-width',.5);

  /* Dashed radial connector lines at each cited paragraph angle */
  const byPara = {};
  data.citations.forEach(c => {
    if(!byPara[c.paraIdx]) byPara[c.paraIdx]=[];
    byPara[c.paraIdx].push(c);
  });
  new Set(data.citations.map(c=>c.paraIdx)).forEach(pi => {
    const a = (pi/(data.paragraphs.length||1))*Math.PI*2 - Math.PI/2;
    c4.append('line')
      .attr('x1',Math.cos(a)*rIn).attr('y1',Math.sin(a)*rIn)
      .attr('x2',Math.cos(a)*(rOut+4)).attr('y2',Math.sin(a)*(rOut+4))
      .attr('stroke','rgba(201,126,126,.15)').attr('stroke-width',.5)
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
window.addEventListener('resize',()=>{if(CORPUS)renderChart(CORPUS)});

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
  pos('zoom-panel',18,18,null,null);
  pos('legend-panel',null,18,18,null);
  pos('stats-panel',null,null,18,18);
  pos('word-panel',Math.round(window.innerHeight/2-120),18,null,null);
  const cp=document.getElementById('ctx-panel');
  cp.style.bottom='18px'; cp.style.left=Math.round(window.innerWidth/2-200)+'px';

  // Demo
setTimeout(()=>{
    FILES=[{name:'demo_memory.txt',text:DEMO,size:DEMO.length}];
    renderFilesList();updateCorpusStats();showConfigBlock();growBody('body-a');
  },300);
});

const DEMO=`The Architecture of Memory

In the late nineteenth century, scholars began to question the nature of consciousness and its relationship to language. The mind, they argued, was not a passive receiver of experience but an active constructor of meaning (James, 1890).

When we consider how memories are formed, we must first acknowledge the role of attention. Without directed focus, experience passes through us like water through open hands. The stream of consciousness that William James famously described was not a metaphor but a phenomenological observation of great depth and complexity.

Chapter One: Language and Encoding

Language shapes memory in profound ways. The words we have available to describe an experience determine, in part, how that experience is encoded and later retrieved. This linguistic relativity extends beyond simple vocabulary into the deep structures of grammar (Whorf, 1956).

The relationship between narrative and memory has occupied philosophers and psychologists alike. We do not simply remember events; we reconstruct them, each time adding new layers of interpretation and meaning. The remembered past is always, in some sense, a work of fiction that the mind assembles from fragments.

Chapter Two: Neural Substrates

Episodic memory, as defined by Tulving, stands in contrast to semantic memory. Where the latter stores general knowledge about the world, the former preserves the when and where of personal experience. This distinction has proven enormously fruitful in neuropsychological research (Tulving, 1972).

The hippocampus plays a central role in the consolidation of new memories. Damage to this structure, as famously documented in the case of patient H.M., results in an inability to form new long-term memories while leaving older memories largely intact. The role of the hippocampus in binding together the elements of an experience into a coherent memory trace remains a central question in cognitive neuroscience.

Forgetting, far from being a failure of the system, serves important adaptive functions. The selective retention of significant experiences over trivial ones allows the mind to operate efficiently in a complex world. Memory is not a recording device but a dynamic, reconstructive process shaped by present goals and contexts.

Chapter Three: Memory and Trauma

Trauma disrupts normal memory processes in distinctive ways. Intrusive memories, flashbacks, and dissociation represent failures of normal integration. The body, Bessel van der Kolk has argued, keeps the score of these unprocessed experiences (van der Kolk, 2014). The treatment of traumatic memory requires understanding both the psychological and neurobiological dimensions of the disorder.

Social memory extends beyond the individual. Communities construct shared narratives that bind members together and define collective identity. These narratives are transmitted across generations through ritual, story, and material culture. The study of collective memory reveals how the past is always shaped by present concerns and power relations (Halbwachs, 1925).

The future of memory research lies at the intersection of neuroscience, psychology, and philosophy. New imaging technologies allow us to observe the brain in the act of remembering, bringing us closer to understanding one of the most fundamental aspects of human existence. The challenge is to integrate findings across multiple levels of analysis, from the molecular to the social.`;


