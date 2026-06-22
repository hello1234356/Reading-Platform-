const BaseModel = require('./BaseModel');

class User extends BaseModel {
  static table = 'users';
  static fields = [
    'name', 'email', 'profile_picture', 'bio', 'favorite_book_1',
    'favorite_book_2', 'favorite_book_3', 'favorite_book_4',
    'favorite_genres', 'reading_goal', 'current_streak'
  ];
}

module.exports = User;
