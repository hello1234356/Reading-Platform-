const express = require('express');
const db = require('../database/init');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

router.get('/:userId', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Student not found.' });

  user.favorite_genres = JSON.parse(user.favorite_genres || '[]');
  const favoriteIds = [user.favorite_book_1, user.favorite_book_2, user.favorite_book_3, user.favorite_book_4]
    .filter(Boolean);
  const favoriteBooks = favoriteIds.length
    ? db.prepare(`SELECT * FROM books WHERE id IN (${favoriteIds.map(() => '?').join(',')})`).all(...favoriteIds)
    : [];
  favoriteBooks.sort((a, b) => favoriteIds.indexOf(a.id) - favoriteIds.indexOf(b.id));

  const shelves = { TBR: [], Reading: [], Finished: [] };
  db.prepare(`
    SELECT ub.*, b.title, b.author, b.cover_image, b.genre
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ? ORDER BY COALESCE(ub.finish_date, ub.start_date, ub.created_at) DESC
  `).all(user.id).forEach(item => shelves[item.status].push(item));

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_logged,
      SUM(status = 'Finished') AS books_finished,
      SUM(status = 'Reading') AS currently_reading,
      ROUND(AVG(CASE WHEN status = 'Finished' THEN rating END), 1) AS average_rating,
      COUNT(DISTINCT CASE WHEN status = 'Finished' THEN genre END) AS genres_read
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ?
  `).get(user.id);

  const finishCalendar = db.prepare(`
    SELECT finish_date AS date, COUNT(*) AS books_finished
    FROM user_books
    WHERE user_id = ? AND status = 'Finished' AND finish_date IS NOT NULL
    GROUP BY finish_date ORDER BY finish_date
  `).all(user.id);

  const challenges = db.prepare(`
    SELECT *, CASE WHEN target_books = 0 THEN 0
      ELSE MIN(100, ROUND(books_completed * 100.0 / target_books)) END AS percent_complete
    FROM reading_challenges WHERE user_id = ? ORDER BY year DESC
  `).all(user.id);

  const badges = db.prepare(`
    SELECT b.*, ub.earned_at FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = ? ORDER BY ub.earned_at DESC
  `).all(user.id);

  const reviews = db.prepare(`
    SELECT ub.rating, ub.review, ub.finish_date, b.id AS book_id,
           b.title, b.author, b.cover_image
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ? AND ub.review IS NOT NULL AND TRIM(ub.review) != ''
    ORDER BY COALESCE(ub.finish_date, ub.created_at) DESC
  `).all(user.id);

  res.json({ user, favorite_books: favoriteBooks, shelves, stats, finish_calendar: finishCalendar, challenges, badges, reviews });
});

router.put('/:userId/challenge', requireUser, (req, res) => {
  if (req.user.id !== Number(req.params.userId)) {
    return res.status(403).json({ error: 'You can only change your own reading goal.' });
  }
  const year = Number(req.body.year || new Date().getFullYear());
  const target = Number(req.body.target_books);
  if (!Number.isInteger(year) || !Number.isInteger(target) || target < 1) {
    return res.status(400).json({ error: 'A valid year and positive target_books are required.' });
  }
  db.prepare(`
    INSERT INTO reading_challenges (user_id, target_books, books_completed, year)
    VALUES (?, ?, (
      SELECT COUNT(*) FROM user_books
      WHERE user_id = ? AND status = 'Finished' AND finish_date IS NOT NULL
        AND CAST(strftime('%Y', finish_date) AS INTEGER) = ?
    ), ?)
    ON CONFLICT(user_id, year) DO UPDATE SET target_books = excluded.target_books
  `).run(req.user.id, target, req.user.id, year, year);
  const challenge = db.prepare('SELECT * FROM reading_challenges WHERE user_id = ? AND year = ?')
    .get(req.user.id, year);
  res.json(challenge);
});

module.exports = router;
