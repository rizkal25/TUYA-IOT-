// backend/scheduler/cycle-checker.js
const db = require('../db');

let checkInterval = null;
const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Convert JS day (0=Sunday) to PostgreSQL DOW (0=Sunday, 1=Monday, ..., 6=Saturday)
// Our DB stores: 0=Monday, 1=Tuesday, ..., 6=Sunday (Python style)
function jsDayToPostgresDay(jsDay) {
  // JS: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  // Our DB: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  return jsDay === 0 ? 6 : jsDay - 1;
}

function formatTimeForComparison(date) {
  // Format to HH:MM:SS for exact string comparison
  return date.toTimeString().slice(0, 8);
}

async function executeHAAction(machine, action, timerInfo = null) {
  try {
    const service = action === 'on' ? 'turn_on' : 'turn_off';
    const url = `${machine.ha_url}/api/services/switch/${service}`;
    
    console.log(`🔄 [CYCLE] Calling HA: ${url} for ${machine.switch_entity}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${machine.ha_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ entity_id: machine.switch_entity })
    });
    
    const responseText = await response.text();
    
    if (response.ok || response.status === 200) {
      const info = timerInfo ? ` [${timerInfo}]` : '';
      console.log(`✅ [CYCLE] ${machine.name}: ${action.toUpperCase()} executed${info} at ${new Date().toISOString()}`);
      return true;
    } else {
      console.error(`❌ [CYCLE] ${machine.name}: HA ${action} failed (${response.status}): ${responseText}`);
      return false;
    }
  } catch (err) {
    console.error(`❌ [CYCLE] ${machine.name}: HA connection error: ${err.message}`);
    return false;
  }
}

async function checkAndExecuteCycleTimers() {
  try {
    const now = new Date();
    const currentDayJS = now.getDay(); // 0=Sunday
    const currentDayDB = jsDayToPostgresDay(currentDayJS); // Convert to our DB format
    const currentTime = formatTimeForComparison(now); // "HH:MM:SS"
    
    console.log(`🔍 [CYCLE] Checking at ${currentTime}, Day: ${dayNames[currentDayJS]} (DB: ${currentDayDB})`);
    
    // Get all active cycle timers with machine info
    const result = await db.query(`
      SELECT ct.id, ct.machine_id, ct.on_time, ct.off_time, ct.schedule_days,
             m.ha_url, m.ha_token, m.switch_entity, m.name as machine_name
      FROM cycle_timers ct
      JOIN mcb_machines m ON ct.machine_id = m.id
      WHERE ct.is_active = true
    `);
    
    if (result.rows.length === 0) {
      console.log('ℹ️ [CYCLE] No active cycle timers found');
      return;
    }
    
    let executed = 0;
    
    for (const timer of result.rows) {
      // Fix: PostgreSQL returns array as string "{0,1,2}", parse it
      const scheduleDays = Array.isArray(timer.schedule_days) 
        ? timer.schedule_days 
        : (timer.schedule_days || '{}').replace(/[{}]/g, '').split(',').map(Number).filter(n => !isNaN(n));
      
      // Check if today is in schedule
      if (!scheduleDays.includes(currentDayDB)) {
        continue;
      }
      
      // Format DB TIME to string for comparison
      const onTime = timer.on_time instanceof Date 
        ? timer.on_time.toTimeString().slice(0, 8) 
        : String(timer.on_time).padStart(8, '0');
      
      const offTime = timer.off_time instanceof Date
        ? timer.off_time.toTimeString().slice(0, 8)
        : String(timer.off_time).padStart(8, '0');
      
      // Check ON time (exact second match)
      if (currentTime === onTime) {
        console.log(`🟢 [CYCLE] ${timer.machine_name}: TURN ON scheduled (${dayNames[currentDayJS]} ${onTime})`);
        const success = await executeHAAction(timer, 'on', `ON:${onTime}`);
        if (success) executed++;
      }
      
      // Check OFF time
      if (currentTime === offTime) {
        console.log(`🔴 [CYCLE] ${timer.machine_name}: TURN OFF scheduled (${dayNames[currentDayJS]} ${offTime})`);
        const success = await executeHAAction(timer, 'off', `OFF:${offTime}`);
        if (success) executed++;
      }
    }
    
    if (executed > 0) {
      console.log(`✅ [CYCLE] Executed ${executed} action(s) at ${currentTime}`);
    }
    
  } catch (err) {
    console.error('❌ [CYCLE] Check error:', err.message, err.stack);
  }
}

// Also check device_schedules (single schedule, not cycle)
async function checkAndExecuteSchedules() {
  try {
    const now = new Date();
    const currentDayJS = now.getDay();
    const currentDayDB = jsDayToPostgresDay(currentDayJS);
    const currentTime = formatTimeForComparison(now).slice(0, 5); // "HH:MM" for schedule
    
    const result = await db.query(`
      SELECT ds.id, ds.machine_id, ds.schedule_day, ds.schedule_time, ds.action,
             m.ha_url, m.ha_token, m.switch_entity, m.name as machine_name
      FROM device_schedules ds
      JOIN mcb_machines m ON ds.machine_id = m.id
      WHERE ds.is_active = true
    `);
    
    if (result.rows.length === 0) return;
    
    for (const sched of result.rows) {
      if (sched.schedule_day !== currentDayDB) continue;
      
      // Format schedule_time (TIME) to "HH:MM"
      const schedTime = sched.schedule_time instanceof Date
        ? sched.schedule_time.toTimeString().slice(0, 5)
        : String(sched.schedule_time).slice(0, 5);
      
      if (currentTime === schedTime) {
        const action = sched.action ? 'on' : 'off';
        const actionText = sched.action ? 'ON' : 'OFF';
        console.log(`⏰ [SCHEDULE] ${sched.machine_name}: ${actionText} scheduled (${schedTime})`);
        await executeHAAction(sched, action, `SCHED:${schedTime}`);
      }
    }
  } catch (err) {
    console.error('❌ [SCHEDULE] Check error:', err.message);
  }
}

async function checkAndExecuteAll() {
  await checkAndExecuteCycleTimers();
  await checkAndExecuteSchedules();
}

function startCycleChecker() {
  if (checkInterval) {
    console.log('🔄 Cycle checker already running');
    return;
  }
  
  console.log('🚀 Cycle/Schedule scheduler started (checking every 1 second)');
  
  // Check immediately on start
  checkAndExecuteAll();
  
  // Then check every second for precise timing
  checkInterval = setInterval(checkAndExecuteAll, 1000);
  
  // Also log status every minute
  setInterval(() => {
    console.log(`📊 [SCHEDULER] Running - Next check in 1s`);
  }, 60000);
}

function stopCycleChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('🛑 Cycle/Schedule scheduler stopped');
  }
}

module.exports = { startCycleChecker, stopCycleChecker };