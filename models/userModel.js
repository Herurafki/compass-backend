const pool = require("../db");

exports.createUser = async (firstName, lastName, email, hashedPassword) => {
  const result = await pool.query(
    `INSERT INTO users (firstname, lastname, email, password) 
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [firstName, lastName, email, hashedPassword]
  );
  return result.rows[0];
};

/**
 * Cari user berdasarkan email
 * @param {string} email
 * @returns {object|null} user jika ditemukan, null jika tidak
 */
exports.findUserByEmail = async (email) => {
  const result = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
};

/**
 * Ambil semua user tanpa password
 * @returns {Array} list user
 */
exports.getAllUsersFromDB = async () => {
  const query = `SELECT id, firstname, lastname, email FROM users`;
  const { rows } = await pool.query(query);
  return rows;
};
