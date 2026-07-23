# scripts/test-scenarios

Testes end-to-end leves do `palworld-auto-manager` sem precisar de Docker, do
container oficial do Palworld ou do jogo real. Usa stubs HTTP, driver em
memoria e o proprio `bootstrap` da aplicacao em execucao para exercitar os
fluxos criticos em segundos.

## Motivacao

Os tres cenarios corrigidos no ADR-0005 (timeout curto no `/save`,
recuperacao apos falha de idle shutdown, e observabilidade do shutdown lento)
sao dificeis de reproduzir com o jogo real: precisam de um mundo sendo
persistido, de jogadores entrando e saindo, e de horas de espera ate o
idle timeout. Subir o container de Palworld + o manager na cloud real para
reproduzir isso na mao e caro.

Este harness usa stubs de Node para simular os cenarios e exercitar o codigo
real do manager (importando `src/entrypoints/bootstrap`).

## Arquivos

| Arquivo | Funcao |
|--------|----|
| `harness.ts` | Orquestra os cenarios, importa `bootstrap`, valida estado final |
| `stub-api.ts` | Servidor HTTP nas portas do REST API do Palworld (`/info`, `/players`, `/save`, `/shutdown`), com latencia e falhas configuraveis |
| `stub-driver.ts` | `ServerProcessDriver` em memoria. Reage ao evento `shutdown:ok` da stub-api para mudar o estado `running` |
| `stub-backup.ts` | `BackupService` em memoria (noop com chamadas contadas) |

## Requisitos

- Node.js >= 22 (igual ao do projeto)
- `npm install` (ja tem `tsx` em devDependencies)

Nenhum Docker, nenhuma porta fixa reservada. Os cenarios alocam portas
dinamicamente a partir de 18000.

## Uso

```bash
npm run test:scenarios
```

O comando roda, em sequencia, os 3 cenarios descritos abaixo. Cada cenario
imprime seu bloco de resultado e o resumo final eh `N/3 cenarios passaram.`
em caso de sucesso.

### Saida esperada

```
-> Cenario 1: /save lento usa timeout dedicado sem abortar
-> Cenario 2: /save sempre falha — manager RECUPERA para RUNNING em vez de ficar preso em STOPPING
-> Cenario 3: /save + /shutdown cooperativos concluem antes do timeout (state STOPPED, sem driver.stop)

=== Resultados ===
[OK] Cenario 1
[OK] Cenario 2
[OK] Cenario 3

3/3 cenarios passaram.
```

Em caso de falha, o processo sai com exit code 1.

## Cenarios cobertos

### Cenario 1 — save lento usa timeout dedicado

- `emptyServerTimeoutMinutes=1`, `playerCheckIntervalSeconds=1`
- `REST_API_SAVE_TIMEOUT_SECONDS=10`, `SERVER_SHUTDOWN_TIMEOUT_SECONDS=30`
- Stub do `/save`: delay 3s, retorno OK
- Esperado: o manager NAO aborta mesmo com save demorado, transita
  para `STOPPED`, e NAO chama `driver.stop()` (shutdown cooperativo basta)

Antes da correcao (ADR-0004 + ADR-0005): o timeout padrao do PalworldApi (10s) era
compartilhado com `/save`, e mesmo quando passava, nao havia tolerancia extra.
Aqui, com `REST_API_SAVE_TIMEOUT_SECONDS=10` e save de 3s, cai folgado.

### Cenario 2 — save sempre falha → manager recupera

- Stub `/save`: retorna 500 imediatamente (sem delay, sem retry possivel)
- Esperado: o `onIdleTimeout` falha, o catch em `bootstrap.onIdleTimeout`
  volta para `RUNNING`, reativa `wakeListener`, e o teste observa
  `state.get() === 'RUNNING'` dentro de 30s

Antes da correcao: o estado ia do `STOPPING` para nulo (nada voltava para RUNNING),
o `idleMonitor` ficava parado, o `wakeListener` era morto, e o manager
permanecia online sem operar. Esse cenario reproduz o bug do incidente de 19/07.

### Cenario 3 — shutdown cooperativo completo

- Stub `/save`: 200ms; Stub `/shutdown`: delay 1.5s e retorna OK; driver
  reage ao `shutdown:ok` e marca running=false
- Esperado: save acontece, shutdown API responde, `isRunning()` retorna
  false no proximo poll do loop, e o estado vai para `STOPPED` sem chamar
  `driver.stop()`

Esse cenario cobre o caso ideal do `increase grace period` (240s): garante
que semanticamente nada quebra quando o Palworld responde de forma padrao
dentro do timeout configurado.

## Implementacao: injecao de dependencias

O `src/entrypoints/bootstrap.ts` foi extraido do entrypoint para expor uma
funcao `bootstrap(dependencies)` que aceita `api`, `driver`, `backupService`,
`config` opcionais. Em producao, `index.ts` chama `bootstrap({})`. O harness
importa `bootstrap` e passa stubs. Ver ADR-0005.

## Adicionar novos cenarios

1. Adicionar a funcao em `harness.ts` na lista `scenarios`
2. Receber uma `ScenarioContext` com stubs `stubApi`, `driver`, `backup`,
   e a `config` do manager
3. `await setupScenario(ctx)` para subir stub HTTP e rodar `bootstrap`
4. Usar `waitFor(predicate, timeoutMs)` para verificar o estado final
5. Chamar `await shutdown()` para encerrar limpamente

Use portas altas e diferentes por cenario para evitar colisao no caso de
testes paralelos:

```
basePort = 18000 (cenario 1)
basePort = 18100 (cenario 2)
basePort = 18200 (cenario 3)
```

## Limitacoes conhecidas

- Os stubs nao validam Basic Auth alem da presenca — qualquer header
  `Basic <base64>` eh aceito. Em cenario real isso importaria, mas nao
  para testar fluxo de stop/start/idle.
- O `stub-driver` escuta o evento `shutdown:ok` da stub-api, nao imita
  sinais SIGTERM/SIGKILL. Em Docker real, sinais sao observaveis
  externamente; aqui nao simulator isso fora do escopo.
- Não testa o cron `0 * * * *` da imagem Palworld — interferencia
  documentada no ADR-0005 mas sem valor verificavel via stub.
