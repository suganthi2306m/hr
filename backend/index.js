require('dotenv').config();
const http = require('http');
const express = require('express');
const path = require('path');
const connectDB = require('./src/config/db');
const cors = require('cors');
const helmet = require('helmet');
const { attachSocketIO } = require('./src/socket/socketServer');

const authRoutes = require('./src/routes/authRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const customerRoutes = require('./src/routes/customerRoutes');
const trackingRoutes = require('./src/routes/trackingRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const leaveRoutes = require('./src/routes/leaveRoutes');
const companyVisitRoutes = require('./src/routes/companyVisitRoutes');

const app = express();

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/selfie', express.static(path.join(process.cwd(), '..', 'selfie')));
app.set('trust proxy', 1);

app.use(helmet());
//cors
// Configure CORS
//const allowedOrigins = ['https://ehrms.askeva.io', 'http://ehrms.askeva.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];

// Configure CORS
const allowedOrigins = ['https://ehrms.askeva.net', 'http://ehrms.askeva.net', 'http://localhost:8080', 'http://127.0.0.1:8080'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Routes (rate limiting is applied at router level, not globally)
console.log('[Server] Registering routes...');
app.use('/api/auth', authRoutes);
console.log('[Server] Auth routes registered at /api/auth');
app.use('/api/tasks', taskRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/company-visits', companyVisitRoutes);
app.use('/api/ops', require('./src/routes/opsRoutes'));

// Debug: Log all incoming requests (only in development)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[Route Debug] ${req.method} ${req.path}`);
        next();
    });
}

// 404 handler - should return JSON, not HTML
app.use((req, res) => {
    console.error(`[404] Route not found: ${req.method} ${req.path}`);
    res.status(404).json({
        success: false,
        error: { message: `Route not found: ${req.method} ${req.path}` }
    });
});

const PORT = process.env.PORT || 5000;
// Listen on all interfaces so phones on the same LAN can reach the dev server (not only localhost).
const HOST = process.env.HOST || '0.0.0.0';

// Start Server
const startServer = async () => {
    try {
        await connectDB();
        const httpServer = http.createServer(app);
        attachSocketIO(httpServer);
        httpServer.listen(PORT, HOST, () => {
            console.log(`Server running on http://${HOST}:${PORT} (HTTP + Socket.IO)`);
        });
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();