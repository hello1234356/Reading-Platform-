const BaseModel = require('./BaseModel');

class Comment extends BaseModel {
  static table = 'comments';
  static fields = ['post_id', 'user_id', 'content'];
}

module.exports = Comment;
