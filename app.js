// ============================================================
// MESA DE RPG — estado e persistência (Supabase)
// ============================================================
// O estado agora é compartilhado entre todos os jogadores através
// da tabela `rpg_state` (uma única linha, id=1) no Supabase.
function uid(){ return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }

function estadoVazio(){
  return {
    maps: [],          // {id, name, imageData, tokens:[{id, refId, refType, nome, tipo, iniciais, x, y, hpAtual, hpMax}]}
    activeMapId: null,
    personagens: [],   // jogadores
    npcs: [],
    itens: [],
    missoes: [],
    eventos: [],   // eventos mundiais
    aliados: [],   // aliados dos heróis
    bosses: [],    // bosses e inimigos especiais
    creditos: { imagem: '', texto: '' } // créditos da mesa — só o ADM edita
  };
}

// Converte a linha do banco (colunas separadas) para o formato de `state` usado pelo app
function linhaParaState(row){
  if(!row) return estadoVazio();
  return {
    maps: row.maps || [],
    activeMapId: row.active_map_id || null,
    personagens: row.personagens || [],
    npcs: row.npcs || [],
    itens: row.itens || [],
    missoes: row.missoes || [],
    eventos: row.eventos || [],
    aliados: row.aliados || [],
    bosses: row.bosses || [],
    creditos: row.creditos || { imagem: '', texto: '' }
  };
}

// Converte `state` para o formato de colunas da tabela `rpg_state`
function stateParaLinha(s){
  return {
    id: 1,
    maps: s.maps,
    active_map_id: s.activeMapId,
    personagens: s.personagens,
    npcs: s.npcs,
    itens: s.itens,
    missoes: s.missoes,
    eventos: s.eventos,
    aliados: s.aliados,
    bosses: s.bosses,
    creditos: s.creditos,
    updated_at: new Date().toISOString()
  };
}

async function loadState(){
  const { data, error } = await sb.from('rpg_state').select('*').eq('id', 1).maybeSingle();
  if(error) throw error; // erro real de conexão/permissão: o bootstrap deve travar e avisar, NUNCA seguir com dados vazios
  console.log('[diagnóstico] linha recebida do Supabase:', data);
  if(data) return linhaParaState(data);
  // Só chega aqui se a consulta funcionou e realmente não existe nenhuma linha ainda (mesa nova de verdade)
  console.warn('[diagnóstico] nenhuma linha encontrada com id=1 — mesa será tratada como nova/vazia.');
  return estadoVazio();
}

let state = estadoVazio(); // populado de fato pelo bootstrap, antes de qualquer render

// Identificador único desta aba/sessão de navegador — usado para que o
// Realtime saiba diferenciar "minha própria escrita" de "escrita de outro jogador"
const CLIENT_ID = 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

// Trava de segurança: nenhum save é permitido até o estado real ter sido
// carregado com sucesso do Supabase. Isso evita que qualquer bug ou
// condição de corrida sobrescreva dados reais com uma mesa vazia.
let _stateCarregadoComSucesso = false;

// Evita salvar simultaneamente o mesmo estado várias vezes em sequência rápida
let _saveStateTimer = null;
let _savingState = false;

function saveState(){
  if(!_stateCarregadoComSucesso){
    console.warn('saveState() ignorado: o estado ainda não foi carregado do Supabase com sucesso.');
    return;
  }
  // Debounce leve: agrupa saves disparados em sequência (ex: arrastar token)
  clearTimeout(_saveStateTimer);
  _saveStateTimer = setTimeout(_flushSaveState, 150);
}

async function _flushSaveState(){
  if(_savingState){ _saveStateTimer = setTimeout(_flushSaveState, 150); return; }
  _savingState = true;
  try{
    const linha = stateParaLinha(state);
    linha.last_writer = CLIENT_ID;
    const { error } = await sb.from('rpg_state').upsert(linha, { onConflict: 'id' });
    if(error) throw error;
  }catch(e){
    console.warn('Falha ao salvar no Supabase', e);
    alert('Não foi possível salvar suas alterações na mesa compartilhada. Verifique sua conexão.');
  }finally{
    _savingState = false;
  }
}

function getActiveMap(){
  return state.maps.find(m => m.id === state.activeMapId) || null;
}

// ============================================================
// NAVEGAÇÃO ENTRE VIEWS
// ============================================================
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
const topbarTitle = document.getElementById('topbarTitle');
const topbarSub = document.getElementById('topbarSub');

const VIEW_META = {
  mapa: {title:'Mapa da Aventura', sub:'Clique no mapa para adicionar um token'},
  personagens: {title:'Heróis & Aliados', sub:'Fichas dos jogadores e seus aliados'},
  npcs: {title:'NPCs', sub:'Personagens não jogáveis'},
  bosses: {title:'Bosses', sub:'Inimigos especiais e chefões da campanha'},
  itens: {title:'Itens', sub:'Catálogo de itens e equipamentos'},
  missoes: {title:'Missões', sub:'Objetivos da aventura'},
  eventos: {title:'Eventos Mundiais', sub:'Crônica dos acontecimentos do mundo'},
  anotacoes: {title:'Minhas Anotações', sub:'Notas pessoais — visíveis apenas por você'},
  creditos: {title:'Créditos', sub:'Quem deu vida a esta mesa de RPG'}
};

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const v = btn.dataset.view;
    views.forEach(view => view.classList.remove('active'));
    const viewEl = document.getElementById('view-' + v);
    if(viewEl) viewEl.classList.add('active');
    if(VIEW_META[v]){
      topbarTitle.textContent = VIEW_META[v].title;
      topbarSub.textContent = VIEW_META[v].sub;
    }
    if(v === 'adm'      && typeof renderAdmPanel === 'function') renderAdmPanel();
    if(v === 'anotacoes' && typeof initNotas      === 'function') initNotas();
    if(v === 'creditos' && typeof renderCreditos  === 'function') renderCreditos();
  });
});

// ============================================================
// MODAIS — abrir/fechar genérico
// ============================================================
function openModal(id){ document.getElementById(id).classList.add('active'); }
function closeModal(id){ document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', (e) => {
    const overlay = e.target.closest('.modal-overlay');
    overlay.classList.remove('active');
  });
});
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', (e) => { if(e.target === ov) ov.classList.remove('active'); });
});

// ============================================================
// MAPA
// ============================================================
const mapWrap = document.getElementById('mapWrap');
const mapEmpty = document.getElementById('mapEmpty');
const mapFileInput = document.getElementById('mapFileInput');
const mapSelector = document.getElementById('mapSelector');
const mapTokenList = document.getElementById('mapTokenList');

let selectedTokenId = null;
let dragState = null; // {tokenId, mapEl}

function renderMapSelector(){
  mapSelector.innerHTML = '';
  if(state.maps.length === 0){
    const opt = document.createElement('option');
    opt.textContent = 'Nenhum mapa criado';
    opt.value = '';
    mapSelector.appendChild(opt);
    return;
  }
  state.maps.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    if(m.id === state.activeMapId) opt.selected = true;
    mapSelector.appendChild(opt);
  });
}

mapSelector.addEventListener('change', () => {
  state.activeMapId = mapSelector.value;
  saveState();
  renderMap();
});

document.getElementById('btnNewMap').addEventListener('click', () => {
  if(typeof isAdm==='function' && !isAdm()){ alert('Apenas o Mestre pode criar mapas.'); return; }
  const name = prompt('Nome do novo mapa:', 'Mapa sem título');
  if(name === null) return;
  const m = { id: uid(), name: name || 'Mapa sem título', imageData: null, tokens: [] };
  state.maps.push(m);
  state.activeMapId = m.id;
  saveState();
  renderMapSelector();
  renderMap();
});

document.getElementById('btnDeleteMap').addEventListener('click', () => {
  if(typeof isAdm==='function' && !isAdm()){ alert('Apenas o Mestre pode excluir mapas.'); return; }
  const m = getActiveMap();
  if(!m) return;
  if(!confirm(`Excluir o mapa "${m.name}"? Isso também remove todos os tokens nele.`)) return;
  state.maps = state.maps.filter(x => x.id !== m.id);
  state.activeMapId = state.maps.length ? state.maps[0].id : null;
  saveState();
  renderMapSelector();
  renderMap();
});

document.getElementById('btnUploadMap').addEventListener('click', () => {
  if(typeof isAdm==='function' && !isAdm()){ alert('Apenas o Mestre pode enviar mapas.'); return; }
  if(!getActiveMap()){
    const name = prompt('Dê um nome para este mapa:', 'Mapa sem título');
    if(name === null) return;
    const m = { id: uid(), name: name || 'Mapa sem título', imageData: null, tokens: [] };
    state.maps.push(m);
    state.activeMapId = m.id;
    renderMapSelector();
  }
  mapFileInput.click();
});

mapFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;
  mapFileInput.value = '';
  const m = getActiveMap();
  if(!m) return;
  try{
    mapWrap.style.opacity = '.5';
    const url = await uploadImagemParaStorage(file, 'mapas');
    m.imageData = url;
    saveState();
    renderMap();
  }catch(err){
    alert('Não foi possível enviar a imagem do mapa. Tente novamente.');
  }finally{
    mapWrap.style.opacity = '';
  }
});

document.getElementById('btnAddToken').addEventListener('click', () => {
  if(typeof isAdm==='function' && !isAdm()){ alert('Apenas o Mestre pode adicionar tokens.'); return; }
  const m = getActiveMap();
  if(!m || !m.imageData){ alert('Carregue uma imagem de mapa primeiro.'); return; }
  openTokenModal(null, {x: 50, y: 50});
});

function renderMap(){
  const m = getActiveMap();
  mapWrap.innerHTML = '';
  if(!m || !m.imageData){
    mapWrap.appendChild(mapEmpty);
    mapTokenList.innerHTML = '';
    return;
  }
  const canvas = document.createElement('div');
  canvas.className = 'map-canvas';
  canvas.id = 'mapCanvas';

  const img = document.createElement('img');
  img.src = m.imageData;
  img.draggable = false;
  canvas.appendChild(img);

  m.tokens.forEach(tok => {
    canvas.appendChild(buildTokenEl(tok));
  });

  canvas.addEventListener('click', (e) => {
    if(e.target !== canvas && e.target !== img) return; // só clique vazio cria token
    if(typeof isAdm === 'function' && !isAdm()) return; // apenas ADM cria tokens
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    openTokenModal(null, {x, y});
  });

  mapWrap.appendChild(canvas);
  renderMapTokenList();
}

function buildTokenEl(tok){
  const el = document.createElement('div');
  el.className = 'token token-type-' + tok.tipo;
  el.style.left = tok.x + 'px';
  el.style.top = tok.y + 'px';
  el.dataset.id = tok.id;
  el.textContent = (tok.iniciais || tok.nome.slice(0,2)).toUpperCase();
  if(tok.id === selectedTokenId) el.classList.add('selected');

  if(tok.refType && tok.refId){
    const list = tok.refType === 'personagem' ? state.personagens : state.npcs;
    const ref = list.find(x => x.id === tok.refId);
    if(ref && ref.imagem){
      const avatar = document.createElement('img');
      avatar.src = ref.imagem;
      avatar.alt = tok.nome;
      el.appendChild(avatar);
    }
  }

  const label = document.createElement('div');
  label.className = 'token-label';
  label.textContent = tok.nome;
  el.appendChild(label);

  if(tok.hpMax){
    const hpWrap = document.createElement('div');
    hpWrap.className = 'token-hp';
    const hpFill = document.createElement('div');
    hpFill.className = 'token-hp-fill';
    const pct = Math.max(0, Math.min(100, (tok.hpAtual / tok.hpMax) * 100));
    hpFill.style.width = pct + '%';
    hpWrap.appendChild(hpFill);
    el.appendChild(hpWrap);
  }

  // drag
  el.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    // Apenas ADM pode mover tokens no mapa
    if(typeof isAdm === 'function' && !isAdm()) return;
    selectedTokenId = tok.id;
    const canvas = document.getElementById('mapCanvas');
    const canvasRect = canvas.getBoundingClientRect();
    dragState = { tokenId: tok.id, canvasRect, moved:false };
    document.querySelectorAll('.token').forEach(t => t.classList.remove('selected'));
    el.classList.add('selected');
  });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if(dragState && dragState.moved) return; // foi drag, não abre modal
    if(typeof isAdm === 'function' && !isAdm()) return; // apenas ADM edita tokens
    openTokenModal(tok.id);
  });

  // touch support
  el.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    selectedTokenId = tok.id;
    const canvas = document.getElementById('mapCanvas');
    const canvasRect = canvas.getBoundingClientRect();
    dragState = { tokenId: tok.id, canvasRect, moved:false };
  }, {passive:true});

  return el;
}

document.addEventListener('mousemove', (e) => {
  if(!dragState) return;
  dragState.moved = true;
  const m = getActiveMap();
  if(!m) return;
  const tok = m.tokens.find(t => t.id === dragState.tokenId);
  if(!tok) return;
  let x = e.clientX - dragState.canvasRect.left;
  let y = e.clientY - dragState.canvasRect.top;
  x = Math.max(0, Math.min(dragState.canvasRect.width, x));
  y = Math.max(0, Math.min(dragState.canvasRect.height, y));
  tok.x = x; tok.y = y;
  const el = document.querySelector(`.token[data-id="${tok.id}"]`);
  if(el){ el.style.left = x + 'px'; el.style.top = y + 'px'; }
});

document.addEventListener('mouseup', () => {
  if(dragState && dragState.moved){
    saveState();
    renderMapTokenList();
  }
  dragState = null;
});

document.addEventListener('touchmove', (e) => {
  if(!dragState) return;
  const touch = e.touches[0];
  const m = getActiveMap();
  if(!m) return;
  const tok = m.tokens.find(t => t.id === dragState.tokenId);
  if(!tok) return;
  dragState.moved = true;
  let x = touch.clientX - dragState.canvasRect.left;
  let y = touch.clientY - dragState.canvasRect.top;
  x = Math.max(0, Math.min(dragState.canvasRect.width, x));
  y = Math.max(0, Math.min(dragState.canvasRect.height, y));
  tok.x = x; tok.y = y;
  const el = document.querySelector(`.token[data-id="${tok.id}"]`);
  if(el){ el.style.left = x + 'px'; el.style.top = y + 'px'; }
}, {passive:true});

document.addEventListener('touchend', () => {
  if(dragState && dragState.moved){ saveState(); renderMapTokenList(); }
  dragState = null;
});

function renderMapTokenList(){
  const m = getActiveMap();
  mapTokenList.innerHTML = '';
  if(!m) return;
  m.tokens.forEach(tok => {
    const card = document.createElement('div');
    card.className = 'mini-card';
    const dotColor = tok.tipo === 'jogador' ? 'var(--poison)' : tok.tipo === 'npc' ? '#5b8def' : 'var(--blood)';
    card.innerHTML = `
      <div class="mini-dot" style="background:${dotColor}"></div>
      <div style="flex:1;">
        <div class="name">${escapeHtml(tok.nome)}</div>
        <div class="meta">${tok.tipo.toUpperCase()} ${tok.hpMax ? `· ${tok.hpAtual}/${tok.hpMax} HP` : ''}</div>
      </div>
    `;
    if(typeof isAdm==='function' && isAdm()){
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => openTokenModal(tok.id));
    }
    mapTokenList.appendChild(card);
  });
}

// ---- Modal de Token ----
function populateVincularSelect(){
  const sel = document.getElementById('tVincular');
  sel.innerHTML = '<option value="">— Nenhuma (token livre) —</option>';
  const addGroup = (list, tipo, label) => {
    if(list.length === 0) return;
    const group = document.createElement('optgroup');
    group.label = label;
    list.forEach(p => {
      const opt = document.createElement('option');
      opt.value = tipo + ':' + p.id;
      opt.textContent = p.nome;
      group.appendChild(opt);
    });
    sel.appendChild(group);
  };
  addGroup(state.personagens, 'personagem', 'Heróis');
  addGroup(state.npcs, 'npc', 'NPCs');
}

let editingTokenId = null;

function openTokenModal(tokenId, newPos){
  populateVincularSelect();
  editingTokenId = tokenId;
  const m = getActiveMap();
  document.getElementById('btnRemoverToken').style.display = tokenId ? 'inline-flex' : 'none';

  if(tokenId){
    const tok = m.tokens.find(t => t.id === tokenId);
    document.getElementById('tVincular').value = tok.refId ? (tok.refType + ':' + tok.refId) : '';
    document.getElementById('tNome').value = tok.nome;
    document.getElementById('tTipo').value = tok.tipo;
    document.getElementById('tIniciais').value = tok.iniciais || '';
    document.getElementById('tHpAtual').value = tok.hpAtual;
    document.getElementById('tHpMax').value = tok.hpMax;
    document.getElementById('tId').value = tok.id;
    document.querySelector('#modalToken h2').textContent = 'Editar token';
  }else{
    document.getElementById('tVincular').value = '';
    document.getElementById('tNome').value = '';
    document.getElementById('tTipo').value = 'jogador';
    document.getElementById('tIniciais').value = '';
    document.getElementById('tHpAtual').value = 100;
    document.getElementById('tHpMax').value = 100;
    document.getElementById('tId').value = '';
    document.querySelector('#modalToken h2').textContent = 'Novo token';
    window.__pendingTokenPos = newPos;
  }
  openModal('modalToken');
}

document.getElementById('tVincular').addEventListener('change', (e) => {
  const val = e.target.value;
  if(!val) return;
  const [tipo, id] = val.split(':');
  const list = tipo === 'personagem' ? state.personagens : state.npcs;
  const p = list.find(x => x.id === id);
  if(!p) return;
  document.getElementById('tNome').value = p.nome;
  document.getElementById('tTipo').value = tipo === 'personagem' ? 'jogador' : 'npc';
  document.getElementById('tIniciais').value = p.nome.slice(0,2).toUpperCase();
  document.getElementById('tHpAtual').value = p.hpAtual ?? 100;
  document.getElementById('tHpMax').value = p.hpMax ?? 100;
});

document.getElementById('btnSalvarToken').addEventListener('click', () => {
  const m = getActiveMap();
  if(!m) return;
  const nome = document.getElementById('tNome').value.trim();
  if(!nome){ alert('Dê um nome ao token.'); return; }
  const vincular = document.getElementById('tVincular').value;
  let refType = null, refId = null;
  if(vincular){ [refType, refId] = vincular.split(':'); }

  const data = {
    nome,
    tipo: document.getElementById('tTipo').value,
    iniciais: document.getElementById('tIniciais').value.trim() || nome.slice(0,2).toUpperCase(),
    hpAtual: Number(document.getElementById('tHpAtual').value) || 0,
    hpMax: Number(document.getElementById('tHpMax').value) || 0,
    refType, refId
  };

  if(editingTokenId){
    const tok = m.tokens.find(t => t.id === editingTokenId);
    Object.assign(tok, data);
  }else{
    const pos = window.__pendingTokenPos || {x:50,y:50};
    m.tokens.push({ id: uid(), x: pos.x, y: pos.y, ...data });
  }
  saveState();
  closeModal('modalToken');
  renderMap();
});

document.getElementById('btnRemoverToken').addEventListener('click', () => {
  const m = getActiveMap();
  if(!m || !editingTokenId) return;
  if(!confirm('Remover este token do mapa?')) return;
  m.tokens = m.tokens.filter(t => t.id !== editingTokenId);
  saveState();
  closeModal('modalToken');
  renderMap();
});

// ============================================================
// HELPERS GERAIS
// ============================================================
function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function parseInventarioText(text){
  if(!text) return [];
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const match = line.match(/^(.*?)(?:\s*x\s*(\d+))?$/i);
    return { nome: match[1].trim(), qtd: match[2] ? Number(match[2]) : 1 };
  });
}

// ============================================================
// UPLOAD DE IMAGEM (clique, arrastar-e-soltar, colar) — genérico
// ============================================================
const imageFieldHandlers = {}; // fieldId -> {setImage, clearImage}

function setupImageField({fieldId, inputId, hiddenId, changeBtnId, removeBtnId, folder}){
  const field = document.getElementById(fieldId);
  const fileInput = document.getElementById(inputId);
  const hidden = document.getElementById(hiddenId);
  const changeBtn = document.getElementById(changeBtnId);
  const removeBtn = document.getElementById(removeBtnId);
  const pastaStorage = folder || 'geral';

  function setImage(url){
    if(!url){ clearImage(); return; }
    hidden.value = url;
    let img = field.querySelector('img');
    if(!img){
      img = document.createElement('img');
      field.insertBefore(img, field.firstChild);
    }
    img.src = url;
    field.classList.add('has-image');
    field.classList.remove('uploading');
  }
  function clearImage(){
    hidden.value = '';
    const img = field.querySelector('img');
    if(img) img.remove();
    field.classList.remove('has-image');
    field.classList.remove('uploading');
  }
  async function handleFile(file){
    if(!file || !file.type || !file.type.startsWith('image/')) return;
    field.classList.add('uploading');
    try{
      const url = await uploadImagemParaStorage(file, pastaStorage);
      setImage(url);
    }catch(e){
      field.classList.remove('uploading');
      alert('Não foi possível enviar a imagem. Tente novamente.');
    }
  }

  field.addEventListener('click', (e) => {
    if(e.target.closest('.img-upload-overlay')) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
    fileInput.value = '';
  });
  field.addEventListener('dragover', (e) => { e.preventDefault(); field.classList.add('drag-over'); });
  field.addEventListener('dragleave', () => field.classList.remove('drag-over'));
  field.addEventListener('drop', (e) => {
    e.preventDefault();
    field.classList.remove('drag-over');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });
  changeBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  removeBtn.addEventListener('click', (e) => { e.stopPropagation(); clearImage(); });

  imageFieldHandlers[fieldId] = { setImage, clearImage };
  return imageFieldHandlers[fieldId];
}

const personagemImgField = setupImageField({fieldId:'pImgField', inputId:'pImgInput', hiddenId:'pImagem', changeBtnId:'pImgChangBtn', removeBtnId:'pImgRemoveBtn', folder:'personagens'});
const itemImgField = setupImageField({fieldId:'iImgField', inputId:'iImgInput', hiddenId:'iImagem', changeBtnId:'iImgChangBtn', removeBtnId:'iImgRemoveBtn', folder:'itens'});
const missaoImgField = setupImageField({fieldId:'mImgField', inputId:'mImgInput', hiddenId:'mImagem', changeBtnId:'mImgChangBtn', removeBtnId:'mImgRemoveBtn', folder:'missoes'});

// Cola (Ctrl+V) de imagem — aplica no campo de imagem do modal aberto,
// ou no editor de créditos quando ele estiver em modo de edição.
document.addEventListener('paste', (e) => {
  const activeOverlay = document.querySelector('.modal-overlay.active');
  let field = null;
  if(activeOverlay){
    field = activeOverlay.querySelector('.img-upload-field');
  }else{
    const credEditor = document.getElementById('creditosEditor');
    if(credEditor && credEditor.style.display !== 'none'){
      field = document.getElementById('credImgField');
    }
  }
  if(!field || !e.clipboardData) return;
  const items = e.clipboardData.items;
  if(!items) return;
  for(const item of items){
    if(item.type && item.type.startsWith('image/')){
      const blob = item.getAsFile();
      const handlers = imageFieldHandlers[field.id];
      if(blob && handlers){
        e.preventDefault();
        field.classList.add('uploading');
        const file = blobParaFile(blob);
        const pasta = field.dataset.uploadFolder || 'geral';
        uploadImagemParaStorage(file, pasta)
          .then(url => handlers.setImage(url))
          .catch(() => { field.classList.remove('uploading'); alert('Não foi possível enviar a imagem colada.'); });
      }
      break;
    }
  }
});

// ============================================================
// VER MAIS — modal com a ficha/carta completa
// ============================================================
function openVerMais(kind, id){
  const body = document.getElementById('verMaisBody');
  const title = document.getElementById('verMaisTitulo');
  const editBtn = document.getElementById('verMaisEditBtn');
  let html = '';

  if(kind === 'jogador' || kind === 'npc' || kind === 'aliado'){
    const list = kind === 'jogador' ? state.personagens : kind === 'aliado' ? (state.aliados||[]) : state.npcs;
    const p = list.find(x => x.id === id);
    if(!p) return;
    title.textContent = p.nome;
    html = buildVerMaisPersonagem(p);
    editBtn.onclick = () => { closeModal('modalVerMais'); openPersonagemModal(kind, id); };
  }else if(kind === 'item'){
    const it = state.itens.find(x => x.id === id);
    if(!it) return;
    title.textContent = it.nome;
    html = buildVerMaisItem(it);
    editBtn.onclick = () => { closeModal('modalVerMais'); openItemModal(id); };
  }else if(kind === 'missao'){
    const m = state.missoes.find(x => x.id === id);
    if(!m) return;
    title.textContent = m.nome;
    html = buildVerMaisMissao(m);
    editBtn.onclick = () => { closeModal('modalVerMais'); openMissaoModal(id); };
  }else{
    return;
  }

  body.innerHTML = html;
  // só exibe botão editar para quem tem permissão
  if(kind === 'jogador' || kind === 'npc' || kind === 'aliado'){
    const list2 = kind === 'jogador' ? state.personagens : kind === 'aliado' ? (state.aliados||[]) : state.npcs;
    const p2 = list2.find(x => x.id === id);
    editBtn.style.display = (typeof canEditPersonagem==='function' && p2 && canEditPersonagem(p2)) ? 'inline-flex' : 'none';
  } else {
    editBtn.style.display = (typeof isAdm==='function' && isAdm()) ? 'inline-flex' : 'none';
  }
  openModal('modalVerMais');
}

function buildVerMaisPersonagem(p){
  const hpPct = p.hpMax ? Math.max(0,Math.min(100,(p.hpAtual/p.hpMax)*100)) : 0;
  const mpPct = p.mpMax ? Math.max(0,Math.min(100,(p.mpAtual/p.mpMax)*100)) : 0;
  const xpPct = p.xpMax ? Math.max(0,Math.min(100,(p.xpAtual/p.xpMax)*100)) : 0;
  const inv = parseInventarioText(p.inventario);

  return `
    ${p.imagem ? `<img class="vf-img" src="${p.imagem}">` : ''}
    <div class="vf-body">
      <div class="vf-name">${escapeHtml(p.nome)}</div>
      <div class="vf-sub">${escapeHtml(p.classe || '—')}</div>

      <div class="tag-row">
        ${p.origem ? `<span class="tag">🌏 ${escapeHtml(p.origem)}</span>` : ''}
        ${p.local ? `<span class="tag">📍 ${escapeHtml(p.local)}</span>` : ''}
        ${p.alinhamento ? `<span class="tag">${escapeHtml(p.alinhamento)}</span>` : ''}
        <span class="tag">LVL ${p.level ?? 1}</span>
      </div>

      <div class="bar-row">
        <div class="bar-label"><span>💓 HP</span><span>${p.hpAtual ?? 0}/${p.hpMax ?? 0}</span></div>
        <div class="bar-track"><div class="bar-fill hp" style="width:${hpPct}%"></div></div>
      </div>
      <div class="bar-row">
        <div class="bar-label"><span>🔷 MP</span><span>${p.mpAtual ?? 0}/${p.mpMax ?? 0}</span></div>
        <div class="bar-track"><div class="bar-fill mp" style="width:${mpPct}%"></div></div>
      </div>
      <div class="bar-row">
        <div class="bar-label"><span>☄️ XP</span><span>${p.xpAtual ?? 0}/${p.xpMax ?? 0}</span></div>
        <div class="bar-track"><div class="bar-fill status" style="width:${xpPct}%"></div></div>
      </div>

      <div class="stat-grid">
        <div class="k">🍖 Fome</div><div class="v">${p.fome ?? 0}</div>
        <div class="k">🥤 Sede</div><div class="v">${p.sede ?? 0}</div>
        <div class="k">💤 Sono</div><div class="v">${p.sono ?? 0}</div>
        <div class="k">🪙 Gold</div><div class="v">${p.gold ?? 0}G ${p.prata ?? 0}P ${p.cobre ?? 0}C</div>
        ${p.guilda ? `<div class="k">🛡️ Guilda</div><div class="v">${escapeHtml(p.guilda)}</div>` : ''}
      </div>

      ${p.dominio ? `<div class="sheet-section"><div class="sec-title">🔮 Efeito de Domínio</div><div class="sec-body">${escapeHtml(p.dominio)}</div></div>` : ''}
      ${p.poderes ? `<div class="sheet-section"><div class="sec-title">🥀 Poderes</div><div class="sec-body">${escapeHtml(p.poderes)}</div></div>` : ''}
      ${p.armadura ? `<div class="sheet-section"><div class="sec-title">⚔️ Armadura</div><div class="sec-body">${escapeHtml(p.armadura)}</div></div>` : ''}
      ${p.armas ? `<div class="sheet-section"><div class="sec-title">🗡️ Armas / Artefatos</div><div class="sec-body">${escapeHtml(p.armas)}</div></div>` : ''}
      ${inv.length ? `<div class="sheet-section"><div class="sec-title">🎒 Inventário</div>
        <ul class="inv-list">${inv.map(it => `<li><span>${escapeHtml(it.nome)}</span><span class="qty">x${it.qtd}</span></li>`).join('')}</ul>
      </div>` : ''}
      ${p.notas ? `<div class="sheet-section"><div class="sec-title">📝 Notas</div><div class="sec-body">${escapeHtml(p.notas)}</div></div>` : ''}
    </div>
  `;
}

function buildVerMaisItem(it){
  return `
    ${it.imagem ? `<img class="vf-img" src="${it.imagem}">` : ''}
    <div class="vf-body">
      <div class="vf-name">${escapeHtml(it.nome)}</div>
      <div class="vf-sub"><span class="item-rarity rarity-${it.raridade}">${RARITY_LABEL[it.raridade]}</span></div>
      ${it.descricao ? `<div class="sheet-section" style="margin-top:0;padding-top:0;border-top:none;"><div class="sec-title">Descrição / Efeito</div><div class="sec-body">${escapeHtml(it.descricao)}</div></div>` : ''}
      <div class="vf-item-grid">
        <div class="k">Tipo</div><div class="v">${escapeHtml(it.tipo)}</div>
        <div class="k">Raridade</div><div class="v">${RARITY_LABEL[it.raridade]}</div>
        <div class="k">Valor</div><div class="v">${it.valor}G</div>
        <div class="k">Quantidade</div><div class="v">x${it.quantidade}</div>
      </div>
    </div>
  `;
}

function buildVerMaisMissao(m){
  return `
    ${m.imagem ? `<img class="vf-img" src="${m.imagem}">` : ''}
    <div class="vf-body">
      <div class="vf-name">${escapeHtml(m.nome)}</div>
      <div class="vf-sub"><span class="status-pill status-${m.status}">${STATUS_LABEL[m.status]}</span></div>
      ${m.descricao ? `<div class="sheet-section" style="margin-top:0;padding-top:0;border-top:none;"><div class="sec-title">Descrição</div><div class="sec-body">${escapeHtml(m.descricao)}</div></div>` : ''}
      ${m.origem ? `<div class="vf-item-grid" style="grid-template-columns:auto 1fr;"><div class="k">Dado por / Local</div><div class="v">${escapeHtml(m.origem)}</div></div>` : ''}
      ${m.recompensa ? `<div class="sheet-section"><div class="sec-title">🎁 Recompensa</div><div class="sec-body">${escapeHtml(m.recompensa)}</div></div>` : ''}
    </div>
  `;
}

// ============================================================
// PERSONAGENS / NPCS (ficha estruturada)
// ============================================================
let editingPersonagemId = null;

function openPersonagemModal(tipo, id){
  editingPersonagemId = id;
  document.getElementById('pTipo').value = tipo;
  document.getElementById('pId').value = id || '';
  const title = id ? 'Editar ' + (tipo === 'jogador' ? 'personagem' : tipo === 'aliado' ? 'aliado' : 'NPC') : 'Novo ' + (tipo === 'jogador' ? 'personagem' : tipo === 'aliado' ? 'aliado' : 'NPC');
  document.getElementById('modalPersonagemTitle').textContent = title;

  const list = tipo === 'jogador' ? state.personagens : tipo === 'aliado' ? (state.aliados || (state.aliados=[])) : state.npcs;
  const fields = ['pNome','pClasse','pOrigem','pPoderes','pDominio','pLocal','pAlinhamento','pLevel','pXpAtual','pXpMax',
    'pHpAtual','pHpMax','pMpAtual','pMpMax','pFome','pSede','pSono','pGuilda','pArmas','pArmadura','pGold','pPrata','pCobre','pInventario','pNotas'];

  if(id){
    const p = list.find(x => x.id === id);
    document.getElementById('pNome').value = p.nome || '';
    document.getElementById('pClasse').value = p.classe || '';
    document.getElementById('pOrigem').value = p.origem || '';
    document.getElementById('pPoderes').value = p.poderes || '';
    document.getElementById('pDominio').value = p.dominio || '';
    document.getElementById('pLocal').value = p.local || '';
    document.getElementById('pAlinhamento').value = p.alinhamento || '';
    document.getElementById('pLevel').value = p.level ?? 1;
    document.getElementById('pXpAtual').value = p.xpAtual ?? 0;
    document.getElementById('pXpMax').value = p.xpMax ?? 1000;
    document.getElementById('pHpAtual').value = p.hpAtual ?? 100;
    document.getElementById('pHpMax').value = p.hpMax ?? 100;
    document.getElementById('pMpAtual').value = p.mpAtual ?? 100;
    document.getElementById('pMpMax').value = p.mpMax ?? 100;
    document.getElementById('pFome').value = p.fome ?? 100;
    document.getElementById('pSede').value = p.sede ?? 100;
    document.getElementById('pSono').value = p.sono ?? 100;
    document.getElementById('pGuilda').value = p.guilda || '';
    document.getElementById('pArmas').value = p.armas || '';
    document.getElementById('pArmadura').value = p.armadura || '';
    document.getElementById('pGold').value = p.gold ?? 0;
    document.getElementById('pPrata').value = p.prata ?? 0;
    document.getElementById('pCobre').value = p.cobre ?? 0;
    document.getElementById('pInventario').value = p.inventario || '';
    document.getElementById('pNotas').value = p.notas || '';
    personagemImgField.setImage(p.imagem || '');
  }else{
    personagemImgField.clearImage();
    document.getElementById('pNome').value = '';
    document.getElementById('pClasse').value = '';
    document.getElementById('pOrigem').value = '';
    document.getElementById('pPoderes').value = '';
    document.getElementById('pDominio').value = '';
    document.getElementById('pLocal').value = '';
    document.getElementById('pAlinhamento').value = '';
    document.getElementById('pLevel').value = 1;
    document.getElementById('pXpAtual').value = 0;
    document.getElementById('pXpMax').value = 1000;
    document.getElementById('pHpAtual').value = 100;
    document.getElementById('pHpMax').value = 100;
    document.getElementById('pMpAtual').value = 100;
    document.getElementById('pMpMax').value = 100;
    document.getElementById('pFome').value = 100;
    document.getElementById('pSede').value = 100;
    document.getElementById('pSono').value = 100;
    document.getElementById('pGuilda').value = '';
    document.getElementById('pArmas').value = '';
    document.getElementById('pArmadura').value = '';
    document.getElementById('pGold').value = 0;
    document.getElementById('pPrata').value = 0;
    document.getElementById('pCobre').value = 0;
    document.getElementById('pInventario').value = '';
    document.getElementById('pNotas').value = '';
  }
  openModal('modalPersonagem');
}

document.getElementById('btnNovoPersonagem').addEventListener('click', () => openPersonagemModal('jogador', null));
document.getElementById('btnNovoNpc').addEventListener('click', () => openPersonagemModal('npc', null));

document.getElementById('btnSalvarPersonagem').addEventListener('click', () => {
  const tipo = document.getElementById('pTipo').value;
  const id = document.getElementById('pId').value;
  const nome = document.getElementById('pNome').value.trim();
  if(!nome){ alert('Dê um nome ao personagem.'); return; }

  const data = {
    nome,
    imagem: document.getElementById('pImagem').value || '',
    classe: document.getElementById('pClasse').value.trim(),
    origem: document.getElementById('pOrigem').value.trim(),
    poderes: document.getElementById('pPoderes').value.trim(),
    dominio: document.getElementById('pDominio').value.trim(),
    local: document.getElementById('pLocal').value.trim(),
    alinhamento: document.getElementById('pAlinhamento').value.trim(),
    level: Number(document.getElementById('pLevel').value) || 1,
    xpAtual: Number(document.getElementById('pXpAtual').value) || 0,
    xpMax: Number(document.getElementById('pXpMax').value) || 1000,
    hpAtual: Number(document.getElementById('pHpAtual').value) || 0,
    hpMax: Number(document.getElementById('pHpMax').value) || 0,
    mpAtual: Number(document.getElementById('pMpAtual').value) || 0,
    mpMax: Number(document.getElementById('pMpMax').value) || 0,
    fome: Number(document.getElementById('pFome').value) || 0,
    sede: Number(document.getElementById('pSede').value) || 0,
    sono: Number(document.getElementById('pSono').value) || 0,
    guilda: document.getElementById('pGuilda').value.trim(),
    armas: document.getElementById('pArmas').value.trim(),
    armadura: document.getElementById('pArmadura').value.trim(),
    gold: Number(document.getElementById('pGold').value) || 0,
    prata: Number(document.getElementById('pPrata').value) || 0,
    cobre: Number(document.getElementById('pCobre').value) || 0,
    inventario: document.getElementById('pInventario').value.trim(),
    notas: document.getElementById('pNotas').value.trim(),
  };

  const list = tipo === 'jogador' ? state.personagens : tipo === 'aliado' ? (state.aliados || (state.aliados=[])) : state.npcs;
  if(id){
    const p = list.find(x => x.id === id);
    Object.assign(p, data);
    // sincroniza tokens vinculados
    syncTokensFromSheet(tipo === 'jogador' ? 'personagem' : 'npc', id, data);
  }else{
    list.push({ id: uid(), ...data });
  }
  saveState();
  closeModal('modalPersonagem');
  renderPersonagens();
  renderAliados();
  renderBosses();
  renderNpcs();
  renderMap();
});

function syncTokensFromSheet(refType, refId, data){
  state.maps.forEach(m => {
    m.tokens.forEach(tok => {
      if(tok.refType === refType && tok.refId === refId){
        tok.nome = data.nome;
        tok.hpAtual = data.hpAtual;
        tok.hpMax = data.hpMax;
      }
    });
  });
}

function deletePersonagem(tipo, id){
  if(!confirm('Excluir esta ficha?')) return;
  if(tipo === 'jogador'){
    state.personagens = state.personagens.filter(p => p.id !== id);
  }else{
    state.npcs = state.npcs.filter(p => p.id !== id);
  }
  // remove tokens vinculados
  state.maps.forEach(m => {
    m.tokens = m.tokens.filter(t => !(t.refId === id && t.refType === (tipo === 'jogador' ? 'personagem' : 'npc')));
  });
  saveState();
  renderPersonagens();
  renderNpcs();
  renderMap();
}

function buildSheetCard(p, tipo){
  const card = document.createElement('div');
  card.className = 'sheet-card type-' + tipo;

  const hpPct = p.hpMax ? Math.max(0,Math.min(100,(p.hpAtual/p.hpMax)*100)) : 0;
  const mpPct = p.mpMax ? Math.max(0,Math.min(100,(p.mpAtual/p.mpMax)*100)) : 0;
  const xpPct = p.xpMax ? Math.max(0,Math.min(100,(p.xpAtual/p.xpMax)*100)) : 0;

  const placeholderIc = tipo === 'npc' ? '👤' : tipo === 'aliado' ? '🤝' : '🧙';

  card.innerHTML = `
    <div class="card-badge">LVL ${p.level ?? 1}</div>
    ${p.imagem
      ? `<img class="card-img" src="${p.imagem}" alt="${escapeHtml(p.nome)}">`
      : `<div class="card-img-placeholder">${placeholderIc}</div>`}

    <div class="card-body">
      <div class="card-name">${escapeHtml(p.nome)}</div>
      <div class="card-sub">${escapeHtml(p.classe || (tipo === 'npc' ? 'NPC' : tipo === 'aliado' ? 'Aliado' : 'Personagem'))}</div>

      <div class="mini-bars">
        <div class="mini-bar-row">
          <span class="lbl">HP</span>
          <div class="mini-bar-track"><div class="mini-bar-fill hp" style="width:${hpPct}%"></div></div>
          <span class="mini-bar-val">${p.hpAtual ?? 0}/${p.hpMax ?? 0}</span>
        </div>
        <div class="mini-bar-row">
          <span class="lbl">MP</span>
          <div class="mini-bar-track"><div class="mini-bar-fill mp" style="width:${mpPct}%"></div></div>
          <span class="mini-bar-val">${p.mpAtual ?? 0}/${p.mpMax ?? 0}</span>
        </div>
        <div class="mini-bar-row">
          <span class="lbl">XP</span>
          <div class="mini-bar-track"><div class="mini-bar-fill xp" style="width:${xpPct}%"></div></div>
          <span class="mini-bar-val">${p.xpAtual ?? 0}/${p.xpMax ?? 0}</span>
        </div>
      </div>
    </div>

    <div class="card-foot">
      <div class="card-actions">
        <button class="icon-btn" data-action="edit" title="Editar">✏️</button>
        <button class="icon-btn" data-action="delete" title="Excluir">🗑️</button>
      </div>
      <button class="btn-ver-mais" data-action="vermais">Ver mais</button>
    </div>
  `;

  // Permissão: jogador só edita/deleta seu próprio personagem; adm pode tudo
  const canEdit = typeof canEditPersonagem === 'function' ? canEditPersonagem(p) : true;
  const editBtn2 = card.querySelector('[data-action="edit"]');
  const delBtn2  = card.querySelector('[data-action="delete"]');
  if(!canEdit){ editBtn2.style.display='none'; delBtn2.style.display='none'; }
  editBtn2.addEventListener('click', () => { if(canEditPersonagem(p)) openPersonagemModal(tipo, p.id); });
  delBtn2.addEventListener('click',  () => { if(canEditPersonagem(p)) deletePersonagem(tipo, p.id); });
  card.querySelector('[data-action="vermais"]').addEventListener('click', () => openVerMais(tipo, p.id));
  return card;
}

function renderPersonagens(filter=''){
  const grid = document.getElementById('gridPersonagens');
  grid.innerHTML = '';
  const list = state.personagens.filter(p => p.nome.toLowerCase().includes(filter.toLowerCase()));
  if(list.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="ic">🧙</div>Nenhum personagem ainda. Clique em "Novo personagem" para criar a primeira ficha.</div>`;
    return;
  }
  list.forEach(p => grid.appendChild(buildSheetCard(p, 'jogador')));
}

function renderNpcs(filter=''){
  const grid = document.getElementById('gridNpcs');
  grid.innerHTML = '';
  const list = state.npcs.filter(p => p.nome.toLowerCase().includes(filter.toLowerCase()));
  if(list.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="ic">👤</div>Nenhum NPC ainda. Clique em "Novo NPC" para criar o primeiro.</div>`;
    return;
  }
  list.forEach(p => grid.appendChild(buildSheetCard(p, 'npc')));
}

document.getElementById('searchPersonagens').addEventListener('input', (e) => renderPersonagens(e.target.value));
document.getElementById('searchNpcs').addEventListener('input', (e) => renderNpcs(e.target.value));

// ============================================================
// ITENS
// ============================================================
let editingItemId = null;

function openItemModal(id){
  editingItemId = id;
  document.getElementById('modalItemTitle').textContent = id ? 'Editar item' : 'Novo item';
  document.getElementById('iId').value = id || '';
  if(id){
    const it = state.itens.find(x => x.id === id);
    document.getElementById('iNome').value = it.nome;
    document.getElementById('iTipo').value = it.tipo;
    document.getElementById('iRaridade').value = it.raridade;
    document.getElementById('iDescricao').value = it.descricao || '';
    document.getElementById('iValor').value = it.valor ?? 0;
    document.getElementById('iQuantidade').value = it.quantidade ?? 1;
    itemImgField.setImage(it.imagem || '');
  }else{
    itemImgField.clearImage();
    document.getElementById('iNome').value = '';
    document.getElementById('iTipo').value = 'Arma';
    document.getElementById('iRaridade').value = 'comum';
    document.getElementById('iDescricao').value = '';
    document.getElementById('iValor').value = 0;
    document.getElementById('iQuantidade').value = 1;
  }
  openModal('modalItem');
}

document.getElementById('btnNovoItem').addEventListener('click', () => openItemModal(null));

document.getElementById('btnSalvarItem').addEventListener('click', () => {
  const nome = document.getElementById('iNome').value.trim();
  if(!nome){ alert('Dê um nome ao item.'); return; }
  const data = {
    nome,
    imagem: document.getElementById('iImagem').value || '',
    tipo: document.getElementById('iTipo').value,
    raridade: document.getElementById('iRaridade').value,
    descricao: document.getElementById('iDescricao').value.trim(),
    valor: Number(document.getElementById('iValor').value) || 0,
    quantidade: Number(document.getElementById('iQuantidade').value) || 1,
  };
  const id = document.getElementById('iId').value;
  if(id){
    Object.assign(state.itens.find(x => x.id === id), data);
  }else{
    state.itens.push({ id: uid(), ...data });
  }
  saveState();
  closeModal('modalItem');
  renderItens();
});

function deleteItem(id){
  if(!confirm('Excluir este item?')) return;
  state.itens = state.itens.filter(x => x.id !== id);
  saveState();
  renderItens();
}

const RARITY_LABEL = {comum:'Comum', raro:'Raro', epico:'Épico', lendario:'Lendário'};

function renderItens(filter=''){
  const grid = document.getElementById('gridItens');
  grid.innerHTML = '';
  const list = state.itens.filter(i => i.nome.toLowerCase().includes(filter.toLowerCase()));
  if(list.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="ic">🎒</div>Nenhum item ainda. Clique em "Novo item" para criar o catálogo.</div>`;
    return;
  }
  list.forEach(it => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      ${it.imagem
        ? `<img class="item-img" src="${it.imagem}" alt="${escapeHtml(it.nome)}">`
        : `<div class="item-img-placeholder">🎒</div>`}
      <div class="item-body">
        <div class="ihead">
          <div class="iname">${escapeHtml(it.nome)}</div>
          <span class="item-rarity rarity-${it.raridade}">${RARITY_LABEL[it.raridade]}</span>
        </div>
        ${it.descricao ? `<div class="item-desc">${escapeHtml(it.descricao)}</div>` : ''}
        <div class="item-meta">
          <span>🏷️ ${escapeHtml(it.tipo)}</span>
          <span>🪙 ${it.valor}G</span>
          <span>📦 x${it.quantidade}</span>
        </div>
      </div>
      <div class="item-foot">
        <div class="card-actions">
          <button class="icon-btn" data-action="edit" title="Editar">✏️</button>
          <button class="icon-btn" data-action="delete" title="Excluir">🗑️</button>
        </div>
        <button class="btn-ver-mais" data-action="vermais">Ver mais</button>
      </div>
    `;
    const admEditI = card.querySelector('[data-action="edit"]');
    const admDelI  = card.querySelector('[data-action="delete"]');
    if(typeof isAdm==='function' && !isAdm()){ admEditI.style.display='none'; admDelI.style.display='none'; }
    admEditI.addEventListener('click', () => { if(typeof isAdm==='function' && isAdm()) openItemModal(it.id); });
    admDelI.addEventListener('click',  () => { if(typeof isAdm==='function' && isAdm()) deleteItem(it.id); });
    card.querySelector('[data-action="vermais"]').addEventListener('click', () => openVerMais('item', it.id));
    grid.appendChild(card);
  });
}

document.getElementById('searchItens').addEventListener('input', (e) => renderItens(e.target.value));

// ============================================================
// MISSÕES
// ============================================================
let editingMissaoId = null;
let missaoStatusAtual = 'ativa';

document.querySelectorAll('#mStatusSeg button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mStatusSeg button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    missaoStatusAtual = btn.dataset.val;
  });
});

function openMissaoModal(id){
  editingMissaoId = id;
  document.getElementById('modalMissaoTitle').textContent = id ? 'Editar missão' : 'Nova missão';
  document.getElementById('mId').value = id || '';
  if(id){
    const m = state.missoes.find(x => x.id === id);
    document.getElementById('mNome').value = m.nome;
    document.getElementById('mDescricao').value = m.descricao || '';
    document.getElementById('mRecompensa').value = m.recompensa || '';
    document.getElementById('mOrigem').value = m.origem || '';
    missaoStatusAtual = m.status;
    missaoImgField.setImage(m.imagem || '');
  }else{
    missaoImgField.clearImage();
    document.getElementById('mNome').value = '';
    document.getElementById('mDescricao').value = '';
    document.getElementById('mRecompensa').value = '';
    document.getElementById('mOrigem').value = '';
    missaoStatusAtual = 'ativa';
  }
  document.querySelectorAll('#mStatusSeg button').forEach(b => b.classList.toggle('active', b.dataset.val === missaoStatusAtual));
  openModal('modalMissao');
}

document.getElementById('btnNovaMissao').addEventListener('click', () => openMissaoModal(null));

document.getElementById('btnSalvarMissao').addEventListener('click', () => {
  const nome = document.getElementById('mNome').value.trim();
  if(!nome){ alert('Dê um título à missão.'); return; }
  const data = {
    nome,
    imagem: document.getElementById('mImagem').value || '',
    status: missaoStatusAtual,
    descricao: document.getElementById('mDescricao').value.trim(),
    recompensa: document.getElementById('mRecompensa').value.trim(),
    origem: document.getElementById('mOrigem').value.trim(),
  };
  const id = document.getElementById('mId').value;
  if(id){
    Object.assign(state.missoes.find(x => x.id === id), data);
  }else{
    state.missoes.push({ id: uid(), ...data });
  }
  saveState();
  closeModal('modalMissao');
  renderMissoes();
});

function deleteMissao(id){
  if(!confirm('Excluir esta missão?')) return;
  state.missoes = state.missoes.filter(x => x.id !== id);
  saveState();
  renderMissoes();
}

const STATUS_LABEL = {ativa:'Ativa', concluida:'Concluída', falhou:'Falhou'};

function renderMissoes(filter=''){
  const grid = document.getElementById('gridMissoes');
  grid.innerHTML = '';
  const list = state.missoes.filter(m => m.nome.toLowerCase().includes(filter.toLowerCase()));
  if(list.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="ic">📜</div>Nenhuma missão ainda. Clique em "Nova missão" para criar a primeira.</div>`;
    return;
  }
  // ativas primeiro
  list.sort((a,b) => (a.status === 'ativa' ? -1 : 1) - (b.status === 'ativa' ? -1 : 1));
  list.forEach(m => {
    const card = document.createElement('div');
    card.className = 'mission-card status-' + m.status;
    card.innerHTML = `
      ${m.imagem
        ? `<img class="mission-img" src="${m.imagem}" alt="${escapeHtml(m.nome)}">`
        : `<div class="mission-img-placeholder">📜</div>`}
      <div class="mission-body">
        <div class="mhead">
          <div class="mname">${escapeHtml(m.nome)}</div>
          <span class="status-pill status-${m.status}">${STATUS_LABEL[m.status]}</span>
        </div>
        ${m.descricao ? `<div class="mdesc">${escapeHtml(m.descricao)}</div>` : ''}
        ${m.origem ? `<div class="mdesc" style="opacity:.8;">📍 ${escapeHtml(m.origem)}</div>` : ''}
        ${m.recompensa ? `<div class="mreward">🎁 ${escapeHtml(m.recompensa)}</div>` : ''}
      </div>
      <div class="mission-foot">
        <div class="card-actions">
          <button class="icon-btn" data-action="edit" title="Editar">✏️</button>
          <button class="icon-btn" data-action="delete" title="Excluir">🗑️</button>
        </div>
        <button class="btn-ver-mais" data-action="vermais">Ver mais</button>
      </div>
    `;
    const admEditM = card.querySelector('[data-action="edit"]');
    const admDelM  = card.querySelector('[data-action="delete"]');
    if(typeof isAdm==='function' && !isAdm()){ admEditM.style.display='none'; admDelM.style.display='none'; }
    admEditM.addEventListener('click', () => { if(typeof isAdm==='function' && isAdm()) openMissaoModal(m.id); });
    admDelM.addEventListener('click',  () => { if(typeof isAdm==='function' && isAdm()) deleteMissao(m.id); });
    card.querySelector('[data-action="vermais"]').addEventListener('click', () => openVerMais('missao', m.id));
    grid.appendChild(card);
  });
}

document.getElementById('searchMissoes').addEventListener('input', (e) => renderMissoes(e.target.value));

// ============================================================
// INICIALIZAÇÃO
// ============================================================
function seedExample(){
  // Só roda na primeiríssima vez (mesa ainda sem nenhum dado no Supabase)
  state.personagens.push({
    id: uid(),
    nome: 'Maga Tóxica',
    classe: 'Maga Tóxica',
    origem: 'Herdeira da Deusa Áclis',
    poderes: 'Total controle de qualquer tipo de veneno e suas variações.\n\nToxina nativa: Imunidade total a envenenamento (PASSIVA).\nPeçonha: Molda e cria nuvens de veneno a partir do próprio sangue (Gasto: 1000).\nToxidade: Solta uma grande nuvem que deixa cair gotas de ácido por 10 minutos (Gasto: 2000).\nEnvenenamento: Parte do sangue se transforma em veneno hiperconcentrado (Gasto: 5000).\nPresas: Ataques físicos aplicam 1 stack de envenenamento (-3% de atributos, máx 5 stacks) (PASSIVA).\nVíper: Camada de veneno não letal que protege de ataques iminentes (Gasto: 1750).\n\nSua mana a envolve de forma cada vez mais pura, desbloqueando novas funções com o tempo.',
    dominio: 'Ainda não desbloqueado',
    local: 'Cidade de Ymir / Continente Leste',
    alinhamento: 'Neutro',
    level: 1,
    xpAtual: 0,
    xpMax: 1000,
    hpAtual: 1000,
    hpMax: 1000,
    mpAtual: 17236,
    mpMax: 17236,
    fome: 100,
    sede: 100,
    sono: 100,
    guilda: 'Null',
    armas: 'Nenhuma',
    armadura: 'Camisa de camponês ⭐, Calça de chain ⭐⭐, Botas de couro ⭐⭐',
    gold: 0,
    prata: 0,
    cobre: 0,
    inventario: '',
    notas: ''
  });
}

function init(){
  const isFirstRun = state.maps.length === 0 && state.personagens.length === 0 && state.npcs.length === 0;
  let precisaSalvar = false;

  if(state.maps.length === 0){
    const m = { id: uid(), name: 'Mapa principal', imageData: null, tokens: [] };
    state.maps.push(m);
    state.activeMapId = m.id;
    precisaSalvar = true;
  }
  if(isFirstRun){ seedExample(); precisaSalvar = true; }
  if(!state.activeMapId || !state.maps.find(m => m.id === state.activeMapId)){
    state.activeMapId = state.maps[0].id;
  }
  if(!state.eventos) state.eventos = [];

  renderMapSelector();
  renderMap();
  renderPersonagens();
  renderNpcs();
  renderItens();
  renderMissoes();
  renderEventos();

  // IMPORTANTE: só salva se de fato criamos algo novo agora (mapa inicial
  // ou dados de exemplo). Se a mesa já tinha dados carregados do Supabase,
  // NUNCA chamamos saveState() aqui — isso evita sobrescrever dados reais
  // por engano em qualquer cenário de carregamento parcial/instável.
  if(precisaSalvar) saveState();
}

// init() agora é chamado pelo bootstrap.js, após o estado ser carregado do Supabase

// ============================================================
// EVENTOS MUNDIAIS
// ============================================================
let editingEventoId = null;
let evCatFiltro = '';

const EV_CAT_LABEL = {
  guerra:'⚔️ Guerra', politica:'👑 Política', desastre:'🌋 Desastre',
  magico:'✨ Mágico', economico:'🪙 Econômico', misterio:'🔮 Mistério', outro:'📌 Outro'
};
const EV_IMP_LABEL = { alto:'🔴 Alto impacto', medio:'🟡 Impacto médio', baixo:'🟢 Baixo impacto' };
const EV_STATUS_LABEL = { ongoing:'🔥 Em andamento', concluido:'✅ Concluído', esquecido:'💤 Lenda' };

// Filtros de categoria
document.querySelectorAll('.ev-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ev-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    evCatFiltro = btn.dataset.cat;
    renderEventos();
  });
});

// Status segmented control no modal
let evStatusAtual = 'ongoing';
document.querySelectorAll('#evStatusSeg button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#evStatusSeg button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    evStatusAtual = btn.dataset.val;
  });
});

function openEventoModal(id) {
  editingEventoId = id || null;
  document.getElementById('modalEventoTitle').textContent = id ? 'Editar evento' : 'Novo evento';
  document.getElementById('evId').value = id || '';

  if (id) {
    const ev = state.eventos.find(x => x.id === id);
    document.getElementById('evNome').value      = ev.nome;
    document.getElementById('evData').value      = ev.data || '';
    document.getElementById('evLocal').value     = ev.local || '';
    document.getElementById('evCategoria').value = ev.categoria || 'outro';
    document.getElementById('evImpacto').value   = ev.impacto || 'medio';
    document.getElementById('evDescricao').value = ev.descricao || '';
    document.getElementById('evEfeitos').value   = ev.efeitos || '';
    evStatusAtual = ev.status || 'ongoing';
  } else {
    document.getElementById('evNome').value      = '';
    document.getElementById('evData').value      = '';
    document.getElementById('evLocal').value     = '';
    document.getElementById('evCategoria').value = 'outro';
    document.getElementById('evImpacto').value   = 'medio';
    document.getElementById('evDescricao').value = '';
    document.getElementById('evEfeitos').value   = '';
    evStatusAtual = 'ongoing';
  }
  document.querySelectorAll('#evStatusSeg button').forEach(b =>
    b.classList.toggle('active', b.dataset.val === evStatusAtual)
  );
  openModal('modalEvento');
}

document.getElementById('btnNovoEvento').addEventListener('click', () => {
  if (typeof isAdm === 'function' && !isAdm()) { alert('Apenas o Mestre pode criar eventos.'); return; }
  openEventoModal(null);
});

document.getElementById('btnSalvarEvento').addEventListener('click', () => {
  const nome = document.getElementById('evNome').value.trim();
  if (!nome) { alert('Dê um título ao evento.'); return; }

  const data = {
    nome,
    data:      document.getElementById('evData').value.trim(),
    local:     document.getElementById('evLocal').value.trim(),
    categoria: document.getElementById('evCategoria').value,
    impacto:   document.getElementById('evImpacto').value,
    status:    evStatusAtual,
    descricao: document.getElementById('evDescricao').value.trim(),
    efeitos:   document.getElementById('evEfeitos').value.trim(),
  };

  const id = document.getElementById('evId').value;
  if (id) {
    Object.assign(state.eventos.find(x => x.id === id), data);
  } else {
    state.eventos.push({ id: uid(), criadoEm: Date.now(), ...data });
  }
  saveState();
  closeModal('modalEvento');
  renderEventos();
});

function deleteEvento(id) {
  if (!confirm('Excluir este evento da linha do tempo?')) return;
  state.eventos = state.eventos.filter(x => x.id !== id);
  saveState();
  renderEventos();
}

function renderEventos(filter) {
  filter = filter !== undefined ? filter : (document.getElementById('searchEventos')?.value || '');
  const tl = document.getElementById('evTimeline');
  if (!tl) return;
  tl.innerHTML = '';

  // garante array no state
  if (!state.eventos) state.eventos = [];

  let list = state.eventos.filter(ev => {
    const matchSearch = ev.nome.toLowerCase().includes(filter.toLowerCase()) ||
      (ev.descricao||'').toLowerCase().includes(filter.toLowerCase()) ||
      (ev.local||'').toLowerCase().includes(filter.toLowerCase());
    const matchCat = !evCatFiltro || ev.categoria === evCatFiltro;
    return matchSearch && matchCat;
  });

  // Ordem: em andamento primeiro, depois por criadoEm desc
  const statusOrder = { ongoing: 0, concluido: 1, esquecido: 2 };
  list.sort((a, b) => (statusOrder[a.status]||0) - (statusOrder[b.status]||0) || (b.criadoEm||0) - (a.criadoEm||0));

  if (list.length === 0) {
    tl.innerHTML = `<div class="ev-empty"><div class="ic">🌍</div><p>Nenhum evento mundial ainda.<br>Clique em "Novo evento" para registrar o primeiro acontecimento.</p></div>`;
    return;
  }

  const admMode = typeof isAdm === 'function' ? isAdm() : true;

  list.forEach(ev => {
    const card = document.createElement('div');
    card.className = 'ev-card';
    card.innerHTML = `
      <div class="ev-card-inner">
        <div class="ev-card-accent ev-acc-${ev.categoria||'outro'}"></div>
        <div class="ev-card-body">
          <div class="ev-card-head">
            <div>
              <div class="ev-card-titulo">${escapeHtml(ev.nome)}</div>
              <div class="ev-card-meta">
                <span class="ev-cat-pill ev-pill-${ev.categoria||'outro'}">${EV_CAT_LABEL[ev.categoria]||'Outro'}</span>
                <span class="ev-impacto-pill ev-imp-${ev.impacto||'medio'}">${EV_IMP_LABEL[ev.impacto||'medio']}</span>
                ${ev.data  ? `<span class="ev-data-pill">🕰️ ${escapeHtml(ev.data)}</span>` : ''}
                ${ev.local ? `<span class="ev-local-pill">📍 ${escapeHtml(ev.local)}</span>` : ''}
              </div>
            </div>
            ${admMode ? `<div class="card-actions" style="flex-shrink:0;">
              <button class="icon-btn" data-action="edit" title="Editar">✏️</button>
              <button class="icon-btn" data-action="delete" title="Excluir">🗑️</button>
            </div>` : ''}
          </div>
          ${ev.descricao ? `<div class="ev-card-desc">${escapeHtml(ev.descricao)}</div>` : ''}
          ${ev.efeitos ? `<div class="ev-card-efeitos"><div class="ev-card-efeitos-label">Efeitos & Consequências</div>${escapeHtml(ev.efeitos)}</div>` : ''}
          <div class="ev-card-foot">
            <div class="ev-status-seg">
              <button class="ev-status-btn ${ev.status==='ongoing'?'active-ongoing':''}" data-action="status" data-val="ongoing">🔥 Andamento</button>
              <button class="ev-status-btn ${ev.status==='concluido'?'active-concluido':''}" data-action="status" data-val="concluido">✅ Concluído</button>
              <button class="ev-status-btn ${ev.status==='esquecido'?'active-esquecido':''}" data-action="status" data-val="esquecido">💤 Lenda</button>
            </div>
          </div>
        </div>
      </div>
    `;

    if (admMode) {
      card.querySelector('[data-action="edit"]').addEventListener('click', () => openEventoModal(ev.id));
      card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEvento(ev.id));
    }

    // Mudar status direto no card (só ADM)
    card.querySelectorAll('[data-action="status"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!admMode) return;
        const target = state.eventos.find(x => x.id === ev.id);
        if (target) { target.status = btn.dataset.val; saveState(); renderEventos(); }
      });
    });

    tl.appendChild(card);
  });
}

document.getElementById('searchEventos').addEventListener('input', (e) => renderEventos(e.target.value));

// ============================================================

// ============================================================
// ALIADOS
// ============================================================
document.getElementById('btnNovoAliado').addEventListener('click', () => {
  if(typeof isAdm==='function' && !isAdm()){ alert('Apenas o Mestre pode adicionar aliados.'); return; }
  openPersonagemModal('aliado', null);
});

function renderAliados(filter=''){
  if(!state.aliados) state.aliados = [];
  const grid = document.getElementById('gridAliados');
  grid.innerHTML = '';
  const list = state.aliados.filter(p => p.nome.toLowerCase().includes(filter.toLowerCase()));
  if(list.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="ic">🤝</div>Nenhum aliado ainda. Clique em "Novo aliado" para adicionar.</div>`;
    return;
  }
  list.forEach(p => grid.appendChild(buildSheetCard(p, 'aliado')));
}

document.getElementById('searchAliados').addEventListener('input', (e) => renderAliados(e.target.value));

// ============================================================
// BOSSES
// ============================================================
if(!state.bosses) state.bosses = [];

const bossImgField = setupImageField({
  fieldId:'bImgField', inputId:'bImgInput', hiddenId:'bImagem',
  changeBtnId:'bImgChangBtn', removeBtnId:'bImgRemoveBtn', folder:'bosses'
});

let editingBossId = null;

function openBossModal(id){
  editingBossId = id;
  document.getElementById('modalBossTitle').textContent = id ? '💀 Editar Boss' : '💀 Novo Boss';
  document.getElementById('bId').value = id || '';
  if(id){
    const b = state.bosses.find(x => x.id === id);
    document.getElementById('bNome').value      = b.nome;
    document.getElementById('bClasse').value    = b.classe || '';
    document.getElementById('bAmeaca').value    = b.ameaca || 'extrema';
    document.getElementById('bLocal').value     = b.local || '';
    document.getElementById('bLevel').value     = b.level ?? 1;
    document.getElementById('bHpAtual').value   = b.hpAtual ?? 10000;
    document.getElementById('bHpMax').value     = b.hpMax ?? 10000;
    document.getElementById('bMpAtual').value   = b.mpAtual ?? 5000;
    document.getElementById('bMpMax').value     = b.mpMax ?? 5000;
    document.getElementById('bFaseAtual').value = b.faseAtual ?? 1;
    document.getElementById('bFaseMax').value   = b.faseMax ?? 3;
    document.getElementById('bPoderes').value   = b.poderes || '';
    document.getElementById('bFraquezas').value = b.fraquezas || '';
    document.getElementById('bRecompensa').value= b.recompensa || '';
    document.getElementById('bNotas').value     = b.notas || '';
    bossImgField.setImage(b.imagem || '');
  }else{
    bossImgField.clearImage();
    document.getElementById('bNome').value      = '';
    document.getElementById('bClasse').value    = '';
    document.getElementById('bAmeaca').value    = 'extrema';
    document.getElementById('bLocal').value     = '';
    document.getElementById('bLevel').value     = 1;
    document.getElementById('bHpAtual').value   = 10000;
    document.getElementById('bHpMax').value     = 10000;
    document.getElementById('bMpAtual').value   = 5000;
    document.getElementById('bMpMax').value     = 5000;
    document.getElementById('bFaseAtual').value = 1;
    document.getElementById('bFaseMax').value   = 3;
    document.getElementById('bPoderes').value   = '';
    document.getElementById('bFraquezas').value = '';
    document.getElementById('bRecompensa').value= '';
    document.getElementById('bNotas').value     = '';
  }
  openModal('modalBoss');
}

document.getElementById('btnNovoBoss').addEventListener('click', () => {
  if(typeof isAdm==='function' && !isAdm()){ alert('Apenas o Mestre pode criar bosses.'); return; }
  openBossModal(null);
});

document.getElementById('btnSalvarBoss').addEventListener('click', () => {
  const nome = document.getElementById('bNome').value.trim();
  if(!nome){ alert('Dê um nome ao boss.'); return; }
  if(!state.bosses) state.bosses = [];

  const data = {
    nome,
    imagem:     document.getElementById('bImagem').value || '',
    classe:     document.getElementById('bClasse').value.trim(),
    ameaca:     document.getElementById('bAmeaca').value,
    local:      document.getElementById('bLocal').value.trim(),
    level:      Number(document.getElementById('bLevel').value) || 1,
    hpAtual:    Number(document.getElementById('bHpAtual').value) || 0,
    hpMax:      Number(document.getElementById('bHpMax').value) || 0,
    mpAtual:    Number(document.getElementById('bMpAtual').value) || 0,
    mpMax:      Number(document.getElementById('bMpMax').value) || 0,
    faseAtual:  Number(document.getElementById('bFaseAtual').value) || 1,
    faseMax:    Number(document.getElementById('bFaseMax').value) || 3,
    poderes:    document.getElementById('bPoderes').value.trim(),
    fraquezas:  document.getElementById('bFraquezas').value.trim(),
    recompensa: document.getElementById('bRecompensa').value.trim(),
    notas:      document.getElementById('bNotas').value.trim(),
  };

  const id = document.getElementById('bId').value;
  if(id){
    Object.assign(state.bosses.find(x => x.id === id), data);
  }else{
    state.bosses.push({ id: uid(), ...data });
  }
  saveState();
  closeModal('modalBoss');
  renderBosses();
});

function deleteBoss(id){
  if(!confirm('Excluir este boss?')) return;
  state.bosses = state.bosses.filter(x => x.id !== id);
  saveState();
  renderBosses();
}

const THREAT_LABEL = {
  baixa:'🟢 Baixa', media:'🟡 Média', alta:'🟠 Alta',
  extrema:'🔴 Extrema', lendaria:'💜 Lendária'
};

function buildBossCard(b){
  if(!b) return document.createElement('div');
  const card = document.createElement('div');
  card.className = 'sheet-card type-boss';

  const hpPct   = b.hpMax   ? Math.max(0,Math.min(100,(b.hpAtual/b.hpMax)*100))   : 0;
  const mpPct   = b.mpMax   ? Math.max(0,Math.min(100,(b.mpAtual/b.mpMax)*100))   : 0;
  const fasePct = b.faseMax ? Math.max(0,Math.min(100,(b.faseAtual/b.faseMax)*100)): 0;

  card.innerHTML = `
    <div class="boss-skull">💀 ${escapeHtml(b.ameaca ? THREAT_LABEL[b.ameaca] : 'Boss')}</div>
    <div class="card-badge">LVL ${b.level ?? 1}</div>
    ${b.imagem
      ? `<img class="card-img" src="${b.imagem}" alt="${escapeHtml(b.nome)}">`
      : `<div class="card-img-placeholder" style="background:linear-gradient(160deg,rgba(80,0,0,.12),rgba(80,0,0,.25));">💀</div>`}
    <div class="card-body">
      <div class="card-name">${escapeHtml(b.nome)}</div>
      <div class="card-sub" style="color:#b06060;">${escapeHtml(b.classe || 'Boss')}</div>
      <div class="mini-bars">
        <div class="mini-bar-row">
          <span class="lbl">HP</span>
          <div class="mini-bar-track"><div class="mini-bar-fill boss" style="width:${hpPct}%"></div></div>
          <span class="mini-bar-val">${b.hpAtual ?? 0}/${b.hpMax ?? 0}</span>
        </div>
        <div class="mini-bar-row">
          <span class="lbl">MP</span>
          <div class="mini-bar-track"><div class="mini-bar-fill mp" style="width:${mpPct}%"></div></div>
          <span class="mini-bar-val">${b.mpAtual ?? 0}/${b.mpMax ?? 0}</span>
        </div>
        <div class="mini-bar-row boss-phase-bar">
          <span class="lbl" style="color:#c06060;font-size:9px;">FASE</span>
          <div class="mini-bar-track"><div class="mini-bar-fill boss" style="width:${fasePct}%"></div></div>
          <span class="mini-bar-val">${b.faseAtual ?? 1}/${b.faseMax ?? 3}</span>
        </div>
      </div>
      ${b.local ? `<div style="font-size:10px;color:var(--ink-soft);margin-top:4px;">📍 ${escapeHtml(b.local)}</div>` : ''}
      <span class="boss-threat threat-${b.ameaca||'extrema'}">${THREAT_LABEL[b.ameaca||'extrema']}</span>
    </div>
    <div class="card-foot">
      <div class="card-actions">
        <button class="icon-btn" data-action="edit" title="Editar">✏️</button>
        <button class="icon-btn" data-action="delete" title="Excluir">🗑️</button>
      </div>
      <button class="btn-ver-mais" data-action="vermais" style="background:linear-gradient(160deg,#8b0000,#5c0000);color:#ffd0d0;border-color:#4a0000;">Ver mais</button>
    </div>
  `;

  const canEdit = typeof isAdm === 'function' ? isAdm() : true;
  const editBtn = card.querySelector('[data-action="edit"]');
  const delBtn  = card.querySelector('[data-action="delete"]');
  if(!canEdit){ editBtn.style.display='none'; delBtn.style.display='none'; }
  editBtn.addEventListener('click',  () => { if(typeof isAdm==='function' && isAdm()) openBossModal(b.id); });
  delBtn.addEventListener('click',   () => { if(typeof isAdm==='function' && isAdm()) deleteBoss(b.id); });
  card.querySelector('[data-action="vermais"]').addEventListener('click', () => openVerMaisBoss(b.id));
  return card;
}

function openVerMaisBoss(id){
  if(!state.bosses) return;
  const b = state.bosses.find(x => x.id === id);
  if(!b) return;
  const body  = document.getElementById('verMaisBody');
  const title = document.getElementById('verMaisTitulo');
  const editBtn = document.getElementById('verMaisEditBtn');

  title.textContent = '💀 ' + b.nome;
  const hpPct   = b.hpMax   ? Math.max(0,Math.min(100,(b.hpAtual/b.hpMax)*100))   : 0;
  const mpPct   = b.mpMax   ? Math.max(0,Math.min(100,(b.mpAtual/b.mpMax)*100))   : 0;
  const fasePct = b.faseMax ? Math.max(0,Math.min(100,(b.faseAtual/b.faseMax)*100)) : 0;

  body.innerHTML = `
    ${b.imagem ? `<img class="vf-img" src="${b.imagem}">` : ''}
    <div class="vf-body">
      <div class="vf-name" style="color:#8b0000;">${escapeHtml(b.nome)}</div>
      <div class="vf-sub">${escapeHtml(b.classe || 'Boss')}</div>
      <div class="tag-row">
        <span class="boss-threat threat-${b.ameaca||'extrema'}">${THREAT_LABEL[b.ameaca||'extrema']}</span>
        ${b.local ? `<span class="tag">📍 ${escapeHtml(b.local)}</span>` : ''}
        <span class="tag">LVL ${b.level ?? 1}</span>
      </div>
      <div class="bar-row">
        <div class="bar-label"><span>💓 HP</span><span>${b.hpAtual ?? 0}/${b.hpMax ?? 0}</span></div>
        <div class="bar-track"><div class="bar-fill hp" style="width:${hpPct}%"></div></div>
      </div>
      <div class="bar-row">
        <div class="bar-label"><span>🔷 MP</span><span>${b.mpAtual ?? 0}/${b.mpMax ?? 0}</span></div>
        <div class="bar-track"><div class="bar-fill mp" style="width:${mpPct}%"></div></div>
      </div>
      <div class="bar-row">
        <div class="bar-label"><span>⚔️ Fase</span><span>${b.faseAtual ?? 1}/${b.faseMax ?? 3}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${fasePct}%;background:linear-gradient(90deg,#8b0000,#cc2222);"></div></div>
      </div>
      ${b.poderes   ? `<div class="sheet-section"><div class="sec-title">⚔️ Poderes / Habilidades</div><div class="sec-body">${escapeHtml(b.poderes)}</div></div>` : ''}
      ${b.fraquezas ? `<div class="sheet-section"><div class="sec-title">🛡️ Fraquezas / Resistências</div><div class="sec-body">${escapeHtml(b.fraquezas)}</div></div>` : ''}
      ${b.recompensa? `<div class="sheet-section"><div class="sec-title">🎁 Recompensa</div><div class="sec-body">${escapeHtml(b.recompensa)}</div></div>` : ''}
      ${b.notas     ? `<div class="sheet-section"><div class="sec-title">📝 Notas do Mestre</div><div class="sec-body">${escapeHtml(b.notas)}</div></div>` : ''}
    </div>
  `;

  editBtn.style.display = (typeof isAdm==='function' && isAdm()) ? 'inline-flex' : 'none';
  editBtn.onclick = () => { closeModal('modalVerMais'); openBossModal(id); };
  openModal('modalVerMais');
}

function renderBosses(filter=''){
  if(!state.bosses) state.bosses = [];
  const grid = document.getElementById('gridBosses');
  if(!grid) return;
  grid.innerHTML = '';
  const list = state.bosses.filter(b => b.nome.toLowerCase().includes(filter.toLowerCase()));
  if(list.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="ic">💀</div>Nenhum boss ainda. Clique em "Novo Boss" para criar o primeiro chefão.</div>`;
    return;
  }
  list.forEach(b => grid.appendChild(buildBossCard(b)));
}

document.getElementById('searchBosses').addEventListener('input', (e) => renderBosses(e.target.value));

// ANOTAÇÕES PESSOAIS — armazenamento por usuário (isolado, no Supabase)
// ============================================================

async function loadNotas() {
  if (!currentUser) return { cadernos: [] };
  try {
    const { data, error } = await sb
      .from('rpg_notas')
      .select('cadernos')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error) throw error;
    if (data) return { cadernos: data.cadernos || [] };
  } catch(e) { console.warn('Falha ao carregar notas', e); }
  return { cadernos: [] };
}

function saveNotas(data) {
  if (!currentUser) return;
  // Fire-and-forget: não bloqueia a digitação do usuário
  sb
    .from('rpg_notas')
    .upsert({ user_id: currentUser.id, cadernos: data.cadernos, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(({ error }) => { if (error) console.warn('Falha ao salvar notas', error); });
}

// Estado da UI de notas
let notasState = { cadernos: [] };
let notasCurrentCadernoId = null;
let notasCurrentPaginaIdx = 0;
let notasSaveTimer = null;

// ── Inicializa a aba quando acessada ──────────────────────────
async function initNotas() {
  notasState = await loadNotas();
  if (!notasState.cadernos) notasState.cadernos = [];
  renderCadernos();
  if (notasState.cadernos.length > 0) {
    openCaderno(notasState.cadernos[0].id);
  } else {
    showNotasEmpty(true);
  }
}

// ── Render sidebar ────────────────────────────────────────────
function renderCadernos() {
  const list = document.getElementById('cadernos-list');
  list.innerHTML = '';
  notasState.cadernos.forEach(c => {
    const totalPags = c.paginas ? c.paginas.length : 0;
    const item = document.createElement('div');
    item.className = 'notas-caderno-item' + (c.id === notasCurrentCadernoId ? ' active' : '');
    item.innerHTML = `
      <span class="notas-caderno-ic">${c.icone || '📓'}</span>
      <span class="notas-caderno-label">${escapeHtml(c.nome || 'Sem título')}</span>
      <span class="notas-caderno-count">${totalPags}p</span>
    `;
    item.addEventListener('click', () => openCaderno(c.id));
    list.appendChild(item);
  });
}

// ── Abrir caderno ─────────────────────────────────────────────
function openCaderno(id) {
  notasCurrentCadernoId = id;
  notasCurrentPaginaIdx = 0;
  showNotasEmpty(false);
  renderCadernos();
  renderEditorCaderno();
}

function showNotasEmpty(show) {
  document.getElementById('notasEmpty').style.display  = show ? 'flex' : 'none';
  document.getElementById('notasEditor').style.display = show ? 'none'  : 'flex';
}

function getCurrentCaderno() {
  return notasState.cadernos.find(c => c.id === notasCurrentCadernoId) || null;
}

// ── Render editor ─────────────────────────────────────────────
function renderEditorCaderno() {
  const c = getCurrentCaderno();
  if (!c) { showNotasEmpty(true); return; }
  if (!c.paginas || c.paginas.length === 0) {
    c.paginas = [{ titulo: 'Página 1', texto: '' }];
    saveNotas(notasState);
  }
  // Garante índice válido
  if (notasCurrentPaginaIdx >= c.paginas.length) notasCurrentPaginaIdx = c.paginas.length - 1;

  document.getElementById('notasCadernoNome').value = c.nome || '';
  renderPaginasTabs(c);
  loadPaginaTexto(c);
  updateCharCount();
}

function renderPaginasTabs(c) {
  const bar = document.getElementById('notas-pages-bar');
  // Remove tabs existentes mas mantém o botão de nova página
  bar.querySelectorAll('.notas-page-tab').forEach(t => t.remove());

  const btnNova = document.getElementById('btnNovaPagina');
  c.paginas.forEach((p, i) => {
    const tab = document.createElement('button');
    tab.className = 'notas-page-tab' + (i === notasCurrentPaginaIdx ? ' active' : '');
    tab.innerHTML = `${escapeHtml(p.titulo || ('Página ' + (i+1)))}${c.paginas.length > 1 ? ' <span class="notas-page-del" data-del="'+i+'">✕</span>' : ''}`;
    tab.addEventListener('click', (e) => {
      if (e.target.dataset.del !== undefined) {
        deletePagina(parseInt(e.target.dataset.del));
        return;
      }
      notasCurrentPaginaIdx = i;
      renderEditorCaderno();
    });
    tab.addEventListener('dblclick', () => renamePagina(i));
    bar.insertBefore(tab, btnNova);
  });
}

function loadPaginaTexto(c) {
  const ta = document.getElementById('notasTextarea');
  const p = c.paginas[notasCurrentPaginaIdx];
  ta.value = p ? (p.texto || '') : '';
}

function updateCharCount() {
  const ta = document.getElementById('notasTextarea');
  document.getElementById('notasCharCount').textContent = ta.value.length + ' caracteres';
}

// ── Auto-save ao digitar ──────────────────────────────────────
document.getElementById('notasTextarea').addEventListener('input', () => {
  updateCharCount();
  const ind = document.getElementById('notasSavedIndicator');
  ind.textContent = '...salvando';
  ind.className = 'notas-saved-indicator saving show';
  clearTimeout(notasSaveTimer);
  notasSaveTimer = setTimeout(() => {
    const c = getCurrentCaderno();
    if (!c) return;
    c.paginas[notasCurrentPaginaIdx].texto = document.getElementById('notasTextarea').value;
    saveNotas(notasState);
    ind.textContent = '✔ Salvo';
    ind.className = 'notas-saved-indicator show';
    setTimeout(() => ind.classList.remove('show'), 2000);
  }, 600);
});

// ── Renomear caderno ──────────────────────────────────────────
document.getElementById('notasCadernoNome').addEventListener('input', (e) => {
  const c = getCurrentCaderno();
  if (!c) return;
  c.nome = e.target.value;
  clearTimeout(notasSaveTimer);
  notasSaveTimer = setTimeout(() => {
    saveNotas(notasState);
    renderCadernos();
  }, 500);
});

// ── Novo caderno ──────────────────────────────────────────────
document.getElementById('btnNovoCaderno').addEventListener('click', () => {
  const nome = prompt('Nome do novo caderno:', 'Meu caderno');
  if (nome === null) return;
  const novo = {
    id: 'cad_' + Date.now().toString(36),
    nome: nome.trim() || 'Caderno',
    icone: '📓',
    paginas: [{ titulo: 'Página 1', texto: '' }]
  };
  notasState.cadernos.push(novo);
  saveNotas(notasState);
  renderCadernos();
  openCaderno(novo.id);
});

// ── Excluir caderno ───────────────────────────────────────────
document.getElementById('btnDelCaderno').addEventListener('click', () => {
  const c = getCurrentCaderno();
  if (!c) return;
  if (!confirm(`Excluir o caderno "${c.nome}"? Todas as páginas serão perdidas.`)) return;
  notasState.cadernos = notasState.cadernos.filter(x => x.id !== c.id);
  notasCurrentCadernoId = null;
  saveNotas(notasState);
  renderCadernos();
  if (notasState.cadernos.length > 0) {
    openCaderno(notasState.cadernos[0].id);
  } else {
    showNotasEmpty(true);
  }
});

// ── Nova página ───────────────────────────────────────────────
document.getElementById('btnNovaPagina').addEventListener('click', () => {
  const c = getCurrentCaderno();
  if (!c) return;
  const n = c.paginas.length + 1;
  const titulo = prompt('Nome da página:', 'Página ' + n);
  if (titulo === null) return;
  c.paginas.push({ titulo: titulo.trim() || 'Página ' + n, texto: '' });
  notasCurrentPaginaIdx = c.paginas.length - 1;
  saveNotas(notasState);
  renderEditorCaderno();
});

// ── Deletar página ────────────────────────────────────────────
function deletePagina(idx) {
  const c = getCurrentCaderno();
  if (!c || c.paginas.length <= 1) { alert('O caderno precisa ter pelo menos uma página.'); return; }
  if (!confirm(`Excluir a página "${c.paginas[idx].titulo}"?`)) return;
  c.paginas.splice(idx, 1);
  if (notasCurrentPaginaIdx >= c.paginas.length) notasCurrentPaginaIdx = c.paginas.length - 1;
  saveNotas(notasState);
  renderEditorCaderno();
}

// ── Renomear página (dblclick na tab) ─────────────────────────
function renamePagina(idx) {
  const c = getCurrentCaderno();
  if (!c) return;
  const novo = prompt('Novo nome da página:', c.paginas[idx].titulo);
  if (novo === null) return;
  c.paginas[idx].titulo = novo.trim() || c.paginas[idx].titulo;
  saveNotas(notasState);
  renderEditorCaderno();
}

// ============================================================
// CRÉDITOS — texto + imagem de capa, editável apenas pelo ADM
// ============================================================
if(!state.creditos) state.creditos = { imagem: '', texto: '' };

const creditosImgField = setupImageField({
  fieldId:'credImgField', inputId:'credImgInput', hiddenId:'credImagem',
  changeBtnId:'credImgChangBtn', removeBtnId:'credImgRemoveBtn', folder:'creditos'
});

// Volta a aba de créditos para o modo de leitura (sai do modo de edição)
function showCreditosDisplay(){
  document.getElementById('creditosEditor').style.display = 'none';
  document.getElementById('creditosDisplay').style.display = '';
  document.getElementById('credImgField').style.display = 'none';

  const banner = document.getElementById('credBannerStatic');
  if(state.creditos.imagem){
    banner.src = state.creditos.imagem;
    banner.style.display = '';
  }else{
    banner.style.display = 'none';
  }
}

function renderCreditos(){
  if(!state.creditos) state.creditos = { imagem: '', texto: '' };
  const adm = typeof isAdm === 'function' && isAdm();

  const editBtn = document.getElementById('btnEditarCreditos');
  if(editBtn) editBtn.style.display = adm ? '' : 'none';

  showCreditosDisplay();

  const display = document.getElementById('creditosDisplay');
  if(state.creditos.texto && state.creditos.texto.trim()){
    display.innerHTML = `<div class="creditos-text">${escapeHtml(state.creditos.texto)}</div>`;
  }else{
    display.innerHTML = `<div class="empty-state"><div class="ic">🎬</div>${
      adm
        ? 'Nenhum crédito escrito ainda. Clique em "✏️ Editar" para começar.'
        : 'Os créditos desta mesa ainda não foram definidos pelo Mestre.'
    }</div>`;
  }
}

document.getElementById('btnEditarCreditos').addEventListener('click', () => {
  if(typeof isAdm==='function' && !isAdm()){ alert('Apenas o Mestre pode editar os créditos.'); return; }
  creditosImgField.setImage(state.creditos.imagem || '');
  document.getElementById('creditosTextarea').value = state.creditos.texto || '';
  document.getElementById('creditosDisplay').style.display = 'none';
  document.getElementById('credBannerStatic').style.display = 'none';
  document.getElementById('credImgField').style.display = '';
  document.getElementById('creditosEditor').style.display = '';
  document.getElementById('btnEditarCreditos').style.display = 'none';
});

document.getElementById('btnCancelarCreditos').addEventListener('click', () => {
  renderCreditos();
});

document.getElementById('btnSalvarCreditos').addEventListener('click', () => {
  if(typeof isAdm==='function' && !isAdm()){ alert('Apenas o Mestre pode editar os créditos.'); return; }
  state.creditos = {
    imagem: document.getElementById('credImagem').value || '',
    texto:  document.getElementById('creditosTextarea').value.trim()
  };
  saveState();
  renderCreditos();
});
