const BaseModel = require('./BaseModel');

class BookClub extends BaseModel {
  static table = 'book_clubs';
  static fields = ['name', 'description', 'book_id', 'creator_id'];
}

module.exports = BookClub;
