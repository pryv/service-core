
// @flow

import type { IPoint } from 'influx';
import type InfluxConnection from './influx_connection';
import type { BatchRequest } from './batch_request';
import type Row from './row';

// Type signature for a mapping function that helps convert eventIds into 
// InfluxDB measurement names. 
type MeasurementNameResolver = (eventId: string) => Promise<string>;

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
  
  // Stores a batch request into InfluxDB and returns a promise that will
  // resolve once the request completes successfully. 
  async store(data: BatchRequest, resolver: MeasurementNameResolver): Promise<*> {
    // These options will apply to all the points:
    const appendOptions = {
      database: this.namespace, 
    };
    
    const points: Array<IPoint> = []; 

    // Loop through all batch requests and convert each row into an IPoint 
    // structure. 
    for (const element of data.elements()) {
      const eventId = element.eventId;
      const data = element.data;
      const measurementName = await resolver(eventId);
      
      data.eachRow((row) => {
        points.push(
          toIPoint(eventId, row, measurementName));
      });
    }
    
    const conn = this.connection; 
    return conn.writePoints(points, appendOptions);
    
    // Converts a single `Row` of data into an IPoint structure. 
    function toIPoint(eventId: string, row: Row, measurementName: string): IPoint {
      const struct = row.toStruct(); 
      // FLOW This cannot fail, but somehow flow things we access the deltatime. 
      delete struct.deltatime; 
      
      const timestamp = row.get('deltatime');
      
      return {
        tags: [], 
        fields: struct, 
        timestamp: timestamp, 
        measurement: measurementName,
      };
    }
  }
}

module.exports = NamespaceBatch;