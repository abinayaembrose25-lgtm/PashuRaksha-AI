const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const config = require('../config');
const { isValidEmail } = require('../utils/validation');

const router = express.Router();
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 7 * 24 * 60 * 60 * 1000 };

router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!isValidEmail(email) || password.length < 6 || password.length > 128) return res.status(400).json({ error: 'Enter a valid email and a password of at least 6 characters.' });

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (user && !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });
    if (!user) {
      const displayName = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Farmer';
      const result = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)').run(email, await bcrypt.hash(password, 12), displayName);
      user = { id: result.lastInsertRowid, email, display_name: displayName };
    }

    const token = jwt.sign({ id: user.id, email: user.email, displayName: user.display_name }, config.jwtSecret, { expiresIn: '7d' });
    res.cookie('pashuraksha_session', token, cookieOptions).json({ user: { email: user.email, displayName: user.display_name } });
  } catch (error) { next(error); }
});

router.get('/session', (req, res) => {
  try {
    const user = jwt.verify(req.cookies.pashuraksha_session || '', config.jwtSecret);
    return res.json({ authenticated: true, user: { email: user.email, displayName: user.displayName } });
  } catch { return res.json({ authenticated: false }); }
});

router.post('/logout', (req, res) => res.clearCookie('pashuraksha_session', cookieOptions).json({ ok: true }));

module.exports = router;