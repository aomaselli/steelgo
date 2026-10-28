-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Três lacunas da função de registro de envio, achadas em auditoria       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- A versão anterior de `registrar_envio_de_documento` conferia finalidade,
-- espécie, titularidade e ausência de credencial no caminho. Faltavam três
-- coisas, e as três só aparecem quando se pergunta "o que acontece se alguém
-- NÃO passar pela server function?".
--
-- ───────────────────────────────────────────────────────────────────────────
-- L1. A FUNÇÃO NÃO EXIGIA CONSENTIMENTO VIGENTE
--
-- `enviarDocumentoFn` confere o consentimento antes de chamar. Mas a função é
-- `grant execute to authenticated`, e PostgREST a expõe: qualquer sessão
-- válida podia registrar documento sem aceite nenhum. A primeira barreira
-- conferia; a segunda, não — e a segunda é a que vale quando alguém chama
-- direto, por script, por engano ou por um caminho novo que esqueceu a
-- conferência.
--
-- A regra aqui espelha `consentStatus` de `access.ts`: vale o ACEITE MAIS
-- RECENTE do titular, comparado ao texto publicado mais recente, por versão E
-- por sha256 do corpo. Duas implementações independentes da mesma regra é o
-- que se quer de uma segunda barreira; a bateria SQL é quem confere que
-- continuam concordando.
--
-- ───────────────────────────────────────────────────────────────────────────
-- L2. REPETIÇÃO DUPLICAVA REGISTRO E TRILHA
--
-- Não havia idempotência. Um clique duplo, uma resposta perdida na rede ou uma
-- nova tentativa depois de erro transitório produziam dois registros e DOIS
-- eventos `upload` para o mesmo envio. Trilha append-only com evento duplicado
-- é pior que trilha sem evento: ela afirma duas coisas que não aconteceram.
--
-- Agora o `p_document_id` é a chave de idempotência. Repetir com o mesmo id e
-- os mesmos dados devolve o id e NÃO grava nada de novo. Repetir o mesmo id
-- com dados diferentes é erro explícito — é tentativa de reescrever um fato.
--
-- ───────────────────────────────────────────────────────────────────────────
-- L3. AS MENSAGENS DE ERRO ECOAVAM ENTRADA DO CLIENTE
--
-- `raise exception '... finalidade % nao prevista', p_purpose` devolve ao
-- chamador o texto que o chamador mandou. É pequeno, e é o tipo de coisa que
-- vira vetor quando a mensagem passa a ser registrada em outro lugar. As
-- mensagens agora dizem o que foi recusado, não o que foi recebido.

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
  v_ator        uuid := (select auth.uid());
  v_papel       text;
  v_segmentos   text[];
  v_versao      text;
  v_sha         text;
  v_aceite      record;
  v_existente   record;
  v_linhas      integer := 0;
begin
  -- 1. Sem sessão não se discute mais nada.
  if v_ator is null then
    raise exception 'envio recusado: sem sessao' using errcode = 'DV010';
  end if;

  -- 2. Finalidade e espécie de lista fechada. Sem ecoar o recebido.
  if p_purpose is distinct from 'identity_validation' then
    raise exception 'envio recusado: finalidade nao prevista' using errcode = 'DV011';
  end if;
  if p_kind not in ('cnh_front', 'cnh_back', 'selfie') then
    raise exception 'envio recusado: especie nao prevista' using errcode = 'DV011';
  end if;

  -- 3. Titularidade pelo CAMINHO, não pelo parâmetro.
  v_segmentos := string_to_array(p_object_path, '/');
  if array_length(v_segmentos, 1) is distinct from 3
     or v_segmentos[1] is distinct from p_purpose
     or v_segmentos[2] is distinct from v_ator::text
     or coalesce(v_segmentos[3], '') = ''
  then
    raise exception 'envio recusado: o caminho nao pertence a quem envia'
      using errcode = 'DV012';
  end if;

  -- 4. O caminho não pode carregar credencial.
  if p_object_path ~* '(https?://|[?&](token|signature|sig)=|eyJ[A-Za-z0-9_-]{8,}\.)' then
    raise exception 'envio recusado: caminho contem credencial ou URL'
      using errcode = 'DV013';
  end if;

  -- 5. CONSENTIMENTO VIGENTE (L1). Espelha `consentStatus`: o aceite mais
  --    recente do titular contra o texto publicado mais recente, por versão E
  --    por sha256 do corpo.
  select t.version, t.body_sha256 into v_versao, v_sha
    from public.document_consent_texts t
   where t.purpose = p_purpose
   order by t.effective_from desc
   limit 1;

  if v_versao is null then
    raise exception 'envio recusado: nao ha texto de consentimento publicado'
      using errcode = 'DV014';
  end if;

  select c.version, c.text_sha256, c.withdrawn_at into v_aceite
    from public.document_consents c
   where c.subject_id = v_ator and c.purpose = p_purpose
   order by c.accepted_at desc
   limit 1;

  if v_aceite is null then
    raise exception 'envio recusado: sem consentimento registrado'
      using errcode = 'DV014';
  end if;
  if v_aceite.withdrawn_at is not null then
    raise exception 'envio recusado: consentimento retirado' using errcode = 'DV014';
  end if;
  if v_aceite.version is distinct from v_versao
     or v_aceite.text_sha256 is distinct from v_sha
  then
    raise exception 'envio recusado: consentimento desatualizado' using errcode = 'DV014';
  end if;

  -- 6. Papel do ator, para a trilha.
  v_papel := case
    when public.has_role(v_ator, 'admin'::public.app_role) then 'admin'
    else 'driver'
  end;

  -- 7. IDEMPOTÊNCIA (L2). `on conflict do nothing` e, se não inseriu, confere
  --    que o que já está lá é o MESMO fato antes de devolver sucesso.
  insert into public.validation_documents
    (id, subject_id, purpose, kind, object_path)
  values
    (p_document_id, v_ator, p_purpose, p_kind, p_object_path)
  on conflict (id) do nothing;

  get diagnostics v_linhas = row_count;

  if v_linhas = 1 then
    insert into public.document_audit
      (action, subject_id, actor_id, actor_role, purpose, kind, object_path)
    values
      ('upload', v_ator, v_ator, v_papel, p_purpose, p_kind, p_object_path);
    return p_document_id;
  end if;

  -- Já existia. Só é repetição do MESMO envio se tudo bater.
  select d.subject_id, d.purpose, d.kind, d.object_path into v_existente
    from public.validation_documents d
   where d.id = p_document_id;

  if v_existente.subject_id is distinct from v_ator
     or v_existente.purpose is distinct from p_purpose
     or v_existente.kind is distinct from p_kind
     or v_existente.object_path is distinct from p_object_path
  then
    raise exception 'envio recusado: este identificador ja descreve outro envio'
      using errcode = 'DV015';
  end if;

  -- Repetição legítima: nada de novo é gravado, nem registro nem trilha.
  return p_document_id;
end $$;

comment on function public.registrar_envio_de_documento(uuid, text, text, text) is
  'Registra documento de validacao e o evento de trilha na mesma transacao. '
  'Exige consentimento vigente (segunda barreira, independente da aplicacao), '
  'e idempotente por `p_document_id`: repetir o mesmo envio nao duplica '
  'registro nem evento. Definidora porque `validation_documents` nao tem '
  'policy de insert e `document_audit` esta revogada do cliente.';

revoke all on function public.registrar_envio_de_documento(uuid, text, text, text)
  from public, anon;
grant execute on function public.registrar_envio_de_documento(uuid, text, text, text)
  to authenticated;

-- ──────── por que NÃO há índice único de `upload` por caminho ─────────────
--
-- A primeira versão desta migration criava
-- `document_audit_upload_unico_por_objeto`, espelhando o
-- `document_audit_purge_unico_por_objeto` do #13. Estava errado, e o destino
-- de prova apanhou: já havia dois eventos `upload` para o mesmo caminho.
--
-- Não era defeito. Um objeto pode ser enviado, expurgado, e o caminho reusado
-- por um envio posterior — e então DOIS eventos `upload` para o mesmo caminho
-- são a história correta. `purge` é diferente: expurgo de um objeto acontece
-- uma vez, e é por isso que lá o índice cabe.
--
-- A garantia que este envio precisa é outra: não duplicar O MESMO envio. Essa
-- é a chave primária de `validation_documents` somada ao `on conflict` acima.
-- Afirmar no banco um invariante que não é invariante teria quebrado o harness
-- de expurgo e, pior, descrito errado o que a trilha significa.

-- ──────────────────── fail-closed: pressupostos desta migration ────────────

do $$
begin
  if (select public from storage.buckets where id = 'validation-documents') then
    raise exception 'bucket validation-documents esta publico';
  end if;

  -- A função tem de recusar quem não tem sessão. Chamada aqui, fora de
  -- requisição, `auth.uid()` é nulo -- e isso precisa dar DV010, não sucesso.
  begin
    perform public.registrar_envio_de_documento(
      gen_random_uuid(), 'identity_validation', 'selfie',
      'identity_validation/00000000-0000-0000-0000-000000000000/selfie-x.png');
    raise exception 'a funcao aceitou chamada sem sessao';
  exception
    when sqlstate 'DV010' then null;
  end;
end $$;
