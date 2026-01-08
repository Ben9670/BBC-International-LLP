// backend/src/scripts/createUser.js
require('dotenv').config();
const path = require('path');

const { connect, disconnect } = require('../db'); // re-use your db connect helper

// Try to require User model whether it's named User.js or user.js
let User;
try {
  User = require('../models/user');
} catch (e1) {
  try {
    User = require('../models/user');
  } catch (e2) {
    console.error('Could not load User model. Expected ../models/User or ../models/user');
    console.error('error1:', e1 && (e1.stack || e1.message));
    console.error('error2:', e2 && (e2.stack || e2.message));
    process.exit(1);
  }
}

async function createUser() {
  // prefer explicit USER_* env, but fall back to ADMIN_* for convenience
  const email = (process.env.USER_EMAIL || process.env.ADMIN_EMAIL || '').trim();
  const password = (process.env.USER_PASSWORD || process.env.ADMIN_PASSWORD || '').trim();
  const name = process.env.USER_NAME || process.env.ADMIN_NAME || 'Normal User';

  if (!email || !password) {
    console.error('Please set USER_EMAIL and USER_PASSWORD (or ADMIN_EMAIL / ADMIN_PASSWORD) in environment before running this script.');
    process.exit(1);
  }

  try {
    await connect();

    const normalizedEmail = email.toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail }).exec();
    if (existing) {
      if (existing.role === 'user') {
        console.log('User already exists:', existing.email, 'role:', existing.role);
        return;
      } else {
        // update role to 'user' if needed (safe operation)
        existing.role = 'user';
        await existing.save();
        console.log('Updated existing account to role "user":', existing.email);
        return;
      }
    }

    const u = new User({
      name,
      email: normalizedEmail,
      password, // hashed in model pre-save hook
      role: 'user'
    });

    await u.save();
    console.log('User created:', u.email, 'role:', u.role);

  } catch (err) {
    console.error('Error creating user:', err && (err.stack || err.message || err));
    process.exitCode = 1;
  } finally {
    try {
      await disconnect();
    } catch (dErr) {
      // ignore disconnect errors but log them
      console.warn('Warning: error during disconnect', dErr && (dErr.stack || dErr.message || dErr));
    }
  }
}

createUser();
