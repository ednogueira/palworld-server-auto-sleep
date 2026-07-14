# Script de Migração de Mapa Local - Palworld
# Executar este script fechará o Palworld para evitar corrupção de arquivos.

Write-Host "=== Iniciando Migracao de Mapa do Palworld ===" -ForegroundColor Cyan

# 1. Define os caminhos das pastas usando os hashes fornecidos
$appDataPath = "$env:LOCALAPPDATA\Pal\Saved\SaveGames"
$oldHash = "BFB1017B4D35A38EDCFF5389EC16A578"
$newHash = "F8C5770D4ED1F3EF6D90BBB274D20CA0"

# 2. Fecha o Palworld se ele estiver aberto
$gameProcess = Get-Process -Name "Palworld-Win64-Shipping" -ErrorAction SilentlyContinue
if ($gameProcess) {
    Write-Host "Fechando o Palworld para garantir a seguranca dos arquivos..." -ForegroundColor Yellow
    Stop-Process -Name "Palworld-Win64-Shipping" -Force
    Start-Sleep -Seconds 2
}

# 3. Encontra a pasta principal de Saves do usuário (que varia por ID Steam)
$userSaveDirs = Get-ChildItem -Path $appDataPath -Directory

if ($userSaveDirs.Count -eq 0) {
    Write-Warning "Nenhuma pasta de save do Palworld foi encontrada em $appDataPath."
    Read-Host "Pressione Enter para sair..."
    exit
}

# Processa para cada ID Steam encontrado (caso o PC tenha mais de uma conta que jogue Palworld)
foreach ($userDir in $userSaveDirs) {
    $oldFullPath = Join-Path $userDir.FullName $oldHash
    $newFullPath = Join-Path $userDir.FullName $newHash

    Write-Host "`nVerificando usuario Steam: $($userDir.Name)" -ForegroundColor Magenta

    # Verifica se a pasta de origem (antiga) existe
    if (Test-Path $oldFullPath) {
        Write-Host "Pasta antiga encontrada!" -ForegroundColor Green

        # Garante que a pasta de destino (nova) exista. Se não existir, cria.
        if (-not (Test-Path $newFullPath)) {
            Write-Host "Criando nova pasta de destino..." -ForegroundColor Yellow
            New-Item -ItemType Directory -Force -Path $newFullPath | Out-Null
        }

        # Realiza um backup de segurança da pasta nova antes de sobrescrever
        $backupPath = "$newFullPath`_backup_PS"
        if (Test-Path $newFullPath) {
            Write-Host "Criando backup de seguranca dos dados novos em: $backupPath" -ForegroundColor Gray
            Copy-Item -Path $newFullPath -Destination $backupPath -Recurse -Force | Out-Null
        }

        # Copia todo o conteúdo (LocalData.sav e pastas de backup) do antigo para o novo
        Write-Host "Copiando mapa e backups antigos para o novo servidor..." -ForegroundColor Green
        Copy-Item -Path "$oldFullPath\*" -Destination $newFullPath -Recurse -Force

        Write-Host "MIGRACAO CONCLUIDA COM SUCESSO PARA ESTE USUARIO!" -ForegroundColor Green
    } else {
        Write-Warning "A pasta do servidor antigo ($oldHash) nao foi encontrada para este usuario."
    }
}

Write-Host "`n=== Processo concluido! Agora voce pode abrir o Palworld e testar seu mapa. ===" -ForegroundColor Cyan
Read-Host "Pressione Enter para fechar esta janela..."