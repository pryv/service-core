'use strict'; 
// @flow

const multer = require('multer');

// Parse multipart file data into request.files: 
const storage = multer.diskStorage({
  filename: null, // default filename, random
  destination: null, // operating system's default directory for temporary files is used.
}); 
const upload = multer({storage: storage});

module.exports = upload; 