/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

export type APIErrorOptions = {
  httpStatus?: number, 
  data?: mixed, 
  innerError?: ?Error, 
  dontNotifyAirbrake?: boolean, 
}

// The constructor to use for all errors within the API.
// 
class APIError extends Error {
  id: string; 
  message: string; 
  httpStatus: ?number;
  data: ?mixed; 
  innerError: ?Error; 
  dontNotifyAirbrake: boolean; 
  
  constructor(id: string, message: string, options: ?APIErrorOptions) {
    super(); 
    
    this.id = id;
    this.message = message;
    
    this.httpStatus = 500; 
    if (options != null && options.httpStatus != null) 
      this.httpStatus = options.httpStatus;
      
    this.data = null; 
    if (options != null && options.data != null) 
      this.data = options.data;
      
    this.innerError = null; 
    if (options != null && options.innerError != null) 
      this.innerError = options.innerError;
    
    // We notify unless somebody tells us not to. 
    this.dontNotifyAirbrake = false; 
    if (options != null && options.dontNotifyAirbrake != null) 
      this.dontNotifyAirbrake = options.dontNotifyAirbrake;
  }
}

module.exports = APIError;