require('dotenv').config();
const db = require('./init');

const seed = db.transaction(() => {
  const books = [
    ['Pachinko', 'Min Jin Lee', 'A sweeping family saga across Korea and Japan.', 'Historical Fiction', 2017, '9781455563937'],
    ['The Great Gatsby', 'F. Scott Fitzgerald', 'A portrait of ambition, longing, and the American Dream.', 'Classic', 1925, '9780743273565'],
    ['The Secret History', 'Donna Tartt', 'A dark campus novel about beauty, obsession, and consequence.', 'Literary Fiction', 1992, '9781400031702'],
    ['The Book Thief', 'Markus Zusak', 'A young reader finds courage and language in wartime Germany.', 'Historical Fiction', 2005, '9780375842207'],
    ['Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 'Two friends build games and a complicated creative life together.', 'Contemporary Fiction', 2022, '9780593321201'],
    ['The Song of Achilles', 'Madeline Miller', 'A tender retelling of Achilles and Patroclus.', 'Mythology', 2011, '9780062060624']
  ];
  const insertBook = db.prepare(`
    INSERT OR IGNORE INTO books (title, author, description, genre, publication_year, isbn)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  books.forEach(book => insertBook.run(...book));

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users
      (name, email, bio, favorite_genres, reading_goal, current_streak)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('Yiru', 'yiru@school.edu', 'Always looking for my next five-star read.', JSON.stringify(['Literary Fiction', 'Historical Fiction']), 24, 7);
  insertUser.run('Maya', 'maya@school.edu', 'Fantasy, classics, and overly detailed reviews.', JSON.stringify(['Fantasy', 'Classic']), 18, 3);

  const yiru = db.prepare('SELECT id FROM users WHERE email = ?').get('yiru@school.edu');
  const maya = db.prepare('SELECT id FROM users WHERE email = ?').get('maya@school.edu');
  const pachinko = db.prepare('SELECT id FROM books WHERE title = ?').get('Pachinko');
  const gatsby = db.prepare('SELECT id FROM books WHERE title = ?').get('The Great Gatsby');
  const secretHistory = db.prepare('SELECT id FROM books WHERE title = ?').get('The Secret History');
  const bookThief = db.prepare('SELECT id FROM books WHERE title = ?').get('The Book Thief');

  db.prepare(`
    UPDATE users SET favorite_book_1 = ?, favorite_book_2 = ?, favorite_book_3 = ? WHERE id = ?
  `).run(pachinko.id, gatsby.id, secretHistory.id, yiru.id);

  db.prepare(`
    INSERT OR IGNORE INTO user_books
      (user_id, book_id, status, rating, review, start_date, finish_date)
    VALUES (?, ?, 'Finished', 5, ?, '2026-05-01', '2026-05-12')
  `).run(yiru.id, gatsby.id, 'Beautiful, sharp, and much sadder than I expected.');
  db.prepare(`
    INSERT OR IGNORE INTO user_books (user_id, book_id, status, start_date)
    VALUES (?, ?, 'Reading', '2026-06-15')
  `).run(yiru.id, pachinko.id);
  db.prepare(`
    INSERT OR IGNORE INTO user_books (user_id, book_id, status)
    VALUES (?, ?, 'TBR')
  `).run(yiru.id, bookThief.id);

  db.prepare(`
    INSERT OR IGNORE INTO posts (user_id, content, book_id)
    VALUES (?, 'Just finished The Great Gatsby — the last page got me.', ?)
  `).run(yiru.id, gatsby.id);
  db.prepare(`
    INSERT OR IGNORE INTO posts (user_id, content, book_id)
    VALUES (?, 'Would anyone be interested in a Pachinko summer read?', ?)
  `).run(maya.id, pachinko.id);

  let club = db.prepare('SELECT id FROM book_clubs WHERE name = ?').get('Pachinko Summer Read');
  if (!club) {
    const result = db.prepare(`
      INSERT INTO book_clubs (name, description, book_id, creator_id)
      VALUES ('Pachinko Summer Read', 'Read together and discuss a few chapters each week.', ?, ?)
    `).run(pachinko.id, yiru.id);
    club = { id: result.lastInsertRowid };
  }
  db.prepare('INSERT OR IGNORE INTO club_members (club_id, user_id) VALUES (?, ?)').run(club.id, yiru.id);
  db.prepare('INSERT OR IGNORE INTO club_members (club_id, user_id) VALUES (?, ?)').run(club.id, maya.id);

  db.prepare(`
    INSERT OR IGNORE INTO reading_challenges (user_id, target_books, books_completed, year)
    VALUES (?, 24, 1, 2026)
  `).run(yiru.id);

  const badges = [
    ['First Book', 'Finish your first book.', '📖'],
    ['10 Books Read', 'Finish ten books.', '🔟'],
    ['100 Day Streak', 'Read for one hundred days in a row.', '🔥'],
    ['Review Writer', 'Publish your first review.', '✍️']
  ];
  const insertBadge = db.prepare('INSERT OR IGNORE INTO badges (name, description, icon) VALUES (?, ?, ?)');
  badges.forEach(badge => insertBadge.run(...badge));
  const firstBook = db.prepare('SELECT id FROM badges WHERE name = ?').get('First Book');
  db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(yiru.id, firstBook.id);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const feature = db.prepare(`
    INSERT OR IGNORE INTO featured_content (title, type, content, month, year)
    VALUES (?, ?, ?, ?, ?)
  `);
  feature.run('Which summer reader are you?', 'quiz', JSON.stringify({
    intro: 'Build a vacation reading list that matches your mood.',
    questions: [{ prompt: 'Choose a reading spot', options: ['Beach', 'Café', 'Library', 'Bed'] }]
  }), month, year);
  feature.run('Stories that cross generations', 'book_list', JSON.stringify({
    description: 'Family sagas selected for this month.', book_ids: [pachinko.id, bookThief.id]
  }), month, year);
});

seed();
console.log('Sample data seeded. Use x-user-id: 1 to explore authenticated routes.');
