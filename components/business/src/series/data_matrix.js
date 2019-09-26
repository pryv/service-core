// @flow

const assert = require('assert');

const { error } = require('./errors');

// 'series' layer depends on the 'types' layer.
const InfluxRowType = require('../types/influx_row_type');

export type Element = string | number; 
export type RawRow = Array<Element>;

type EpochTime = number; // in seconds since epoch
export type DataExtent = { from: EpochTime, to: EpochTime };

const Row = require('./row');

/** Data in matrix form. Columns have names, rows have numbers, starting at 0. 
 */
class DataMatrix {
  columns: Array<string>; 
  data: Array<RawRow>; 
  
  // @return {number} number of rows this data matrix has. 
  length: number; 
  
  // Parses a data matrix given a javascript object of the right form
  // ('flatJSON'). This method will throw a ParseFailure if the internal
  // structure of the object is not correct.   
  // 
  static parse(obj: mixed, type: InfluxRowType): DataMatrix {
    const out = this.empty(); 
    const parser = new Parser(out); 
    
    parser.parse(obj, type);
    
    return out; 
  }
  
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
  
  // Returns the row at index `idx`. 
  // 
  atRow(idx: number): Row {
    const raw = this.at(idx);
    return new Row(raw, this.columns);
  }
  
  /** Iterates over each row of the data matrix. 
   */
  eachRow(fn: (row: Row, idx: number) => void) {
    this.data.forEach((row, idx) => {
      const rowObj = new Row(row, this.columns); 
      fn(rowObj, idx);
    });
  }
  
  // Transforms this matrix in place by calling `fn` for each cell, replacing
  // its value with what fn returns. 
  // 
  transform(fn: (colName: string, cellVal: Element) => Element) {
    for (let row of this.data) {
      row.forEach((cell, idx) => 
        row[idx] = fn(this.columns[idx], cell));
    }
  }

  // Returns a tuple of [from, to] for the dataset in this matrix, indicating
  // the earliest (`from`) and the latest (`to`) deltatime in the data set. 
  // No assumptions are made about the order of the data. If the matrix is 
  // empty, this method throws an error. 
  // 
  minmax(): DataExtent {
    if (this.length <= 0) throw new Error('Precondition error: matrix is empty.');
    
    // assert: length > 0 => at least one row is available
    const first = this.atRow(0).deltatime(); 
    
    let [min, max] = [first, first];
    this.eachRow(row => {
      
      const deltatime = row.deltatime();
                  
      min = Math.min(min, deltatime);
      max = Math.max(max, deltatime);
    });
    
    return {
      from: min, 
      to: max, 
    };
  }
}

const FLAT_JSON = 'flatJSON';

class Parser {
  out: DataMatrix;
  
  constructor(out: DataMatrix) {
    this.out = out; 
  }
  
  parse(obj: mixed, type: InfluxRowType) {
    const out = this.out; 
    
    if (obj == null || typeof obj !== 'object') 
      throw error('flatJSON structure must be an object.'); 
    
    // assert: obj is a {}
    
    if (obj.format !== FLAT_JSON) 
      throw error('"format" field must contain the string "flatJSON".');
    
    const fields = this.checkFields(obj.fields);
    const points = obj.points; 

    if (points == null || !Array.isArray(points)) 
      throw error('"points" field must be a list of data points.');
    
    // assert: fields, points are both arrays
          
    if (! type.validateColumns(fields))
      throw error('"fields" field must contain valid field names for the series type.');
      
    if (! type.validateAllRows(points, fields)) 
      throw error('"points" matrix must contain correct data types according to series type.');

    out.columns = fields; 
    out.setData(points); 

    try {
      out.transform((columnName, cellValue) => {
        const cellType = type.forField(columnName);
    
        const coercedValue = cellType.coerce(cellValue);
        return coercedValue; 
      });
    }
    catch (e) {
      throw error(`Error during field coercion: ${e}`);
    }
  }
  
  checkFields(val: any): Array<string> {
    if (val == null) throw error('Field names must be a list.');
    if (! (Array.isArray(val))) throw error('Field names must be a list.');
    
    for (const el of val) {
      if (typeof el !== 'string') throw error('Field names must be strings.');
    }
    
    return val;
  }
}

module.exports = DataMatrix;
