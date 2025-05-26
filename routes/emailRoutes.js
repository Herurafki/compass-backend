const express = require('express');
const{ sendEmail } = require('../controllers/emailController');

const router = express.Router();

router.post('/', sendEmail);

router.post('/send-reset-code', sendEmail);


module.exports = router;


