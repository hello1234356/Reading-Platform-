const db = require('../database/init');

class BaseModel {
  static get table() {
    throw new Error('A model must define a table name.');
  }

  static all(orderBy = 'id DESC') {
    return db.prepare(`SELECT * FROM ${this.table} ORDER BY ${orderBy}`).all();
  }

  static findById(id) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  static findWhere(field, value, orderBy = 'id DESC') {
    if (!this.fields.includes(field)) throw new Error(`Unsupported ${this.table} field: ${field}`);
    return db.prepare(`SELECT * FROM ${this.table} WHERE ${field} = ? ORDER BY ${orderBy}`).all(value);
  }

  static create(data) {
    const entries = Object.entries(data).filter(([key, value]) =>
      this.fields.includes(key) && value !== undefined
    );
    if (!entries.length) throw new Error(`No valid fields supplied for ${this.table}.`);
    const columns = entries.map(([key]) => key).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    const result = db.prepare(
      `INSERT INTO ${this.table} (${columns}) VALUES (${placeholders})`
    ).run(...entries.map(([, value]) => value));
    return this.findById(result.lastInsertRowid);
  }

  static update(id, data) {
    const entries = Object.entries(data).filter(([key, value]) =>
      this.fields.includes(key) && value !== undefined
    );
    if (!entries.length) return this.findById(id);
    const setters = entries.map(([key]) => `${key} = ?`).join(', ');
    db.prepare(`UPDATE ${this.table} SET ${setters} WHERE id = ?`)
      .run(...entries.map(([, value]) => value), id);
    return this.findById(id);
  }

  static delete(id) {
    return db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id).changes > 0;
  }
}

module.exports = BaseModel;
