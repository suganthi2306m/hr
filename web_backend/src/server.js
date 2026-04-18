const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const connectDb = require('./config/db');
const registerRoutes = require('./routes');
const initSocketServer = require('./sockets');
const { ensureDefaultAdmin, ensureDefaultUsers, ensureCustomerIndexes } = require('./services/bootstrapService');
const { startLocationRealtime } = require('./services/locationRealtimeService');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = initSocketServer(server);

app.set('io', io);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

/** Trim each origin — spaces after commas in CORS_ORIGIN break matching and cause POST CORS failures. */
function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGIN || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : ['http://localhost:5173'];
}

/** Vercel project URLs (production + previews) without listing each in CORS_ORIGIN. */
function isCustomerconnectVercelOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'https:') return false;
    return hostname.endsWith('.vercel.app') && hostname.startsWith('customerconnect');
  } catch {
    return false;
  }
}

const parsedCorsOrigins = parseCorsOrigins();
// eslint-disable-next-line no-console
console.log('[cors] allow-list from CORS_ORIGIN:', parsedCorsOrigins.join(' | ') || '(none)');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (parsedCorsOrigins.includes(origin)) return callback(null, origin);
      if (isCustomerconnectVercelOrigin(origin)) {
        // eslint-disable-next-line no-console
        console.log('[cors] allowing Vercel host:', origin);
        return callback(null, origin);
      }
      // eslint-disable-next-line no-console
      console.warn('[cors] blocked Origin (add to CORS_ORIGIN on Render):', origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '4mb' }));
app.use(morgan('dev'));
app.use('/api', limiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

registerRoutes(app);

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDb();
  await ensureCustomerIndexes();
  await ensureDefaultAdmin();
  await ensureDefaultUsers();
  startLocationRealtime(io);
  server.listen(PORT, () => {
    console.log(`LiveTrack backend running on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error('Unable to start server:', error);
  process.exit(1);
});
