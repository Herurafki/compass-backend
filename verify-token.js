const jwt = require('jsonwebtoken');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc0BleGFtcGxlLmNvbSIsImZpcnN0bmFtZSI6IlRlcyIsImxhc3RuYW1lIjoiRXhhbXBsZSIsImlhdCI6MTc0NzMwMjczMywiZXhwIjoxNzQ3MzA2MzMzfQ.ph2Xes-dnFNjnYX2_VmXVDm-Me7O0JNco6EDX1j5Gws';
const secret = 'compas@secret123';

try {
  const decoded = jwt.verify(token, secret);
  console.log("✅ Token valid! Isinya:");
  console.log(decoded);
} catch (err) {
  console.error("❌ Verifikasi gagal:", err.name, '-', err.message);
}
