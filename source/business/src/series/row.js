
const R = require('ramda');

/** A single row of the data matrix. Stores a reference to the original 
 * matrix; this is like a pointer, not like a value. It is used during iteration
 * to reference individual rows. 
 */
class Row {
  values: Array<Element>; 
  columnNames: Array<string>; 
  
  /** Constructs a row - internal constructor. Use DataMatrix to produce rows. 
   */
  constructor(values: Array<Element>, columnNames: Array<string>) {
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
  toStruct() {
    const s = Object.create(null); // Avoid key collisions with Javascript base object. 
    const assoc = (s, [k, v]) => R.assoc(k, v, s);
    const createObj = R.reduce(assoc, s); 
    
    return createObj(R.zip(this.columnNames, this.values));
  }
}

module.exports = Row; 
