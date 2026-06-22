const BaseModel = require('./BaseModel');

class Like extends BaseModel {
  static table = 'likes';
  static fields = ['user_id', 'post_id'];
}

module.exports = Like;
