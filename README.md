# Palworld Server Auto Sleep

Protege sua campanha de Palworld desligando automaticamente o servidor dedicado quando não há jogadores online. Quando alguém tenta conectar, o servidor acorda automaticamente do último save — evitando morte dos Pals, deterioração da base e perda de progressão.

## Índice

- [Como funciona](#como-funciona)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Uso](#uso)
- [Wake UDP (acordar automaticamente)](#wake-udp-acordar-automaticamente)
- [Iniciar com o Windows](#iniciar-com-o-windows)
- [Utilitários](#utilitários)
- [Solução de problemas](#solução-de-problemas)

---

## Como funciona

```
PC desliga → Servidor para → Jogador tenta conectar → Servidor acorda
         ↑                                                        ↓
    (ninguém online)                                    (alguém conectou)
         ↑                                                        ↓
    Servidor "dorme" ← Timer esgotou ← Último jogador saiu ← Jogadores jogam
```

1. **Inicialização**: o servidor inicia automaticamente quando o computador liga
2. **Jogo ativo**: jogadores conectam e jogam normalmente
3. **Ociosidade**: quando o último jogador sai, um timer começa a contar
4. **Sleep**: se ninguém conectar dentro do tempo configurado, o servidor salva o mundo e desliga
5. **Wake**: o gerenciador passa a escutar a porta UDP `8211`. Quando um jogador tenta conectar, o pacote UDP acorda o servidor, que volta exatamente de onde parou

---

## Instalação

### 1. Pré-requisitos

Certifique-se de ter instalado no computador que **rodará o servidor**:

| Item | Versão / Observação |
|------|---------------------|
| **Windows** | 10 ou 11 |
| **Node.js** | v22 ou superior ([baixar](https://nodejs.org/)) |
| **Palworld Dedicated Server** | Instalado via Steam (gratuito separado do jogo) |

### 2. Baixe o projeto

```bash
git clone https://github.com/ednogueira/palworld-server-auto-sleep.git
cd palworld-server-auto-sleep
npm install
```

### 3. Configure o servidor Palworld

Edite o arquivo `PalWorldSettings.ini` (geralmente em `Pal\Saved\Config\WindowsServer\`) e garanta:

```ini
AdminPassword="sua-senha-forte"
RESTAPIEnabled=True
RESTAPIPort=8212
PublicPort=8211
```

> ⚠️ A porta `8212` (REST API) **não** deve ser exposta na internet. Mantenha-a acessível apenas localmente (firewall bloqueando acesso externo).

### 4. Configure o projeto

Copie o arquivo de exemplo e ajuste:

```bash
cp .env.example .env
```

Edite `.env` com as informações do seu servidor:

| Variável | O que preencher |
|----------|----------------|
| `PALSERVER_EXE_PATH` | Caminho completo do `PalServer.exe` no seu computador |
| `PALSERVER_WORKING_DIRECTORY` | Pasta onde o PalServer.exe está |
| `PALSERVER_PROCESS_NAME` | Nome do processo (veja no Gerenciador de Tarefas) |
| `REST_API_PASSWORD` | A mesma senha definida em `AdminPassword` no PalWorldSettings.ini |

**Como achar o caminho do PalServer.exe:**

```
C:\Program Files (x86)\Steam\steamapps\common\PalServer\PalServer.exe
```

Se não for esse, localize a pasta do servidor dedicado na sua biblioteca Steam.

### 5. Libere as portas no firewall e roteador

| Porta | Protocolo | Destino | Observação |
|-------|-----------|---------|------------|
| `8211` | UDP | Público (roteador + firewall) | Porta do jogo — jogadores conectam aqui |
| `8212` | TCP | Local apenas (firewall) | REST API — só o gerenciador acessa |

No **roteador**, encaminhe UDP `8211` para o IP do computador (use IP fixo ou reserva DHCP).

---

## Uso

### Desenvolvimento (com reload automático)

```bash
npm run dev
```

### Produção

```bash
npm run build
npm start
```

### Testes

```bash
npm test
```

### Verificar tipos TypeScript

```bash
npm run typecheck
```

---

## Wake UDP (acordar automaticamente)

Quando o servidor está parado, o gerenciador abre a porta `8211` e fica escutando. Assim que um pacote UDP chega (um jogador tentando conectar), ele **inicia o servidor automaticamente**.

**Limitação importante:**
- O primeiro pacote UDP recebido **não é repassado** ao Palworld — ele serve apenas como gatilho
- O jogador precisará esperar o servidor iniciar e tentar conectar novamente
- Não é possível prometer conexão instantânea

### Como testar manualmente

1. Pare o `PalServer.exe`
2. Confirme que a porta `8211` está sendo escutada pelo gerenciador
3. Envie qualquer pacote UDP para `8211` (ex: de outro computador, ou com ferramenta como `netcat`)
4. O servidor deve iniciar automaticamente

---

## Iniciar com o Windows

Para que o gerenciador inicie automaticamente quando o computador ligar:

```powershell
.\scripts\install-task.ps1 -Trigger Startup
```

Para iniciar apenas quando você fizer logon:

```powershell
.\scripts\install-task.ps1 -Trigger Logon
```

Para remover a tarefa:

```powershell
.\scripts\remove-task.ps1
```

> ⚠️ Execute o PowerShell **como administrador** para instalar a tarefa.

A tarefa será registrada como `PalworldServerAutoSleep` no Agendador de Tarefas do Windows, executando como `SYSTEM` com reinício automático em caso de falha.

---

## Utilitários

### Migrar dados de mapa entre servidores (`update-map.ps1`)

Quando o servidor Palworld é migrado para outro local (reinstalação, troca de máquina, mudança de hash), cada jogador perde o progresso do **mapa** (exploração, marcações, ícones) ao logar no novo servidor, mesmo que a campanha continue intacta.

Este script copia os dados de mapa da pasta com hash antigo para a pasta com hash novo.

**Quando usar:**
- Você migrou o servidor e o hash mudou
- Jogadores reportam o mapa "inexplorado" (sem ícones, sem marcas)
- A campanha do servidor foi restaurada de backup, mas os mapas individuais não acompanharam

**Fluxo para cada jogador:**

1. Conecte no novo servidor **uma vez** (para criar a pasta com hash novo)
2. Feche o Palworld
3. No PowerShell, execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\update-map.ps1
```

4. Conecte no servidor — seu mapa estará preservado

**Como encontrar os hashes:**

```
%LOCALAPPDATA%\Pal\Saved\SaveGames
```

Dentro da pasta com seu ID Steam, você verá pastas com nomes de **32 caracteres hexadecimais**:
- **HASH ANTIGO** = pasta com dados de mapa do servidor antigo
- **HASH NOVO** = pasta criada quando conectou no novo servidor

**Comportamento do script:**

| Situação | O que acontece |
|----------|----------------|
| Hashes padrão encontrados | Usa automaticamente, sem perguntar |
| Hashes não encontrados | Pede para digitar os hashes manualmente |
| Hash inválido | Valida formato de 32 caracteres hexadecimais |
| Backup automático | Cria backup com sufixo `_backup_PS` |
| Múltiplos usuários Steam | Processa todos automaticamente |

---

## Solução de problemas

| Problema | Possível causa | Solução |
|----------|---------------|---------|
| API local não responde | `RESTAPIEnabled` ou `RESTAPIPort` incorretos | Verifique `PalWorldSettings.ini` |
| Wake não inicia o servidor | Porta `8211` não encaminhada no roteador | Configure o encaminhamento UDP |
| Servidor não desliga sozinho | API não retorna lista válida de jogadores | Confira as credenciais da REST API |
| Script de instalação falha | PowerShell sem privilégios de admin | Execute como administrador |
| Servidor fecha sozinho | Timer de sleep muito curto | Ajuste `EMPTY_SERVER_TIMEOUT_MINUTES` no `.env` |