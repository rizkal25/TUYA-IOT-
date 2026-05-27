/**
 * Report Module - A4 Report Generator
 * Handles report generation, printing, and data fetching
 */

const Report = {
  // API endpoint
  API_URL: 'http://127.0.0.1:3001/api/auth',
  
  // Report configuration (can be customized before opening)
  config: {
    title: 'LAPORAN MONITORING MCB',
    subtitle: 'Nexora Tech Control System',
    company: 'PT Nexora Teknologi Indonesia',
    address: 'Jl. Teknologi No. 123, Jakarta',
    showLogo: true,
    showSignature: true,
    signatureName: 'Manager Operasional',
    
    // Sections to display
    sections: {
      header: true,
      summary: true,
      dataTable: true,
      footer: true
    },
    
    // Data source: 'api' | 'static' | 'custom'
    dataSource: 'api',
    
    // Date range (null = today)
    dateRange: {
      start: null,
      end: null
    }
  },
  
  // Cached data
  machine: null,
  readings: [],
  
  /**
   * Initialize report page
   */
  async init() {
    // Check authentication
    const token = localStorage.getItem('authToken');
    if (!token) {
      window.location.href = 'index.html';
      return;
    }
    
    // Show loading
    this.showLoading(true);
    
    // Get machine ID from session
    const machineId = sessionStorage.getItem('currentMachineId');
    
    if (machineId) {
      // Fetch data and generate report
      await this.fetchData(machineId, token);
      await this.generateContent();
    } else {
      // No machine selected - show empty state
      this.showEmptyState('Silakan pilih mesin dari dashboard terlebih dahulu.');
    }
    
    // Hide loading
    this.showLoading(false);
    
    // Show page
    document.getElementById('reportPage')?.classList.add('active');
  },
  
  /**
   * Fetch data from API
   */
  async fetchData(machineId, token) {
    try {
      // Fetch machine info
      const mRes = await fetch(`${this.API_URL}/mcb-machines/${machineId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const mData = await mRes.json();
      if (mData.success) {
        this.machine = mData.machine;
        document.title = `Report — ${this.machine.name}`;
      }
      
      // Fetch readings with date range
      const today = new Date().toISOString().split('T')[0];
      const startDate = this.config.dateRange.start || today;
      const endDate = this.config.dateRange.end || today;
      
      const startISO = new Date(startDate).toISOString();
      const endISO = new Date(endDate);
      endISO.setUTCHours(23, 59, 59, 999);
      
      const rRes = await fetch(
        `${this.API_URL}/mcb-machines/${machineId}/readings?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO.toISOString())}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const rData = await rRes.json();
      if (rData.success) {
        this.readings = rData.readings || [];
      }
    } catch (e) {
      console.warn('Failed to fetch report data:', e);
      this.readings = [];
    }
  },
  
  /**
   * Generate report HTML content
   */
  async generateContent() {
    const container = document.getElementById('a4Content');
    if (!container) return;
    
    const cfg = this.config;
    const machineName = this.machine?.name || 'Mesin Tidak Dikenal';
    const readings = this.readings;
    
    // Calculate stats
    const stats = this.calculateStats(readings);
    
    // Build HTML
    let html = '';
    
    // ===== HEADER =====
    if (cfg.sections.header) {
      const today = new Date().toISOString().split('T')[0];
      const startDate = cfg.dateRange.start || today;
      const endDate = cfg.dateRange.end || today;
      
      html += `
        <section class="report-section">
          <div style="text-align:center;margin-bottom:20px">
            ${cfg.showLogo ? `
              <div style="font-size:24pt;font-weight:800;color:var(--primary, #6c63ff);margin-bottom:8px">
                ⚡ NEXORA
              </div>
            ` : ''}
            <h1 style="margin:0;font-size:16pt;color:#1a1a2e">${cfg.title}</h1>
            <p style="margin:4px 0 0 0;font-size:11pt;color:#6b6b80">${cfg.subtitle}</p>
          </div>
          
          <div class="report-meta">
            <div><strong>Mesin:</strong><span>${this.escapeHtml(machineName)}</span></div>
            <div><strong>Periode:</strong><span>${this.formatDate(startDate)} - ${this.formatDate(endDate)}</span></div>
            <div><strong>Dibuat:</strong><span>${new Date().toLocaleString('id-ID')}</span></div>
            <div><strong>Halaman:</strong><span>1 dari 1</span></div>
          </div>
        </section>
      `;
    }
    
    // ===== SUMMARY =====
    if (cfg.sections.summary) {
      html += `
        <section class="report-section">
          <h3>📊 Ringkasan Data</h3>
          <div class="report-summary">
            <div class="report-card">
              <div class="value">${stats.totalReadings}</div>
              <div class="label">Total Data</div>
            </div>
            <div class="report-card">
              <div class="value">${stats.avgPower} W</div>
              <div class="label">Rata-rata Daya</div>
            </div>
            <div class="report-card">
              <div class="value">${stats.totalEnergy} kWh</div>
              <div class="label">Total Energi</div>
            </div>
            <div class="report-card">
              <div class="value">${stats.peakPower} W</div>
              <div class="label">Daya Puncak</div>
            </div>
          </div>
        </section>
      `;
    }
    
    // ===== DATA TABLE =====
    if (cfg.sections.dataTable) {
      if (readings.length > 0) {
        html += `
          <section class="report-section">
            <h3>📋 Detail Pembacaan</h3>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th class="num">Volt (V)</th>
                  <th class="num">Ampere (A)</th>
                  <th class="num">Daya (W)</th>
                  <th class="num">Energi (kWh)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${readings.slice(0, 20).map(r => `
                  <tr>
                    <td>${new Date(r.timestamp).toLocaleString('id-ID', {hour:'2-digit',minute:'2-digit'})}</td>
                    <td class="num">${r.voltage?.toFixed(1) || '-'}</td>
                    <td class="num">${r.current?.toFixed(3) || '-'}</td>
                    <td class="num ${r.power > (stats.avgPower * 1.2) ? 'warning' : ''}">${r.power?.toFixed(0) || '-'}</td>
                    <td class="num">${r.energy_kwh?.toFixed(3) || '-'}</td>
                    <td>${r.relay ? '🟢 ON' : '🔴 OFF'}</td>
                  </tr>
                `).join('')}
                ${readings.length > 20 ? `
                  <tr>
                    <td colspan="6" style="text-align:center;color:#6b6b80;font-style:italic">
                      ... dan ${readings.length - 20} data lainnya
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </section>
        `;
      } else {
        html += `
          <section class="report-section">
            <h3>📋 Detail Pembacaan</h3>
            <div class="report-empty">
              <div class="icon">📭</div>
              <h4>Tidak Ada Data</h4>
              <p>Tidak ada data pembacaan untuk periode yang dipilih.</p>
            </div>
          </section>
        `;
      }
    }
    
    // ===== FOOTER =====
    if (cfg.sections.footer) {
      html += `
        <footer class="report-footer">
          <div class="company-info">
            <strong>${this.escapeHtml(cfg.company)}</strong>
            ${this.escapeHtml(cfg.address)}
            <small style="display:block;margin-top:8px;color:#8b8ba7">
              Dokumen ini dihasilkan otomatis oleh sistem Nexora Tech.
            </small>
          </div>
          ${cfg.showSignature ? `
            <div class="signature">
              <div class="signature-line"></div>
              <strong>${this.escapeHtml(cfg.signatureName)}</strong>
              <small>${new Date().toLocaleDateString('id-ID')}</small>
            </div>
          ` : ''}
        </footer>
      `;
    }
    
    // Render
    container.innerHTML = html;
  },
  
  /**
   * Calculate statistics from readings
   */
  calculateStats(readings) {
    if (!readings?.length) {
      return { totalReadings: 0, avgPower: 0, totalEnergy: 0, peakPower: 0 };
    }
    
    const validPower = readings
      .filter(r => r.power != null && r.power >= 0)
      .map(r => r.power);
    
    const validEnergy = readings
      .filter(r => r.energy_kwh != null)
      .map(r => r.energy_kwh);
    
    return {
      totalReadings: readings.length,
      avgPower: validPower.length 
        ? Math.round(validPower.reduce((a, b) => a + b, 0) / validPower.length) 
        : 0,
      totalEnergy: validEnergy.length 
        ? validEnergy.reduce((a, b) => a + b, 0).toFixed(2) 
        : '0.00',
      peakPower: validPower.length ? Math.max(...validPower) : 0
    };
  },
  
  /**
   * Refresh report data
   */
  async refresh() {
    this.showLoading(true);
    const token = localStorage.getItem('authToken');
    const machineId = sessionStorage.getItem('currentMachineId');
    
    if (machineId && token) {
      await this.fetchData(machineId, token);
      await this.generateContent();
      this.showToast('✅ Data diperbarui', 'success');
    }
    
    this.showLoading(false);
  },
  
  /**
   * Print report (browser print dialog)
   */
  print() {
    // Small delay to ensure content is rendered
    setTimeout(() => {
      window.print();
    }, 100);
  },
  
  /**
   * Close report and return to dashboard
   */
  close() {
    document.getElementById('reportPage')?.classList.remove('active');
    // Optional: redirect to dashboard
    // window.location.href = 'dashboard.html';
  },
  
  /**
   * Show/hide loading overlay
   */
  showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
    }
  },
  
  /**
   * Show empty state message
   */
  showEmptyState(message) {
    const container = document.getElementById('a4Content');
    if (container) {
      container.innerHTML = `
        <div class="report-empty">
          <div class="icon">⚠️</div>
          <h4>Perlu Konfigurasi</h4>
          <p>${this.escapeHtml(message)}</p>
        </div>
      `;
    }
  },
  
  /**
   * Show toast notification
   */
  showToast(message, type = 'info', duration = 3000) {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 9999;
      animation: slideIn 0.3s ease, fadeOut 0.3s ease ${duration - 300}ms forwards;
    `;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), duration);
  },
  
  /**
   * Format date for display
   */
  formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  },
  
  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};/**
 * Report Module - A4 Report Generator
 * Handles report generation, printing, and data fetching
 */

const Report = {
  // API endpoint
  API_URL: 'http://127.0.0.1:3001/api/auth',
  
  // Report configuration (can be customized before opening)
  config: {
    title: 'LAPORAN MONITORING MCB',
    subtitle: 'Nexora Tech Control System',
    company: 'PT Nexora Teknologi Indonesia',
    address: 'Jl. Teknologi No. 123, Jakarta',
    showLogo: true,
    showSignature: true,
    signatureName: 'Manager Operasional',
    
    // Sections to display
    sections: {
      header: true,
      summary: true,
      dataTable: true,
      footer: true
    },
    
    // Data source: 'api' | 'static' | 'custom'
    dataSource: 'api',
    
    // Date range (null = today)
    dateRange: {
      start: null,
      end: null
    }
  },
  
  // Cached data
  machine: null,
  readings: [],
  
  /**
   * Initialize report page
   */
  async init() {
    // Check authentication
    const token = localStorage.getItem('authToken');
    if (!token) {
      window.location.href = 'index.html';
      return;
    }
    
    // Show loading
    this.showLoading(true);
    
    // Get machine ID from session
    const machineId = sessionStorage.getItem('currentMachineId');
    
    if (machineId) {
      // Fetch data and generate report
      await this.fetchData(machineId, token);
      await this.generateContent();
    } else {
      // No machine selected - show empty state
      this.showEmptyState('Silakan pilih mesin dari dashboard terlebih dahulu.');
    }
    
    // Hide loading
    this.showLoading(false);
    
    // Show page
    document.getElementById('reportPage')?.classList.add('active');
  },
  
  /**
   * Fetch data from API
   */
  async fetchData(machineId, token) {
    try {
      // Fetch machine info
      const mRes = await fetch(`${this.API_URL}/mcb-machines/${machineId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const mData = await mRes.json();
      if (mData.success) {
        this.machine = mData.machine;
        document.title = `Report — ${this.machine.name}`;
      }
      
      // Fetch readings with date range
      const today = new Date().toISOString().split('T')[0];
      const startDate = this.config.dateRange.start || today;
      const endDate = this.config.dateRange.end || today;
      
      const startISO = new Date(startDate).toISOString();
      const endISO = new Date(endDate);
      endISO.setUTCHours(23, 59, 59, 999);
      
      const rRes = await fetch(
        `${this.API_URL}/mcb-machines/${machineId}/readings?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO.toISOString())}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const rData = await rRes.json();
      if (rData.success) {
        this.readings = rData.readings || [];
      }
    } catch (e) {
      console.warn('Failed to fetch report data:', e);
      this.readings = [];
    }
  },
  
  /**
   * Generate report HTML content
   */
  async generateContent() {
    const container = document.getElementById('a4Content');
    if (!container) return;
    
    const cfg = this.config;
    const machineName = this.machine?.name || 'Mesin Tidak Dikenal';
    const readings = this.readings;
    
    // Calculate stats
    const stats = this.calculateStats(readings);
    
    // Build HTML
    let html = '';
    
    // ===== HEADER =====
    if (cfg.sections.header) {
      const today = new Date().toISOString().split('T')[0];
      const startDate = cfg.dateRange.start || today;
      const endDate = cfg.dateRange.end || today;
      
      html += `
        <section class="report-section">
          <div style="text-align:center;margin-bottom:20px">
            ${cfg.showLogo ? `
              <div style="font-size:24pt;font-weight:800;color:var(--primary, #6c63ff);margin-bottom:8px">
                ⚡ NEXORA
              </div>
            ` : ''}
            <h1 style="margin:0;font-size:16pt;color:#1a1a2e">${cfg.title}</h1>
            <p style="margin:4px 0 0 0;font-size:11pt;color:#6b6b80">${cfg.subtitle}</p>
          </div>
          
          <div class="report-meta">
            <div><strong>Mesin:</strong><span>${this.escapeHtml(machineName)}</span></div>
            <div><strong>Periode:</strong><span>${this.formatDate(startDate)} - ${this.formatDate(endDate)}</span></div>
            <div><strong>Dibuat:</strong><span>${new Date().toLocaleString('id-ID')}</span></div>
            <div><strong>Halaman:</strong><span>1 dari 1</span></div>
          </div>
        </section>
      `;
    }
    
    // ===== SUMMARY =====
    if (cfg.sections.summary) {
      html += `
        <section class="report-section">
          <h3>📊 Ringkasan Data</h3>
          <div class="report-summary">
            <div class="report-card">
              <div class="value">${stats.totalReadings}</div>
              <div class="label">Total Data</div>
            </div>
            <div class="report-card">
              <div class="value">${stats.avgPower} W</div>
              <div class="label">Rata-rata Daya</div>
            </div>
            <div class="report-card">
              <div class="value">${stats.totalEnergy} kWh</div>
              <div class="label">Total Energi</div>
            </div>
            <div class="report-card">
              <div class="value">${stats.peakPower} W</div>
              <div class="label">Daya Puncak</div>
            </div>
          </div>
        </section>
      `;
    }
    
    // ===== DATA TABLE =====
    if (cfg.sections.dataTable) {
      if (readings.length > 0) {
        html += `
          <section class="report-section">
            <h3>📋 Detail Pembacaan</h3>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th class="num">Volt (V)</th>
                  <th class="num">Ampere (A)</th>
                  <th class="num">Daya (W)</th>
                  <th class="num">Energi (kWh)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${readings.slice(0, 20).map(r => `
                  <tr>
                    <td>${new Date(r.timestamp).toLocaleString('id-ID', {hour:'2-digit',minute:'2-digit'})}</td>
                    <td class="num">${r.voltage?.toFixed(1) || '-'}</td>
                    <td class="num">${r.current?.toFixed(3) || '-'}</td>
                    <td class="num ${r.power > (stats.avgPower * 1.2) ? 'warning' : ''}">${r.power?.toFixed(0) || '-'}</td>
                    <td class="num">${r.energy_kwh?.toFixed(3) || '-'}</td>
                    <td>${r.relay ? '🟢 ON' : '🔴 OFF'}</td>
                  </tr>
                `).join('')}
                ${readings.length > 20 ? `
                  <tr>
                    <td colspan="6" style="text-align:center;color:#6b6b80;font-style:italic">
                      ... dan ${readings.length - 20} data lainnya
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </section>
        `;
      } else {
        html += `
          <section class="report-section">
            <h3>📋 Detail Pembacaan</h3>
            <div class="report-empty">
              <div class="icon">📭</div>
              <h4>Tidak Ada Data</h4>
              <p>Tidak ada data pembacaan untuk periode yang dipilih.</p>
            </div>
          </section>
        `;
      }
    }
    
    // ===== FOOTER =====
    if (cfg.sections.footer) {
      html += `
        <footer class="report-footer">
          <div class="company-info">
            <strong>${this.escapeHtml(cfg.company)}</strong>
            ${this.escapeHtml(cfg.address)}
            <small style="display:block;margin-top:8px;color:#8b8ba7">
              Dokumen ini dihasilkan otomatis oleh sistem Nexora Tech.
            </small>
          </div>
          ${cfg.showSignature ? `
            <div class="signature">
              <div class="signature-line"></div>
              <strong>${this.escapeHtml(cfg.signatureName)}</strong>
              <small>${new Date().toLocaleDateString('id-ID')}</small>
            </div>
          ` : ''}
        </footer>
      `;
    }
    
    // Render
    container.innerHTML = html;
  },
  
  /**
   * Calculate statistics from readings
   */
  calculateStats(readings) {
    if (!readings?.length) {
      return { totalReadings: 0, avgPower: 0, totalEnergy: 0, peakPower: 0 };
    }
    
    const validPower = readings
      .filter(r => r.power != null && r.power >= 0)
      .map(r => r.power);
    
    const validEnergy = readings
      .filter(r => r.energy_kwh != null)
      .map(r => r.energy_kwh);
    
    return {
      totalReadings: readings.length,
      avgPower: validPower.length 
        ? Math.round(validPower.reduce((a, b) => a + b, 0) / validPower.length) 
        : 0,
      totalEnergy: validEnergy.length 
        ? validEnergy.reduce((a, b) => a + b, 0).toFixed(2) 
        : '0.00',
      peakPower: validPower.length ? Math.max(...validPower) : 0
    };
  },
  
  /**
   * Refresh report data
   */
  async refresh() {
    this.showLoading(true);
    const token = localStorage.getItem('authToken');
    const machineId = sessionStorage.getItem('currentMachineId');
    
    if (machineId && token) {
      await this.fetchData(machineId, token);
      await this.generateContent();
      this.showToast('✅ Data diperbarui', 'success');
    }
    
    this.showLoading(false);
  },
  
  /**
   * Print report (browser print dialog)
   */
  print() {
    // Small delay to ensure content is rendered
    setTimeout(() => {
      window.print();
    }, 100);
  },
  
  /**
   * Close report and return to dashboard
   */
  close() {
    document.getElementById('reportPage')?.classList.remove('active');
    // Optional: redirect to dashboard
    // window.location.href = 'dashboard.html';
  },
  
  /**
   * Show/hide loading overlay
   */
  showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
    }
  },
  
  /**
   * Show empty state message
   */
  showEmptyState(message) {
    const container = document.getElementById('a4Content');
    if (container) {
      container.innerHTML = `
        <div class="report-empty">
          <div class="icon">⚠️</div>
          <h4>Perlu Konfigurasi</h4>
          <p>${this.escapeHtml(message)}</p>
        </div>
      `;
    }
  },
  
  /**
   * Show toast notification
   */
  showToast(message, type = 'info', duration = 3000) {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 9999;
      animation: slideIn 0.3s ease, fadeOut 0.3s ease ${duration - 300}ms forwards;
    `;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), duration);
  },
  
  /**
   * Format date for display
   */
  formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  },
  
  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};