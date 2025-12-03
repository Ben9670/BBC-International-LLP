// backend/src/scripts/createAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const { connect } = require('../db'); // re-use your db connect helper

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!email || !password) {
    console.error('Please set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running this script.');
    process.exit(1);
  }

  try {
    await connect();
    // check existing
    const existing = await User.findOne({ email: email.toLowerCase().trim() }).exec();
    if (existing) {
      if (existing.role === 'admin') {
        console.log('Admin user already exists:', existing.email);
      } else {
        existing.role = 'admin';
        await existing.save();
        console.log('Upgraded existing user to admin:', existing.email);
      }
      process.exit(0);
    }

    const u = new User({
      name,
      email: email.toLowerCase().trim(),
      password,
      role: 'admin'
    });

    await u.save();
    console.log('Admin user created:', u.email);
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err && (err.stack || err));
    process.exit(1);
  }
}

createAdmin();
