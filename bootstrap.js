// ============================================================
// BOOTSTRAP — orquestra o carregamento assíncrono via Supabase
// ============================================================
// Este arquivo deve ser carregado por último (depois de app.js e
// adm.js). Ele substitui a antiga inicialização síncrona que existia
// no final de cada arquivo.

function mostrarTelaCarregando(mostrar) {
  let el = document.getElementById('loadingScreen');
  if (mostrar) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'loadingScreen';
      el.style.cssText = `
        position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:14px;
        background:radial-gradient(ellipse at 50% 30%, #2a1e0e 0%, #150e05 60%, #0a0704 100%);
        color:#cb9e3a;font-family:'Cinzel',serif;letter-spacing:.05em;
      `;
      el.innerHTML = `
        <div style="font-size:34px;animation:loadingSpin 1.4s linear infinite;">⚙️</div>
        <div>Conectando à mesa...</div>
        <style>@keyframes loadingSpin{to{transform:rotate(360deg);}}</style>
      `;
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
  } else if (el) {
    el.style.display = 'none';
  }
}

function mostrarErroConexao(mensagem) {
  const el = document.getElementById('loadingScreen');
  if (!el) return;
  el.innerHTML = `
    <div style="font-size:34px;">⚠️</div>
    <div style="max-width:340px;text-align:center;font-family:'Crimson Pro',serif;letter-spacing:0;">${mensagem}</div>
    <button class="btn btn-primary" onclick="location.reload()" style="margin-top:8px;">Tentar novamente</button>
  `;
}

let _realtimeChannel = null;

function iniciarRealtimeSync() {
  if (_realtimeChannel) return;
  _realtimeChannel = sb
    .channel('rpg_state_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rpg_state' }, (payload) => {
      // Ignora o eco da própria escrita: se quem salvou foi esta mesma aba, não há nada novo para aplicar
      if (payload.new && payload.new.last_writer === CLIENT_ID) return;
      if (payload.new) {
        state = linhaParaState(payload.new);
        rerenderizarTudo();
      }
    })
    .subscribe();
}

function rerenderizarTudo() {
  // Evita resetar um formulário que o usuário esteja editando no momento
  const modalAberto = document.querySelector('.modal-overlay.active');
  if (modalAberto) return;

  if (typeof renderMapSelector === 'function') renderMapSelector();
  if (typeof renderMap         === 'function') renderMap();
  if (typeof renderPersonagens === 'function') renderPersonagens();
  if (typeof renderNpcs        === 'function') renderNpcs();
  if (typeof renderAliados     === 'function') renderAliados();
  if (typeof renderBosses      === 'function') renderBosses();
  if (typeof renderItens       === 'function') renderItens();
  if (typeof renderMissoes     === 'function') renderMissoes();
  if (typeof renderEventos     === 'function') renderEventos();
  if (typeof renderCreditos    === 'function') renderCreditos();
  if (typeof renderAdmPanel    === 'function' && typeof isAdm === 'function' && isAdm()) renderAdmPanel();
}

async function bootstrapApp() {
  mostrarTelaCarregando(true);
  try {
    state = await loadState();
    _stateCarregadoComSucesso = true; // libera saveState() — só a partir de aqui é seguro salvar
    init(); // definida em app.js — popula mapa inicial, exemplo, etc se for primeira vez
    await checkAuth(); // definida em adm.js — decide entre tela de login ou entrar direto
    iniciarRealtimeSync();
    mostrarTelaCarregando(false);
  } catch (e) {
    console.error('Falha ao inicializar a mesa', e);
    mostrarErroConexao('Não foi possível carregar os dados da mesa. Por segurança, o app não vai continuar (isso evita sobrescrever seus dados com uma mesa vazia). Verifique sua internet e tente novamente em alguns segundos.');
  }
}

bootstrapApp();
