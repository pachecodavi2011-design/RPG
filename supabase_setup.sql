-- ============================================================
-- MESA DE RPG — SETUP DO SUPABASE
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- (Painel → SQL Editor → New query → cole tudo → Run)
-- ============================================================

-- ------------------------------------------------------------
-- 1) TABELA DE ESTADO DO JOGO (linha única compartilhada)
-- ------------------------------------------------------------
create table if not exists rpg_state (
  id            int primary key default 1,
  maps          jsonb not null default '[]',
  active_map_id text,
  personagens   jsonb not null default '[]',
  npcs          jsonb not null default '[]',
  itens         jsonb not null default '[]',
  missoes       jsonb not null default '[]',
  eventos       jsonb not null default '[]',
  aliados       jsonb not null default '[]',
  bosses        jsonb not null default '[]',
  creditos      jsonb not null default '{"imagem":"","texto":""}',
  last_writer   text,
  updated_at    timestamptz not null default now(),

  -- Garante que só pode existir a linha id=1 (estado único e compartilhado)
  constraint rpg_state_singleton check (id = 1)
);

-- Garante que a linha inicial exista
insert into rpg_state (id)
values (1)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2) TABELA DE USUÁRIOS (login próprio, nome + senha)
-- ------------------------------------------------------------
create table if not exists rpg_users (
  id             text primary key,
  nome           text not null,
  nome_lower     text generated always as (lower(nome)) stored,
  cargo          text,
  senha          text not null,
  role           text not null default 'jogador' check (role in ('adm','jogador')),
  cor            text default '#566b35',
  personagem_id  text,
  created_at     timestamptz not null default now()
);

create unique index if not exists rpg_users_nome_lower_idx on rpg_users (nome_lower);

-- Usuário Mestre padrão (mesmo usuário/senha que o app já usava localmente)
insert into rpg_users (id, nome, cargo, senha, role, cor, personagem_id)
values ('adm_root', 'Mestre', 'Mestre — Dono da Mesa', 'mestre123', 'adm', '#cb9e3a', null)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3) TABELA DE ANOTAÇÕES PESSOAIS (uma linha por usuário)
-- ------------------------------------------------------------
create table if not exists rpg_notas (
  user_id    text primary key references rpg_users(id) on delete cascade,
  cadernos   jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4) REALTIME — habilita transmissão de mudanças ao vivo
-- ------------------------------------------------------------
alter publication supabase_realtime add table rpg_state;
alter publication supabase_realtime add table rpg_users;

-- ------------------------------------------------------------
-- 5) STORAGE — bucket público para imagens (mapas, fotos, etc.)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('rpg-media', 'rpg-media', true)
on conflict (id) do nothing;

-- ============================================================
-- OBSERVAÇÃO SOBRE SEGURANÇA (RLS)
-- ============================================================
-- Este setup NÃO usa Row Level Security (RLS): qualquer pessoa com a
-- URL e a anon key do projeto pode ler e escrever nessas tabelas e no
-- bucket. Isso foi uma escolha consciente para simplificar uma mesa
-- privada entre amigos. Se quiser adicionar RLS depois, me avise.
-- ============================================================
