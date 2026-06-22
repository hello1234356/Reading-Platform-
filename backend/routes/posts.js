const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const db = require('../database/init');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const before = req.query.before || '9999-12-31T23:59:59Z';
  const posts = db.prepare(`
    SELECT p.*, u.name AS user_name, u.profile_picture,
           b.title AS book_title, b.author AS book_author, b.cover_image
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN books b ON b.id = p.book_id
    WHERE p.created_at < ?
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?
  `).all(before, limit);
  res.json(posts);
});

router.post('/', requireUser, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Post content is required.' });
  res.status(201).json(Post.create({ user_id: req.user.id, content, book_id: req.body.book_id || null }));
});

router.delete('/:id', requireUser, (req, res) => {
  const post = Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own post.' });
  Post.delete(req.params.id);
  res.status(204).end();
});

router.get('/:id/comments', (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.name AS user_name, u.profile_picture
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC
  `).all(req.params.id);
  res.json(comments);
});

router.post('/:id/comments', requireUser, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Comment content is required.' });
  if (!Post.findById(req.params.id)) return res.status(404).json({ error: 'Post not found.' });
  res.status(201).json(Comment.create({ post_id: Number(req.params.id), user_id: req.user.id, content }));
});

router.put('/:id/like', requireUser, (req, res) => {
  if (!Post.findById(req.params.id)) return res.status(404).json({ error: 'Post not found.' });
  db.prepare('INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)')
    .run(req.user.id, req.params.id);
  res.json(Post.findById(req.params.id));
});

router.delete('/:id/like', requireUser, (req, res) => {
  db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?')
    .run(req.user.id, req.params.id);
  res.json(Post.findById(req.params.id));
});

module.exports = router;
