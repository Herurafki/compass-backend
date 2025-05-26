require('dotenv').config();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');


// Setup koneksi ke PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'data_compass',
  password: '12345',
  port: 5432,
});

exports.verifyCode = async (req, res) => {
  const email = req.body.email?.toLowerCase();
  const { code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email dan kode harus diisi.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM verification_codes WHERE LOWER(email) = $1 ORDER BY created_at DESC LIMIT 1',
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Kode tidak ditemukan.' });
    }

    const { code: storedCode, expires_at } = result.rows[0];

    if (Date.now() > new Date(expires_at).getTime()) {
      return res.status(400).json({ error: 'Kode telah kedaluwarsa.' });
    }

    if (code !== storedCode) {
      return res.status(400).json({ error: 'Kode salah.' });
    }

    res.json({ message: 'Kode berhasil diverifikasi.' });
  } catch (err) {
    console.error('❌ Error saat verifikasi kode:', err);
    res.status(500).json({ error: 'Terjadi kesalahan saat verifikasi kode.' });
  }
};



function generateKode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
}

exports.sendResetCode = async (req, res) => {
  const { email } = req.body;

  // 🧪 Validasi: Email harus diisi
  if (!email) {
    return res.status(400).json({ message: 'Email wajib diisi.' });
  }

  // 🔐 Generate kode 6 digit dan waktu kadaluarsa
  const kodeVerifikasi = generateKode(); // contoh: '123456'
  const now = moment().tz('Asia/Jakarta'); // waktu sekarang di zona Asia/Jakarta
  const expiresAt = now.clone().add(1, 'minute').toDate(); // Kode aktif selama 1 menit
  const lastSent = now.toDate(); // Waktu pengiriman saat ini

  try {
    // 🔍 Cek apakah sudah ada entri untuk email ini di database
    const existing = await pool.query('SELECT * FROM verification_codes WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      const data = existing.rows[0];

      // ⌛ Cek apakah kode sebelumnya sudah kadaluarsa
      const kodeKadaluarsa = new Date(data.expires_at) < new Date();

      if (kodeKadaluarsa) {
        // 🧹 Hapus data lama yang sudah kadaluarsa
        await pool.query('DELETE FROM verification_codes WHERE email = $1', [email]);
      } else {
        // 🕐 Hitung selisih waktu dari pengiriman terakhir
        const lastSentTime = new Date(data.last_sent);
        const selisihDetik = (now.toDate() - lastSentTime) / 1000;

        // ⛔ Jika belum lewat 60 detik, tolak permintaan
        if (selisihDetik < 60) {
          return res.status(429).json({ message: 'Kode sudah dikirim, silakan tunggu 1 menit.' });
        }

        // 🔄 Update kode dan waktu pengiriman
        await pool.query(`
          UPDATE verification_codes
          SET code = $1, expires_at = $2, resend_count = resend_count + 1, last_sent = $3
          WHERE email = $4
        `, [kodeVerifikasi, expiresAt, lastSent, email]);

        // 📧 Kirim ulang kode ke email
        await kirimEmail(email, kodeVerifikasi);
        return res.status(200).json({ message: 'Kode verifikasi baru dikirim.' });
      }
    }

    // 🆕 Jika belum ada, masukkan data baru ke database
    await pool.query(`
      INSERT INTO verification_codes (email, code, expires_at, resend_count, last_sent)
      VALUES ($1, $2, $3, 1, $4)
    `, [email, kodeVerifikasi, expiresAt, lastSent]);

    // 📤 Kirim kode baru via email
    await kirimEmail(email, kodeVerifikasi);
    res.status(200).json({ message: 'Kode verifikasi dikirim ke email Anda.' });

  } catch (error) {
    // ❌ Tangani error dari proses database atau pengiriman email
    console.error('❌ Gagal mengirim kode verifikasi:', error);
    res.status(500).json({ message: 'Terjadi kesalahan saat mengirim kode verifikasi.' });
  }
};






// Fungsi untuk registrasi
exports.register = async (req, res) => {
  const { email, password, firstname, lastname } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (email, password, firstname, lastname) VALUES ($1, $2, $3, $4)',
      [email, hashedPassword, firstname, lastname]
    );

    res.status(201).json({ message: 'User berhasil didaftarkan' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
};

// Fungsi untuk login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Incorrect username or password.' });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({ message: 'Login berhasil', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
};

// Fungsi untuk mendapatkan daftar semua user
exports.getAllUsers = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, firstname, lastname FROM users');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
};

// Fungsi untuk mendapatkan profil user yang login
exports.getProfile = (req, res) => {
  res.json({
    id: req.user.id,
    firstname: req.user.firstname,
    lastname: req.user.lastname,
    email: req.user.email,
  });
};

// Fungsi reset password
const resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'Email dan password baru wajib diisi.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE email = $2 RETURNING email',
      [hashedPassword, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Email tidak ditemukan.' });
    }

    res.status(200).json({ message: 'Password berhasil diperbarui.' });
  } catch (error) {
    console.error('❌ Gagal reset password:', error);
    res.status(500).json({ message: 'Terjadi kesalahan saat memperbarui password.' });
  }
};

exports.resetPassword = resetPassword;
