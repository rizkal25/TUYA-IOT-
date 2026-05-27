const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');

// ===== IMPORT CYCLE TIMER SCHEDULER =====
const { startCycleChecker, stopCycleChecker } = require('./scheduler/cycle-checker');

require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== CORS CONFIG =====
const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    // Development: allow all (remove for production)
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Global rate limiter (express-rate-limit package)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300000000, // limit each IP to 100 requests per windowMs
  message: { success: false, message: 'Terlalu banyak request dari IP ini' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Database setup
const db = require('./db');

async function initDB() {
  try {
    // Users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar VARCHAR(500),
        bio TEXT DEFAULT '',
        email_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      );
    `);

    // Password resets
    await db.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Sessions
    await db.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      );
    `);

    // ===== CYCLE TIMERS TABLE =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS cycle_timers (
        id SERIAL PRIMARY KEY,
        machine_id INTEGER REFERENCES mcb_machines(id) ON DELETE CASCADE,
        schedule_days INTEGER[] NOT NULL,
        on_time TIME NOT NULL,
        off_time TIME NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_cycle_timers_machine ON cycle_timers(machine_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_cycle_timers_active ON cycle_timers(is_active) WHERE is_active = true');

    // Device schedules (single schedule)
    await db.query(`
      CREATE TABLE IF NOT EXISTS device_schedules (
        id SERIAL PRIMARY KEY,
        machine_id INTEGER REFERENCES mcb_machines(id) ON DELETE CASCADE,
        schedule_day INTEGER CHECK (schedule_day BETWEEN 0 AND 6),
        schedule_time TIME NOT NULL,
        action BOOLEAN NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Meter readings
    await db.query(`
      CREATE TABLE IF NOT EXISTS meter_readings (
        id SERIAL PRIMARY KEY,
        machine_id INTEGER REFERENCES mcb_machines(id) ON DELETE CASCADE,
        timestamp TIMESTAMP DEFAULT NOW(),
        voltage NUMERIC(10,2),
        current NUMERIC(10,3),
        power NUMERIC(10,2),
        energy_kwh NUMERIC(12,4),
        relay BOOLEAN,
        online BOOLEAN,
        cost NUMERIC(12,2)
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_meter_readings_machine ON meter_readings(machine_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_meter_readings_time ON meter_readings(timestamp)');

    // System config
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        tariff_per_kwh NUMERIC(12,2) DEFAULT 1467.79,
        carbon_factor NUMERIC(5,3) DEFAULT 0.85,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await db.query(`
      INSERT INTO system_config (id, tariff_per_kwh) VALUES (1, 1467.79)
      ON CONFLICT (id) DO NOTHING
    `);

    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  }
}

// Routes
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    uptime: process.uptime(),
    scheduler: 'cycle-checker: ' + (global.cycleSchedulerRunning ? 'running' : 'stopped')
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

// ===== START SERVER & SCHEDULER =====
initDB().then(async () => {
  // Start the HTTP server
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // ✅ Start cycle timer scheduler AFTER server is ready
  startCycleChecker();
  global.cycleSchedulerRunning = true;

  // ===== GRACEFUL SHUTDOWN =====
  const shutdown = async (signal) => {
    console.log(`\n👋 Received ${signal}, shutting down gracefully...`);
    
    // Stop cycle timer scheduler
    stopCycleChecker();
    global.cycleSchedulerRunning = false;
    
    // Close DB connections
    if (db.pool) {
      await db.pool.end();
      console.log('🔌 Database connections closed');
    }
    
    // Close HTTP server
    server.close(() => {
      console.log('🛑 HTTP server closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds if server doesn't close
    setTimeout(() => {
      console.error('❌ Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
});