'use strict';
// @flow

// Transparently handles multipart requests for uploading file attachments.
// 
// Files uploaded, if any, will be in req.files, while the rest of the request
// will be as for a regular pure JSON request (i.e. uploaded data in req.body).

var errors = require('components/errors').factory;

function validateFileUpload(req: express$Request, res: express$Response, next: Function) {
  const body = req.body; 
  
  if (req.is('multipart/form-data') && 
    body != null && typeof body === 'object') {  
    var bodyKeys = Object.keys(body);
    
    if (bodyKeys.length > 1) {
      return next(errors.invalidRequestStructure(
        'In multipart requests, we don\'t expect more than one non-file part.'));
    }
    if (bodyKeys.length == 0) { 
      return next(); 
    }
    
    // assert: bodyKeys.length === 1
    
    // The only content that is not a file MUST be JSON. 
    try {
      const key = bodyKeys[0];
      const contents = body[key];
      
      if (typeof contents !== 'string') {
        throw new Error('JSON body must be a string.');
      }
      
      req.body = JSON.parse(contents);
    } catch (error) {
      return next(errors.invalidRequestStructure(
        'In multipart requests, we expect the non-file part to be valid JSON.'));
    }
  }

  return next();
}

module.exports = validateFileUpload;
