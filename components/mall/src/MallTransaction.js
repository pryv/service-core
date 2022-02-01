/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { DataStore }  = require('pryv-datastore');

class MallTransaction {
  mall: Mall;
  transactionsByStoreId: Map<string, DataStore.Transaction>;
  
  constructor(mall) {
    this.mall = mall;
    this.transactionsByStoreId = new Map();
  }

  /**
   * Set a transaction for a store (open outside of mall)
   */
  registerExernalTransaction(storeId, transaction) {
    if (this.transactionsByStoreId.has(storeId)) {
      throw new Error(`Transaction for store ${storeId} already registered`);
    }
    this.transactionsByStoreId.set(storeId, transaction);
  }

  async forStoreId(storeId): DataStore.Transaction {
    if (this.transactionsByStoreId.has(storeId)) {
      return this.transactionsByStoreId.get(storeId);
    } 
    const store = this.mall._storeForId(storeId);
    const transaction = await store.newTransaction();
    this.transactionsByStoreId.set(store.id, transaction);
    return transaction;
  }

  // !! should we respect an order ? or do we want to commit all at once ?
  // and failure ... ?
  async commit() {
    const promises = [];
    this.transactionsByStoreId.forEach(transaction => {
      promises.push(transaction.commit());
    });
    await Promise.all(promises);
  }

}

module.exports = MallTransaction;
