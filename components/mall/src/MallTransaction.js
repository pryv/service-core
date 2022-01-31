/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { DataStore }  = require('pryv-datastore');

class MallTransaction {

  transactionsByStoreId: Map<string, DataStore.Transaction>;
  
  constructor() {
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

  async forStore(store): DataStore.Transaction {
    if (this.transactionsByStoreId.has(store.id)) {
      return this.transactionsByStoreId.get(store.id);
    } 

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
