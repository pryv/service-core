
// @flow

import type InfluxConnection from './influx_connection';
import type { BatchRequest } from './batch_request';

// A store operation that stores data for multiple series in one call to the
// backend. 
// 
// Example: 
//    
//    const batch = await repository.makeBatch(...);
//    await batch.store(); 
// 
class NamespaceBatch {
  connection: InfluxConnection;
  namespace: string;
  
  constructor(conn: InfluxConnection, namespace: string) {
    this.connection = conn;
    this.namespace = namespace;
  }
  
  async store(data: BatchRequest): Promise<*> {
    console.log('store', data);
  }
}

module.exports = NamespaceBatch;