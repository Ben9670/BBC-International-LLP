// backend/src/routes/authRoutes.js
const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');

const router = express.Router();

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail({ gmail_remove_dots: false }).trim(),
    body('password').isString().withMessage('Password required').trim().notEmpty(),
  ],
  authController.login
);

// Refresh access token using refresh cookie
router.post('/refresh', authController.refresh);

// Logout - clears cookies
router.post('/logout', authController.logout);

module.exports = router;
