// @flow

const R = require('ramda');

const Row = require('./row');

type Element = string | number; 

/** Data in matrix form. Columns have names, rows have numbers, starting at 0. 
 */
class DataMatrix {
  columns: Array<string>; 
  data: Array<Array<Element>>; 
  
  constructor() {
    this.columns = ['timestamp', 'value'];
    this.data = [
      [1490277022, 10], 
      [1490277023, 20],
    ];
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
