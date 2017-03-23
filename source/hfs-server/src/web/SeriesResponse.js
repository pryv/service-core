
/** Represents a response in series format. 
 * 
 * This class is used to represent a series response. It serializes to JSON. 
 */
class SeriesResponse {
  matrix: DataMatrix; 
  
  /** Constructs a series response from an existing data matrix. 
   */
  constructor(mat: DataMatrix) {
    this.matrix = mat; 
  }

  /** Answers the client with a series response (JSON). 
   */
  answer(res: express$Response) {
    res
      .json(this)
      .status(200);
  }
  
  /** Serializes this response to JSON. 
   */
  toJSON() {
    return {
      elementType: 'unknown/fake', 
      format: 'flatJSON', 
      fields: this.matrix.columns, 
      points: this.matrix.data, 
    };
  }
}

module.exports = SeriesResponse;
