const BaseModel = require('./BaseModel');

class Post extends BaseModel {
  static table = 'posts';
  static fields = ['user_id', 'content', 'book_id'];
}

module.exports = Post;
