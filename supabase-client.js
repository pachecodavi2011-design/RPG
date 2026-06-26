// ============================================================
// CLIENTE SUPABASE — configuração e helpers
// ============================================================
// Preencha com a URL e a anon key do seu projeto (Painel Supabase →
// Settings → API). A anon key é pública por natureza: ela fica
// visível no navegador e suas permissões são controladas pelas
// regras (RLS) do banco — neste projeto, RLS está desativado por
// simplicidade (mesa privada entre amigos).
const SUPABASE_URL = 'https://tkrkercioooilbmsgolo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrcmtlcmNpb29vaWxibXNnb2xvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTk5NDksImV4cCI6MjA5Nzk5NTk0OX0.mv8O6Guo0Fs52RxySTUGdtajngA0HCwEoCoF09_UIA0';

// Importante: chamamos a variável local de 'sb' (e não 'supabase') porque o
// próprio SDK do Supabase expõe um objeto global chamado 'supabase' — usar o
// mesmo nome causa o erro "Identifier 'supabase' has already been declared".
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const RPG_BUCKET = 'rpg-media';

/**
 * Faz upload de um arquivo de imagem para o Supabase Storage e
 * retorna a URL pública para salvar no estado/registro.
 * @param {File} file
 * @param {string} folder - subpasta dentro do bucket (ex: 'mapas', 'personagens')
 * @returns {Promise<string>} URL pública da imagem
 */
async function uploadImagemParaStorage(file, folder) {
  if (!file) return '';
  const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'png';
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await sb.storage.from(RPG_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) {
    console.error('Erro ao enviar imagem para o Storage:', error);
    throw error;
  }

  const { data } = sb.storage.from(RPG_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Converte um Blob (ex: vindo de colar do clipboard) em File antes do upload.
 */
function blobParaFile(blob, nomeSugerido) {
  const tipo = blob.type || 'image/png';
  const ext = tipo.split('/')[1] || 'png';
  return new File([blob], nomeSugerido || `colado_${Date.now()}.${ext}`, { type: tipo });
}
