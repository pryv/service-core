
// @flow

import type InfluxConnection from './influx_connection';

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
  
  // XXX Where should I define the BatchRequest structure?
  append(batch: BatchRequest) {
    
  }
  
  async store(): Promise<*> {
    throw new Error('Not Implemented');
  }
}

module.exports = NamespaceBatch;