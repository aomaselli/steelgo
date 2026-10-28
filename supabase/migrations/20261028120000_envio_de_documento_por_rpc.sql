-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Registro de envio de documento de validação, por função definidora      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- A migration da Etapa 1 deu ao titular policies de SELECT em
-- `validation_documents` e revogou `document_audit` de `anon` e
-- `authenticated`. Deliberadamente: a trilha não se escreve pelo cliente, e o
-- registro do documento não se insere por quem quiser.
--
-- A consequência é que, do jeito como está, NÃO HÁ caminho para o titular
-- registrar o próprio envio. Há exatamente duas saídas:
--
--   1. usar a chave de service role no caminho dos documentos -- que ignora
--      RLS e transformaria toda a matriz de permissões em decoração. Há uma
--      regressão no repositório que recusa isso (`sem-service-role.test.ts`);
--   2. uma função `security definer` estreita, que recebe só o que precisa e
--      confere tudo por conta própria.
--
-- Esta é a segunda. Ela não amplia o que o titular pode fazer: continua
-- podendo registrar apenas documento DELE, na finalidade declarada, no caminho
-- que carrega o próprio identificador.
--
-- `search_path = ''` e todo objeto qualificado: função definidora que resolve
-- nome por search_path do chamador é escalada de privilégio esperando
-- acontecer.

-- ─────────────────────── envio: registro + trilha ──────────────────────────
--
-- As duas gravações numa função só, porque são um fato só. Documento
-- registrado sem evento de trilha é exatamente o estado que o #13 passou a
-- recusar no expurgo -- não faz sentido criá-lo aqui na entrada.

create or replace function public.registrar_envio_de_documento(
  p_document_id uuid,
  p_purpose     text,
  p_kind        text,
  p_object_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator  uuid := (select auth.uid());
  v_papel text;
  v_segmentos text[];
begin
  -- 1. Sem sessão não se discute mais nada.
  if v_ator is null then
    raise exception 'envio recusado: sem sessao' using errcode = 'DV010';
  end if;

  -- 2. Finalidade e espécie de lista fechada. Os mesmos `check` das tabelas,
  --    repetidos aqui para a função falhar ANTES de escrever, com mensagem
  --    que diz o que houve.
  if p_purpose is distinct from 'identity_validation' then
    raise exception 'envio recusado: finalidade % nao prevista', p_purpose
      using errcode = 'DV011';
  end if;
  if p_kind not in ('cnh_front', 'cnh_back', 'selfie') then
    raise exception 'envio recusado: especie % nao prevista', p_kind
      using errcode = 'DV011';
  end if;

  -- 3. Titularidade pelo CAMINHO, não pelo parâmetro.
  --
  --    A policy do bucket confere `(storage.foldername(name))[2]` contra
  --    `auth.uid()`. Se aqui o registro aceitasse caminho de outra pessoa,
  --    teríamos linha apontando para objeto que o titular não pode ler -- e a
  --    divergência entre tabela e bucket é o tipo de estado que ninguém
  --    percebe até precisar dele.
  v_segmentos := string_to_array(p_object_path, '/');
  if array_length(v_segmentos, 1) is distinct from 3 then
    raise exception 'envio recusado: caminho fora da forma <finalidade>/<titular>/<arquivo>'
      using errcode = 'DV012';
  end if;
  if v_segmentos[1] is distinct from p_purpose then
    raise exception 'envio recusado: finalidade do caminho diverge da declarada'
      using errcode = 'DV012';
  end if;
  if v_segmentos[2] is distinct from v_ator::text then
    raise exception 'envio recusado: o caminho nao pertence a quem envia'
      using errcode = 'DV012';
  end if;

  -- 4. O caminho não pode carregar credencial. Mesma lista da barreira de
  --    `audit.ts`, porque o caminho vai para a trilha e a trilha sobrevive ao
  --    documento.
  if p_object_path ~* '(https?://|[?&](token|signature|sig)=|eyJ[A-Za-z0-9_-]{8,}\.)' then
    raise exception 'envio recusado: caminho contem credencial ou URL'
      using errcode = 'DV013';
  end if;

  -- 5. O papel do ator, para a trilha. `admin` existe no quadro de papéis e
  --    também pode ser titular; o que vale aqui é que o evento registre o que
  --    a pessoa é, não o que ela pediu para constar.
  v_papel := case
    when public.has_role(v_ator, 'admin'::public.app_role) then 'admin'
    else 'driver'
  end;

  insert into public.validation_documents
    (id, subject_id, purpose, kind, object_path)
  values
    (p_document_id, v_ator, p_purpose, p_kind, p_object_path);

  insert into public.document_audit
    (action, subject_id, actor_id, actor_role, purpose, kind, object_path)
  values
    ('upload', v_ator, v_ator, v_papel, p_purpose, p_kind, p_object_path);

  return p_document_id;
end $$;

comment on function public.registrar_envio_de_documento(uuid, text, text, text) is
  'Registra documento de validacao e o evento de trilha na mesma transacao. '
  'Definidora porque `validation_documents` nao tem policy de insert e '
  '`document_audit` esta revogada do cliente -- e a alternativa seria service '
  'role no caminho dos documentos, que anularia a segunda barreira.';

revoke all on function public.registrar_envio_de_documento(uuid, text, text, text)
  from public, anon;
grant execute on function public.registrar_envio_de_documento(uuid, text, text, text)
  to authenticated;

-- ──────────────────── fail-closed: o que não pode ter mudado ───────────────
--
-- Confere o que esta migration pressupõe. Se qualquer pressuposto tiver caído,
-- a transação inteira volta -- inclusive a função acima.

do $$
declare
  v_concedido boolean;
begin
  if (select public from storage.buckets where id = 'validation-documents') then
    raise exception 'bucket validation-documents esta publico';
  end if;

  -- A trilha continua fora do alcance do cliente. Se alguém tiver concedido
  -- insert direto, esta função deixaria de ser o caminho único.
  select bool_or(privilege_type = 'INSERT') into v_concedido
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'document_audit'
     and grantee in ('anon', 'authenticated');
  if coalesce(v_concedido, false) then
    raise exception 'document_audit recebeu insert direto para o cliente';
  end if;

  -- E `validation_documents` continua sem policy de insert, que é a razão de
  -- esta função existir.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'validation_documents'
       and cmd = 'INSERT'
  ) then
    raise exception 'validation_documents ganhou policy de insert; revise esta funcao';
  end if;
end $$;
