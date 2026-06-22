PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  profile_picture TEXT,
  bio TEXT DEFAULT '',
  favorite_book_1 INTEGER REFERENCES books(id) ON DELETE SET NULL,
  favorite_book_2 INTEGER REFERENCES books(id) ON DELETE SET NULL,
  favorite_book_3 INTEGER REFERENCES books(id) ON DELETE SET NULL,
  favorite_book_4 INTEGER REFERENCES books(id) ON DELETE SET NULL,
  favorite_genres TEXT DEFAULT '[]',
  reading_goal INTEGER NOT NULL DEFAULT 0 CHECK (reading_goal >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  cover_image TEXT,
  description TEXT DEFAULT '',
  genre TEXT,
  publication_year INTEGER,
  isbn TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SQLite permits the users table to reference books before books is created.
CREATE TABLE IF NOT EXISTS user_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('TBR', 'Reading', 'Finished')),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review TEXT,
  start_date TEXT,
  finish_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS book_clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL DEFAULT 1 CHECK (member_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS club_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS club_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reading_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_books INTEGER NOT NULL CHECK (target_books > 0),
  books_completed INTEGER NOT NULL DEFAULT 0 CHECK (books_completed >= 0),
  year INTEGER NOT NULL,
  UNIQUE (user_id, year)
);

CREATE TABLE IF NOT EXISTS badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS featured_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('quiz', 'book_list', 'article', 'recommendation')),
  content TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_user_books_user_status ON user_books(user_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_club_messages_club ON club_messages(club_id, created_at);
CREATE INDEX IF NOT EXISTS idx_featured_period ON featured_content(year, month);

CREATE TRIGGER IF NOT EXISTS comments_after_insert
AFTER INSERT ON comments BEGIN
  UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
END;

CREATE TRIGGER IF NOT EXISTS comments_after_delete
AFTER DELETE ON comments BEGIN
  UPDATE posts SET comments_count = MAX(0, comments_count - 1) WHERE id = OLD.post_id;
END;

CREATE TRIGGER IF NOT EXISTS likes_after_insert
AFTER INSERT ON likes BEGIN
  UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
END;

CREATE TRIGGER IF NOT EXISTS likes_after_delete
AFTER DELETE ON likes BEGIN
  UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = OLD.post_id;
END;

CREATE TRIGGER IF NOT EXISTS club_members_after_insert
AFTER INSERT ON club_members BEGIN
  UPDATE book_clubs
  SET member_count = (SELECT COUNT(*) FROM club_members WHERE club_id = NEW.club_id)
  WHERE id = NEW.club_id;
END;

CREATE TRIGGER IF NOT EXISTS club_members_after_delete
AFTER DELETE ON club_members BEGIN
  UPDATE book_clubs
  SET member_count = (SELECT COUNT(*) FROM club_members WHERE club_id = OLD.club_id)
  WHERE id = OLD.club_id;
END;
