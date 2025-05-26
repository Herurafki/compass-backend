const express = require("express");
const router = express.Router();
const { register, login, getAllUsers, getProfile } = require("../controllers/authController.js");
const authenticate = require('../middleware/authenticate'); // pastikan nama ini sesuai file middleware
const { resetPassword } = require('../controllers/authController');
const authController = require('../controllers/authController');

// Route untuk registrasi
router.post("/register", register);

// Route untuk login
router.post("/login", login);

// Route untuk mendapatkan semua user (memerlukan autentikasi)
router.get('/users', authenticate, getAllUsers);

// Route untuk mendapatkan profile user yang login
router.get('/me', authenticate, getProfile);

router.post('/verify-code', authController.verifyCode);

router.put('/reset-password', resetPassword);

module.exports = router;
