const BaseModel = require('./BaseModel');

class ReadingChallenge extends BaseModel {
  static table = 'reading_challenges';
  static fields = ['user_id', 'target_books', 'books_completed', 'year'];
}

module.exports = ReadingChallenge;
