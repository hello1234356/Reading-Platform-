const BaseModel = require('./BaseModel');

class ClubMember extends BaseModel {
  static table = 'club_members';
  static fields = ['club_id', 'user_id'];
}

module.exports = ClubMember;
