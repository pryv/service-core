/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


 const {DataStore, errors}  = require('pryv-datastore');

/**
 * Per-user events data
 */
 class Transaction extends DataStore.Transaction {

  constructor()

  async commit(): Promise<void> { throw(new Error('not implemented')); }

  async rollback(): Promise<void> { throw(new Error('not implemented')); }

}

module.exports = Transaction;