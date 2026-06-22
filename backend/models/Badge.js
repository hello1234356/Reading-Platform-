const BaseModel = require('./BaseModel');

class Badge extends BaseModel {
  static table = 'badges';
  static fields = ['name', 'description', 'icon'];
}

module.exports = Badge;
