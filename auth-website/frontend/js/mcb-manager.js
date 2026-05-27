// ===== MCB MACHINE MANAGER (Home Assistant API Version) =====
// 🛠️ DEBUG: Semua error dicetak ke console untuk troubleshooting
const MCBManager = {
  API_BASE: 'http://127.0.0.1:3001/api/auth',
  
  // ===== AUTH HELPERS =====
  _getToken() {
    return localStorage.getItem('authToken');
  },
  
  _headers() {
    const token = this._getToken();
    console.log('🔐 MCBManager._headers() token:', token ? '✓ Present' : '✗ Missing');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  },
  
  // ===== MACHINE CRUD =====
  async getAll() {
    try {
      console.log('📡 MCBManager.getAll() - Fetching machines...');
      const res = await fetch(`${this.API_BASE}/mcb-machines`, { headers: this._headers() });
      console.log('📡 Response status:', res.status);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('📦 Machines data:', data);
      return data.success ? data.machines : [];
    } catch (err) {
      console.error('❌ MCBManager.getAll() error:', err);
      return [];
    }
  },
  
  async getById(id) {
    try {
      console.log(`📡 MCBManager.getById(${id})`);
      const res = await fetch(`${this.API_BASE}/mcb-machines/${id}`, { headers: this._headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('📦 Machine data:', data);
      return data.success ? data.machine : null;
    } catch (err) {
      console.error(`❌ MCBManager.getById(${id}) error:`, err);
      return null;
    }
  },
  
  async add(machine) {
    console.log('📡 MCBManager.add() - Adding machine:', machine);
    const validation = this.validate(machine);
    if (!validation.valid) {
      console.error('❌ Validation failed:', validation.errors);
      throw new Error(validation.errors.join(', '));
    }
    
    // ✅ FIX: Hanya kirim field HA yang valid
    const payload = {
      name: machine.name?.trim(),
      haUrl: machine.haUrl?.trim(),
      haToken: machine.haToken?.trim(),
      switchEntity: machine.switchEntity?.trim(), // ✅ Entity ID HA (switch.xxx)
      sensors: {
        current: machine.sensors?.current?.trim(),
        power: machine.sensors?.power?.trim(),
        voltage: machine.sensors?.voltage?.trim(),
        energy: machine.sensors?.energy?.trim()
      },
      maxCurrent: parseFloat(machine.maxCurrent) || 10.0,
      minCurrent: parseFloat(machine.minCurrent) || 0.1,
      maxVoltage: parseFloat(machine.maxVoltage) || 240.0,
      minVoltage: parseFloat(machine.minVoltage) || 180.0,
      maxPower: parseFloat(machine.maxPower) || 2000.0,
      minPower: parseFloat(machine.minPower) || 5.0
    };
    
    console.log('📤 Sending payload:', JSON.stringify(payload, null, 2));
    
    const res = await fetch(`${this.API_BASE}/mcb-machines`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(payload)
    });
    
    console.log('📡 Add response status:', res.status);
    const responseData = await res.json();
    console.log('📦 Add response:', responseData);
    
    if (!res.ok) {
      throw new Error(responseData.message || `HTTP ${res.status}`);
    }
    
    return responseData.machine;
  },
  
  async update(id, updates) {
    console.log(`📡 MCBManager.update(${id})`, updates);
    
    const payload = {
      name: updates.name?.trim(),
      haUrl: updates.haUrl?.trim(),
      haToken: updates.haToken?.trim(),
      switchEntity: updates.switchEntity?.trim(),
      sensors: updates.sensors
    };
    
    const res = await fetch(`${this.API_BASE}/mcb-machines/${id}`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(payload)
    });
    
    console.log('📡 Update response status:', res.status);
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }
    
    return data.success;
  },
  
  async delete(id) {
    console.log(`📡 MCBManager.delete(${id})`);
    const res = await fetch(`${this.API_BASE}/mcb-machines/${id}`, {
      method: 'DELETE',
      headers: this._headers()
    });
    console.log('📡 Delete response status:', res.status);
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }
    
    return data.success;
  },
  
  // ===== LIMITS =====
  async updateLimits(id, limits) {
    console.log(`📡 MCBManager.updateLimits(${id})`, limits);
    const payload = {
      max_current: parseFloat(limits.max_current),
      min_current: parseFloat(limits.min_current),
      max_voltage: parseFloat(limits.max_voltage),
      min_voltage: parseFloat(limits.min_voltage),
      max_power: parseFloat(limits.max_power),
      min_power: parseFloat(limits.min_power)
    };
    
    const res = await fetch(`${this.API_BASE}/mcb-machines/${id}/limits`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data.success;
  },
  
  // ===== SCHEDULE CRUD =====
  async getSchedules(machineId) {
    try {
      const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/schedules`, { headers: this._headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.success ? data.schedules : [];
    } catch (err) {
      console.error('❌ getSchedules error:', err);
      return [];
    }
  },
  
  async addSchedule(machineId, schedule) {
    console.log('📡 addSchedule', { machineId, schedule });
    const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/schedules`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        schedule_day: parseInt(schedule.schedule_day),
        schedule_time: schedule.schedule_time,
        action: schedule.action
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data.success;
  },
  
  async deleteSchedule(machineId, scheduleId) {
    console.log(`📡 deleteSchedule(${scheduleId})`);
    const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/schedules/${scheduleId}`, {
      method: 'DELETE',
      headers: this._headers()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data.success;
  },
  
  // ===== CYCLE TIMER CRUD =====
  async getCycleTimers(machineId) {
    try {
      const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/cycle-timers`, { headers: this._headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.success ? data.timers : [];
    } catch (err) {
      console.error('❌ getCycleTimers error:', err);
      return [];
    }
  },
  
  async addCycleTimer(machineId, timer) {
    console.log('📡 addCycleTimer', { machineId, timer });
    const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/cycle-timers`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        schedule_days: timer.schedule_days,
        on_time: timer.on_time,
        off_time: timer.off_time
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data.success;
  },
  
  async deleteCycleTimer(machineId, timerId) {
    console.log(`📡 deleteCycleTimer(${timerId})`);
    const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/cycle-timers/${timerId}`, {
      method: 'DELETE',
      headers: this._headers()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data.success;
  },
  
  // ===== METER READINGS =====
  async getReadings(machineId, params = {}) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/readings?${qs}`, { headers: this._headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.success ? data.readings : [];
    } catch (err) {
      console.error('❌ getReadings error:', err);
      return [];
    }
  },
  
  async getAggregateReadings(machineId, params = {}) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/readings/aggregate?${qs}`, { headers: this._headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('❌ getAggregateReadings error:', err);
      return [];
    }
  },
  
  // ===== SYSTEM CONFIG =====
  async getSystemConfig() {
    try {
      const res = await fetch(`${this.API_BASE}/system/config`, { headers: this._headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.success ? data.config : null;
    } catch (err) {
      console.error('❌ getSystemConfig error:', err);
      return null;
    }
  },
  
  async updateSystemConfig(config) {
    const res = await fetch(`${this.API_BASE}/system/config`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify({
        tariff_per_kwh: parseFloat(config.tariff_per_kwh),
        carbon_factor: parseFloat(config.carbon_factor || 0.85)
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data.success;
  },
  
  // ===== HOME ASSISTANT CONTROL =====
  async getDeviceStatus(machineId) {
    try {
      console.log(`📡 getDeviceStatus(${machineId})`);
      const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/status`, {
        method: 'POST',
        headers: this._headers()
      });
      const data = await res.json();
      console.log('📦 Status data:', data);
      return data;
    } catch (err) {
      console.error('❌ getDeviceStatus error:', err);
      return { success: false, error: err.message, data: null };
    }
  },
  
  async controlRelay(machineId, action) {
    try {
      console.log(`📡 controlRelay(${machineId}, ${action})`);
      const res = await fetch(`${this.API_BASE}/mcb-machines/${machineId}/control`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      console.log('📦 Control response:', data);
      return data;
    } catch (err) {
      console.error('❌ controlRelay error:', err);
      return { success: false, message: err.message };
    }
  },
  
  // ===== TEST CONNECTION =====
  async testConnection(id) {
    try {
      const res = await fetch(`${this.API_BASE}/mcb-machines/${id}/test`, {
        method: 'POST',
        headers: this._headers()
      });
      return await res.json();
    } catch (err) {
      return { success: false, connected: false, error: err.message };
    }
  },
  
  // ===== VALIDATION =====
  validate(machine) {
    const errors = [];
    if (!machine?.name?.trim()) errors.push('Nama mesin wajib diisi');
    if (!machine?.haUrl?.trim()) errors.push('HA URL wajib diisi');
    if (!machine?.haToken?.trim()) errors.push('HA Token wajib diisi');
    if (!machine?.switchEntity?.trim()) errors.push('Switch Entity HA wajib (switch.xxx)');
    // Sensors optional tapi disarankan
    return { valid: errors.length === 0, errors };
  }
};

// 🛠️ DEBUG: Export ke window untuk testing di console
if (typeof window !== 'undefined') {
  window.MCBManager = MCBManager;
  console.log('✅ MCBManager loaded & available at window.MCBManager');
}