const BaseModel = require('./BaseModel');

class UserBadge extends BaseModel {
  static table = 'user_badges';
  static fields = ['user_id', 'badge_id'];
}

module.exports = UserBadge;
