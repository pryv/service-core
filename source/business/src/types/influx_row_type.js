// @flow

const R = require('ramda');

import type {EventType, PropertyType} from './interfaces';

const FIELD_TIMESTAMP = 'timestamp';

// Represents the type of the timestamp column in influx input data. 
//
class InfluxDateType implements PropertyType {
  secondsToNanos(secs: number): number {
    return secs * 1000 * 1000 * 1000;
  }

  coerce(value: any): any {
    switch (R.type(value)) {
      case 'Number': 
        return this.secondsToNanos(value); 
      case 'String':
        return this.secondsToNanos(parseInt(value)); 
      // FALL THROUGH
    }

    throw new Error(`Cannot coerce ${value} into timestamp.`);
  }
}

// Represents the type of a row in influx input data.
//  
class InfluxRowType implements EventType {
  eventType: EventType; 
  
  constructor(eventType: EventType) {
    this.eventType = eventType; 
  }
  
  /** Returns true if the columns given can be reconciled with this type. 
   */
  validateColumns(columnNames: Array<string>): boolean {
    // TODO remove hard coding to simple types. 
    if (columnNames.indexOf(FIELD_TIMESTAMP) < 0) return false; 
    if (columnNames.indexOf('value') < 0) return false; 
    
    return true; 
  }
  
  /** Returns true if all the rows in the given row array are valid for this 
   * type. 
   */
  validateAllRows(rows: Array<any>, columnNames: Array<string>) {
    for (let row of rows) {
      if (! this.isRowValid(row, columnNames)) return false; 
    }
    
    return true; 
  }
  
  /** Returns true if the given row (part of the input from the client) looks 
   * right. See the code for what rules define right. 
   * 
   * Normal order of operations would be: 
   * 
   *  1) Check `columnNames` (`{@link validateColumns}`).
   *  2) For each row: 
   *    2.1) `isRowValid`?
   *    2.2) For each cell: 
   *      2.2.1) `coerce` into target type
   *      2.2.2) `isCellValid`?
   * 
   * @param row {any} Rows parsed from client input, could be any type. 
   * @param columnNames {Array<string>} A list of column names the client 
   *  provided. Check these first using `validateColumns`.
   */
  isRowValid(row: any, columnNames: Array<string>) {
    // A valid row is an array of cells. 
    const outerType = R.type(row);
    if (outerType !== 'Array') return false;
    
    // It has the correct length. (Assumes that columnNames is right)
    if (row.length !== columnNames.length) return false; 
    
    // Everything looks good. 
    return true; 
  }
  
  /** Returns the type of a single cell with column name `name`. 
   */
  forField(name: string): PropertyType  {
    if (name === FIELD_TIMESTAMP) {
      return new InfluxDateType();
    }
    else {
      return this.eventType.forField(name);
    }
  }

  // What fields may be present? See `requiredFields` for a list of mandatory 
  // fields. 
  // 
  optionalFields() {
    return this.eventType.optionalFields();
  }
  
  // What fields MUST be present? 
  // 
  requiredFields() {
    return [FIELD_TIMESTAMP].concat(
      this.eventType.requiredFields());
  }
}

module.exports = InfluxRowType;
