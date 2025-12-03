// backend/src/controllers/authController.js
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // short expiry for security

// POST /api/auth/login
const loginValidators = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required')
];

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array().map(e => e.msg).join(', ') });
  }

  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase().trim() }).exec();
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const match = await user.comparePassword(password);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const payload = { id: user._id.toString(), role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return res.json({
    success: true,
    token,
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  });
}

module.exports = {
  login,
  loginValidators
};
