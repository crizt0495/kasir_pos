import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { startCacheCleanup } from './middleware/cache.js';

const app = express();

// Start cache cleanup timer (setiap 5 menit hapus entry expired)
startCacheCleanup(5 * 60 * 1000);

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

// Keamanan header
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS (cookie httpOnly → butuh credentials + origin eksplisit)
const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // Izinkan request non-browser (test, server-to-server) tanpa origin
      if (!origin || corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Rate limiting global untuk seluruh API
app.use('/api', globalLimiter);

// Routes
app.use('/api', routes);

// 404 & error handler terpusat
app.use(notFound);
app.use(errorHandler);

export default app;
