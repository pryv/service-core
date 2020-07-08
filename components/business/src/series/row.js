/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const R = require('ramda');
const assert = require('assert');

import type { Element } from './data_matrix';

/** A single row of the data matrix. Stores a reference to the original 
 * matrix; this is like a pointer, not like a value. It is used during iteration
 * to reference individual rows. 
 */
class Row {
  values: Array<Element>; 
  columnNames: Array<string>; 
  
  /** Constructs a row - internal constructor. Use DataMatrix to produce rows. 
   */
  constructor(values: Array<*>, columnNames: Array<string>) {
    this.values = values; 
    this.columnNames = columnNames; 
  }
  
  /** Turns this row into an object that has the columns as keys and the row
   * values as values. 
   * 
   * @example 
   *    row.toStruct() # => { col1: 'value1', col2: 'value2' }
   * 
   * @return {Object} The current row in object (struct) form. 
   */
  toStruct(): Object {
    const s = Object.create(null); // Avoid key collisions with Javascript base object. 
    const assoc = (s, [k, v]) => R.assoc(k, v, s);
    const createObj = R.reduce(assoc, s); 
    
    return createObj(R.zip(this.columnNames, this.values));
  }
  
  /** Returns a single field value. 
   * 
   * You need to make sure that you access an actual column, 
   * otherwise this method throws an error. 
   */
  get(column: string): Element {
    const idx = this.columnNames.indexOf(column);
    if (idx < 0) throw new Error(`No such column ${column}.`); 
    
    assert.ok(idx < this.values.length);
    assert.ok(idx >= 0);
    
    return this.values[idx];
  }
  
  // Returns this rows deltaTime. If the deltaTime is not available, a runtime
  // error is thrown. 
  // 
  deltaTime(): number {
    const value = this.get('deltaTime');
    if (typeof value !== 'number') throw new Error('Deltatime must be a number');
    if (value < 0) throw new Error('Deltatime must be greater than 0');
    return value;
  }
}

module.exports = Row; 
