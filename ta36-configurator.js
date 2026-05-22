const statusEl = document.getElementById('status');
const selectorsEl = document.getElementById('selectors');
const resultsEl = document.getElementById('results');
const noResultsEl = document.getElementById('no-results');
const resetBtn = document.getElementById('reset-filters');
const configCodeDisplayEl = document.getElementById('config-code-display');
const attrOrderEl = document.getElementById('attribute-order-display');
const comparisonEl = document.getElementById('comparison-display');

let configJson = null;
let masterlistJson = null;
let products = [];
let currentFilters = {};

function normalizeKey(name){
  if(!name) return '';
  return String(name).toLowerCase().replace(/\uFFFD/g,'').replace(/[^a-z0-9]+/g,'').trim();
}

function findMasterlistAttribute(name){
  if(!masterlistJson || !masterlistJson.attributes) return null;
  const norm = normalizeKey(name);
  return masterlistJson.attributes.find(attr => {
    return [
      attr.attribute_name_english,
      attr.attribute_name_german,
      attr.attribute_name_italian,
      attr.attribute_name_french,
      attr.attribute_id
    ].some(v => normalizeKey(v) === norm);
  }) || null;
}

function masterlistValuesForAttribute(name){
  const attr = findMasterlistAttribute(name);
  if(!attr || !Array.isArray(attr.values)) return null;
  return attr.values.map(v => ({
    key: v.value_id || v.value_name_english || v.value_name_german || v.value_name_italian || v.value_name_french || '',
    label: v.value_name_english || v.value_name_german || v.value_name_italian || v.value_name_french || v.value_id || ''
  }));
}

async function loadMasterlist(){
  try{
    const resp = await fetch('./Masterlist.json');
    if(!resp.ok) throw new Error('Masterlist not found');
    masterlistJson = await resp.json();
    statusEl.textContent = 'Masterlist.json loaded.';
    renderSelectorsFromConfig();
  }catch(e){
    console.warn('Masterlist.json not loaded:', e);
  }
}

function getProductCell(p, norm){
  if(!p) return '';
  for(const k in p){
    try{ if(normalizeKey(k) === norm) return String(p[k]||'').trim(); }catch(e){}
  }
  return '';
}

async function loadConfiguration(){
  try{
    const resp = await fetch('./Configuration.json');
    if(!resp.ok) throw new Error('Config not found');
    configJson = await resp.json();
    statusEl.textContent = 'Configuration.json loaded.';
    renderSelectorsFromConfig();
  }catch(e){
    statusEl.textContent = 'Configuration.json not found, please load CSV.';
    console.warn(e);
  }
}

function renderSelectorsFromConfig(){
  if(!configJson) return;
  selectorsEl.innerHTML = '';
  // use structure order to present selectors
  const struct = configJson.structure || [];
  // determine ordered attribute list from structure (positions ascending)
  const attrs = [];
  struct.forEach(s=>{ if(s && s.attribute) attrs.push(s.attribute); });

  // fallback to keys of attributes
  if(attrs.length===0 && configJson.attributes){
    attrs.push(...Object.keys(configJson.attributes));
  }

  attrs.forEach(attr=>{
    const div = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = attr;
    const select = document.createElement('select');
    const norm = normalizeKey(attr);
    select.dataset.attr = attr;
    select.dataset.attrNorm = norm;
    const emptyOpt = document.createElement('option'); emptyOpt.value=''; emptyOpt.textContent='--'; select.appendChild(emptyOpt);

    const masterAttr = findMasterlistAttribute(attr);
    if(masterAttr && masterAttr.attribute_id){
      const titleText = `attribute_id: ${masterAttr.attribute_id}`;
      div.title = titleText;
      label.title = titleText;
      select.title = titleText;
      const hint = document.createElement('span');
      hint.className = 'attribute-id-hint';
      hint.textContent = masterAttr.attribute_id;
      label.appendChild(document.createTextNode(' '));
      label.appendChild(hint);
    }

    let vals = (configJson.attributes && configJson.attributes[attr]) || [];
    const masterVals = masterlistValuesForAttribute(attr);
    if(masterVals && masterVals.length){
      vals = masterVals;
    }

    vals.forEach(v=>{
      const o = document.createElement('option');
      o.value = v.key || v.label || JSON.stringify(v);
      o.dataset.label = v.label || v.key || o.value;
      o.textContent = v.label || v.key || o.value;
      select.appendChild(o);
    });
    select.addEventListener('change', onFilterChange);
    div.appendChild(label); div.appendChild(select);
    selectorsEl.appendChild(div);
  });
  renderAttributeOrder();
}

function renderAttributeOrder(){
  if(!attrOrderEl) return;
  attrOrderEl.innerHTML = '';
  if(!configJson) return;
  const struct = (configJson.structure || []).slice();
  const rows = [];
  if(struct.length){
    struct.sort((a,b)=> (a.position||0)-(b.position||0));
    struct.forEach(s=>{
      // Skip Rated voltage entirely in the attribute-order display
      if(s.attribute && String(s.attribute).trim().toLowerCase() === 'rated voltage') return;
      const isEncoded = (s.encoded === undefined) || (s.encoded === true);
      const pos = isEncoded ? (s.position || '') : '-';
      const attr = s.attribute || '';
      const sel = currentFilters[normalizeKey(attr)];
      const key = sel ? sel.key : '';
      const value = sel ? sel.label : '';
      rows.push({pos, attr, key, value});
    });
  } else {
    const keys = Object.keys(configJson.attributes || {});
    keys.forEach((k,i)=>{
      const sel = currentFilters[normalizeKey(k)];
      rows.push({pos: i+1, attr: k, selText: sel ? (sel.key + (sel.label ? (' – ' + sel.label) : '')) : ''});
    });
  }
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const thr = document.createElement('tr');
  ['Pos','Attribute','Selection'].forEach(h=>{ const th=document.createElement('th'); th.textContent = h; thr.appendChild(th); });
  thead.appendChild(thr); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    [r.pos, r.attr, r.selText || ''].forEach(v=>{ const td=document.createElement('td'); td.textContent = v; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  attrOrderEl.appendChild(table);
}

function onFilterChange(e){
  const s = e.target;
  const attr = s.dataset.attr;
  const norm = s.dataset.attrNorm || normalizeKey(attr);
  const val = s.value;
  const label = s.selectedOptions[0] ? s.selectedOptions[0].dataset.label : '';
  if(val) currentFilters[norm] = {key:val,label:label, attr: attr}; else delete currentFilters[norm];
  filterProductsAndRender();
  renderConfigCode();
}

function renderConfigCode(){
  if(!configJson) { configCodeDisplayEl.textContent = ''; return; }
  const struct = (configJson.structure || []).slice();
  struct.sort((a,b)=> (a.position||0)-(b.position||0));

  // Only encoded parts go into the code
  const encodedStruct = struct.filter(s => s && (s.encoded === undefined || s.encoded === true));
  const mainEntries = encodedStruct.filter(s => !(s.attribute && String(s.attribute).toLowerCase() === 'variant'));
  const variantEntries = encodedStruct.filter(s => s.attribute && String(s.attribute).toLowerCase() === 'variant');

  function buildBlocks(entries){
    const blocks = [];
    for(const s of entries){
      if(!s.attribute) continue;
      const selByNorm = currentFilters[normalizeKey(s.attribute)];
      const part = selByNorm && selByNorm.key ? String(selByNorm.key) : null;
      const len = s.length || (part ? part.length : 1);
      const position = s.position || null;
      if(part){
        const chars = part.split('');
        for(let i=0;i<len;i++) blocks.push({char: chars[i] || ' ', filled: true, position});
      } else {
        for(let i=0;i<len;i++) blocks.push({char: '✕', filled: false, position});
      }
    }
    return blocks;
  }

  const mainBlocks = buildBlocks(mainEntries);
  const variantBlocks = buildBlocks(variantEntries);

  // Pattern-driven rendering: render literals and [main]/[variant]
  const pattern = (configJson.orderCode && configJson.orderCode.pattern) ? configJson.orderCode.pattern : 'TA36-[main]-[variant]';
  const tokens = [];
  const re = /(\[[^\]]+\])|./g;
  let m;
  while((m = re.exec(pattern)) !== null) tokens.push(m[0]);

  configCodeDisplayEl.innerHTML = '';
  const codeRow = document.createElement('div');
  codeRow.className = 'code-row';
  const posRow = document.createElement('div');
  posRow.className = 'code-position-row';
  let lastPosition = null;
  let currentGroupPosChars = [];
  let currentGroupPos = null;

  function flushPosGroup(){
    if(currentGroupPosChars.length === 0) return;
    
    // Create wrapper for position group (for Pos 14, 15, 17)
    if([14, 15, 17].includes(currentGroupPos)){
      const posWrapper = document.createElement('div');
      posWrapper.className = 'code-position-group code-position-group-special';
      currentGroupPosChars.forEach((item, idx) => {
        const posEl = document.createElement('div');
        posEl.className = 'code-position';
        if(idx === 0){
          posEl.textContent = String(currentGroupPos);
        } else {
          posEl.textContent = '\u00A0';
        }
        posWrapper.appendChild(posEl);
      });
      posRow.appendChild(posWrapper);
    } else {
      // Regular positions - add individually
      currentGroupPosChars.forEach((item, idx) => {
        const posEl = document.createElement('div');
        posEl.className = 'code-position';
        if(idx === 0 && currentGroupPos !== null){
          posEl.textContent = String(currentGroupPos);
        } else {
          posEl.textContent = '\u00A0';
        }
        posRow.appendChild(posEl);
      });
    }

    currentGroupPosChars = [];
    currentGroupPos = null;
  }

  function appendCharElement(char, filled, position = null){
    // Add char to codeRow individually
    const charEl = document.createElement('div');
    charEl.className = 'code-char ' + (filled ? 'selected' : 'empty');
    charEl.textContent = char;
    codeRow.appendChild(charEl);

    // Track position for grouping in position row
    if(position !== currentGroupPos && currentGroupPosChars.length > 0){
      flushPosGroup();
    }
    
    currentGroupPos = position;
    currentGroupPosChars.push({});
  }

  const assembledParts = [];
  for(let ti=0; ti<tokens.length; ti++){
    const t = tokens[ti];
    if(t.startsWith('[') && t.endsWith(']')){
      const name = t.slice(1,-1).toLowerCase();
      if(name === 'main'){
        mainBlocks.forEach(b=>{
          appendCharElement(b.char, b.filled, b.position);
        });
        assembledParts.push(mainBlocks.map(b=>b.char).join(''));
        const next = tokens[ti+1];
        if(next && next.toLowerCase() === '[variant]'){
          appendCharElement('-', true, null);
          assembledParts.push('-');
        }
      } else if(name === 'variant'){
        variantBlocks.forEach(b=>{
          appendCharElement(b.char, b.filled, b.position);
        });
        assembledParts.push(variantBlocks.map(b=>b.char).join(''));
      } else {
        for(const ch of t.split('')){
          appendCharElement(ch, true, null);
          assembledParts.push(ch);
        }
      }
    } else {
      appendCharElement(t, true, null);
      assembledParts.push(t);
    }
  }
  flushPosGroup(); // Flush any remaining group

  configCodeDisplayEl.appendChild(codeRow);
  configCodeDisplayEl.appendChild(posRow);
  const assembled = assembledParts.join('');
  // Ensure there is a hyphen between main and variant if variant exists but pattern lacked explicit '-'
  if(variantBlocks.length && !pattern.includes(']-') && !pattern.includes('-[')){
    // naive insertion: if assembled contains main followed immediately by variant, insert '-'
    // but to avoid complexity, only act if pattern didn't include a literal '-'
  }

  // Compare with example and render attribute order
  compareWithExample(assembled);
  renderAttributeOrder();
}

function filterProductsAndRender(){
  resultsEl.innerHTML = '';
  if(!products.length){ noResultsEl.classList.add('hidden'); return; }
  const filtered = products.filter(p=>{
    for(const norm in currentFilters){
      const sel = currentFilters[norm];
      const cell = getProductCell(p, norm) || String(p[sel && sel.attr] || '').trim();
      if(!cell) return false;
      const tokens = cell.split(/\s+/).filter(Boolean);
      if(sel.key && tokens.includes(sel.key)) continue;
      if(sel.label && tokens.includes(sel.label)) continue;
      return false;
    }
    return true;
  });
  if(filtered.length===0){ noResultsEl.classList.remove('hidden'); return; }
  noResultsEl.classList.add('hidden');
  // render table
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  const cols = Object.keys(filtered[0]);
  cols.forEach(c=>{ const th=document.createElement('th'); th.textContent=c; tr.appendChild(th); });
  thead.appendChild(tr); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  filtered.forEach(row=>{
    const tr = document.createElement('tr');
    cols.forEach(c=>{ const td=document.createElement('td'); td.textContent = row[c]||''; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  resultsEl.appendChild(table);
}

function parseCSVText(text){
  const res = Papa.parse(text, {header:true, delimiter:';', skipEmptyLines:true});
  products = res.data.map(r=>{
    const cleaned = {};
    for(const k in r){
      const key = k ? String(k).replace(/\uFFFD/g,'').trim() : k;
      cleaned[key] = r[k] ? String(r[k]).trim() : '';
    }
    return cleaned;
  });
  statusEl.textContent = 'CSV loaded.';
  if(!configJson){
    deriveConfigFromCSV();
  }
  renderSelectorsFromConfig();
  renderAttributeOrder();
  filterProductsAndRender();
}

function deriveConfigFromCSV(){
  if(!products.length) return;
  const headers = Object.keys(products[0]);
  const attributes = {};
  headers.forEach(h=>{
    if(!h) return;
    const masterVals = masterlistValuesForAttribute(h);
    if(masterVals && masterVals.length){
      attributes[h] = masterVals;
      return;
    }
    const s = new Set();
    products.forEach(p=>{ if(p[h]) s.add(p[h]); });
    attributes[h] = Array.from(s).map(v=>{
      const parts = String(v).split(/\s+/);
      if(parts.length>1){ return {key:parts[0], label: parts.slice(1).join(' ')}; }
      return {key:v, label:v};
    });
  });
  configJson = { product:'TA36', structure: [], attributes: {} };
  let pos = 1;
  for(const h of headers){ configJson.structure.push({position:pos, attribute:h, length:1, encoded:true}); pos++; }
  configJson.attributes = attributes;
}

function compareWithExample(generated){
  if(!comparisonEl) return;
  const example = 'TA36-RS24FQ200BGHB150000-000';
  comparisonEl.innerHTML = '';
  const pGen = document.createElement('div'); pGen.textContent = 'Generated code: ' + generated;
  const pEx = document.createElement('div'); pEx.textContent = 'Example code:    ' + example;
  const res = document.createElement('div');
  if(generated === example){ res.textContent = 'Match: YES'; res.style.color='green'; }
  else { res.textContent = 'Match: NO'; res.style.color='red'; }
  comparisonEl.appendChild(pGen); comparisonEl.appendChild(pEx); comparisonEl.appendChild(res);
}

// Load default Configuration.json and Masterlist.json on start
loadConfiguration();
loadMasterlist();

// Allow user to upload CSV manually
const productsFileInput = document.getElementById('products-file');
productsFileInput.addEventListener('change', e=>{
  const f = e.target.files[0];
  if(!f) return;
  statusEl.textContent = 'Reading CSV...';
  const reader = new FileReader();
  reader.onload = ev=> parseCSVText(ev.target.result);
  reader.readAsText(f, 'utf-8');
});

resetBtn.addEventListener('click', () => {
  currentFilters = {};
  const selects = selectorsEl.querySelectorAll('select');
  selects.forEach(sel => { sel.value = ''; });
  filterProductsAndRender();
  renderConfigCode();
  renderAttributeOrder();
});

// If file present in same folder, try to fetch Opened_articles.csv automatically
(async function tryAutoLoadCSV(){
  try{
    const resp = await fetch('./Opened_articles.csv');
    if(resp.ok){
      const txt = await resp.text();
      parseCSVText(txt);
    }
  }catch(e){ /* ignore */ }
})();
