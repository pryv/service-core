/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict'; 
// @flow

// A middleware that allows checking uploads and that will at the same time
// allow uploads for the route. 

const filesUploadSupport = require('middleware').filesUploadSupport;
const multer = require('multer');
const integrity = require('business').integrity;

// load the correct disk storage depending on settings
const MulterDiskStorage = integrity.isActiveFor.attachments ? integrity.MulterIntegrityDiskStorage : multer.diskStorage;

// ---------------------------------------------------------------- multer setup

// Parse multipart file data into request.files: 
const storage = MulterDiskStorage({
  filename: null, // default filename, random
  destination: null, // operating system's default directory for temporary files is used.
}); 
const uploadMiddlewareFactory = multer({storage: storage});

// --------------------------------------------------------------------- exports
module.exports = {
  filesUploadSupport: filesUploadSupport, 
  hasFileUpload: hasFileUpload,
};



/** Declares that a route has file uploads. 
 * 
 * Enables file uploads on a route. file uploads are checked in their global
 * form (MUST have only a JSON body). 
 */ 
function hasFileUpload(req: express$Request, res: express$Response, next: express$NextFunction) {
  const uploadMiddleware = uploadMiddlewareFactory.any(); 
  
  uploadMiddleware(req, res, (err) => {
    if (err) return next(err);
    
    filesUploadSupport(req, res, next);
  });
}

