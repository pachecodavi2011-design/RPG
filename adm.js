// ============================================================
// SISTEMA DE AUTENTICAÇÃO & ADM — adm.js (Supabase)
// ============================================================
const AUTH_KEY = 'mesa_rpg_auth_v1'; // sessão fica no sessionStorage (local, não compartilhada)

// ---------- Usuários ----------
async function loadUsers() {
  try {
    const { data, error } = await sb.from('rpg_users').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    if (data && data.length > 0) {
      return data.map(u => ({
        id: u.id, nome: u.nome, cargo: u.cargo, senha: u.senha,
        role: u.role, cor: u.cor, personagemId: u.personagem_id
      }));
    }
  } catch(e) { console.warn('Falha ao carregar usuários do Supabase', e); }
  // Fallback: usuário Mestre padrão (caso a tabela ainda esteja vazia/inacessível)
  return [{
    id: 'adm_root', nome: 'Mestre', cargo: 'Mestre — Dono da Mesa',
    senha: 'mestre123', role: 'adm', cor: '#cb9e3a', personagemId: null
  }];
}

async function saveUser(u) {
  const { error } = await sb.from('rpg_users').upsert({
    id: u.id, nome: u.nome, cargo: u.cargo, senha: u.senha,
    role: u.role, cor: u.cor, personagem_id: u.personagemId
  }, { onConflict: 'id' });
  if (error) { console.warn('Falha ao salvar usuário', error); throw error; }
}

async function deleteUserRemoto(id) {
  const { error } = await sb.from('rpg_users').delete().eq('id', id);
  if (error) { console.warn('Falha ao excluir usuário', error); throw error; }
}

let currentUser = null;

// ---------- Helpers de permissão (usados pelo app.js) ----------
function isAdm() {
  return currentUser && currentUser.role === 'adm';
}

/**
 * Retorna true se o usuário logado pode editar o personagem p.
 * ADM pode tudo. Jogador só pode editar seu próprio personagem vinculado.
 */
function canEditPersonagem(p) {
  if (!currentUser) return false;
  if (isAdm()) return true;
  return currentUser.personagemId === p.id;
}

// ---------- Sessão (local ao navegador — apenas "quem está logado aqui") ----------
function getSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}
function setSession(user) {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify({ id: user.id }));
}
function clearSession() {
  sessionStorage.removeItem(AUTH_KEY);
}

// ---------- Login ----------
function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appWrapper').style.display  = 'none';
}
function hideLoginScreen() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appWrapper').style.display  = 'flex';
}

async function doLogin() {
  const name   = document.getElementById('loginUser').value.trim();
  const pass   = document.getElementById('loginPass').value;
  const err    = document.getElementById('loginError');
  const btn    = document.getElementById('btnLogin');
  err.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

  try {
    const users = await loadUsers();
    const found = users.find(u =>
      u.nome.toLowerCase() === name.toLowerCase() && u.senha === pass
    );
    if (!found) { err.textContent = '❌ Usuário ou senha incorretos.'; return; }

    currentUser = found;
    setSession(found);
    hideLoginScreen();
    await afterLogin();
  } catch(e) {
    err.textContent = '⚠️ Não foi possível conectar à mesa. Verifique sua internet.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

document.addEventListener('keydown', (e) => {
  const ls = document.getElementById('loginScreen');
  if (ls && ls.style.display !== 'none' && e.key === 'Enter') doLogin();
});

// ---------- Pós-login ----------
async function afterLogin() {
  applyUserContext();
  applyMapPermissions();
  await renderAdmPanel();
  // Re-renderiza tudo para aplicar permissões
  if (typeof renderPersonagens === 'function') renderPersonagens();
  if (typeof renderNpcs        === 'function') renderNpcs();
  if (typeof renderAliados     === 'function') renderAliados();
  if (typeof renderBosses      === 'function') renderBosses();
  if (typeof renderItens       === 'function') renderItens();
  if (typeof renderMissoes     === 'function') renderMissoes();
  if (typeof renderEventos     === 'function') renderEventos();
  if (typeof renderCreditos    === 'function') renderCreditos();
  // notas são inicializadas ao abrir a aba (por usuário)
  if (typeof renderMap         === 'function') renderMap();

  // Se for jogador com personagem vinculado, navega direto para a ficha dele
  if (!isAdm() && currentUser.personagemId) {
    const navPersonagens = document.querySelector('.nav-btn[data-view="personagens"]');
    if (navPersonagens) navPersonagens.click();
  }
}

function applyUserContext() {
  // Aba ADM só para o dono
  const admBtn = document.getElementById('navAdm');
  admBtn.style.display = isAdm() ? 'flex' : 'none';

  // Botões de criar novo personagem/NPC: só ADM
  const btnNovoP = document.getElementById('btnNovoPersonagem');
  const btnNovoN = document.getElementById('btnNovoNpc');
  const btnNovoAliado = document.getElementById('btnNovoAliado');
  const btnNovoBoss   = document.getElementById('btnNovoBoss');
  if (btnNovoP) btnNovoP.style.display = isAdm() ? '' : 'none';
  if (btnNovoN)      btnNovoN.style.display      = isAdm() ? '' : 'none';
  if (btnNovoAliado) btnNovoAliado.style.display = isAdm() ? '' : 'none';
  if (btnNovoBoss)   btnNovoBoss.style.display   = isAdm() ? '' : 'none';

  // Botões de criar missão e item: só ADM
  const btnNovoEvento = document.getElementById('btnNovoEvento');
  if (btnNovoEvento) btnNovoEvento.style.display = isAdm() ? '' : 'none';
  const btnNovaMissao = document.getElementById('btnNovaMissao');
  const btnNovoItem   = document.getElementById('btnNovoItem');
  if (btnNovaMissao) btnNovaMissao.style.display = isAdm() ? '' : 'none';
  if (btnNovoItem)   btnNovoItem.style.display   = isAdm() ? '' : 'none';

  // Badge do usuário no topbar
  const badge = document.getElementById('userBadge');
  if (currentUser) {
    badge.innerHTML = `
      <div style="text-align:right;line-height:1.3;">
        <div class="user-cargo">${escapeHtml(currentUser.cargo || (isAdm() ? 'Mestre' : 'Jogador'))}</div>
        <div class="user-name">${escapeHtml(currentUser.nome)}</div>
      </div>
      <div class="user-dot" style="background:${currentUser.cor||'#566b35'}">${currentUser.nome.slice(0,2).toUpperCase()}</div>
      <button id="btnLogout" title="Sair">🚪</button>
    `;
    document.getElementById('btnLogout').addEventListener('click', () => {
      clearSession();
      currentUser = null;
      showLoginScreen();
    });
  }
}

function applyMapPermissions() {
  // Esconde controles de mapa para não-ADM
  const mapControls = ['btnNewMap','btnDeleteMap','btnUploadMap','btnAddToken'];
  mapControls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdm() ? '' : 'none';
  });
  // Seletor de mapa: somente leitura para jogadores
  const sel = document.getElementById('mapSelector');
  if (sel) sel.disabled = !isAdm();
}

// ============================================================
// PAINEL ADM
// ============================================================
async function renderAdmPanel() {
  if (!isAdm()) return;
  const users = await loadUsers();
  const grid  = document.getElementById('admUsersGrid');
  if (!grid) return;
  grid.innerHTML = '';

  users.forEach(u => {
    // Nome do personagem vinculado
    let nomePers = '—';
    if (u.personagemId && typeof state !== 'undefined') {
      const p = state.personagens.find(x => x.id === u.personagemId);
      if (p) nomePers = p.nome;
    }

    const card = document.createElement('div');
    card.className = 'adm-user-card' + (u.role === 'adm' ? ' adm-owner' : '');
    card.innerHTML = `
      <div class="adm-user-avatar" style="background:${u.cor||'#566b35'}">${(u.nome||'?').slice(0,2).toUpperCase()}</div>
      <div class="adm-user-info">
        <div class="adm-user-name">${escapeHtml(u.nome)}${u.role==='adm'?' <span class="adm-crown">👑</span>':''}</div>
        <div class="adm-user-cargo">${escapeHtml(u.cargo||'Sem cargo definido')}</div>
        <div class="adm-user-pers">⚔️ Personagem: <strong>${escapeHtml(nomePers)}</strong></div>
        <div class="adm-user-role-pill role-${u.role}">${u.role==='adm'?'ADM — Mestre':'Jogador'}</div>
      </div>
      <div class="adm-user-actions">
        <button class="btn btn-sm" data-action="edit" data-id="${u.id}">✏️ Editar</button>
        ${u.id!=='adm_root'?`<button class="btn btn-danger btn-sm" data-action="del" data-id="${u.id}">🗑️</button>`:''}
      </div>
    `;
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openAdmUserModal(u.id));
    const delBtn = card.querySelector('[data-action="del"]');
    if (delBtn) delBtn.addEventListener('click', () => deleteAdmUser(u.id));
    grid.appendChild(card);
  });
}

let editingAdmUserId = null;

async function openAdmUserModal(id) {
  editingAdmUserId = id || null;
  const users = await loadUsers();

  // Popula select de personagens
  const selPers = document.getElementById('admUPersonagem');
  selPers.innerHTML = '<option value="">— Nenhum (ADM / sem personagem) —</option>';
  if (typeof state !== 'undefined') {
    state.personagens.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nome;
      selPers.appendChild(opt);
    });
  }

  if (id) {
    const u = users.find(x => x.id === id);
    document.getElementById('modalAdmUserTitle').textContent = 'Editar usuário';
    document.getElementById('admUNome').value   = u.nome;
    document.getElementById('admUCargo').value  = u.cargo || '';
    document.getElementById('admUSenha').value  = '';
    document.getElementById('admUSenhaHint').textContent = 'Deixe em branco para não alterar a senha';
    document.getElementById('admURole').value   = u.role;
    document.getElementById('admUCor').value    = u.cor || '#566b35';
    selPers.value = u.personagemId || '';
    document.getElementById('admURole').disabled = (id === 'adm_root');
  } else {
    document.getElementById('modalAdmUserTitle').textContent = 'Novo usuário';
    document.getElementById('admUNome').value   = '';
    document.getElementById('admUCargo').value  = '';
    document.getElementById('admUSenha').value  = '';
    document.getElementById('admUSenhaHint').textContent = '';
    document.getElementById('admURole').value   = 'jogador';
    document.getElementById('admURole').disabled = false;
    document.getElementById('admUCor').value    = '#566b35';
    selPers.value = '';
  }
  openModal('modalAdmUser');
}

document.getElementById('btnAdmSalvarUser').addEventListener('click', async () => {
  const nome  = document.getElementById('admUNome').value.trim();
  const cargo = document.getElementById('admUCargo').value.trim();
  const senha = document.getElementById('admUSenha').value;
  const role  = document.getElementById('admURole').value;
  const cor   = document.getElementById('admUCor').value;
  const personagemId = document.getElementById('admUPersonagem').value || null;

  if (!nome) { alert('Informe o nome do usuário.'); return; }

  const saveBtn = document.getElementById('btnAdmSalvarUser');
  saveBtn.disabled = true;
  try {
    const users = await loadUsers();
    if (editingAdmUserId) {
      const u = users.find(x => x.id === editingAdmUserId);
      u.nome  = nome;
      u.cargo = cargo;
      u.cor   = cor;
      u.personagemId = (editingAdmUserId === 'adm_root') ? null : personagemId;
      if (editingAdmUserId !== 'adm_root') u.role = role;
      if (senha) u.senha = senha;
      await saveUser(u);
    } else {
      if (!senha) { alert('Defina uma senha para o novo usuário.'); return; }
      const exists = users.find(u => u.nome.toLowerCase() === nome.toLowerCase());
      if (exists) { alert('Já existe um usuário com esse nome.'); return; }
      const novo = {
        id: 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
        nome, cargo, senha, role, cor, personagemId
      };
      await saveUser(novo);
    }
    closeModal('modalAdmUser');
    await renderAdmPanel();
  } catch(e) {
    alert('Não foi possível salvar o usuário. Verifique sua conexão.');
  } finally {
    saveBtn.disabled = false;
  }
});

document.getElementById('btnAdmNovoUser').addEventListener('click', () => openAdmUserModal(null));

async function deleteAdmUser(id) {
  if (id === 'adm_root') return;
  if (!confirm('Excluir este usuário? Ele não poderá mais acessar a mesa.')) return;
  try {
    await deleteUserRemoto(id);
    await renderAdmPanel();
  } catch(e) {
    alert('Não foi possível excluir o usuário. Verifique sua conexão.');
  }
}

// ============================================================
// NAVEGAÇÃO — adicionar ADM ao VIEW_META
// ============================================================
VIEW_META['adm'] = { title: 'Painel do Mestre', sub: 'Gerencie usuários e acessos da mesa' };

// ============================================================
// BOOTSTRAP — verifica sessão. Chamado pelo bootstrap.js, não auto-executa.
// ============================================================
async function checkAuth() {
  const session = getSession();
  if (session) {
    try {
      const users = await loadUsers();
      const found = users.find(u => u.id === session.id);
      if (found) {
        currentUser = found;
        hideLoginScreen();
        await afterLogin();
        return;
      }
    } catch(e) { console.warn('Falha ao verificar sessão', e); }
  }
  showLoginScreen();
}
