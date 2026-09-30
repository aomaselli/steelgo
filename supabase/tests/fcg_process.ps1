#Requires -Version 5.1
<#
================================================================================
 fcg_process.ps1  -  lancamento de processos simultaneos com captura confiavel
================================================================================
 Motivo de existir: em 2026-09-29 a concorrencia FCG abortou no primeiro
 cenario porque `Start-Process -PassThru` SEM `-Wait` devolve, no Windows
 PowerShell 5.1, um objeto cujo ExitCode fica vazio mesmo com HasExited=True.
 O teste interpretou a ausencia como falha e nada foi exercitado.

 Duas regras que este modulo impoe:

 1. AUSENCIA DE CODIGO DE SAIDA NUNCA SIGNIFICA SUCESSO. Se o codigo nao puder
    ser lido, Wait-FcgProcess lanca excecao. Nao existe caminho em que um
    processo sem codigo conhecido seja tratado como aprovado.

 2. LEITURA ASSINCRONA DE stdout E stderr. Ler um fluxo ate o fim antes de
    esperar o processo trava quando o outro fluxo enche o buffer do sistema
    operacional. Aqui as duas leituras comecam como Task no instante do
    lancamento, entao nenhum dos dois fluxos bloqueia o filho.

 O lancamento usa System.Diagnostics.Process diretamente: e a via em que o
 ExitCode e confiavel no .NET Framework, sem exigir -Wait e portanto sem
 serializar as sessoes.

 Uso:
   . "$PSScriptRoot\fcg_process.ps1"
   $a = Start-FcgProcess -FilePath docker -Arguments @('exec',$id,'psql','-c','select 1') -Rotulo 'A'
   $b = Start-FcgProcess -FilePath docker -Arguments @('exec',$id,'psql','-c','select 2') -Rotulo 'B'
   $ra = Wait-FcgProcess -Sessao $a -TimeoutMs 120000 -Aceitos @(0)
   $rb = Wait-FcgProcess -Sessao $b -TimeoutMs 120000 -Aceitos @(0)
================================================================================
#>
Set-StrictMode -Version Latest

function ConvertTo-FcgArgumentString {
    <#
      .NET Framework nao tem ProcessStartInfo.ArgumentList, entao a linha de
      comando e montada aqui. Cada argumento e citado quando contem espaco ou
      aspas, para que caminhos e SQL nao se quebrem em pedacos.
    #>
    param([string[]]$Arguments)
    $partes = @()
    foreach ($a in $Arguments) {
        $s = [string]$a
        if ($s -eq '') { $partes += '""'; continue }
        if ($s -match '[\s"]') { $partes += '"' + ($s -replace '"', '\"') + '"' }
        else { $partes += $s }
    }
    return ($partes -join ' ')
}

function Start-FcgProcess {
    <#
      Inicia o processo e devolve imediatamente, sem esperar. As leituras de
      stdout e stderr ja saem como Task, para nao bloquear o filho.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [string]$FilePath,
        [Parameter(Mandatory = $true)] [string[]]$Arguments,
        [string]$Rotulo = ''
    )
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = ConvertTo-FcgArgumentString -Arguments $Arguments
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $p = [System.Diagnostics.Process]::Start($psi)
    return [pscustomobject]@{
        Rotulo    = $Rotulo
        Proc      = $p
        TarefaOut = $p.StandardOutput.ReadToEndAsync()
        TarefaErr = $p.StandardError.ReadToEndAsync()
    }
}

function Wait-FcgProcess {
    <#
      Espera o termino, colhe as duas saidas e devolve o codigo.
      Lanca excecao em timeout e quando o codigo nao puder ser lido.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [pscustomobject]$Sessao,
        [int]$TimeoutMs = 120000,
        [int[]]$Aceitos = @(0)
    )
    $nome = if ($Sessao.Rotulo) { $Sessao.Rotulo } else { 'sessao' }

    if (-not $Sessao.Proc.WaitForExit($TimeoutMs)) {
        try { if (-not $Sessao.Proc.HasExited) { $Sessao.Proc.Kill() } } catch { }
        throw "Timeout de ${TimeoutMs}ms na sessao ${nome}; processo encerrado e cenario incompleto"
    }
    # As Task ja estao praticamente prontas quando o processo termina; a espera
    # curta cobre o intervalo entre a saida do processo e o fechamento do pipe.
    [void]$Sessao.TarefaOut.Wait(30000)
    [void]$Sessao.TarefaErr.Wait(30000)

    $saida = ''
    $erro = ''
    if ($Sessao.TarefaOut.IsCompleted) { $saida = [string]$Sessao.TarefaOut.Result }
    if ($Sessao.TarefaErr.IsCompleted) { $erro = [string]$Sessao.TarefaErr.Result }

    $codigo = $null
    try { $codigo = $Sessao.Proc.ExitCode } catch { $codigo = $null }
    if ($null -eq $codigo) {
        throw "Codigo de saida ausente na sessao ${nome}: ausencia NUNCA significa sucesso"
    }
    if ($Aceitos -notcontains $codigo) {
        throw "Falha de processo na sessao ${nome} (exit ${codigo})"
    }
    return [pscustomobject]@{ Rotulo = $nome; ExitCode = $codigo; Out = $saida; Err = $erro }
}
