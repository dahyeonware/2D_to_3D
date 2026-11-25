// Express 앱 팩토리 (테스트에서 메모리 DB로 생성 가능)
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config as defaultConfig } from './config.js';
import { createData } from './services/data.js';
import { createGraphService } from './services/graph.js';
import { createEventBus } from './services/events.js';
import { readRoutes } from './routes/read.js';
import { writeRoutes } from './routes/write.js';
import { errorHandler, notFound } from './http.js';

export function createApp(db, config = defaultConfig) {
  const app = express();
  const data = createData(db);
  const ctx = { db, data, graph: createGraphService(data), bus: createEventBus(), config };

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  // SSE: 서버리스(Vercel)에서는 연결을 유지할 수 없으므로 204 → 프론트가 폴링(/live)으로 전환
  api.get('/events', (req, res) => (config.realtime === 'sse' ? ctx.bus.subscribe(req, res) : res.status(204).end()));
  api.use(readRoutes(ctx));
  api.use(writeRoutes(ctx));
  api.use((req, res, next) => next(notFound(`API ${req.method} ${req.path}`)));
  app.use('/api', api);

  // 빌드된 프론트(web/dist) 정적 서빙 — npm run build 후 npm start
  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    app.use(express.static(config.webDist, { index: 'index.html', maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }

  app.use(errorHandler);
  app.locals.ctx = ctx;
  return app;
}
