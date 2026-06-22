const express = require('express');
const Book = require('../models/Book');
const UserBook = require('../models/UserBook');
const db = require('../database/init');
const { requireUser } = require('../middleware/auth');

const router = express.Router();
const VALID_STATUSES = new Set(['TBR', 'Reading', 'Finished']);

function syncChallenges(userId) {
  db.prepare(`
    UPDATE reading_challenges
    SET books_completed = (
      SELECT COUNT(*) FROM user_books
      WHERE user_id = ? AND status = 'Finished'
        AND finish_date IS NOT NULL
        AND CAST(strftime('%Y', finish_date) AS INTEGER) = reading_challenges.year
    )
    WHERE user_id = ?
  `).run(userId, userId);
}

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const genre = String(req.query.genre || '').trim();
  const clauses = [];
  const params = [];
  if (q) {
    clauses.push('(title LIKE ? OR author LIKE ? OR isbn LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (genre) {
    clauses.push('genre LIKE ?');
    params.push(`%${genre}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  res.json(db.prepare(`SELECT * FROM books ${where} ORDER BY title ASC LIMIT 50`).all(...params));
});

router.get('/featured', (req, res) => {
  const now = new Date();
  const month = Number(req.query.month || now.getMonth() + 1);
  const year = Number(req.query.year || now.getFullYear());
  const rows = db.prepare(`
    SELECT * FROM featured_content
    WHERE month = ? AND year = ? ORDER BY type, id DESC
  `).all(month, year).map(item => ({ ...item, content: JSON.parse(item.content) }));
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const book = Book.findById(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  res.json(book);
});

router.post('/', requireUser, (req, res) => {
  const { title, author } = req.body;
  if (!title?.trim() || !author?.trim()) {
    return res.status(400).json({ error: 'Title and author are required.' });
  }
  res.status(201).json(Book.create({ ...req.body, title: title.trim(), author: author.trim() }));
});

router.put('/:id/log', requireUser, (req, res) => {
  const { status, rating, review, start_date, finish_date } = req.body;
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Status must be TBR, Reading, or Finished.' });
  }
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5.' });
  }
  if (!Book.findById(req.params.id)) return res.status(404).json({ error: 'Book not found.' });

  const existing = db.prepare('SELECT * FROM user_books WHERE user_id = ? AND book_id = ?')
    .get(req.user.id, req.params.id);
  const data = {
    user_id: req.user.id,
    book_id: Number(req.params.id),
    status,
    rating: rating ?? null,
    review: review ?? null,
    start_date: start_date ?? null,
    finish_date: finish_date ?? null,
    updated_at: new Date().toISOString()
  };
  const record = existing ? UserBook.update(existing.id, data) : UserBook.create(data);
  syncChallenges(req.user.id);
  res.status(existing ? 200 : 201).json(record);
});

router.delete('/:id/log', requireUser, (req, res) => {
  const result = db.prepare('DELETE FROM user_books WHERE user_id = ? AND book_id = ?')
    .run(req.user.id, req.params.id);
  syncChallenges(req.user.id);
  res.status(result.changes ? 204 : 404).end();
});

module.exports = router;
