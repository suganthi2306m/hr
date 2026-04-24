const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const connectDb = require('./config/db');
const registerRoutes = require('./routes');
const subscriptionWebhookRoutes = require('./routes/subscriptionWebhookRoutes');
const initSocketServer = require('./sockets');
const {
  ensureDefaultAdmin,
  ensureMainSuperAdmin,
  ensureSuperAdmin,
  migrateSubscriptionPlans,
  ensureDefaultSubscriptionPlans,
  ensureDefaultUsers,
  ensureCustomerIndexes,
} = require('./services/bootstrapService');
const { startLocationRealtime } = require('./services/locationRealtimeService');
const {
  normalizeBrowserOrigin,
  parseCorsOrigins,
  parseVercelProjectSlugs,
  isDevLocalFrontendOrigin,
  isAllowedVercelProjectOrigin,
} = require('./utils/corsAllowlist');

/** Log each auto-allowed dev Origin once (avoids spam on every preflight). */
const devCorsOriginLogged = new Set();

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
  /** Plain-string bodies omit `message`; keep JSON aligned with other API errors. */
  message: { message: 'Too many requests. Please try again later.' },
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const parsedCorsOrigins = parseCorsOrigins();
// eslint-disable-next-line no-console
console.log('[cors] allow-list from CORS_ORIGIN:', parsedCorsOrigins.join(' | ') || '(none)');
// eslint-disable-next-line no-console
console.log('[cors] Vercel project slugs (CORS_VERCEL_SLUGS or default):', parseVercelProjectSlugs().join(' | '));

/** Payment provider webhooks need raw body for signature verification (Razorpay). */
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }), subscriptionWebhookRoutes);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalized = normalizeBrowserOrigin(origin);
      if (parsedCorsOrigins.includes(normalized) || parsedCorsOrigins.includes(origin)) {
        return callback(null, origin);
      }
      if (isAllowedVercelProjectOrigin(origin)) {
        // eslint-disable-next-line no-console
        console.log('[cors] allowing Vercel host:', origin);
        return callback(null, origin);
      }
      if (isDevLocalFrontendOrigin(origin)) {
        if (!devCorsOriginLogged.has(origin)) {
          devCorsOriginLogged.add(origin);
          // eslint-disable-next-line no-console
          console.log('[cors] allowing dev localhost frontend (NODE_ENV!=production):', origin);
        }
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

app.use((error, req, res, _next) => {
  const status = error.status || 500;
  const verboseErrors =
    process.env.NODE_ENV !== 'production' || String(process.env.VERBOSE_API_ERRORS || '').trim() === '1';
  if (verboseErrors && (error.raw || status >= 500)) {
    const path = req.originalUrl || req.url || '';
    // eslint-disable-next-line no-console
    console.error(`[http error] ${req.method} ${path} → ${status}: ${error.message}`);
    if (error.raw && typeof error.raw === 'object') {
      // eslint-disable-next-line no-console
      console.error('[http error] upstream JSON:', JSON.stringify(error.raw).slice(0, 2000));
    }
    if (error.stack) {
      // eslint-disable-next-line no-console
      console.error(error.stack);
    }
  }
  res.status(status).json({
    message: error.message || 'Internal server error',
  });
});

const PORT = Number(process.env.PORT) || 5000;

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(
      `[server] Port ${PORT} is already in use (EADDRINUSE). Another LiveTrack / Node process is probably still running.\n` +
        `  Fix: stop the other terminal (Ctrl+C), or run: Get-NetTCPConnection -LocalPort ${PORT} | Select OwningProcess\n` +
        `  Or use a different port: set PORT=5001 in web_backend/.env`,
    );
    process.exit(1);
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[server] HTTP server error:', err);
  process.exit(1);
});

async function start() {
  await connectDb();
  await ensureCustomerIndexes();
  await ensureDefaultAdmin();
  await ensureMainSuperAdmin();
  await ensureSuperAdmin();
  await migrateSubscriptionPlans();
  await ensureDefaultSubscriptionPlans();
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
