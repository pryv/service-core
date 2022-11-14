/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

const business = require('business');
const setCommonMeta = require('api-server/src/methods/helpers/setCommonMeta').setCommonMeta;

/** Represents a response in series format. 
 * 
 * This class is used to represent a series response. It serializes to JSON. 
 */
class SeriesResponse {
  matrix; 
  
  /** Constructs a series response from an existing data matrix. 
   */
  constructor(mat) {
    this.matrix = mat; 
  }

  /** Answers the client with a series response (JSON). 
   */
  answer(res) {
    res
      .json(this)
      .status(200);
  }
  
  /** Serializes this response to JSON. 
   */
  toJSON() {
    return setCommonMeta({
      format: 'flatJSON', 
      fields: this.matrix.columns, 
      points: this.matrix.data, 
    });
  }
}

module.exports = SeriesResponse;
