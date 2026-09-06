import { describeApp } from '@app/app-info.js';
import { createLivenessServer } from '@app/liveness.js';

const host = process.env['APP_HOST'] ?? '0.0.0.0';
const port = Number(process.env['APP_PORT'] ?? 3000);

const server = createLivenessServer();

// Docker envía SIGTERM al parar el contenedor. Sin cerrar aquí, esperaría diez
// segundos a que el proceso reaccione antes de matarlo.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}

server.listen(port, host, () => {
  console.log(`${describeApp()} — escuchando en http://${host}:${port}`);
});
