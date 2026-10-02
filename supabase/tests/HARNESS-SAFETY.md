# Execucao dos testes FCG

Os executores exigem `Container`, `ExpectedContainerId` (64 hexadecimais),
`ExpectedProject` e `ExpectedPort`. Registre esses valores ao preparar uma
instancia descartavel; nao use valores descobertos automaticamente pelo teste.
O projeto protegido `iaabxrclxpsagdijkrcx` e recusado.

`-VerifyOnly` valida o destino sem enviar SQL. Esse modo nao comprova migrations
nem comportamento do banco. As suites SQL usam o ID completo validado, executam
uma copia com ON_ERROR_STOP ativo e exigem todas as assercoes numeradas e um
marcador final. Logs ficam em diretorio novo por rodada, incluindo codigos de
saida e manifesto results.json. Logs de testes podem conter dados de fixtures;
nao publique sem revisar.

Os testes com COMMIT exigem banco novo (sem usuarios, contratos ou viagens).
Nao apagam fixtures para permitir repeticao. Preserve a instancia e use outra
para repetir; o executor nao faz reset nem destroi containers. A limpeza do
teste de falha remove apenas sua injecao e restaura a flag, preservando auditoria.

## Fechamento de acesso e atomicidade das migrations

`fcg_run_privilege_closure.ps1` executa `fcg_privilege_closure.sql` e, com
`-ComprovarAtomicidade`, tambem `fcg_migration_atomicity.sql`. Usa o mesmo
guarda de destino das demais suites e o modulo fcg_process.ps1 para ler o
codigo de saida.

Exige instancia SINTETICA e descartavel, construida apenas a partir das
migrations -- sem dump e sem dado real. `fcg_privilege_closure.sql` detecta a
fase em `schema_migrations` e serve antes e depois da 2/3 sem edicao: separa o
invariante (anon nunca tem privilegio; RLS nunca desligada) da leitura que a
2/3 concede a authenticated. A assercao P1 cria uma tabela e uma funcao de
controle FORA do escopo da Fase 1A, confere que nascem abertas e as remove pelo
rollback -- sem ela, "as tabelas estao fechadas" nao provaria nada.

`-ComprovarAtomicidade` exige `-ProjectDirectory`, o diretorio do projeto
descartavel. Antes de tocar nele o executor confere que o `project_id` do
`config.toml` e o mesmo projeto ja validado, que nao e o projeto protegido e que
o diretorio NAO esta dentro deste repositorio. Entao copia
`fixtures/fcg_failure_fixture.sql` para o diretorio de migrations daquele
projeto, exige que `supabase migration up` falhe, e remove a injecao em seguida,
inclusive se algo falhar no meio. Codigo de saida zero nesse passo reprova a
etapa: significa que o cenario nao foi exercitado.

`fixtures/fcg_failure_fixture.sql` NAO e migration da entrega e nunca deve ser
copiada a mao para `supabase/migrations/`. O caminho de uso e o executor.

Recusa por permissao e falha por fixture invalida sao coisas distintas: so
`SQLSTATE 42501` conta como acesso fechado. Qualquer outro codigo reprova a
assercao, mesmo que a operacao nao tenha funcionado.

## Verificacoes offline

Na pasta dos testes, executar com Windows PowerShell 5.1 ou posterior:

```powershell
powershell -NoProfile -File .\fcg_target_guard_tests.ps1
powershell -NoProfile -File .\fcg_runner_tests.ps1
powershell -NoProfile -File .\fcg_process_tests.ps1
```

Os dois primeiros substituem Docker/processos por simulacoes. Eles verificam
recusas de destino e falsos sucessos, incluindo falha de copia, saida vazia,
exit nao zero, erro FATAL, assercao ausente/duplicada/falha, conclusao ausente
e o aviso legitimo do produto ("fcg observacional falhou"), que NAO pode
reprovar uma suite cujas assercoes passaram.

fcg_process_tests.ps1 e diferente: exercita fcg_process.ps1 com PROCESSOS
REAIS, porque o defeito que motivou aquele modulo -- ExitCode vazio em
Start-Process -PassThru sem -Wait, no Windows PowerShell 5.1 -- nao aparece em
simulacao. Cobre saida 0, saida nao zero, timeout, stdout, stderr, volume alto
nos dois fluxos e dois processos simultaneos.

Nenhum dos tres substitui a execucao SQL posterior em instancia descartavel.
