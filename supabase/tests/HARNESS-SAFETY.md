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
