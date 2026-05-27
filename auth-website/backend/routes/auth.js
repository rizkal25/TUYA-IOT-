const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { verifyToken, rateLimit } = require('../middleware/auth');
require('dotenv').config();

// ============ REGISTER ============
router.post('/register', rateLimit, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Password tidak cocok' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password minimal 8 karakter' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id, name, email, created_at`,
      [name, email.toLowerCase(), hashedPassword]
    );

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil! Silakan login.',
      user: result.rows[0],
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ LOGIN ============
router.post('/login', rateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }

    await db.query('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    res.json({
      success: true,
      message: 'Login berhasil!',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ FORGOT PASSWORD (DEV MODE - ZIP FLOW) ============
router.post('/forgot-password', rateLimit, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email wajib diisi' });

    const result = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Email tidak terdaftar' });
    }

    const userId = result.rows[0].id;
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000);

    await db.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, resetToken, expiresAt]
    );

    res.json({ 
      success: true, 
      message: 'Kode reset berhasil dibuat!',
      devToken: resetToken
    });
  } catch (err) {
    console.error('❌ Forgot password error:', err.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ VERIFY TOKEN (FOR ZIP FLOW) ============
router.post('/verify-token', rateLimit, async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) return res.status(400).json({ success: false, message: 'Email dan token wajib diisi' });
    if (token.length !== 64) return res.status(400).json({ success: false, message: 'Format token tidak valid' });

    const result = await db.query(
      `SELECT u.email FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token = $1 AND u.email = $2 AND pr.expires_at > NOW()
       ORDER BY pr.created_at DESC LIMIT 1`,
      [token, email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Kode tidak valid atau sudah kedaluwarsa' });
    }

    res.json({ success: true, message: 'Kode valid!' });
  } catch (err) {
    console.error('❌ Verify token error:', err.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ RESET PASSWORD ============
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, message: 'Token dan password baru wajib diisi' });
    if (password.length < 8) return res.status(400).json({ success: false, message: 'Password minimal 8 karakter' });

    const result = await db.query(
      'SELECT * FROM password_resets WHERE token = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', 
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Token tidak valid atau sudah kedaluwarsa' });
    }

    const reset = result.rows[0];
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    await db.query('BEGIN');
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashedPassword, reset.user_id]);
    await db.query('DELETE FROM password_resets WHERE user_id = $1', [reset.user_id]);
    await db.query('COMMIT');

    res.json({ success: true, message: 'Password berhasil direset. Silakan login dengan password baru.' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ GET PROFILE ============
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, bio, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ UPDATE PROFILE ============
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, bio } = req.body;
    
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Nama minimal 2 karakter' });
    }
    if (bio !== undefined && bio.length > 500) {
      return res.status(400).json({ success: false, message: 'Bio maksimal 500 karakter' });
    }

    const result = await db.query(
      `UPDATE users SET name = $1, bio = $2, updated_at = NOW() WHERE id = $3 RETURNING id, name, email, bio`,
      [name.trim(), bio || '', req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }

    res.json({ success: true, message: 'Profil berhasil diperbarui', user: result.rows[0] });
  } catch (err) {
    console.error('❌ Update profile error:', err.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ CHANGE PASSWORD ============
router.put('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Password saat ini dan baru wajib diisi' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password baru minimal 8 karakter' });
    }

    const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    
    const user = result.rows[0];
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) return res.status(401).json({ success: false, message: 'Password saat ini salah' });

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashedPassword, req.user.id]);

    res.json({ success: true, message: 'Password berhasil diubah' });
  } catch (err) {
    console.error('❌ Change password error:', err.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ MCB MACHINES: GET ALL ============
router.get('/mcb-machines', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, ha_url, sensors, switch_entity, is_active, last_connected_at, created_at FROM mcb_machines WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, machines: result.rows });
  } catch (err) {
    console.error('❌ Get MCB machines error:', err.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ MCB MACHINES: CREATE ============
router.post('/mcb-machines', verifyToken, async (req, res) => {
  try {
    const { name, haUrl, haToken, sensors, switchEntity } = req.body;
    
    if (!name || !haUrl || !haToken || !sensors?.current || !switchEntity) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }
    
    const result = await db.query(
      `INSERT INTO mcb_machines (user_id, name, ha_url, ha_token, sensors, switch_entity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, ha_url, sensors, switch_entity, created_at`,
      [req.user.id, name.trim(), haUrl.trim(), haToken.trim(), sensors, switchEntity.trim()]
    );
    
    res.status(201).json({ success: true, message: 'Mesin berhasil ditambahkan', machine: result.rows[0] });
  } catch (err) {
    console.error('❌ Create MCB machine error:', err.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ MCB MACHINES: UPDATE ============
router.put('/mcb-machines/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, haUrl, haToken, sensors, switchEntity } = req.body;
    
    const check = await db.query('SELECT id FROM mcb_machines WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    }
    
    const result = await db.query(
      `UPDATE mcb_machines 
       SET name = $1, ha_url = $2, ha_token = $3, sensors = $4, switch_entity = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, ha_url, sensors, switch_entity, updated_at`,
      [name?.trim(), haUrl?.trim(), haToken?.trim(), sensors, switchEntity?.trim(), id]
    );
    
    res.json({ success: true, message: 'Mesin berhasil diperbarui', machine: result.rows[0] });
  } catch (err) {
    console.error('❌ Update MCB machine error:', err.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ MCB MACHINES: DELETE ============
router.delete('/mcb-machines/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const check = await db.query('SELECT id FROM mcb_machines WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    }
    
    await db.query('DELETE FROM mcb_machines WHERE id = $1', [id]);
    res.json({ success: true, message: 'Mesin berhasil dihapus' });
  } catch (err) {
    console.error('❌ Delete MCB machine error:', err.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// ============ MCB MACHINES: TEST CONNECTION ============
router.post('/mcb-machines/:id/test', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT ha_url, ha_token FROM mcb_machines WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    }
    
    const { ha_url, ha_token } = result.rows[0];
    
    const response = await fetch(`${ha_url}/api/`, {
      headers: {
        'Authorization': `Bearer ${ha_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const connected = response.status === 200;
    
    if (connected) {
      await db.query('UPDATE mcb_machines SET last_connected_at = NOW() WHERE id = $1', [id]);
    }
    
    res.json({ 
      success: true, 
      connected, 
      status: response.status,
      message: connected ? 'Terhubung ke Home Assistant' : `Gagal: Status ${response.status}`
    });
  } catch (err) {
    console.error('❌ Test connection error:', err.message);
    res.json({ success: true, connected: false, error: err.message });
  }
});

// ============ MCB: GET SINGLE MACHINE ============
router.get('/mcb-machines/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT * FROM mcb_machines WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    res.json({ success: true, machine: result.rows[0] });
  } catch (err) {
    console.error('❌ Get machine error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ MCB: UPDATE MACHINE LIMITS ============
router.put('/mcb-machines/:id/limits', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { max_current, min_current, max_voltage, min_voltage, max_power, min_power } = req.body;
    
    const check = await db.query('SELECT id FROM mcb_machines WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    
    await db.query(
      `UPDATE mcb_machines SET max_current=$1, min_current=$2, max_voltage=$3, min_voltage=$4, max_power=$5, min_power=$6, updated_at=NOW() WHERE id=$7`,
      [max_current, min_current, max_voltage, min_voltage, max_power, min_power, id]
    );
    res.json({ success: true, message: 'Batas aman diperbarui' });
  } catch (err) {
    console.error('❌ Update limits error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ SCHEDULE: CRUD ============
router.get('/mcb-machines/:id/schedules', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT ds.*, m.name as machine_name FROM device_schedules ds
       JOIN mcb_machines m ON ds.machine_id = m.id
       WHERE ds.machine_id = $1 AND m.user_id = $2 ORDER BY schedule_day, schedule_time`,
      [id, req.user.id]
    );
    res.json({ success: true, schedules: result.rows });
  } catch (err) {
    console.error('❌ Get schedules error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/mcb-machines/:id/schedules', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { schedule_day, schedule_time, action } = req.body;
    
    const check = await db.query('SELECT id FROM mcb_machines WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    
    const result = await db.query(
      'INSERT INTO device_schedules (machine_id, schedule_day, schedule_time, action) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, schedule_day, schedule_time, action]
    );
    res.status(201).json({ success: true, message: 'Jadwal ditambahkan', schedule: result.rows[0] });
  } catch (err) {
    console.error('❌ Create schedule error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/mcb-machines/:id/schedules/:scheduleId', verifyToken, async (req, res) => {
  try {
    const { id, scheduleId } = req.params;
    const check = await db.query(
      'SELECT ds.id FROM device_schedules ds JOIN mcb_machines m ON ds.machine_id = m.id WHERE ds.id = $1 AND m.user_id = $2',
      [scheduleId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan' });
    
    await db.query('DELETE FROM device_schedules WHERE id = $1', [scheduleId]);
    res.json({ success: true, message: 'Jadwal dihapus' });
  } catch (err) {
    console.error('❌ Delete schedule error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ CYCLE TIMER: CRUD ============
router.get('/mcb-machines/:id/cycle-timers', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT ct.*, m.name as machine_name FROM cycle_timers ct
       JOIN mcb_machines m ON ct.machine_id = m.id
       WHERE ct.machine_id = $1 AND m.user_id = $2 ORDER BY on_time`,
      [id, req.user.id]
    );
    res.json({ success: true, timers: result.rows });
  } catch (err) {
    console.error('❌ Get cycle timers error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/mcb-machines/:id/cycle-timers', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { schedule_days, on_time, off_time } = req.body;
    
    const check = await db.query('SELECT id FROM mcb_machines WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    
    const result = await db.query(
      'INSERT INTO cycle_timers (machine_id, schedule_days, on_time, off_time) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, schedule_days, on_time, off_time]
    );
    res.status(201).json({ success: true, message: 'Cycle timer ditambahkan', timer: result.rows[0] });
  } catch (err) {
    console.error('❌ Create cycle timer error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/mcb-machines/:id/cycle-timers/:timerId', verifyToken, async (req, res) => {
  try {
    const { id, timerId } = req.params;
    const check = await db.query(
      'SELECT ct.id FROM cycle_timers ct JOIN mcb_machines m ON ct.machine_id = m.id WHERE ct.id = $1 AND m.user_id = $2',
      [timerId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Timer tidak ditemukan' });
    
    await db.query('DELETE FROM cycle_timers WHERE id = $1', [timerId]);
    res.json({ success: true, message: 'Cycle timer dihapus' });
  } catch (err) {
    console.error('❌ Delete cycle timer error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// ============ METER READINGS: GET HISTORY (FIXED DATE HANDLING) ============
router.get('/mcb-machines/:id/readings', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { start, end } = req.query;
    
    // ✅ FIX: Parse date parameters properly
    let dateFilter = '';
    let params = [id, req.user.id];
    let paramCount = 2;
    
    if (start && end) {
      // Parse start: ensure it's a valid date, use beginning of day UTC
      const startDate = new Date(start);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Format tanggal mulai tidak valid' });
      }
      startDate.setUTCHours(0, 0, 0, 0);
      
      // Parse end: ensure it's a valid date, use end of day UTC
      const endDate = new Date(end);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Format tanggal akhir tidak valid' });
      }
      endDate.setUTCHours(23, 59, 59, 999);
      
      dateFilter = `AND timestamp >= $${++paramCount} AND timestamp <= $${++paramCount}`;
      params.push(startDate.toISOString(), endDate.toISOString());
      
      console.log(`🔍 Readings query: machine=${id}, start=${startDate.toISOString()}, end=${endDate.toISOString()}`);
    } else if (start) {
      // Only start date: fetch for that day only
      const dayDate = new Date(start);
      if (isNaN(dayDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Format tanggal tidak valid' });
      }
      dayDate.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayDate);
      dayEnd.setUTCHours(23, 59, 59, 999);
      
      dateFilter = `AND timestamp >= $${++paramCount} AND timestamp <= $${++paramCount}`;
      params.push(dayDate.toISOString(), dayEnd.toISOString());
    }
    
    // ✅ SELECT ALL COLUMNS that frontend expects
    const result = await db.query(
      `SELECT 
        id, timestamp, 
        voltage, current, power, energy_kwh,
        apparent_power, pf, peak_power, carbon_factor,
        relay, online, cost
      FROM meter_readings 
      WHERE machine_id = $1 
      AND machine_id IN (SELECT id FROM mcb_machines WHERE user_id = $2)
      ${dateFilter}
      ORDER BY timestamp DESC 
      LIMIT 1000`,
      params
    );
    
    console.log(`📊 Readings found: ${result.rows.length} rows for machine ${id}`);
    
    // Transform rows to ensure all fields exist (handle NULL)
    const readings = result.rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      voltage: row.voltage !== null ? parseFloat(row.voltage) : null,
      current: row.current !== null ? parseFloat(row.current) : null,
      power: row.power !== null ? parseFloat(row.power) : null,
      energy_kwh: row.energy_kwh !== null ? parseFloat(row.energy_kwh) : null,
      apparent_power: row.apparent_power !== null ? parseFloat(row.apparent_power) : null,
      pf: row.pf !== null ? parseFloat(row.pf) : null,
      peak_power: row.peak_power !== null ? parseFloat(row.peak_power) : null,
      carbon_factor: row.carbon_factor !== null ? parseFloat(row.carbon_factor) : 0.85,
      relay: row.relay,
      online: row.online,
      cost: row.cost !== null ? parseFloat(row.cost) : null
    }));
    
    res.json({ success: true, readings });
    
  } catch (err) {
    console.error('❌ Get readings error:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ============ METER READINGS: AGGREGATE FOR GRAPH ============
router.get('/mcb-machines/:id/readings/aggregate', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { period = 'daily', year, month, day } = req.query;
    
    let groupBy = '', select = '', where = '';
    let params = [id, req.user.id];
    
    if (period === 'daily') {
      groupBy = 'EXTRACT(HOUR FROM timestamp)';
      select = 'EXTRACT(HOUR FROM timestamp) as label, SUM(energy_kwh) as total_kwh, AVG(power) as avg_power';
      where = `AND DATE(timestamp) = $3`;
      params.push(day || new Date().toISOString().split('T')[0]);
    } else if (period === 'monthly') {
      groupBy = 'EXTRACT(DAY FROM timestamp)';
      select = 'EXTRACT(DAY FROM timestamp) as label, SUM(energy_kwh) as total_kwh, AVG(power) as avg_power';
      where = `AND EXTRACT(MONTH FROM timestamp) = $3 AND EXTRACT(YEAR FROM timestamp) = $4`;
      params.push(month || new Date().getMonth()+1, year || new Date().getFullYear());
    } else {
      groupBy = 'EXTRACT(MONTH FROM timestamp)';
      select = 'EXTRACT(MONTH FROM timestamp) as label, SUM(energy_kwh) as total_kwh, AVG(power) as avg_power';
      where = `AND EXTRACT(YEAR FROM timestamp) = $3`;
      params.push(year || new Date().getFullYear());
    }
    
    const result = await db.query(
      `SELECT ${select} FROM meter_readings 
       WHERE machine_id = $1 
       AND machine_id IN (SELECT id FROM mcb_machines WHERE user_id = $2)
       ${where}
       GROUP BY ${groupBy} ORDER BY ${groupBy}`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('❌ Aggregate readings error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ SYSTEM CONFIG: GET/UPDATE TARIFF ============
router.get('/system/config', verifyToken, async (req, res) => {
  try {
    const result = await db.query('SELECT tariff_per_kwh, carbon_factor FROM system_config WHERE id = 1');
    res.json({ success: true, config: result.rows[0] || { tariff_per_kwh: 1467.79, carbon_factor: 0.85 } });
  } catch (err) {
    console.error('❌ Get config error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/system/config', verifyToken, async (req, res) => {
  try {
    const { tariff_per_kwh, carbon_factor } = req.body;
    await db.query(
      'UPDATE system_config SET tariff_per_kwh = $1, carbon_factor = $2, updated_at = NOW() WHERE id = 1',
      [tariff_per_kwh, carbon_factor]
    );
    res.json({ success: true, message: 'Konfigurasi sistem diperbarui' });
  } catch (err) {
    console.error('❌ Update config error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// ============ HA: GET DEVICE STATUS (via backend proxy) - FIXED CONNECTION STATUS ============
router.post('/mcb-machines/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      `SELECT ha_url, ha_token, switch_entity, 
              sensor_current, sensor_power, sensor_voltage, sensor_energy,
              max_current, min_current, max_voltage, min_voltage, max_power, min_power,
              name
       FROM mcb_machines WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    }
    
    const machine = result.rows[0];
    
    // Fetch status switch/entity dari Home Assistant
    const switchRes = await fetch(`${machine.ha_url}/api/states/${machine.switch_entity}`, {
      headers: {
        'Authorization': `Bearer ${machine.ha_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!switchRes.ok) {
      return res.json({ 
        success: true, 
        error: `HA API error: ${switchRes.status}`, 
        data: null,
        warning: 'Periksa HA URL, token, dan entity ID'
      });
    }
    
    const switchData = await switchRes.json();
    
    // Fetch sensor values (jika entity sensor terpisah)
    const sensors = {};
    if (machine.sensor_current) {
      try {
        const s = await fetch(`${machine.ha_url}/api/states/${machine.sensor_current}`, {
          headers: { 'Authorization': `Bearer ${machine.ha_token}` }
        });
        if (s.ok) sensors.current = (await s.json()).state;
      } catch {}
    }
    if (machine.sensor_power) {
      try {
        const s = await fetch(`${machine.ha_url}/api/states/${machine.sensor_power}`, {
          headers: { 'Authorization': `Bearer ${machine.ha_token}` }
        });
        if (s.ok) sensors.power = (await s.json()).state;
      } catch {}
    }
    if (machine.sensor_voltage) {
      try {
        const s = await fetch(`${machine.ha_url}/api/states/${machine.sensor_voltage}`, {
          headers: { 'Authorization': `Bearer ${machine.ha_token}` }
        });
        if (s.ok) sensors.voltage = (await s.json()).state;
      } catch {}
    }
    if (machine.sensor_energy) {
      try {
        const s = await fetch(`${machine.ha_url}/api/states/${machine.sensor_energy}`, {
          headers: { 'Authorization': `Bearer ${machine.ha_token}` }
        });
        if (s.ok) sensors.energy = (await s.json()).state;
      } catch {}
    }

    // Helper: safe parseFloat dengan fallback
    const num = (val, fallback = null) => {
      if (val === undefined || val === null) return fallback;
      const parsed = parseFloat(val);
      return !isNaN(parsed) ? parsed : fallback;
    };

    const attrs = switchData.attributes || {};

    // ✅ STEP 1: Base data (no circular dependencies)
    const baseData = {
      voltage: num(sensors.voltage || attrs.voltage || attrs.current_voltage),
      current: num(sensors.current || attrs.current || attrs.current_consumption),
      power: num(sensors.power || attrs.power || attrs.current_power),
      energy_kwh: num(sensors.energy || attrs.total_energy || attrs.energy),
      relay: switchData.state === 'on',
      online: switchData.state !== 'unavailable' && switchData.state !== 'unknown',
      timestamp: switchData.last_updated,
      entity_id: machine.switch_entity
    };

    // ✅ STEP 2: Calculate derived fields using baseData
    const apparentPower = num(attrs.apparent_power || attrs.va) || 
                          (baseData.voltage != null && baseData.current != null 
                            ? baseData.voltage * baseData.current 
                            : null);

    const pf = num(attrs.power_factor || attrs.pf) || 
               (baseData.power != null && apparentPower != null && apparentPower > 0 
                 ? baseData.power / apparentPower 
                 : null);

    const peakPower = num(attrs.peak_power || attrs.max_power) || baseData.power;

    // ✅ STEP 3: Final data object
    const data = {
      ...baseData,
      apparent_power: apparentPower,
      pf: pf,
      peak_power: peakPower,
      carbon_factor: 0.85
    };

    // Debug log
    console.log(`📊 Parsed data for machine ${machine.name}:`, {
      voltage: data.voltage, current: data.current, power: data.power,
      apparent: data.apparent_power, pf: data.pf, peak: data.peak_power
    });
    
    // Hitung cost
    let cost = 0;
    try {
      const configRes = await db.query('SELECT tariff_per_kwh FROM system_config WHERE id = 1');
      const tariff = configRes.rows[0]?.tariff_per_kwh || 1467.79;
      cost = (data.energy_kwh || 0) * tariff;
    } catch (e) {
      console.warn('⚠️ Could not calculate cost:', e.message);
    }

    // ✅ SIMPAN KE meter_readings
    if (data.online && data.power != null && data.power >= 0) {
      try {
        await db.query(
          `INSERT INTO meter_readings (
            machine_id, timestamp, voltage, current, power, energy_kwh,
            apparent_power, pf, peak_power, carbon_factor,
            relay, online, cost
          ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            id,
            data.voltage || null, data.current || null, data.power || null,
            data.energy_kwh || null,
            data.apparent_power || null, data.pf || null, data.peak_power || null,
            data.carbon_factor || 0.85,
            data.relay, data.online, cost
          ]
        );
        console.log(`💾 Saved meter_reading for ${machine.name}: ${data.power}W`);
      } catch (err) {
        console.warn('⚠️ Failed to save meter_reading:', err.message);
      }
    }

    // ✅ FIX: UPDATE last_connected_at jika HA response OK
    // Ini yang bikin status "Online" muncul di frontend!
    try {
      await db.query(
        'UPDATE mcb_machines SET last_connected_at = NOW() WHERE id = $1',
        [id]
      );
      console.log(`🔗 Updated last_connected_at for ${machine.name}`);
    } catch (err) {
      console.warn('⚠️ Failed to update last_connected_at:', err.message);
      // Jangan throw error agar response tetap sukses
    }

    // ✅ CEK PROTEKSI
    if (data.relay === true && machine.max_power && machine.max_power > 0) {
      const violations = [];
      if (machine.max_current > 0 && data.current != null && data.current > machine.max_current) violations.push(`Arus ${data.current}A > ${machine.max_current}A`);
      if (machine.min_current > 0 && data.current != null && data.current < machine.min_current) violations.push(`Arus ${data.current}A < ${machine.min_current}A`);
      if (machine.max_voltage > 0 && data.voltage != null && data.voltage > machine.max_voltage) violations.push(`Tegangan ${data.voltage}V > ${machine.max_voltage}V`);
      if (machine.min_voltage > 0 && data.voltage != null && data.voltage < machine.min_voltage) violations.push(`Tegangan ${data.voltage}V < ${machine.min_voltage}V`);
      if (machine.max_power > 0 && data.power != null && data.power > machine.max_power) violations.push(`Daya ${data.power}W > ${machine.max_power}W`);
      if (machine.min_power > 0 && data.power != null && data.power < machine.min_power) violations.push(`Daya ${data.power}W < ${machine.min_power}W`);
      
      if (violations.length > 0) {
        console.log(`🛡️ [PROTECTION] ${machine.name}: ${violations.join('; ')}`);
        try {
          const response = await fetch(`${machine.ha_url}/api/services/switch/turn_off`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${machine.ha_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_id: machine.switch_entity })
          });
          if (response.ok || response.status === 200) {
            console.log(`✅ [PROTECTION] ${machine.name}: Auto-shutdown executed`);
            return res.json({ 
              success: true, 
              data: { ...data, relay: false }, 
              protection: { triggered: true, reasons: violations, action: 'turn_off', timestamp: new Date().toISOString() }
            });
          }
        } catch (e) {
          console.error(`❌ [PROTECTION] Failed: ${e.message}`);
        }
      }
    }

    res.json({ success: true, data });
    
  } catch (err) {
    console.error('❌ Get HA status error:', err.message, err.stack);
    res.json({ success: true, error: err.message, data: null });
  }
});




// ============ HA: CONTROL RELAY (switch.turn_on / turn_off) ============
router.post('/mcb-machines/:id/control', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'on' or 'off'
    
    // Validate action
    if (!action || !['on', 'off'].includes(action)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Action harus "on" atau "off"' 
      });
    }
    
    // Get machine config from DB
    const result = await db.query(
      'SELECT id, name, ha_url, ha_token, switch_entity FROM mcb_machines WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    }
    
    const machine = result.rows[0];
    const service = action === 'on' ? 'turn_on' : 'turn_off';
    const haUrl = `${machine.ha_url}/api/services/switch/${service}`;
    
    console.log(`🔄 [CONTROL] ${machine.name}: Calling HA ${service} for ${machine.switch_entity}`);
    
    // Call Home Assistant API
    const response = await fetch(haUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${machine.ha_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ entity_id: machine.switch_entity })
    });
    
    const responseText = await response.text();
    
    // Log result
    if (response.ok || response.status === 200) {
      console.log(`✅ [CONTROL] ${machine.name}: ${action.toUpperCase()} executed successfully`);
    } else {
      console.warn(`⚠️ [CONTROL] ${machine.name}: HA returned ${response.status}: ${responseText}`);
    }
   
    res.json({ 
      success: response.ok || response.status === 200, 
      message: response.ok ? `Switch ${action}` : `HA API error: ${response.status}`,
      status: response.status,
      action: action,              
      machine_id: id,              
      machine_name: machine.name   
    });
    
  } catch (err) {
    console.error(`❌ [CONTROL] Error for machine ${req.params.id}:`, err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + err.message,
      error: err.message
    });
  }
});

module.exports = router;