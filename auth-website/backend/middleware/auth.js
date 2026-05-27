const jwt = require('jsonwebtoken');

// ===== VERIFY TOKEN =====
exports.verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token tidak ditemukan. Silakan login ulang.' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.warn('⚠️ Token verify error:', err.message);
    res.status(403).json({ 
      success: false, 
      message: 'Token tidak valid atau sudah kedaluwarsa' 
    });
  }
};

// ===== RATE LIMIT: DI-NONAKTIFKAN =====
// ✅ Selalu lanjutkan request tanpa batas
exports.rateLimit = (req, res, next) => {
  // No rate limiting - unlimited requests for development
  next();
};