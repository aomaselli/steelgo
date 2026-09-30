#Requires -Version 5.1
<#
================================================================================
 fcg_target_guard.ps1  -  validador de destino compartilhado pelas suites FCG
================================================================================
 Motivo de existir: em 2026-09-28 um semeador com o nome do container fixo no
 codigo escreveu na instancia que atende as arvores de trabalho. Nome, substring
 e porta interna nao provam isolamento. Este validador amarra o destino ao
 container EXATO preparado para a rodada.

 O que e verificado, nesta ordem:
   0. ExpectedContainerId veio preenchido e com 64 hexadecimais: e o ID
      previamente registrado da instancia descartavel, e sem ele nada segue;
   2. o alvo nao esta na lista de projetos proibidos  <- ANTES de falar com o
      Docker, para que um teste negativo nunca toque a instancia protegida;
   3. o Docker responde; falha de consulta interrompe;
   4. exatamente UM container corresponde (nome exato ou prefixo de id);
      zero ou mais de um interrompe;
   5. o rotulo com.supabase.cli.project e o projeto descartavel esperado;
   6. o projeto resolvido tambem nao esta na lista de proibidos;
   7. a porta publicada do 5432/tcp e a esperada (a porta INTERNA e sempre
      5432 nos dois lados, portanto nao prova nada);
   8. o container esta em execucao.
   9. o ID resolvido e EXATAMENTE o ExpectedContainerId informado.

 Devolve o ID COMPLETO. Quem chama executa contra o ID, nunca resolvendo o nome
 de novo -- um nome pode passar a apontar para outro container entre a
 validacao e a escrita.

 Uso (ExpectedContainerId e OBRIGATORIO):
   . "$PSScriptRoot\fcg_target_guard.ps1"
   $id = Assert-FcgTarget -Container $c -ExpectedProject $p -ExpectedPort $porta `
                          -ExpectedContainerId $idRegistrado
   docker exec $id psql ...
================================================================================
#>
Set-StrictMode -Version Latest

# Projetos que NUNCA podem ser destino de teste. A instancia que atende as duas
# arvores de trabalho esta aqui por nome de projeto, nao por nome de container:
# o container pode ser recriado, o projeto permanece.
$script:FcgProjetosProibidos = @('iaabxrclxpsagdijkrcx')

function Test-FcgTarget {
    <#
      Versao que NAO lanca excecao: devolve um objeto com Ok, ContainerId e
      Motivo. E o modo de verificacao sem escrita.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [AllowEmptyString()] [string]$Container,
        [Parameter(Mandatory = $true)] [AllowEmptyString()] [string]$ExpectedProject,
        [Parameter(Mandatory = $true)] [int]$ExpectedPort,
        [AllowEmptyString()] [string]$ExpectedContainerId = "",
        [string[]]$Denied = $script:FcgProjetosProibidos
    )

    $r = [ordered]@{ Ok = $false; ContainerId = $null; Projeto = $null; Porta = $null; Motivo = $null }

    if ($ExpectedContainerId -notmatch '^[0-9a-f]{64}$') {
        $r.Motivo = 'informe o ID completo previamente registrado da instancia descartavel'
        return [pscustomobject]$r
    }
    # 1. destino explicito
    if ([string]::IsNullOrWhiteSpace($Container)) {
        $r.Motivo = 'container nao informado: este validador nao descobre destino sozinho'
        return [pscustomobject]$r
    }
    if ([string]::IsNullOrWhiteSpace($ExpectedProject)) {
        $r.Motivo = 'projeto esperado nao informado'
        return [pscustomobject]$r
    }
    if ($ExpectedPort -le 0) {
        $r.Motivo = "porta esperada invalida: $ExpectedPort"
        return [pscustomobject]$r
    }

    # 2. lista de proibidos ANTES de qualquer chamada ao Docker
    foreach ($p in $Denied) {
        if ($Container -like "*$p*" -or $ExpectedProject -eq $p) {
            $r.Motivo = "destino proibido: '$Container' remete ao projeto protegido '$p'"
            return [pscustomobject]$r
        }
    }

    # 3. Docker responde?
    $linhas = $null
    try {
        $saida = & docker ps -a --no-trunc --format '{{.ID}}|{{.Names}}|{{.State}}' 2>&1
        if ($LASTEXITCODE -ne 0) {
            $r.Motivo = "consulta ao Docker falhou (exit $LASTEXITCODE): $($saida | Select-Object -First 1)"
            return [pscustomobject]$r
        }
        $linhas = @($saida | Where-Object { $_ -is [string] -and $_ -match '\|' })
    } catch {
        $r.Motivo = "consulta ao Docker lancou excecao: $($_.Exception.Message)"
        return [pscustomobject]$r
    }
    if ($linhas.Count -eq 0) {
        $r.Motivo = 'consulta ao Docker devolveu vazio'
        return [pscustomobject]$r
    }

    # 4. exatamente um correspondente
    $cand = @()
    foreach ($l in $linhas) {
        $p = $l -split '\|'
        if ($p.Count -lt 3) { continue }
        if ($p[1] -eq $Container) { $cand += ,@($p[0], $p[1], $p[2]); continue }
        if ($Container.Length -ge 12 -and $p[0].StartsWith($Container)) { $cand += ,@($p[0], $p[1], $p[2]) }
    }
    if ($cand.Count -eq 0) {
        $r.Motivo = "nenhum container corresponde a '$Container'"
        return [pscustomobject]$r
    }
    if ($cand.Count -gt 1) {
        $r.Motivo = "ambiguidade: $($cand.Count) containers correspondem a '$Container'"
        return [pscustomobject]$r
    }
    $id = $cand[0][0]; $estado = $cand[0][2]
    if ($id -cne $ExpectedContainerId) {
        $r.Motivo = 'ID divergente: o container nao e a instancia previamente registrada'
        return [pscustomobject]$r
    }
    $r.ContainerId = $id

    # 5/6. projeto pelo rotulo do CLI
    # Template com aspas internas nao sobrevive a passagem de argumentos, por
    # isso pedimos o objeto inteiro em JSON e resolvemos aqui.
    $proj = $null
    try {
        $rotulosJson = (& docker inspect $id --format '{{json .Config.Labels}}' 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) {
            $r.Motivo = "docker inspect dos rotulos falhou (exit $LASTEXITCODE)"
            return [pscustomobject]$r
        }
        $rotulos = $rotulosJson | ConvertFrom-Json
        $prop = $rotulos.PSObject.Properties | Where-Object { $_.Name -eq 'com.supabase.cli.project' }
        if ($prop) { $proj = [string]$prop.Value }
    } catch {
        $r.Motivo = "leitura dos rotulos falhou: $($_.Exception.Message)"
        return [pscustomobject]$r
    }
    $r.Projeto = $proj
    if ([string]::IsNullOrWhiteSpace($proj)) {
        $r.Motivo = "container $($cand[0][1]) nao tem rotulo com.supabase.cli.project"
        return [pscustomobject]$r
    }
    if ($proj -ne $ExpectedProject) {
        $r.Motivo = "projeto divergente: rotulo='$proj', esperado='$ExpectedProject'"
        return [pscustomobject]$r
    }
    foreach ($p in $Denied) {
        if ($proj -eq $p) {
            $r.Motivo = "projeto proibido resolvido pelo rotulo: '$proj'"
            return [pscustomobject]$r
        }
    }

    # 7. porta PUBLICADA (a interna e 5432 nos dois lados e nao prova nada)
    $portas = @()
    try {
        $portasJson = (& docker inspect $id --format '{{json .NetworkSettings.Ports}}' 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) {
            $r.Motivo = "docker inspect das portas falhou (exit $LASTEXITCODE)"
            return [pscustomobject]$r
        }
        $mapa = $portasJson | ConvertFrom-Json
        $entrada = $mapa.PSObject.Properties | Where-Object { $_.Name -eq '5432/tcp' }
        if ($entrada -and $entrada.Value) {
            $portas = @($entrada.Value | ForEach-Object { [string]$_.HostPort } | Where-Object { $_ } | Sort-Object -Unique)
        }
    } catch {
        $r.Motivo = "leitura das portas falhou: $($_.Exception.Message)"
        return [pscustomobject]$r
    }
    $r.Porta = ($portas -join ',')
    if ($portas.Count -eq 0) {
        $r.Motivo = 'container nao publica a porta 5432/tcp no host'
        return [pscustomobject]$r
    }
    if ($portas.Count -gt 1) {
        $r.Motivo = "ambiguidade de porta publicada: $($portas -join ', ')"
        return [pscustomobject]$r
    }
    if ($portas[0] -ne "$ExpectedPort") {
        $r.Motivo = "porta publicada divergente: $($portas[0]), esperada $ExpectedPort"
        return [pscustomobject]$r
    }

    # 8. em execucao
    if ($estado -ne 'running') {
        $r.Motivo = "container nao esta em execucao (estado=$estado)"
        return [pscustomobject]$r
    }

    $r.Ok = $true
    $r.Motivo = 'destino validado'
    return [pscustomobject]$r
}

function Assert-FcgTarget {
    <#
      Versao estrita: devolve o ID completo, ou interrompe o script.
      Use esta antes de QUALQUER escrita.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [AllowEmptyString()] [string]$Container,
        [Parameter(Mandatory = $true)] [AllowEmptyString()] [string]$ExpectedProject,
        [Parameter(Mandatory = $true)] [int]$ExpectedPort,
        [AllowEmptyString()] [string]$ExpectedContainerId = "",
        [string[]]$Denied = $script:FcgProjetosProibidos,
        [switch]$Quiet
    )
    $v = Test-FcgTarget -Container $Container -ExpectedProject $ExpectedProject -ExpectedPort $ExpectedPort -ExpectedContainerId $ExpectedContainerId -Denied $Denied
    if (-not $v.Ok) {
        Write-Host "RECUSADO: $($v.Motivo)" -ForegroundColor Red
        Write-Host "          Nenhum SQL foi executado."
        exit 1
    }
    if (-not $Quiet) {
        Write-Host ("destino validado: projeto={0} porta={1} id={2}" -f $v.Projeto, $v.Porta, $v.ContainerId.Substring(0, 12))
    }
    return $v.ContainerId
}
