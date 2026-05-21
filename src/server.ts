import 'dotenv/config';
import http from 'http';
import { buildApp } from './app';
import { initSocketServer } from './socket';
import { config } from './config';
import { prisma } from './config/prisma';

async function main() {
  // 1. Build Fastify app
  const fastify = await buildApp();
  await fastify.ready();

  // 2. Attach Socket.io to the underlying Node http.Server
  const httpServer = http.createServer(fastify.server);
  // Fastify uses its own http server internally; we bridge Socket.io onto it
  initSocketServer(fastify.server as unknown as http.Server);

  // 3. Start listening
  fastify.listen(
    { port: config.server.port, host: config.server.host },
    (err, address) => {
      if (err) {
        fastify.log.error(err);
        process.exit(1);
      }
      console.log(`
╔══════════════════════════════════════════════╗
║       🐾 Haiwan Kita API Server 🐾          ║
╠══════════════════════════════════════════════╣
║  Status  : Running                           ║
║  Address : ${address.padEnd(33)}║
║  Env     : ${config.server.env.padEnd(33)}║
╚══════════════════════════════════════════════╝
      `);
    },
  );

  // 4. Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
    await fastify.close();
    await prisma.$disconnect();
    console.log('[Server] Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Fatal] Server failed to start:', err);
  process.exit(1);
});
