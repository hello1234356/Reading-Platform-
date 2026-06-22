const BaseModel = require('./BaseModel');

class ClubMessage extends BaseModel {
  static table = 'club_messages';
  static fields = ['club_id', 'user_id', 'message'];
}

module.exports = ClubMessage;
