require('dotenv').config();
const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ message: 'Header Authorization tidak ditemukan atau format salah (harus Bearer <token>)' });
  }

  const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;

  console.log('JWT_SECRET saat verify:', process.env.JWT_SECRET);
  console.log("JWT_SECRET saat SIGN:", process.env.JWT_SECRET);
  console.log("JWT_SECRET VERIFY:", JSON.stringify(process.env.JWT_SECRET));
  console.log('Token yang akan diverifikasi:', token);
  console.log('Secret:', secret);



  console.log('Token yang diterima:', token);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded; //  simpan semua info dari token

    next();
  } catch (err) {
    console.error('JWT Error:', err.name, '-', err.message);

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token sudah kedaluwarsa' });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Token tidak valid' });
    } else {
      return res.status(401).json({ message: 'Token tidak valid atau sudah kedaluwarsa' });
    }
  }
};

module.exports = authenticate;
