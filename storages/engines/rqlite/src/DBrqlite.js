/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * PlatformDB implementation backed by rqlite (distributed SQLite via Raft).
 * Same SQL as the local SQLite backend (DBsqlite.js) but accessed over HTTP.
 * Single-node: use SQLite engine. Multi-core: use this engine with rqlite sidecar.
 */
class DBrqlite {
  url;
  closed;

  constructor (url) {
    this.url = url || 'http://localhost:4001';
    this.closed = false;
  }

  async init () {
    await this.execute(
      'CREATE TABLE IF NOT EXISTS keyValue (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    );
  }

  // --- Low-level HTTP methods --- //

  /**
   * Execute a write statement (INSERT, UPDATE, DELETE, CREATE).
   * @param {string} sql
   * @param {Array} [params]
   * @returns {Promise<Object>} rqlite result
   */
  async execute (sql, params) {
    const body = params ? [[sql, ...params]] : [[sql]];
    const res = await fetch(this.url + '/db/execute?timings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`rqlite execute failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    if (data.results?.[0]?.error) {
      throw new Error(`rqlite SQL error: ${data.results[0].error}`);
    }
    return data.results[0];
  }

  /**
   * Execute a read query (SELECT).
   * @param {string} sql
   * @param {Array} [params]
   * @returns {Promise<Array>} rows as objects
   */
  async query (sql, params) {
    const body = params ? [[sql, ...params]] : [[sql]];
    const res = await fetch(this.url + '/db/query?timings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`rqlite query failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    if (data.results?.[0]?.error) {
      throw new Error(`rqlite SQL error: ${data.results[0].error}`);
    }
    const result = data.results[0];
    if (!result.columns || !result.values) return [];
    // Convert columnar format to row objects
    return result.values.map(row => {
      const obj = {};
      for (let i = 0; i < result.columns.length; i++) {
        obj[result.columns[i]] = row[i];
      }
      return obj;
    });
  }

  // --- PlatformDB interface --- //

  async setUserUniqueField (username, field, value) {
    const key = getUserUniqueKey(field, value);
    await this.execute(
      'INSERT OR REPLACE INTO keyValue (key, value) VALUES (?, ?)',
      [key, username]
    );
  }

  async setUserUniqueFieldIfNotExists (username, field, value) {
    const key = getUserUniqueKey(field, value);
    // Atomic: INSERT OR IGNORE, then check
    await this.execute(
      'INSERT OR IGNORE INTO keyValue (key, value) VALUES (?, ?)',
      [key, username]
    );
    const rows = await this.query(
      'SELECT value FROM keyValue WHERE key = ?',
      [key]
    );
    if (rows.length === 0) return false;
    return rows[0].value === username;
  }

  async deleteUserUniqueField (field, value) {
    const key = getUserUniqueKey(field, value);
    await this.execute('DELETE FROM keyValue WHERE key = ?', [key]);
  }

  async setUserIndexedField (username, field, value) {
    const key = getUserIndexedKey(username, field);
    await this.execute(
      'INSERT OR REPLACE INTO keyValue (key, value) VALUES (?, ?)',
      [key, value]
    );
  }

  async deleteUserIndexedField (username, field) {
    const key = getUserIndexedKey(username, field);
    await this.execute('DELETE FROM keyValue WHERE key = ?', [key]);
  }

  async getUserIndexedField (username, field) {
    const key = getUserIndexedKey(username, field);
    const rows = await this.query('SELECT value FROM keyValue WHERE key = ?', [key]);
    return rows.length === 0 ? null : rows[0].value;
  }

  async getUsersUniqueField (field, value) {
    const key = getUserUniqueKey(field, value);
    const rows = await this.query('SELECT value FROM keyValue WHERE key = ?', [key]);
    return rows.length === 0 ? null : rows[0].value;
  }

  async getAllWithPrefix (prefix) {
    const rows = await this.query(
      "SELECT key, value FROM keyValue WHERE key LIKE (? || '%')",
      [prefix]
    );
    return rows.map(parseEntry);
  }

  async deleteAll () {
    await this.execute('DELETE FROM keyValue');
  }

  async close () {
    this.closed = true;
  }

  isClosed () {
    return this.closed;
  }

  // --- Migration methods --- //

  async exportAll () {
    return await this.getAllWithPrefix('user');
  }

  async importAll (data) {
    for (const entry of data) {
      if (entry.isUnique) {
        await this.setUserUniqueField(entry.username, entry.field, entry.value);
      } else {
        await this.setUserIndexedField(entry.username, entry.field, entry.value);
      }
    }
  }

  async clearAll () {
    return await this.deleteAll();
  }
}

// --- Key helpers (same as SQLite engine) --- //

function parseEntry (entry) {
  const [type, field, userNameOrValue] = entry.key.split('/');
  const isUnique = (type === 'user-unique');
  return {
    isUnique,
    field,
    username: isUnique ? entry.value : userNameOrValue,
    value: isUnique ? userNameOrValue : entry.value
  };
}

function getUserUniqueKey (field, value) {
  return 'user-unique/' + field + '/' + value;
}

function getUserIndexedKey (username, field) {
  return 'user-indexed/' + field + '/' + username;
}

module.exports = DBrqlite;
