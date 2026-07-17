<#
.SYNOPSIS
    Backup e transferência do save do Palworld do Windows para a instância na Oracle Cloud.

.DESCRIPTION
    Este script:
      1. Compacta a pasta do save do Palworld no Windows (hash antigo)
      2. Envia via SCP para a instância Ubuntu na Oracle Cloud
      3. Descompacta no destino correto /opt/palworld/save-backup/<hash_antigo>/

    Após rodar este script, na instância execute:
        sudo bash 03-restore-save.sh

.PARAMETERS
    -InstanceIp   : IP público da instância na Oracle Cloud
    -InstanceUser  : usuário SSH (padrão: ubuntu)
    -SshKeyPath    : caminho da chave SSH privada (.pem ou arquivo sem extensão)
    -PalserverPath : caminho da pasta do PalServer no Windows
    -OldHash       : hash antigo do save (padrão: F8C5770D4ED1F3EF6D90BBB274D20CA0)

.EXAMPLE
    .\backup-save-windows.ps1 -InstanceIp 123.45.67.89 -SshKeyPath C:\keys\oracle.pem
    .\backup-save-windows.ps1 -InstanceIp 123.45.67.89 -SshKeyPath C:\keys\oracle_rsa_console
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$InstanceIp,

    [Parameter(Mandatory=$false)]
    [string]$InstanceUser = "ubuntu",

    [Parameter(Mandatory=$true)]
    [string]$SshKeyPath,

    [Parameter(Mandatory=$false)]
    [string]$PalserverPath = "C:\Program Files (x86)\Steam\steamapps\common\PalServer",

    [Parameter(Mandatory=$false)]
    [string]$OldHash = "F8C5770D4ED1F3EF6D90BBB274D20CA0"
)

$ErrorActionPreference = 'Continue'

function Write-Ok($msg)   { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERR]  $msg" -ForegroundColor Red }

function Invoke-Ssh {
    param([string[]]$Arguments)
    $result = & ssh @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    return @{ ExitCode = $exitCode; Output = $result }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Backup e Transferencia de Save - Palworld Windows -> Oracle Cloud" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Validacoes -------------------------------------------------------------

$savePath = Join-Path $PalserverPath "Pal\Saved\SaveGames\0\$OldHash"
if (-not (Test-Path $savePath)) {
    Write-Err "Pasta de save nao encontrada: $savePath"
    Write-Err "Verifique -PalserverPath e -OldHash."
    Write-Host ""
    Write-Host "Caminho esperado:"
    Write-Host "  <PalserverPath>\Pal\Saved\SaveGames\0\<OldHash>\"
    Write-Host ""
    Write-Host "Exemplo:"
    Write-Host "  C:\Program Files (x86)\Steam\steamapps\common\PalServer\Pal\Saved\SaveGames\0\F8C5770D4ED1F3EF6D90BBB274D20CA0\"
    exit 1
}
Write-Ok "Save antigo encontrado: $savePath"

if (-not (Test-Path $SshKeyPath)) {
    Write-Err "Chave SSH nao encontrada: $SshKeyPath"
    Write-Host ""
    Write-Host "DICA: Use a chave PRIVADA (.pem ou arquivo sem extensao), nao a publica (.pub)."
    Write-Host "  Exemplo: C:\Users\emers\.ssh\oracle_rsa_console (sem .pub)"
    exit 1
}

# Verificar se parece ser chave publica
if ($SshKeyPath -match '\.pub$') {
    Write-Err "Voce passou um arquivo .pub (chave publica). O SSH precisa da chave PRIVADA."
    Write-Host "  Use o arquivo SEM .pub:  $($SshKeyPath -replace '\.pub$', '')"
    exit 1
}

# Garantir permissoes da chave .pem (icacls no Windows)
Write-Info "Ajustando permissoes da chave SSH..."
icacls $SshKeyPath /inheritance:r /grant:r "$($env:USERNAME):(R)" 2>$null | Out-Null
Write-Ok "Permissoes da chave ajustadas."

# ---- Verificar se o Palworld esta fechado -----------------------------------
$palProcess = Get-Process -Name "Palworld-Win64-Shipping", "PalServer-Win64-Test-Cmd" -ErrorAction SilentlyContinue
if ($palProcess) {
    Write-Warn "Palworld/PalServer esta rodando. Recomendado fechar antes do backup."
    $resp = Read-Host "Deseja fechar agora? (s/N)"
    if ($resp -eq "s" -or $resp -eq "S") {
        $palProcess | Stop-Process -Force
        Start-Sleep -Seconds 2
        Write-Ok "Processos do Palworld fechados."
    } else {
        Write-Warn "Continuando com o Palworld aberto (pode haver arquivos em uso)."
    }
}

# ---- Compactar o save -------------------------------------------------------
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$tempDir = Join-Path $env:TEMP "palworld-save-backup"
$zipName = "palworld-save-$OldHash-$timestamp.zip"
$zipPath = Join-Path $tempDir $zipName

if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
}

Write-Info "Compactando save em: $zipPath"
Write-Host "   Origem: $savePath"
Write-Host ""

Compress-Archive -Path "$savePath\*" -DestinationPath $zipPath -Force
$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Ok "Save compactado: $zipName ($([math]::Round($zipSize, 2)) MB)"

# ---- Enviar via SCP para a instancia ----------------------------------------
Write-Host ""
Write-Info "Enviando save para a instancia Oracle Cloud..."
$destinoMsg = "${InstanceUser}@${InstanceIp}:/opt/palworld/save-backup/"
Write-Host "   Destino: $destinoMsg"
Write-Host ""

# Criar a pasta no destino primeiro
$sshTarget = "${InstanceUser}@${InstanceIp}"
Write-Info "Criando pasta de destino no servidor..."
$sshArgs = @("-i", $SshKeyPath, "-o", "StrictHostKeyChecking=accept-new", $sshTarget, "sudo mkdir -p /opt/palworld/save-backup")
$sshResult = Invoke-Ssh -Arguments $sshArgs
if ($sshResult.ExitCode -ne 0) {
    Write-Warn "Nao foi possivel criar a pasta via SSH (pode ja existir). Continuando..."
}

# SCP do zip
$scpTarget = "${sshTarget}:/tmp/${zipName}"
Write-Info "Enviando arquivo compactado via SCP..."
$scpResult = & scp -i $SshKeyPath -o "StrictHostKeyChecking=accept-new" $zipPath $scpTarget 2>&1
$scpExit = $LASTEXITCODE
if ($scpExit -ne 0) {
    Write-Err "Falha ao enviar arquivo via SCP."
    Write-Err "Verifique o IP ($InstanceIp), usuario ($InstanceUser) e chave ($SshKeyPath)."
    exit 1
}
Write-Ok "Arquivo enviado para /tmp/$zipName na instancia."

# Mover e descompactar no destino certo
$remoteZip = "/tmp/$zipName"
$remoteTarget = "/opt/palworld/save-backup/$OldHash"
$moveCmd = "sudo unzip -o $remoteZip -d $remoteTarget && sudo rm $remoteZip && sudo chown -R 1000:1000 $remoteTarget"
Write-Info "Descompactando e organizando no servidor..."
$sshArgs = @("-i", $SshKeyPath, "-o", "StrictHostKeyChecking=accept-new", $sshTarget, $moveCmd)
$sshResult = Invoke-Ssh -Arguments $sshArgs
if ($sshResult.ExitCode -ne 0) {
    Write-Err "Falha ao descompactar o save na instancia."
    Write-Err "Verifique se 'unzip' esta instalado: sudo apt install unzip"
    Write-Host ""
    Write-Host "Voce pode fazer manualmente na instancia:"
    Write-Host "  sudo unzip $remoteZip -d $remoteTarget"
    Write-Host "  sudo chown -R 1000:1000 $remoteTarget"
    exit 1
}
Write-Ok "Save descompactado em $remoteTarget na instancia."

# ---- Limpeza local ----------------------------------------------------------
Write-Info "Limpando arquivo temporario local..."
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Write-Ok "Limpeza concluida."

# ---- Resumo -----------------------------------------------------------------
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host " TRANSFERENCIA CONCLUIDA COM SUCESSO!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host " Resumo:"
Write-Host "   Hash antigo:  $OldHash"
Write-Host "   Save local:   $savePath"
Write-Host "   Instancia:    ${InstanceUser}@${InstanceIp}"
Write-Host "   Destino:      $remoteTarget"
Write-Host "   Backup zip:   $([math]::Round($zipSize, 2)) MB"
Write-Host ""
Write-Host " PROXIMO PASSO - na instancia (via SSH):" -ForegroundColor Yellow
Write-Host "   sudo bash /opt/palworld/03-restore-save.sh" -ForegroundColor Cyan
Write-Host ""
Write-Host "================================================================"
