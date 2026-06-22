const BaseModel = require('./BaseModel');

class FeaturedContent extends BaseModel {
  static table = 'featured_content';
  static fields = ['title', 'type', 'content', 'month', 'year'];
}

module.exports = FeaturedContent;
