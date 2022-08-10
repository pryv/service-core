/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// TODO: move this inside mall once the latter is a proper singleton object
class MallTransaction {
  /**
   * @type {Mall}
   */
  mall;
  /**
   * @type {Map<string, DataStore.Transaction>}
   */
  storeTransactions;

  constructor(mall) {
    this.mall = mall;
    this.storeTransactions = new Map();
  }

  async getStoreTransaction(storeId) {
    if (this.storeTransactions.has(storeId)) {
      return this.storeTransactions.get(storeId);
    }
    const store = this.mall.stores.get(storeId);
    const transaction = await store.newTransaction();
    this.storeTransactions.set(store.id, transaction);
    return transaction;
  }
}

module.exports = MallTransaction;
