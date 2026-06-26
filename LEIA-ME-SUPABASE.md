# Conectando a Mesa de RPG ao Supabase — guia de configuração

Seu app foi adaptado para usar o Supabase como banco de dados compartilhado.
Antes de abrir o `index.html`, siga estes passos **uma única vez** no painel
do seu projeto Supabase (https://supabase.com/dashboard).

## 1. Rode o script SQL

1. Abra seu projeto no painel do Supabase.
2. Vá em **SQL Editor** (menu lateral) → **New query**.
3. Cole todo o conteúdo do arquivo `supabase_setup.sql` (incluído aqui).
4. Clique em **Run**.

Isso cria:
- Tabela `rpg_state` — o estado compartilhado da mesa (mapas, personagens, etc).
- Tabela `rpg_users` — usuários e senhas (substitui o antigo localStorage).
- Tabela `rpg_notas` — anotações pessoais de cada jogador.
- Um usuário Mestre padrão: **nome `Mestre`, senha `mestre123`** (a mesma senha que o app já usava antes — troque depois pelo Painel do Mestre dentro do app).
- O bucket de Storage `rpg-media`, público, para guardar imagens de mapas, personagens, itens, etc.

## 2. Confirme que o bucket está público

1. Vá em **Storage** no menu lateral.
2. Você deve ver um bucket chamado `rpg-media`.
3. Clique nele → **Configuration** → confirme que "Public bucket" está marcado.
   (O script SQL já cria como público, mas vale confirmar.)

## 3. Habilite Realtime (geralmente automático)

O script já tenta habilitar via `alter publication supabase_realtime add table ...`.
Se por algum motivo der erro nessa parte (ex: já estava habilitado), pode ignorar
e seguir — não impede o restante do script de funcionar. Para confirmar manualmente:

1. Vá em **Database** → **Replication**.
2. Confirme que `rpg_state` e `rpg_users` aparecem na lista com Realtime ativado.

## 4. Pronto — abra o app

Os arquivos `index.html`, `app.js`, `adm.js`, `supabase-client.js` e
`bootstrap.js` já estão configurados com a URL e a chave (anon key) do seu
projeto. Basta hospedar esses 5 arquivos juntos (mesma pasta) e abrir
`index.html` no navegador.

---

## O que mudou tecnicamente

- **Antes:** cada jogador tinha seus próprios dados isolados no navegador
  (`localStorage`). Ninguém via o que o outro fazia.
- **Agora:** todos os dados (mapas, personagens, NPCs, itens, missões,
  eventos, aliados, bosses, créditos) ficam numa única linha compartilhada
  na tabela `rpg_state`. Quando alguém move um token ou edita uma ficha,
  o Supabase Realtime avisa os outros navegadores conectados, que atualizam
  a tela automaticamente (sem precisar recarregar a página).
- **Login** continua com nome de usuário + senha definidos por você (não usa
  Supabase Auth) — só que agora a lista de usuários mora na tabela
  `rpg_users` em vez do navegador.
- **Imagens** (mapas, personagens, itens, missões, bosses, banner de
  créditos) agora são enviadas para o **Supabase Storage** em vez de
  ficarem como texto base64 dentro do JSON. Isso deixa os salvamentos mais
  rápidos e evita o antigo problema de "imagem grande demais para salvar".
- **Notas pessoais** de cada jogador também migraram para o Supabase
  (tabela `rpg_notas`), continuando privadas — cada jogador só vê as
  próprias.

## Sobre segurança (leia com atenção)

Por escolha consciente (mesa privada entre amigos), este setup **não usa
Row Level Security (RLS)**. Isso significa que qualquer pessoa que descobrir
a URL e a anon key do seu projeto Supabase (ambas ficam visíveis no código
do navegador — isso é normal e esperado em qualquer app que usa Supabase)
poderia ler ou editar diretamente os dados das tabelas via API, sem precisar
fazer login no app.

Para uma mesa fechada entre amigos de confiança, esse risco normalmente é
aceitável. Se algum dia quiser reforçar isso (por exemplo, se for compartilhar
o link publicamente), me avise — dá para adicionar regras de RLS depois sem
precisar reescrever o app.

## Senha do Mestre

A senha padrão do usuário Mestre é `mestre123` (mesma que já era usada antes).
Recomendo trocá-la assim que entrar pela primeira vez: vá na aba **Painel do
Mestre** dentro do app → editar o usuário "Mestre" → defina uma nova senha.
