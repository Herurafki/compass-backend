const nodemailer = require('nodemailer');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'data_compass',
  password: '12345',
  port: 5432,
});

// ⏱️ Fungsi bantu: cek apakah sudah lewat 1 menit
const canResend = (lastSent) => {
  const now = new Date();
  const diff = now - new Date(lastSent); // selisih dalam ms
  return diff > 60 * 1000; // 1 menit
};

const sendEmail = async (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res.status(400).json({ message: 'Email penerima wajib diisi.' });
  }

  try {
    // 🔍 Cek apakah email ada di tabel users
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [to]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Akun dengan email ini tidak ditemukan.' });
    }

    // 🔐 Buat kode verifikasi
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit
    const now = new Date();

    // 🔍 Cek apakah sudah ada di verification_codes
    const result = await pool.query('SELECT * FROM verification_codes WHERE email = $1', [to]);

    if (result.rows.length > 0) {
      const existing = result.rows[0];

      if (!canResend(existing.last_sent)) {
        return res.status(429).json({
          message: 'Kode sudah dikirim. Silakan tunggu 1 menit sebelum mencoba lagi.',
        });
      }

      // Update kode & metadata
      await pool.query(
        `UPDATE verification_codes
         SET code = $1,
             expires_at = $2,
             resend_count = resend_count + 1,
             last_sent = $3
         WHERE email = $4`,
        [verificationCode, expiresAt, now, to]
      );
    } else {
      //  Insert baru
      await pool.query(
        `INSERT INTO verification_codes (email, code, expires_at, resend_count, last_sent)
         VALUES ($1, $2, $3, 1, $4)`,
        [to, verificationCode, expiresAt, now]
      );
    }

    // 📧 Kirim email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Compas App" <${process.env.EMAIL_USER}>`,
      to,
      subject: 'Kode Verifikasi Reset Password',
      html: `
        <p>Halo,</p>
        <p>Berikut adalah kode verifikasi untuk mengatur ulang password kamu:</p>
        <h2 style="color: #333;">${verificationCode}</h2>
        <p>Kode ini berlaku selama 1 menit.</p>
        <p>Jika kamu tidak meminta reset password, abaikan email ini.</p>
        <p>Terima kasih!</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);

    res.status(200).json({
      message: 'Kode verifikasi telah dikirim ke email.',
      // code: verificationCode // 👉 optional, hanya aktifkan untuk testing
    });
  } catch (error) {
    console.error('❌ Gagal kirim email:', error);
    res.status(500).json({ message: 'Gagal mengirim email. Coba lagi nanti.' });
  }
};

module.exports = { sendEmail };
