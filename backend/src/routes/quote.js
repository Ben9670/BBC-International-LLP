// backend/src/routes/quote.js

console.log("📨 quote.js loaded");
// console.log("📩 /api/quote HIT");


const express = require('express');
const { body, validationResult } = require('express-validator');
const sanitizer = require('sanitizer'); // simple sanitizer helper
const sendEmail = require('../services/email');

const router = express.Router();

const validators = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 100 }).withMessage('Name must be under 100 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email address')
    .normalizeEmail(),
  body('company')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Company must be under 100 characters'),
  body('message')
    .trim()
    .notEmpty().withMessage('Message is required')
    .isLength({ min: 10, max: 2000 }).withMessage('Message must be between 10 and 2000 characters')
];

router.post('/', validators, async (req, res) => {
  // Validation
  console.log("📩 /api/quote HIT");

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  // Guard: ensure destination email is configured
  if (!process.env.BUSINESS_EMAIL) {
    console.error('BUSINESS_EMAIL is not configured in env');
    return res.status(500).json({ error: 'Server not configured to receive emails' });
  }

  // Basic sanitization (defense-in-depth)
  const raw = {
    name: req.body.name || '',
    email: req.body.email || '',
    company: req.body.company || '',
    message: req.body.message || ''
  };

  const payload = {
    name: sanitizer.escape(raw.name),
    // use normalized email from validator; keep it lowercased and trimmed
    email: (raw.email || '').toString().trim().toLowerCase(),
    company: sanitizer.escape(raw.company || ''),
    message: sanitizer.escape(raw.message)
  };

  // Optional: request info for logs / audit
  const requestMeta = {
    ip: req.ip || req.connection?.remoteAddress,
    time: new Date().toISOString()
  };

  try {
    const subject = `New Quote Request from ${payload.name}`;
    const textBody = `New quote request\n-----------------\nName: ${payload.name}\nEmail: ${payload.email}\nCompany: ${payload.company}\nMessage:\n${payload.message}\n`;
    const htmlBody = `
      <h2>New Quote Request</h2>
      <p><strong>Name:</strong> ${payload.name}</p>
      <p><strong>Email:</strong> ${payload.email}</p>
      <p><strong>Company:</strong> ${payload.company}</p>
      <p><strong>Message:</strong><br/>${payload.message.replace(/\n/g, '<br/>')}</p>
      <hr/>
      <small>IP: ${requestMeta.ip} • Time: ${requestMeta.time}</small>
    `;

    const info = await sendEmail({
      to: process.env.BUSINESS_EMAIL,
      from: process.env.FROM_EMAIL,
      subject,
      text: textBody,
      html: htmlBody,
      replyTo: payload.email
    });

    // Log success (info contains accepted/envelope details from nodemailer)
    console.log(`Quote email sent: ${info && info.messageId ? info.messageId : JSON.stringify(info)}`);

    return res.status(200).json({ message: 'Quote request submitted successfully' });
  } catch (err) {
    console.error('Error sending quote email:', err && (err.stack || err.message || err));
    return res.status(500).json({ error: 'Failed to send quote. Please try later.' });
  }
});

module.exports = router;
