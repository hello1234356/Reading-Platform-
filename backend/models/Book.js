const BaseModel = require('./BaseModel');

class Book extends BaseModel {
  static table = 'books';
  static fields = ['title', 'author', 'cover_image', 'description', 'genre', 'publication_year', 'isbn'];
}

module.exports = Book;
