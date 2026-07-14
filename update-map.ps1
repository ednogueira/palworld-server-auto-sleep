# Script de Migração de Dados de Mapa entre Servidores - Palworld
# Quando o hash do servidor muda (migração, reinstalação, troca de máquina),
# os dados de exploração do mapa de cada jogador são perdidos.
# Este script copia os dados do mapa (marcações, ícones, exploração)
# da pasta com hash antigo para a pasta com hash novo.
# Executar este script fechará o Palworld para evitar corrupção de arquivos.

Write-Host "=== Migracao de Dados de Mapa entre Servidores Palworld ===" -ForegroundColor Cyan

# 1. Define os caminhos das pastas usando os hashes fornecidos
$appDataPath = "$env:LOCALAPPDATA\Pal\Saved\SaveGames"

Write-Host ""
Write-Host "Este script copia os dados de MAPA (exploracao, marcacoes, icones)"
Write-Host "da pasta com hash antigo para a pasta com hash novo."
Write-Host ""
Write-Host "Isso e necessario quando o servidor Palworld e migrado para outro"
Write-Host "local e o hash muda — cada jogador precisa rodar este script no"
Write-Host "seu proprio computador para nao perder o progresso do mapa."
Write-Host ""
Write-Host "Se voce esta rodando pela primeira vez, precisara informar os hashes."
Write-Host ""

# Tenta encontrar pastas de save para detectar se os hashes padrão existem
$userSaveDirs = Get-ChildItem -Path $appDataPath -Directory -ErrorAction SilentlyContinue

$defaultOldHash = "BFB1017B4D35A38EDCFF5389EC16A578"
$defaultNewHash = "F8C5770D4ED1F3EF6D90BBB274D20CA0"

# Verifica se os hashes padrão funcionam para algum usuário
$defaultHashesFound = $false
if ($userSaveDirs) {
    foreach ($userDir in $userSaveDirs) {
        $oldPath = Join-Path $userDir.FullName $defaultOldHash
        if (Test-Path $oldPath) {
            $defaultHashesFound = $true
            break
        }
    }
}

if ($defaultHashesFound) {
    Write-Host "Hashes padrao encontrados! Usando:" -ForegroundColor Green
    Write-Host "  Antigo: $defaultOldHash" -ForegroundColor Gray
    Write-Host "  Novo:   $defaultNewHash" -ForegroundColor Gray
    $oldHash = $defaultOldHash
    $newHash = $defaultNewHash
} else {
    Write-Host "Hashes padrao nao encontrados no seu sistema." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Para descobrir seus hashes:"
    Write-Host "  1. Abra o explorador de arquivos e va para:"
    Write-Host "     %LOCALAPPDATA%\Pal\Saved\SaveGames"
    Write-Host "  2. Dentro da pasta com nome numerico (seu ID Steam),"
    Write-Host "     voce vera pastas com nomes de 32 caracteres em hexadecimal."
    Write-Host "  3. A pasta com seu save antigo e o OLD hash."
    Write-Host "  4. A pasta com seu save do servidor e o NEW hash."
    Write-Host ""
    Write-Host "Exemplo de hash: BFB1017B4D35A38EDCFF5389EC16A578"
    Write-Host ""

    $oldHash = Read-Host "Digite o HASH ANTIGO (seu save local)"
    $newHash = Read-Host "Digite o HASH NOVO (save do servidor)"

    # Validação básica: hashes devem ter 32 caracteres hexadecimais
    $hashPattern = '^[A-Fa-f0-9]{32}$'
    if ($oldHash -notmatch $hashPattern -or $newHash -notmatch $hashPattern) {
        Write-Host ""
        Write-Error 'Hash invalido! O hash deve ter exatamente 32 caracteres hexadecimais'
        Write-Host 'Exemplo: BFB1017B4D35A38EDCFF5389EC16A578'
        Read-Host 'Pressione Enter para sair...'
        exit 1
    }
}

# 2. Fecha o Palworld se ele estiver aberto
$gameProcess = Get-Process -Name "Palworld-Win64-Shipping" -ErrorAction SilentlyContinue
if ($gameProcess) {
    Write-Host ""
    Write-Host "Fechando o Palworld para garantir a seguranca dos arquivos..." -ForegroundColor Yellow
    Stop-Process -Name "Palworld-Win64-Shipping" -Force
    Start-Sleep -Seconds 2
}

# 3. Encontra a pasta principal de Saves do usuário (que varia por ID Steam)
if (-not $userSaveDirs -or $userSaveDirs.Count -eq 0) {
    Write-Warning "Nenhuma pasta de save do Palworld foi encontrada em $appDataPath."
    Write-Host "Certifique-se de que ja jogou Palworld pelo menos uma vez neste computador." -ForegroundColor Yellow
    Read-Host 'Pressione Enter para sair...'
    exit
}

$migrationDone = $false

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
        $migrationDone = $true
    } else {
        Write-Warning "A pasta do servidor antigo ($oldHash) nao foi encontrada para este usuario."
    }
}

if (-not $migrationDone) {
    Write-Host ""
    Write-Host "NENHUMA MIGRACAO FOI REALIZADA." -ForegroundColor Red
    Write-Host "Motivo: a pasta com o hash antigo ($oldHash) nao foi encontrada em nenhum usuario." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Possiveis causas:" -ForegroundColor Yellow
    Write-Host "  1. O hash antigo digitado esta incorreto."
    Write-Host "  2. Voce nunca jogou Palworld com esse hash neste computador."
    Write-Host "  3. O jogo esta instalado em outro local."
    Write-Host ""
    Write-Host "Verifique os hashes em: $appDataPath" -ForegroundColor Cyan
}

Write-Host "`n=== Processo concluido! Agora voce pode abrir o Palworld e testar seu mapa. ===" -ForegroundColor Cyan
Read-Host 'Pressione Enter para fechar esta janela...'