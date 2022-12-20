/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { getDatabase } = require('../index');
const defaultOptions = {
  readPreference: 'primary',
  readConcern: { level: 'local' },
  writeConcern: { w: 'majority' }
};
/**
 * Per-user events data
 */
class LocalTransaction {
  transactionSession;

  transactionOptions;
  constructor (transactionOptions) {
    this.transactionOptions = transactionOptions || defaultOptions;
  }

  /**
   * @returns {Promise<void>}
   */
  async init () {
    const database = await getDatabase();
    this.transactionSession = await database.startSession();
  }

  /**
   *
   * @param {Function} func  undefined
   * @returns {Promise<void>}
   */
  async exec (func) {
    await this.transactionSession.withTransaction(func, this.transactionOptions);
  }

  /**
   * @returns {Promise<void>}
   */
  async commit () {
    throw new Error('not implemented');
  }

  /**
   * @returns {Promise<void>}
   */
  async rollback () {
    throw new Error('not implemented');
  }
}
module.exports = LocalTransaction;
