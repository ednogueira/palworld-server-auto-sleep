import { bootstrap } from './entrypoints/bootstrap';

bootstrap().then(async () => {
  // Mantem o processo vivo. O shutdown e disparado pelos handlers de
  // SIGINT/SIGTERM registrados em bootstrap.ts. Sem o await abaixo,
  // o then resolve imediatamente e o processo encerra.
  await new Promise<void>(() => {
    // nunca resolve
  });
}).catch((error: unknown) => {
  console.error('Falha fatal na inicializacao do manager:', error);
  process.exit(1);
});
