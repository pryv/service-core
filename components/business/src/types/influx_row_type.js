// @flow

const R = require('ramda');
const debug = require('debug')('influx_row_type');

import type {EventType, PropertyType, Validator, Content} from './interfaces';

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
  
  // Returns the name of the type inside the series. 
  // 
  elementTypeName() {
    return this.eventType.typeName(); 
  }
  
  /** Returns true if the columns given can be reconciled with this type. 
   */
  validateColumns(columnNames: Array<string>): boolean {
    const underlyingType = this.eventType;
    
    // These names are all allowed once:
    const allowedFields = new Set(underlyingType.fields());
    allowedFields.add(FIELD_TIMESTAMP);
    debug('Allowed are ', allowedFields);
    
    // Accumulator for the fields that we've already seen.
    const seenFields = new Set(); 

    for (const field of columnNames) {
      if (! allowedFields.has(field)) {
        debug(`Field '${field}' is not allowed.`);
        return false; 
      }
      
      // Fields are only allowed once; otherwise the storage op would be
      // ambiguous.
      if (seenFields.has(field)) {
        debug(`Duplicate field '${field}'.`);
        return false; 
      }
      
      seenFields.add(field);
    }
    
    // Now this looks valid: Only allowed fields and every field just once. 
    // Let's see if we have all required fields: 
    const requiredFields = new Set(underlyingType.requiredFields());
    requiredFields.add(FIELD_TIMESTAMP);
    
    for (const requiredField of requiredFields) {
      if (! seenFields.has(requiredField)) {
        debug(`Field '${requiredField}' is required, but was not present.`);
        return false;
      }
    }
    
    return true; 
  }
  
  /** Returns true if all the rows in the given row array are valid for this 
   * type. 
   */
  validateAllRows(rows: Array<any>, columnNames: Array<string>) {
    for (let row of rows) {
      if (! this.isRowValid(row, columnNames)) {
        debug('Invalid row: ', row, columnNames.length);
        return false; 
      }
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
  
  // As part of being an EventType, return the name of this type. 
  // 
  typeName() {
    return 'series:'+this.eventType.typeName();
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
  optionalFields(): Array<string> {
    return this.eventType.optionalFields();
  }
  
  // What fields MUST be present? 
  // 
  requiredFields(): Array<string> {
    return [FIELD_TIMESTAMP].concat(
      this.eventType.requiredFields());
  }
  fields(): Array<string> {
    return [FIELD_TIMESTAMP].concat(
      this.eventType.fields()); 
  }

  isSeries(): true {
    return true; 
  }

  callValidator(
    validator: Validator,                         
    content: Content // eslint-disable-line no-unused-vars
  ): Promise<Content> {
    return Promise.reject(
      new Error('No validation for influx row types.'));
  }
}

module.exports = InfluxRowType;
