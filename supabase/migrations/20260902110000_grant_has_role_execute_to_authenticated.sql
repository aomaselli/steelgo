-- =============================================================================
-- CORRETIVA - anterior ao L2a : EXECUTE de public.has_role para authenticated
-- =============================================================================
-- POR QUE ESTA MIGRATION EXISTE
--
-- Fato verificado por execucao, nao por leitura. Aplicando o repositorio do zero
-- ate 20260902100100 - isto e, SEM nenhuma linha do L2a - o papel authenticated
-- nao consegue sequer um SELECT em public.freights:
--
--     ERROR:  permission denied for function has_role
--
-- Cadeia do defeito:
--   1. 20260521014520 cria public.has_role(uuid, public.app_role) e as policies
--      freights_select (linha 345) e freights_update_owner (linha 352), que a
--      chamam.
--   2. 20260521014538 linha 2 revoga EXECUTE de has_role de public, anon e
--      authenticated.
--   3. Nenhuma migration posterior reconcede. Busca exaustiva nas 28 migrations
--      anteriores: uma unica ocorrencia de has_role em grant/revoke, e e a
--      revogacao.
--
-- Uma policy de RLS e avaliada com os privilegios de quem consulta, nao com os
-- do dono da policy. Sem EXECUTE, toda policy que chama has_role levanta 42501
-- ANTES de qualquer filtro de linha. No banco reconstruido a partir deste
-- repositorio, has_role aparece em 59 policies - ou seja, o efeito nao se limita
-- a freights: alcanca praticamente todo o schema.
--
-- Consequencia pratica: ou o banco hospedado DIVERGE deste repositorio - o
-- privilegio foi concedido fora das migrations, pelo SQL Editor ou pelo painel -
-- ou a aplicacao esta quebrada para authenticated. Nos dois casos a correcao
-- pertence ao repositorio, porque um `supabase db reset` reproduz o defeito.
--
-- POR QUE UMA MIGRATION NOVA, E NAO UMA EDICAO
--   20260521014538 ja foi aplicada. Migration aplicada nao se edita: editar
--   mudaria o historico sem mudar bancos ja migrados. A correcao e aditiva e
--   posterior, e por isso esta datada entre o L1 (20260902100100) e o L2a
--   (20260903100000) - o L2a depende dela para que suas policies de leitura
--   funcionem para authenticated.
--
-- ALCANCE DELIBERADAMENTE MINIMO
--   Concede EXECUTE apenas a authenticated. NAO reconcede a anon nem a PUBLIC:
--   quem nao esta autenticado nao tem por que consultar papeis. As outras duas
--   funcoes revogadas em 20260521014538 - get_user_role e handle_new_user - NAO
--   sao chamadas por policy alguma (verificado: 0 policies) e seguem revogadas.
--
-- LIMITE HONESTO, REGISTRADO
--   has_role(_user_id, _role) aceita QUALQUER uuid. Com EXECUTE concedido, um
--   usuario autenticado pode verificar o papel de terceiros - divulgacao de
--   informacao de baixa gravidade, mas real. A correcao estreita seria uma
--   variante fixada em auth.uid() e a reescrita das policies para usa-la; isso
--   exigiria alterar policies criadas em migrations ja aplicadas e esta fora do
--   escopo autorizado. Fica registrado como recomendacao para L2b.
-- =============================================================================

grant execute on function public.has_role(uuid, public.app_role) to authenticated;

comment on function public.has_role(uuid, public.app_role) is
  'Verificacao de papel usada por policies de RLS em todo o schema. EXECUTE '
  'concedido a authenticated pela migration 20260902110000: sem ele, toda policy '
  'que chama esta funcao levanta 42501 e o papel authenticated perde ate o '
  'SELECT. Nao concedida a anon nem a PUBLIC. Aceita qualquer uuid, portanto '
  'permite a um autenticado consultar o papel de terceiros - estreitar isso '
  'exige uma variante fixada em auth.uid() e a reescrita das policies (L2b).';
