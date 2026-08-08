import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRouter } from './auth.js';
import { mapsRouter, loadBoardCache } from './maps.js';
import { profileRouter } from './profile.js';
import { uploadsRouter } from './uploads.js';
import { setupSockets } from './sockets.js';
import { initDatabase } from './db.js';

/**
 * Service API : Express + Socket.IO, sans état sur disque.
 *
 * Les fichiers statiques sont servis par le conteneur `web` (nginx), qui gère
 * aussi le HTTP/HTTPS sur le même port ; l'API ne parle que HTTP en interne.
 */

const PORT = Number(process.env.MONOPOLIE_PORT ?? 3000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // nginx est devant : indispensable au rate-limiting par IP

// L'app est servie en clair sur le réseau local : on retire tout ce qui force
// le HTTPS, sinon les navigateurs mobiles tentent de charger les assets en
// https://<ip>:3000 et n'affichent qu'une page blanche.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
  strictTransportSecurity: false,
}));
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/uploads', uploadsRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true }, // le client de dev tourne sur un autre port
});
setupSockets(io);

async function main() {
  await initDatabase();
  await loadBoardCache();
  httpServer.listen(PORT, () => {
    console.log(`\n  🎲 API Monopolie en écoute sur le port ${PORT}\n`);
  });
}

await main().catch((e) => {
  console.error('Démarrage impossible :', e);
  process.exit(1);
});

// arrêt propre : Docker envoie SIGTERM, on ferme les connexions en cours
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} reçu, arrêt…`);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
