/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const R = require('ramda');
const logger = require('boiler').getLogger('influx_row_type');

import type {EventType, PropertyType, Validator, Content} from './interfaces';

const FIELD_DELTATIME = 'deltaTime';
const FIELD_TIMESTAMP = 'timestamp';

// Represents the type of the deltaTime column in influx input data.
//
class InfluxDateType implements PropertyType {
  deltaTo: number;
  constructor(eventTime: number) {
    this.deltaTo = eventTime;
  }

  secondsToNanos(secs: number): number {
    if (secs < 0) throw new Error(`Deltatime must be greater than 0`);
    return Math.trunc(secs * 1000 * 1000 * 1000);
  }

  coerce(value: any): any {
    switch (R.type(value)) {
      case 'Number': 
        return this.secondsToNanos(value - this.deltaTo); 
      case 'String':
        return this.secondsToNanos(parseFloat(value) - this.deltaTo); 
      // FALL THROUGH
    }

    throw new Error(`Cannot coerce ${value} into deltaTime.`);
  }
}

// Represents the type of a row in influx input data.
//  
class InfluxRowType implements EventType {
  eventType: EventType; 
  seriesMeta: SeriesMetadata;
  applyDeltaTimeToSerie: Number;

  constructor(eventType: EventType) {
    this.eventType = eventType; 
    this.applyDeltaTimeToSerie = 0;
  }

  setSeriesMeta(seriesMeta: SeriesMetadata) {
    this.seriesMeta = seriesMeta;
  }

  // Returns the name of the type inside the series. 
  // 
  elementTypeName() {
    return this.eventType.typeName(); 
  }
  
  /** 
   * Returns true if the columns given can be reconciled with this type.
   * WARNING If 'timestamp' column is found a column name will be renamed to "deltaTime" 
   * and next coerce will convert timestamps to deltaTime relatively to the 
   * Event time.
   */
  validateColumns(columnNames: Array<string>): boolean {
    const underlyingType = this.eventType;
    
    // ** do we need to transformation timestamp into deltatime
    // ** look for "timestamp" in the columns and rename it to deltatime.. 
    // ** advertise type to convert future measures and r
    const timestampColumn = columnNames.indexOf(FIELD_TIMESTAMP);
    if (timestampColumn >= 0) {
      columnNames[timestampColumn] = FIELD_DELTATIME;
      if (!this.seriesMeta) {
        throw new Error('Cannot transform to timestamp without knwowing the seriesMeta time');
      }
      this.applyDeltaTimeToSerie = this.seriesMeta.time;
    }

    // These names are all allowed once:
    const allowedFields = new Set(underlyingType.fields());
    allowedFields.add(FIELD_DELTATIME);
    logger.debug('Allowed are ', allowedFields);
    
    // Accumulator for the fields that we've already seen.
    const seenFields = new Set(); 

    for (const field of columnNames) {
      if (! allowedFields.has(field)) {
        logger.debug(`Field '${field}' is not allowed.`);
        return false; 
      }
      
      // Fields are only allowed once; otherwise the storage op would be
      // ambiguous.
      if (seenFields.has(field)) {
        logger.debug(`Duplicate field '${field}'.`);
        return false; 
      }
      
      seenFields.add(field);
    }
    
    // Now this looks valid: Only allowed fields and every field just once. 
    // Let's see if we have all required fields: 
    const requiredFields = new Set(underlyingType.requiredFields());
    requiredFields.add(FIELD_DELTATIME);
    
    for (const requiredField of requiredFields) {
      if (! seenFields.has(requiredField)) {
        logger.debug(`Field '${requiredField}' is required, but was not present.`);
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
        logger.debug('Invalid row: ', row, columnNames.length);
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
    if (name === FIELD_DELTATIME) {
      return new InfluxDateType(this.applyDeltaTimeToSerie);
    } else {
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
    return [FIELD_DELTATIME].concat(
      this.eventType.requiredFields());
  }
  fields(): Array<string> {
    return [FIELD_DELTATIME].concat(
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
