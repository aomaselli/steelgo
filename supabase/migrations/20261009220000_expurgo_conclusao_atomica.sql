-- =============================================================================
-- Expurgo: conclusão atômica e evento único
-- =============================================================================
--
-- Incremental, sobre `20261009090000_validation_documents.sql`, que já foi
-- homologada em banco limpo e não é reescrita. O que falta ali é o que o banco
-- precisa sustentar para que a conclusão do expurgo seja atômica e única.
--
-- ─────────────────────── 1. evento `purge` ÚNICO por objeto ────────────────
--
-- Duas execuções do expurgo podem alcançar o mesmo documento. Sem barreira no
-- banco, as duas gravam um evento `purge` para o mesmo arquivo, e a trilha
-- passa a dizer que ele foi apagado duas vezes — o que não aconteceu, e o que
-- estraga justamente a contagem que uma auditoria usaria.
--
-- O índice é PARCIAL, só sobre `action = 'purge'`: `upload`, `access` e
-- `validation_started` acontecem várias vezes para o mesmo objeto, e devem.
--
-- Com ele, a segunda execução recebe violação de unicidade dentro da própria
-- transação, não grava nada, e o código a lê como "já concluído".

create unique index if not exists document_audit_purge_unico_por_objeto
  on public.document_audit (object_path)
  where action = 'purge';

-- ─────────────────────── 2. o motivo de falha que faltava ──────────────────
--
-- `CONCLUSAO_FALHOU`: o arquivo saiu do Storage, mas a transação que grava
-- `purged_at`, limpa a falha anterior e insere o evento não confirmou. É um
-- estado distinto dos outros três — nos outros o arquivo continua lá — e
-- precisa de nome próprio para a recuperação ser legível.
--
-- O `check` da migration anterior não o conhece. Trocá-lo é obrigatório antes
-- de a aplicação tentar gravá-lo; caso contrário a própria gravação da falha
-- falha, e aí não sobra registro de nada.

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'validation_documents_purge_failure_valid'
       and conrelid = 'public.validation_documents'::regclass
  ) then
    alter table public.validation_documents
      drop constraint validation_documents_purge_failure_valid;
  end if;

  alter table public.validation_documents
    add constraint validation_documents_purge_failure_valid check (
      last_purge_failure is null
      or last_purge_failure in (
        'REMOCAO_FALHOU', 'ARQUIVO_PERSISTE', 'CONFERENCIA_FALHOU', 'CONCLUSAO_FALHOU'
      )
    );
end $$;

-- ─────────────────────── 3. a conclusão, numa transação só ─────────────────
--
-- `purged_at`, limpeza da falha e evento de trilha. As três coisas, ou
-- nenhuma. Em função, porque a atomicidade tem de valer para qualquer
-- chamador — e porque deixar as três instruções soltas no código da aplicação
-- é como elas estavam quando dava para gravar `purged_at` sem a trilha.
--
-- `security definer` com `search_path = ''`: a função escreve em
-- `document_audit`, que é append-only e está fora do alcance do cliente. Quem
-- a chama é a esteira de expurgo, nunca o titular.
--
-- O retorno distingue os dois desfechos legítimos:
--
--   'concluido'     esta chamada gravou
--   'ja_concluido'  outra execução chegou antes; nada foi gravado de novo
--
-- Qualquer outra coisa é erro, e aí a transação inteira volta atrás.

create or replace function public.concluir_expurgo_de_documento(
  p_object_path text,
  p_quando      timestamptz,
  p_subject_id  uuid,
  p_actor_id    uuid,
  p_actor_role  text,
  p_purpose     text,
  p_kind        text,
  p_reason_code text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_afetadas int;
begin
  -- Condicional em `purged_at is null`: é isto que faz a concorrência ter um
  -- vencedor só. Quem perder sai por 'ja_concluido' sem gravar evento.
  update public.validation_documents
     set purged_at = p_quando,
         last_purge_failure = null
   where object_path = p_object_path
     and purged_at is null;

  get diagnostics v_afetadas = row_count;

  if v_afetadas = 0 then
    -- Ou já estava concluído, ou o registro não existe. Os dois casos são
    -- "nada a fazer aqui"; distingui-los não muda a ação de quem chama.
    return 'ja_concluido';
  end if;

  insert into public.document_audit
    (action, subject_id, actor_id, actor_role, purpose, kind, object_path,
     reason_code, occurred_at)
  values
    ('purge', p_subject_id, p_actor_id, p_actor_role, p_purpose, p_kind,
     p_object_path, p_reason_code, p_quando);

  return 'concluido';
end $$;

comment on function public.concluir_expurgo_de_documento is
  'Conclui o expurgo de UM documento: purged_at, limpeza da falha e evento de '
  'trilha, na mesma transacao. Se o evento falhar, purged_at nao e gravado -- '
  'o estado com documento expurgado e trilha vazia e o que esta funcao existe '
  'para impedir. Devolve concluido ou ja_concluido.';

revoke all on function public.concluir_expurgo_de_documento(
  text, timestamptz, uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- ─────────────────── fail-closed: o que não pode ter mudado ────────────────

do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'document_audit_purge_unico_por_objeto'
  ) then
    raise exception 'o indice unico de evento purge nao foi criado';
  end if;

  if has_function_privilege('anon',
       'public.concluir_expurgo_de_documento(text, timestamptz, uuid, uuid, text, text, text, text)',
       'execute')
     or has_function_privilege('authenticated',
       'public.concluir_expurgo_de_documento(text, timestamptz, uuid, uuid, text, text, text, text)',
       'execute') then
    raise exception 'a funcao de conclusao ficou ao alcance do cliente';
  end if;
end $$;
