const BaseModel = require('./BaseModel');

class UserBook extends BaseModel {
  static table = 'user_books';
  static fields = ['user_id', 'book_id', 'status', 'rating', 'review', 'start_date', 'finish_date', 'updated_at'];
}

module.exports = UserBook;
