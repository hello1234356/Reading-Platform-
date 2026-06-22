require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('./database/init');

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/users', require('./routes/users'));
app.use('/api/books', require('./routes/books'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/clubs', require('./routes/clubs'));
app.use('/api/profile', require('./routes/profile'));

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'That record already exists.' });
  }
  if (err.code?.startsWith('SQLITE_CONSTRAINT')) {
    return res.status(400).json({ error: 'The submitted data violates a database rule.' });
  }
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

if (require.main === module) {
  app.listen(port, () => console.log(`Reading Social API running at http://localhost:${port}`));
}

module.exports = app;
