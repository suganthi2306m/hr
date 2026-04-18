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

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
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
