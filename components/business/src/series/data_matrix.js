// @flow

const assert = require('assert');

export type Element = string | number; 
export type RawRow = Array<Element>;

const Row = require('./row');

/** Data in matrix form. Columns have names, rows have numbers, starting at 0. 
 */
class DataMatrix {
  columns: Array<string>; 
  data: Array<RawRow>; 
  
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
  
  /** Iterates over each row of the data matrix. 
   */
  eachRow(fn: (row: Row, idx: number) => void) {
    this.data.forEach((row, idx) => {
      const rowObj = new Row(row, this.columns); 
      fn(rowObj, idx);
    });
  }
  
  /** Transforms this matrix in place by calling `fn` for each cell, replacing
   * its value with what fn returns. 
   */
  transform(fn: (colName: string, cellVal: Element) => Element) {
    for (let row of this.data) {
      row.forEach((cell, idx) => 
        row[idx] = fn(this.columns[idx], cell));
    }
  }
}

module.exports = DataMatrix;
