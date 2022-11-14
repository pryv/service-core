/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// 

const { getDatabase } = require('../index');

const defaultOptions = {
  readPreference: 'primary',
  readConcern: { level: 'local' },
  writeConcern: { w: 'majority' },
};

/**
 * Per-user events data
 */
class LocalTransaction {
  transactionSession;
  transactionOptions;

  constructor(transactionOptions) {
    this.transactionOptions = transactionOptions || defaultOptions;
  }

  async init() {
    const database = await getDatabase();
    this.transactionSession = await database.startSession();
  }

  /**
   *
   * @param {Function} func
   */
  async exec(func) {
    await this.transactionSession.withTransaction(func, this.transactionOptions);
  }

  async commit() { throw(new Error('not implemented')); }

  async rollback() { throw(new Error('not implemented')); }
}

module.exports = LocalTransaction;
