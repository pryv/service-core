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
    this.data = data;
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
