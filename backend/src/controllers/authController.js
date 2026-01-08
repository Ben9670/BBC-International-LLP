// backend/src/controllers/authController.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/user'); // lowercase, matches your file

// Secrets & expirations
const ACCESS_JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'dev_secret';
const REFRESH_JWT_SECRET = process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET || 'dev_secret');

const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';   // short-lived access token
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'; // long-lived refresh token

// Cookie names & options
const ACCESS_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'token'; // legacy cookie name (access token)
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'refreshToken';

const ACCESS_COOKIE_MAX_AGE = Number(process.env.AUTH_COOKIE_MAX_AGE) || 15 * 60 * 1000; // ms (default 15m)
const REFRESH_COOKIE_MAX_AGE = Number(process.env.REFRESH_COOKIE_MAX_AGE) || 7 * 24 * 60 * 60 * 1000; // ms (7d)

const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || 'Lax'; // 'Strict' | 'Lax' | 'None'
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined; // optional

function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_JWT_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

/**
 * Login - issues access token and refresh token (returns them in JSON for API clients)
 * NOTE: HttpOnly cookie code is provided but commented out for production usage.
 */
exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { email, password } = req.body;
  try {
    if (!email || !password) return res.status(422).json({ message: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const payload = { id: user._id.toString(), role: user.role, email: user.email };

    // generate tokens
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // -------------------------------------------------------------------------
    // Production: if you want cookie-based auth for browsers, uncomment these.
    // Keep them commented during API testing with Postman (so tokens can be read).
    // -------------------------------------------------------------------------
    /*
    // set access token cookie (HttpOnly)
    res.cookie(ACCESS_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      domain: COOKIE_DOMAIN,
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });

    // set refresh token cookie (HttpOnly, long-lived)
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      domain: COOKIE_DOMAIN,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
    */
    // -------------------------------------------------------------------------

    // Return tokens in JSON for Postman / API clients
    return res.json({
      ok: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Auth login error:', err && (err.stack || err.message));
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Refresh - rotate refresh token and issue new access token
 * Accepts refresh token from cookie, Authorization header (Bearer), or request body.
 */
exports.refresh = async (req, res) => {
  try {
    // Try cookie first, then body, then Authorization header
    let refreshToken =
      (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) ||
      (req.body && req.body.refreshToken) ||
      null;

    if (!refreshToken) {
      const authHeader = req.headers.authorization || req.headers.Authorization || '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        refreshToken = authHeader.split(' ')[1];
      }
    }

    if (!refreshToken) return res.status(401).json({ message: 'Refresh token missing' });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_JWT_SECRET);
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Refresh token expired' });
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const user = await User.findById(decoded.id).exec();
    if (!user) return res.status(401).json({ message: 'User not found for refresh token' });

    // prepare new tokens (rotation)
    const payload = { id: user._id.toString(), role: user.role, email: user.email };
    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload);

    // -------------------------------------------------------------------------
    // Production: uncomment to set cookies instead of relying on JSON response.
    // -------------------------------------------------------------------------
    /*
    res.cookie(ACCESS_COOKIE_NAME, newAccessToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      domain: COOKIE_DOMAIN,
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });

    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      domain: COOKIE_DOMAIN,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
    */
    // -------------------------------------------------------------------------

    return res.json({
      ok: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Auth refresh error:', err && (err.stack || err.message));
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Logout - clear cookies (if you use cookie-based sessions)
 * Also returns OK for API clients.
 */
exports.logout = (req, res) => {
  try {
    // If you used cookies in production, clear them here (uncomment).
    /*
    res.clearCookie(ACCESS_COOKIE_NAME, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      domain: COOKIE_DOMAIN,
    });
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      domain: COOKIE_DOMAIN,
    });
    */

    return res.json({ ok: true, message: 'Logged out' });
  } catch (err) {
    console.error('Auth logout error:', err && (err.stack || err.message));
    return res.status(500).json({ message: 'Server error' });
  }
};
