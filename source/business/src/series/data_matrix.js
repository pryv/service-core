// @flow

const R = require('ramda');
const assert = require('assert');

const Row = require('./row');

type Element = string | number; 

/** Data in matrix form. Columns have names, rows have numbers, starting at 0. 
 */
class DataMatrix {
  columns: Array<string>; 
  data: Array<Array<Element>>; 
  
  // @return {number} number of rows this data matrix has. 
  length: number; 
  
  /** Constructs an empty matrix. 
   */
  static empty(): DataMatrix {
    return new DataMatrix([], []);
  }
  
  /** Store data inside the data matrix. This replaces the
   * existing content of this matrix with the content you 
   * give as parameter. 
   * 
   * NOTE data must be rectangular; it can contain as many 
   *  rows as you want (outer array), but should always 
   *  contain columns.length columns (inner array). This is 
   *  not checked, but further operations will take place 
   *  only on known columns. 
   * 
   * @param columns {Array<string>} column names to use for 
   *  this matrix. 
   * @param data {Array<Array<Element>} data
   * @return {void}
   */
  constructor(columns: Array<string>, data: Array<Array<Element>>) {
    assert.ok(columns.length > 0);

    this.columns = columns;
    this.setData(data);
  }
  
  /** Updates the data attribute internally, keeping length === data.length. 
   */
  setData(data: Array<*>) {
    this.data = data; 
    this.length = data.length; 
  }
  
  /** Accesses the nth element of the array. If the index is out of bounds, 
   * an error is thrown. 
   */
  at(idx: number): Array<Element> {
    assert.ok(idx >= 0);
    assert.ok(idx < this.length);
    
    return this.data[idx];
  }
  
  
  /** Functor implementation for the data matrix, iterating over all rows. 
   * Use this with ramda `map` for example. 
   * 
   * @param f {Row => T} function mapping each row to some return type
   * @return {Array<T>} a new array, containing all the returned elements
   */
  map<T>(f: (Row) => T): Array<T> {
    const mapper = (rawRow) => f(new Row(rawRow, this.columns));
    return R.map(mapper, this.data);
  }
}

module.exports = DataMatrix;
