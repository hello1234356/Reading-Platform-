const db = require('../database/init');

function requireUser(req, res, next) {
  const id = Number(req.header('x-user-id'));
  if (!Number.isInteger(id) || id < 1) {
    return res.status(401).json({ error: 'Send a valid student id in the x-user-id header.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(401).json({ error: 'Student account not found.' });
  req.user = user;
  next();
}

module.exports = { requireUser };
