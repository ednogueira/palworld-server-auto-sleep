# Palworld Server Auto Sleep

Protege sua campanha de Palworld desligando automaticamente o servidor dedicado quando não há jogadores online. Evita morte dos Pals, deterioração da base e perda de progressão. Quando um jogador tenta conectar, o servidor acorda automaticamente do último save.

## Como funciona

1. **Servidor inicia** automaticamente quando o computador liga
2. **Jogadores jogam** normalmente
3. **Último jogador sai** → um timer de inatividade começa
4. **Tempo esgotou** → o servidor salva o mundo e "dorme" (desliga)
5. **Jogador tenta conectar** → um pacote UDP na porta `8211` acorda o servidor
6. **Servidor volta** exatamente de onde parou (último save)

## Requisitos

- Windows
- Node.js 22+
- Servidor dedicado do Palworld instalado pela Steam
- Porta UDP pública `8211`
- REST API local na porta `8212`

## Instalação

```bash
npm install
```

## Configuração do `.env`

Copie `.env.example` para `.env` e ajuste:

- `PALSERVER_EXE_PATH`
- `PALSERVER_WORKING_DIRECTORY`
- `PALSERVER_ARGUMENTS`
- `PALSERVER_PROCESS_NAME`
- `REST_API_USERNAME`
- `REST_API_PASSWORD`
- `LOG_LEVEL`

Valores de porta e timeout podem ser mantidos se estiverem iguais ao padrão.

## PalWorldSettings.ini

Edite:

`Pal\Saved\Config\WindowsServer\PalWorldSettings.ini`

Garanta:

```ini
AdminPassword="trocar-por-senha-forte"
RESTAPIEnabled=True
RESTAPIPort=8212
PublicPort=8211
```

Não exponha a porta `8212` na internet.

## Firewall e roteador

### Roteador

- encaminhe UDP `8211` para o IP local do computador;
- use um IP fixo ou reserva DHCP;
- exemplo: `192.168.15.4`.

### Firewall do Windows

- libere UDP `8211` para o gerenciador e para o Palworld;
- mantenha TCP `8212` apenas local;
- não crie regra pública para `8212`.

## Como descobrir o caminho do `PalServer.exe`

Na Steam, localize a pasta do servidor dedicado. O caminho comum é:

`C:\Program Files (x86)\Steam\steamapps\common\PalServer\PalServer.exe`

## Como executar em desenvolvimento

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Execução

```bash
npm start
```

## Testes

```bash
npm test
```

## Typecheck

```bash
npm run typecheck
```

## Wake UDP

Quando o servidor estiver parado, o processo abre a porta UDP `8211` apenas como gatilho.

Limitação importante:

- o primeiro pacote UDP recebido não é repassado ao Palworld;
- esse pacote serve apenas para disparar o início do servidor;
- o jogador provavelmente precisará esperar o servidor subir e tentar conectar novamente;
- não é possível prometer conexão instantânea.

## Como iniciar automaticamente com o Windows

Use:

```powershell
.\scripts\install-task.ps1 -Trigger Startup
```

Ou:

```powershell
.\scripts\install-task.ps1 -Trigger Logon
```

Remoção:

```powershell
.\scripts\remove-task.ps1
```

## Criar tarefa no Agendador

O script instala a tarefa `PalworldServerAutoSleep` para executar como `SYSTEM`, com reinício em caso de falha e diretório de trabalho correto.

## Como testar o wake

1. Pare o `PalServer.exe`.
2. Confirme que `8211` está escutando pelo gerenciador.
3. Envie qualquer pacote UDP para `8211`.
4. O servidor deve iniciar.
5. O pacote original não será entregue ao Palworld.

## Limitações da detecção UDP

O gerenciador não atua como proxy UDP enquanto o Palworld está rodando.
Ele apenas usa a porta `8211` como gatilho quando o servidor está parado.

## Solução de problemas

- Se a API local não responder, confira `RESTAPIEnabled=True` e `RESTAPIPort=8212`.
- Se o wake não iniciar o servidor, verifique se a porta `8211` está encaminhada no roteador.
- Se o servidor não desligar, confirme se a API respondeu com lista válida de jogadores.
- Se o script de tarefa falhar, rode o PowerShell como administrador.

## Valores que você ainda precisa preencher

- `PALSERVER_EXE_PATH`
- `PALSERVER_WORKING_DIRECTORY`
- `REST_API_PASSWORD`
- `PALSERVER_PROCESS_NAME` se o nome do executável for diferente do exemplo

## Atualizar Mapa do usuário
- Abra o powershell e a partir do diretório onde se encontra o arquivo `update-map.ps1` execute o comando:

    ``` powershell
    powershell -ExecutionPolicy Bypass -File .\update-map.ps1