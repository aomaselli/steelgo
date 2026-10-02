#Requires -Version 5.1
<#
================================================================================
 fcg_process_tests.ps1  -  fcg_process.ps1 com PROCESSOS REAIS
================================================================================
 Estes testes nao simulam nada: lancam cmd.exe de verdade, no Windows
 PowerShell 5.1. E preciso ser assim -- o defeito que motivou este modulo
 (ExitCode vazio) so aparece com processo real, e por isso passou pelas
 simulacoes offline sem ser notado.

 Cobertura: saida 0, saida nao zero, timeout, stdout, stderr, os dois fluxos
 juntos com volume alto (prova que a leitura assincrona nao trava o filho) e
 dois processos genuinamente simultaneos.

 Uso: powershell -NoProfile -File .\fcg_process_tests.ps1
================================================================================
#>
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. "$PSScriptRoot\fcg_process.ps1"

$falhas = 0
function Caso([string]$nome, [bool]$ok, [string]$detalhe) {
    $m = if ($ok) { 'PASS' } else { 'FALHA' }
    if (-not $ok) { $script:falhas++ }
    Write-Host ("  [{0}] {1}{2}" -f $m, $nome, $(if ($detalhe) { "  -> $detalhe" } else { '' }))
}
function Cmd([string]$linha) { return @('/c', $linha) }

Write-Host '=== processos reais, Windows PowerShell 5.1 ==='
Write-Host ("    versao do host: {0}" -f $PSVersionTable.PSVersion)

# P1. saida 0 e stdout
$s = Start-FcgProcess -FilePath cmd -Arguments (Cmd 'echo saida-ok') -Rotulo 'P1'
$r = Wait-FcgProcess -Sessao $s -TimeoutMs 30000 -Aceitos @(0)
Caso 'P1 exit 0 capturado' ($r.ExitCode -eq 0) "exit=$($r.ExitCode)"
Caso 'P1 stdout capturado' ($r.Out -match 'saida-ok') ($r.Out.Trim())

# P2. saida nao zero: precisa ser recusada quando nao esta na lista de aceitos
$s = Start-FcgProcess -FilePath cmd -Arguments (Cmd 'exit /b 7') -Rotulo 'P2'
$erro = $null
try { $null = Wait-FcgProcess -Sessao $s -TimeoutMs 30000 -Aceitos @(0) } catch { $erro = $_.Exception.Message }
Caso 'P2 exit 7 reprovado quando nao aceito' ($erro -like '*exit 7*') $erro

# P2b. o mesmo codigo, agora declarado aceito, precisa passar
$s = Start-FcgProcess -FilePath cmd -Arguments (Cmd 'exit /b 3') -Rotulo 'P2b'
$r = Wait-FcgProcess -Sessao $s -TimeoutMs 30000 -Aceitos @(0, 3)
Caso 'P2b exit 3 aceito quando declarado' ($r.ExitCode -eq 3) "exit=$($r.ExitCode)"

# P3. stderr separado do stdout
$s = Start-FcgProcess -FilePath cmd -Arguments (Cmd 'echo para-stdout& echo para-stderr 1>&2') -Rotulo 'P3'
$r = Wait-FcgProcess -Sessao $s -TimeoutMs 30000 -Aceitos @(0)
Caso 'P3 stdout e stderr separados' (($r.Out -match 'para-stdout') -and ($r.Err -match 'para-stderr') -and ($r.Out -notmatch 'para-stderr')) "out='$($r.Out.Trim())' err='$($r.Err.Trim())'"

# P4. volume alto nos dois fluxos ao mesmo tempo: com leitura sincrona isto
#     travaria; a leitura assincrona precisa concluir.
$linha = 'for /L %i in (1,1,400) do @(echo linha-saida-%i& echo linha-erro-%i 1>&2)'
$s = Start-FcgProcess -FilePath cmd -Arguments (Cmd $linha) -Rotulo 'P4'
$r = Wait-FcgProcess -Sessao $s -TimeoutMs 60000 -Aceitos @(0)
$nOut = ([regex]::Matches($r.Out, 'linha-saida-')).Count
$nErr = ([regex]::Matches($r.Err, 'linha-erro-')).Count
Caso 'P4 dois fluxos volumosos sem travar' (($nOut -eq 400) -and ($nErr -eq 400)) "stdout=$nOut stderr=$nErr linhas"

# P5. timeout precisa lancar excecao, nao devolver sucesso
$s = Start-FcgProcess -FilePath cmd -Arguments (Cmd 'ping -n 12 127.0.0.1 >nul') -Rotulo 'P5'
$erro = $null
try { $null = Wait-FcgProcess -Sessao $s -TimeoutMs 1500 -Aceitos @(0) } catch { $erro = $_.Exception.Message }
Caso 'P5 timeout lanca excecao' ($erro -like '*Timeout*') $erro

# P6. simultaneidade real: dois processos de ~3s cada precisam terminar em
#     bem menos que a soma. Se rodassem em serie, o total passaria de 6s.
$t0 = Get-Date
$a = Start-FcgProcess -FilePath cmd -Arguments (Cmd 'ping -n 4 127.0.0.1 >nul& echo fim-A') -Rotulo 'A'
$b = Start-FcgProcess -FilePath cmd -Arguments (Cmd 'ping -n 4 127.0.0.1 >nul& echo fim-B') -Rotulo 'B'
$ra = Wait-FcgProcess -Sessao $a -TimeoutMs 60000 -Aceitos @(0)
$rb = Wait-FcgProcess -Sessao $b -TimeoutMs 60000 -Aceitos @(0)
$dur = ((Get-Date) - $t0).TotalSeconds
Caso 'P6 dois processos simultaneos, ambos com exit 0' (($ra.ExitCode -eq 0) -and ($rb.ExitCode -eq 0)) "A=$($ra.ExitCode) B=$($rb.ExitCode)"
Caso 'P6 executaram em paralelo, nao em serie' ($dur -lt 6) ("duracao total {0:N1}s (serie custaria ~6s)" -f $dur)
Caso 'P6 saidas nao se misturaram' (($ra.Out -match 'fim-A') -and ($rb.Out -match 'fim-B') -and ($ra.Out -notmatch 'fim-B')) 'cada sessao com sua saida'

# P7. citacao de argumentos com espaco
$s = Start-FcgProcess -FilePath cmd -Arguments (Cmd 'echo com espaco preservado') -Rotulo 'P7'
$r = Wait-FcgProcess -Sessao $s -TimeoutMs 30000 -Aceitos @(0)
Caso 'P7 argumento com espaco preservado' ($r.Out -match 'com espaco preservado') ($r.Out.Trim())

Write-Host ''
if ($falhas -eq 0) { Write-Host 'PASS: captura de processos reais validada no PowerShell 5.1'; exit 0 }
Write-Host "FALHA: $falhas caso(s) reprovado(s)"; exit 1
