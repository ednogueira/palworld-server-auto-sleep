import { main } from './entrypoints/main';

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
