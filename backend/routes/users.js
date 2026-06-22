const express = require('express');
const User = require('../models/User');
const db = require('../database/init');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json(User.all('name ASC'));
  const pattern = `%${q}%`;
  res.json(db.prepare(`
    SELECT * FROM users
    WHERE name LIKE ? OR email LIKE ?
    ORDER BY name ASC LIMIT 30
  `).all(pattern, pattern));
});

router.get('/:id', (req, res) => {
  const user = User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Student not found.' });
  user.favorite_genres = JSON.parse(user.favorite_genres || '[]');
  res.json(user);
});

router.post('/', (req, res) => {
  const { name, email } = req.body;
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  const user = User.create({
    ...req.body,
    name: name.trim(),
    email: email.trim(),
    favorite_genres: JSON.stringify(req.body.favorite_genres || [])
  });
  res.status(201).json(user);
});

router.patch('/:id', requireUser, (req, res) => {
  if (req.user.id !== Number(req.params.id)) {
    return res.status(403).json({ error: 'You can only edit your own profile.' });
  }
  const data = { ...req.body };
  if (Array.isArray(data.favorite_genres)) data.favorite_genres = JSON.stringify(data.favorite_genres);
  delete data.email;
  res.json(User.update(req.params.id, data));
});

module.exports = router;
