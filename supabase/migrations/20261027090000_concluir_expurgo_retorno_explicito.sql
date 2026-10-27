-- =============================================================================
-- Conclusão do expurgo: retorno explícito, sem sucesso por omissão
-- =============================================================================
--
-- Incremental, sobre `20261009220000_expurgo_conclusao_atomica.sql`. Aquela
-- migration foi aplicada e não é reescrita; esta substitui apenas o corpo da
-- função, que tinha três buracos — todos na mesma linha de raciocínio.
--
-- ───────────────────────────── O QUE ESTAVA ERRADO ─────────────────────────
--
-- A versão anterior decidia por `row_count = 0`:
--
--     if v_afetadas = 0 then
--       -- Ou já estava concluído, ou o registro não existe. Os dois casos são
--       -- "nada a fazer aqui"; distingui-los não muda a ação de quem chama.
--       return 'ja_concluido';
--     end if;
--
-- O comentário estava errado, e por isso o código também.
--
--   1. REGISTRO INEXISTENTE devolvia `ja_concluido`. Um caminho de objeto
--      digitado errado, um documento apagado por outro processo, uma esteira
--      apontando para a tabela errada — tudo isso respondia "já estava feito".
--      O executor marcava sucesso para um expurgo que nunca existiu.
--
--   2. `ja_concluido` NÃO CONFERIA A TRILHA. Dizia "outra execução concluiu"
--      sem olhar se havia evento `purge`. Se o evento faltasse, a resposta era
--      a mesma: sucesso.
--
--   3. REGISTRO EXPURGADO SEM AUDITORIA, que é o estado que a conclusão
--      atômica existe para impedir, saía como sucesso em vez de alarme. E é o
--      estado que mais custa: `purged_at` preenchido tira o documento da
--      seleção para sempre, então ninguém volta a olhar — e a trilha, que era
--      a prova de que o documento existiu e foi apagado, não tem a linha.
--
-- ─────────────────────────────── O QUE MUDA ────────────────────────────────
--
-- `ja_concluido` passa a exigir as DUAS condições: registro expurgado E evento
-- `purge` correspondente. Qualquer outra coisa é erro, com SQLSTATE próprio
-- para quem chama poder distinguir sem ler mensagem:
--
--   DV001  registro inexistente            -> pendência de conclusão
--   DV002  expurgado sem evento `purge`    -> inconsistência, nunca sucesso
--
-- A conclusão atômica, a recuperação com objeto ausente e a proteção contra
-- concorrência ficam como estão: o `update` segue condicionado a
-- `purged_at is null`, e as três gravações seguem na mesma transação.

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
  v_afetadas   int;
  v_purged_at  timestamptz;
  v_existe     boolean;
begin
  -- 1. O registro existe?
  --
  -- `for update` trava a linha desde já. Sem isso, entre esta leitura e o
  -- `update` do passo 3 cabe outra transação, e o caso de corrida teria de
  -- ser reconstruído depois pelo `row_count`. Com a trava, quem chega
  -- segundo espera e lê o estado final de quem chegou primeiro.
  select purged_at into v_purged_at
    from public.validation_documents
   where object_path = p_object_path
     for update;

  if not found then
    raise exception
      'expurgo: nao ha registro de documento para este caminho de objeto'
      using errcode = 'DV001';
  end if;

  -- 2. Já expurgado? Então `ja_concluido` SÓ se a trilha tiver o evento.
  if v_purged_at is not null then
    select exists (
      select 1 from public.document_audit
       where object_path = p_object_path and action = 'purge'
    ) into v_existe;

    if v_existe then
      return 'ja_concluido';
    end if;

    -- `purged_at` preenchido e trilha sem o evento. Não é sucesso, não é
    -- pendência — é um estado que não deveria existir, e some do radar
    -- sozinho porque o documento não volta a ser selecionado.
    raise exception
      'expurgo: documento marcado como expurgado sem evento purge na trilha'
      using errcode = 'DV002';
  end if;

  -- 3. Não expurgado: concluir. O `where purged_at is null` continua ali como
  --    segunda barreira — a trava do passo 1 já serializa, e redundância aqui
  --    custa nada.
  update public.validation_documents
     set purged_at = p_quando,
         last_purge_failure = null
   where object_path = p_object_path
     and purged_at is null;

  get diagnostics v_afetadas = row_count;

  if v_afetadas = 0 then
    -- Com a linha travada no passo 1, chegar aqui significa que o estado do
    -- registro mudou debaixo da trava, o que não é esperado. Erro, não
    -- sucesso.
    raise exception
      'expurgo: o registro mudou de estado durante a conclusao'
      using errcode = 'DV002';
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
  'trilha, na mesma transacao. Devolve concluido, ou ja_concluido SO quando o '
  'registro estiver expurgado E houver evento purge. Registro inexistente '
  'levanta DV001; expurgado sem auditoria levanta DV002. Nenhum dos dois e '
  'sucesso.';

revoke all on function public.concluir_expurgo_de_documento(
  text, timestamptz, uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- ─────────────────── fail-closed: o que não pode ter mudado ────────────────

do $$
declare
  v_resultado text;
begin
  if has_function_privilege('anon',
       'public.concluir_expurgo_de_documento(text, timestamptz, uuid, uuid, text, text, text, text)',
       'execute')
     or has_function_privilege('authenticated',
       'public.concluir_expurgo_de_documento(text, timestamptz, uuid, uuid, text, text, text, text)',
       'execute') then
    raise exception 'a funcao de conclusao ficou ao alcance do cliente';
  end if;

  -- Caminho que seguramente não existe: tem de levantar DV001, não devolver
  -- 'ja_concluido'. É a regressão da própria migration, cobrada na aplicação.
  begin
    select public.concluir_expurgo_de_documento(
      'caminho/que/nao/existe/' || gen_random_uuid()::text,
      now(), gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
      'system', 'identity_validation', 'selfie', 'BIOMETRIC_EXPIRED'
    ) into v_resultado;
    raise exception
      'registro inexistente devolveu % em vez de levantar DV001', v_resultado;
  exception
    when sqlstate 'DV001' then
      null;  -- esperado
  end;
end $$;
