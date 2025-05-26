const jwt = require('jsonwebtoken');

const token = jwt.sign(
  {
    email: 'tes@example.com',
    firstname: 'Tes',
    lastname: 'Example'
  },
  'compas@secret123', // langsung, biar pasti
  { expiresIn: '1h' }
);

console.log("Generated Token:\n", token);
