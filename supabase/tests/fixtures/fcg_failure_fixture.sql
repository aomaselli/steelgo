-- =============================================================================
-- FIXTURE DE FALHA DELIBERADA -- NAO E MIGRATION DA ENTREGA
-- =============================================================================
-- Este arquivo NAO pertence a supabase/migrations/ e nao deve ser copiado para
-- la a mao. Ele existe para que fcg_migration_atomicity.sql tenha o que
-- verificar: um lote em que a migration seguinte a 1/3 falha.
--
-- Quem o usa: fcg_run_privilege_closure.ps1 -ComprovarAtomicidade. O executor
-- o copia para o diretorio de migrations do PROJETO DESCARTAVEL com o nome
-- 20260925120050_fcg_failure_fixture.sql -- timestamp entre a 1/3
-- (20260925120000) e a 2/3 (20260925120100) -- roda `supabase migration up`,
-- exige exit diferente de zero, e remove o arquivo em seguida, inclusive se
-- algo falhar no meio.
--
-- O executor so faz isso depois de validar o destino pelo guarda existente e
-- de conferir que o project_id declarado no config.toml do diretorio e o mesmo
-- projeto descartavel ja validado. Nunca em producao, nunca na instancia
-- protegida, nunca na arvore do repositorio.
--
-- Cria um marcador ANTES de falhar, de proposito: sem ele o teste nao saberia
-- distinguir "a transacao desta migration foi desfeita" de "esta migration nao
-- chegou a executar nada".
-- =============================================================================

create table public.zzz_fcg_falha_marcador (id integer primary key);

insert into public.zzz_fcg_falha_marcador (id) values (1);

-- Falha deliberada. Divisao por zero: SQLSTATE 22012.
select 1 / 0;
