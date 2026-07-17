#!/usr/bin/env bash
#
# 01-prepare-instance.sh
# Prepara a instância Ubuntu ARM64 (Oracle Cloud) para rodar o Palworld Dedicated Server.
#
# O que faz:
#   - Atualiza pacotes do Ubuntu
#   - Instala Docker Engine + Docker Compose plugin
#   - Cria swap de 8GB (mitigar RAM limitada do free tier 12GB)
#   - Ajusta parâmetros de kernel (swappiness, file descriptors)
#   - Cria estrutura de diretórios /opt/palworld/
#
# Uso:
#   sudo bash 01-prepare-instance.sh
#
set -euo pipefail

# ---- cores para output ------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
info() { echo -e "${CYAN}[INFO]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC}  $*" >&2; }

# ---- validações iniciais ----------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  err "Execute como root (use: sudo bash $0)"
  exit 1
fi

ARCH=$(uname -m)
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
  warn "Arquitetura detectada: $ARCH"
  warn "Este script foi desenhado para arm64. Prosseguindo sob seu risco."
fi

info "Arquitetura: $ARCH"
info "Este script prepara a instância para o Palworld Dedicated Server (Docker + box64)."
echo ""

# ---- 1. Atualizar pacotes ---------------------------------------------------
info "Atualizando pacotes do sistema..."
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  rsync \
  netcat-traditional \
  htop \
  jq \
  ufw
log "Pacotes atualizados."

# ---- 2. Instalar Docker Engine + Compose -----------------------------------
if command -v docker &>/dev/null; then
  log "Docker já está instalado: $(docker --version)"
else
  info "Instalando Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin
  log "Docker Engine instalado: $(docker --version)"
fi

# Habilitar e iniciar Docker
systemctl enable docker
systemctl start docker
log "Docker habilitado e iniciado."

# Adicionar usuário atual ao grupo docker (opcional, conveniência)
CURRENT_USER="${SUDO_USER:-ubuntu}"
if id "$CURRENT_USER" &>/dev/null; then
  usermod -aG docker "$CURRENT_USER"
  log "Usuário '$CURRENT_USER' adicionado ao grupo docker."
fi

# ---- 3. Criar swap de 8GB ---------------------------------------------------
SWAP_FILE="/swapfile"
SWAP_SIZE="8G"

if swapon --show | grep -q "$SWAP_FILE"; then
  log "Swap já ativo em $SWAP_FILE ($(swapon --show | awk 'NR==2{print $3}'))"
else
  info "Criando swap de $SWAP_SIZE..."
  if [[ -f "$SWAP_FILE" ]]; then
    warn "Arquivo $SWAP_FILE já existe mas não está ativo. Recriando."
    rm -f "$SWAP_FILE"
  fi
  fallocate -l "$SWAP_SIZE" "$SWAP_FILE"
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE"
  swapon "$SWAP_FILE"
  log "Swap de $SWAP_SIZE ativado."

  # Persistir no fstab se ainda não estiver
  if ! grep -q "$SWAP_FILE" /etc/fstab; then
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
    log "Swap persistido em /etc/fstab."
  fi
fi

# swappiness baixo: só usar swap em emergência (preferir RAM)
CURRENT_SWAPPINESS=$(cat /proc/sys/vm/swappiness)
if [[ "$CURRENT_SWAPPINESS" -gt 10 ]]; then
  info "Ajustando vm.swappiness de $CURRENT_SWAPPINESS para 10..."
  sysctl vm.swappiness=10
  if ! grep -q "^vm.swappiness" /etc/sysctl.conf; then
    echo "vm.swappiness=10" >> /etc/sysctl.conf
  else
    sed -i 's/^vm.swappiness=.*/vm.swappiness=10/' /etc/sysctl.conf
  fi
  log "vm.swappiness=10 configurado e persistido."
else
  log "vm.swappiness já está em $CURRENT_SWAPPINESS."
fi

# ---- 4. Tuning de kernel para servidor de jogo ------------------------------
info "Aplicando tunings de kernel..."

# Mais file descriptors (Palworld/box64 podem usar muitos)
if ! grep -q "^fs.file-max" /etc/sysctl.conf; then
  echo "fs.file-max=1048576" >> /etc/sysctl.conf
fi

# Otimização de rede UDP
if ! grep -q "^net.core.rmem_max" /etc/sysctl.conf; then
  cat >> /etc/sysctl.conf <<'EOF'
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=262144
net.core.wmem_default=262144
net.core.netdev_max_backlog=5000
net.ipv4.udp_rmem_min=16384
net.ipv4.udp_wmem_min=16384
EOF
  log "Parâmetros de rede UDP adicionados."
fi

sysctl -p >/dev/null 2>&1 || true
log "Tunings de kernel aplicados."

# Aumentar limites de arquivo aberto para o serviço docker
DOCKER_SERVICE_DIR="/etc/systemd/system/docker.service.d"
mkdir -p "$DOCKER_SERVICE_DIR"
if [[ ! -f "$DOCKER_SERVICE_DIR/limits.conf" ]]; then
  cat > "$DOCKER_SERVICE_DIR/limits.conf" <<'EOF'
[Service]
LimitNOFILE=1048576
LimitNPROC=infinity
EOF
  log "Limites do serviço Docker configurados."
fi
systemctl daemon-reload
systemctl restart docker

# ---- 5. Estrutura de diretórios --------------------------------------------
PALWORLD_DIR="/opt/palworld"
info "Criando estrutura em $PALWORLD_DIR..."
mkdir -p "$PALWORLD_DIR/palworld-data"
mkdir -p "$PALWORLD_DIR/config-backup"
# O auto-sleep manager (Fase 2) usará /opt/palworld/auto-manager
mkdir -p "$PALWORLD_DIR/auto-manager"

# Permissões para o user do container (PUID/PGID 1000)
if id -u 1000 &>/dev/null; then
  chown -R 1000:1000 "$PALWORLD_DIR" 2>/dev/null || true
fi
log "Estrutura de diretórios criada em $PALWORLD_DIR."

# ---- 6. Resumo final -------------------------------------------------------
echo ""
echo "================================================================"
echo -e "${GREEN} PREPARAÇÃO CONCLUÍDA COM SUCESSO${NC}"
echo "================================================================"
echo ""
echo " Resumo:"
echo "   - Docker:        $(docker --version)"
echo "   - Compose:       $(docker compose version 2>/dev/null || echo 'n/a')"
echo "   - Swap:          $(swapon --show | awk 'NR==2{print $3}') ativo"
echo "   - swappiness:    $(cat /proc/sys/vm/swappiness)"
echo "   - Diretório:     $PALWORLD_DIR"
echo ""
echo " Próximos passos:"
echo "   1. Copie os arquivos para $PALWORLD_DIR/:"
echo "        docker-compose.yml"
echo "        .env  (edite com suas senhas)"
echo "   2. Configure o firewall:  sudo bash 02-configure-firewall.sh"
echo "   3. Libere portas no console da Oracle Cloud (ver oracle-security-lists.md)"
echo "   4. Suba o servidor:       cd $PALWORLD_DIR && docker compose up -d"
echo "   5. Restaure o save:       sudo bash 03-restore-save.sh"
echo ""
echo "================================================================"
