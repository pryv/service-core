// @flow

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
}

module.exports = DataMatrix;
