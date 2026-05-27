// ✅ FUNGSI DINAMIS API_URL - PASTI JALAN DI HP & LAPTOP
function getAPIURL() {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // Jika dibuka via file:// atau localhost, pakai 127.0.0.1
  if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://127.0.0.1:3001/api/auth';
  }
  
  // Jika dibuka via IP (misal dari HP), pakai hostname yang sama
  return `${protocol}//${hostname}:3001/api/auth`;
}

// Variabel global untuk dipakai di seluruh script
const API_URL = getAPIURL();
console.log('🔗 API_URL:', API_URL); // Debug: cek di console

// ===== LOADING =====
function showLoading() {
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

// ===== TOAST =====
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.4s ease-out forwards';
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ===== PASSWORD TOGGLE =====
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

// ===== PASSWORD STRENGTH =====
function checkPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const levels = [
    { width: '0%', color: 'transparent', text: '' },
    { width: '20%', color: '#E53170', text: 'Sangat Lemah' },
    { width: '40%', color: '#FF8906', text: 'Lemah' },
    { width: '60%', color: '#FFD700', text: 'Cukup' },
    { width: '80%', color: '#2CB67D', text: 'Kuat' },
    { width: '100%', color: '#00D2FF', text: 'Sangat Kuat' },
  ];

  return levels[score] || levels[0];
}

// ===== VALIDATION =====
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  input.classList.add('error');
  input.classList.remove('success');
  error.textContent = message;
  error.classList.add('show');
}

function clearError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  input.classList.remove('error');
  error.classList.remove('show');
}

function showSuccess(inputId) {
  const input = document.getElementById(inputId);
  input.classList.remove('error');
  input.classList.add('success');
}

// ===== LOADING STATE =====
function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ===== REGISTER FORM =====
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  const regPassword = document.getElementById('regPassword');
  const strengthDiv = document.getElementById('passwordStrength');
  const strengthFill = document.getElementById('strengthFill');
  const strengthText = document.getElementById('strengthText');

  regPassword.addEventListener('input', function () {
    if (this.value.length > 0) {
      strengthDiv.classList.add('show');
      const strength = checkPasswordStrength(this.value);
      strengthFill.style.width = strength.width;
      strengthFill.style.background = strength.color;
      strengthText.textContent = strength.text;
      strengthText.style.color = strength.color;
    } else {
      strengthDiv.classList.remove('show');
    }
  });

  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    let valid = true;

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const agreeTerms = document.getElementById('agreeTerms').checked;

    // Validate name
    if (!name) {
      showError('regName', 'regNameError', 'Nama wajib diisi');
      valid = false;
    } else {
      clearError('regName', 'regNameError');
      showSuccess('regName');
    }

    // Validate email
    if (!validateEmail(email)) {
      showError('regEmail', 'regEmailError', 'Masukkan email yang valid');
      valid = false;
    } else {
      clearError('regEmail', 'regEmailError');
      showSuccess('regEmail');
    }

    // Validate password
    if (password.length < 8) {
      showError('regPassword', 'regPasswordError', 'Password minimal 8 karakter');
      valid = false;
    } else {
      clearError('regPassword', 'regPasswordError');
      showSuccess('regPassword');
    }

    // Validate confirm password
    if (password !== confirmPassword) {
      showError('regConfirmPassword', 'regConfirmError', 'Password tidak cocok');
      valid = false;
    } else {
      clearError('regConfirmPassword', 'regConfirmError');
      if (confirmPassword) showSuccess('regConfirmPassword');
    }

    if (!agreeTerms) {
      showToast('Anda harus menyetujui Syarat & Ketentuan', 'warning');
      valid = false;
    }

    if (!valid) return;

    setButtonLoading('registerBtn', true);

    try {
      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });

      const data = await res.json();

      if (data.success) {
        showToast(data.message, 'success');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1500);
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Terjadi kesalahan. Coba lagi.', 'error');
    } finally {
      setButtonLoading('registerBtn', false);
    }
  });
}

// ===== LOGIN FORM =====
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    let valid = true;

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!validateEmail(email)) {
      showError('loginEmail', 'loginEmailError', 'Masukkan email yang valid');
      valid = false;
    } else {
      clearError('loginEmail', 'loginEmailError');
      showSuccess('loginEmail');
    }

    if (!password) {
      showError('loginPassword', 'loginPasswordError', 'Password wajib diisi');
      valid = false;
    } else {
      clearError('loginPassword', 'loginPasswordError');
      showSuccess('loginPassword');
    }

    if (!valid) return;

    setButtonLoading('loginBtn', true);

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('authUser', JSON.stringify(data.user));
        showToast(data.message, 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1000);
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server', 'error');
    } finally {
      setButtonLoading('loginBtn', false);
    }
  });
}

// ===== FORGOT PASSWORD FORM =====
const forgotForm = document.getElementById('forgotForm');
if (forgotForm) {
  forgotForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const email = document.getElementById('forgotEmail').value.trim();

    if (!validateEmail(email)) {
      showError('forgotEmail', 'forgotEmailError', 'Masukkan email yang valid');
      return;
    } else {
      clearError('forgotEmail', 'forgotEmailError');
      showSuccess('forgotEmail');
    }

    setButtonLoading('forgotBtn', true);

    try {
      const res = await fetch(`${API_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.success) {
        showToast(data.message, 'success');
        forgotForm.reset();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server', 'error');
    } finally {
      setButtonLoading('forgotBtn', false);
    }
  });
}

// ===== REAL-TIME VALIDATION =====
document.querySelectorAll('.form-input').forEach(input => {
  input.addEventListener('blur', function () {
    const errorEl = this.closest('.form-group')?.querySelector('.error-msg');
    if (errorEl && errorEl.classList.contains('show')) return;

    if (this.type === 'email' && this.value) {
      if (validateEmail(this.value)) {
        this.classList.add('success');
      } else {
        this.classList.add('error');
      }
    } else if (this.value.length > 0) {
      this.classList.add('success');
    }
  });

  input.addEventListener('focus', function () {
    this.classList.remove('error', 'success');
  });
});

// ===== CHECK AUTH ON LOAD =====
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(hideLoading, 800);

  // Redirect if already logged in
  const token = localStorage.getItem('authToken');
  const path = window.location.pathname;
  if (token && (path.includes('index.html') || path.includes('register.html') || path.includes('forgot-password.html'))) {
    // Allow logged in users to visit these pages (optional)
  }
});