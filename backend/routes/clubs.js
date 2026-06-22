const express = require('express');
const BookClub = require('../models/BookClub');
const ClubMessage = require('../models/ClubMessage');
const db = require('../database/init');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

function membership(clubId, userId) {
  return db.prepare('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?')
    .get(clubId, userId);
}

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const pattern = `%${q}%`;
  const clubs = db.prepare(`
    SELECT c.*, b.title AS book_title, b.author AS book_author, b.cover_image,
           u.name AS creator_name
    FROM book_clubs c
    JOIN books b ON b.id = c.book_id
    JOIN users u ON u.id = c.creator_id
    WHERE (? = '' OR c.name LIKE ? OR b.title LIKE ?)
    ORDER BY c.created_at DESC
  `).all(q, pattern, pattern);
  res.json(clubs);
});

router.get('/:id', (req, res) => {
  const club = db.prepare(`
    SELECT c.*, b.title AS book_title, b.author AS book_author, b.cover_image,
           b.description AS book_description, u.name AS creator_name
    FROM book_clubs c
    JOIN books b ON b.id = c.book_id
    JOIN users u ON u.id = c.creator_id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!club) return res.status(404).json({ error: 'Book club not found.' });
  club.members = db.prepare(`
    SELECT u.id, u.name, u.profile_picture, cm.joined_at
    FROM club_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.club_id = ? ORDER BY cm.joined_at
  `).all(req.params.id);
  res.json(club);
});

router.post('/', requireUser, (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const bookId = Number(req.body.book_id);
  if (!name || !Number.isInteger(bookId)) {
    return res.status(400).json({ error: 'Club name and book_id are required.' });
  }
  if (!db.prepare('SELECT id FROM books WHERE id = ?').get(bookId)) {
    return res.status(404).json({ error: 'Book not found.' });
  }
  const create = db.transaction(() => {
    const club = BookClub.create({ name, description, book_id: bookId, creator_id: req.user.id });
    db.prepare('INSERT INTO club_members (club_id, user_id) VALUES (?, ?)').run(club.id, req.user.id);
    return BookClub.findById(club.id);
  });
  res.status(201).json(create());
});

router.post('/:id/join', requireUser, (req, res) => {
  if (!BookClub.findById(req.params.id)) return res.status(404).json({ error: 'Book club not found.' });
  const result = db.prepare('INSERT OR IGNORE INTO club_members (club_id, user_id) VALUES (?, ?)')
    .run(req.params.id, req.user.id);
  res.status(result.changes ? 201 : 200).json(BookClub.findById(req.params.id));
});

router.delete('/:id/join', requireUser, (req, res) => {
  const club = BookClub.findById(req.params.id);
  if (!club) return res.status(404).json({ error: 'Book club not found.' });
  if (club.creator_id === req.user.id) {
    return res.status(400).json({ error: 'The creator cannot leave their own club.' });
  }
  db.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.status(204).end();
});

router.get('/:id/messages', requireUser, (req, res) => {
  if (!membership(req.params.id, req.user.id)) {
    return res.status(403).json({ error: 'Join this club to read its chat.' });
  }
  const beforeId = Number(req.query.before_id) || Number.MAX_SAFE_INTEGER;
  const messages = db.prepare(`
    SELECT m.*, u.name AS user_name, u.profile_picture
    FROM club_messages m JOIN users u ON u.id = m.user_id
    WHERE m.club_id = ? AND m.id < ?
    ORDER BY m.id DESC LIMIT 50
  `).all(req.params.id, beforeId).reverse();
  res.json(messages);
});

router.post('/:id/messages', requireUser, (req, res) => {
  if (!membership(req.params.id, req.user.id)) {
    return res.status(403).json({ error: 'Join this club before sending messages.' });
  }
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message cannot be empty.' });
  res.status(201).json(ClubMessage.create({
    club_id: Number(req.params.id), user_id: req.user.id, message
  }));
});

module.exports = router;
