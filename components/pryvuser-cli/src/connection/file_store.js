// @flow

import type { FileStoreSettings } from '../configuration'; 

const fs = require('fs');

class FileStore {
  config: *; 

  constructor(config: FileStoreSettings) {
    this.config = config;
  }

  async preflight(username: string): Promise<void> {
    // NOTE Not much to do in the way of a preflight test, since file stores
    //  are created lazily. However: If a file store exists, we need to make sure
    //  we'll be able to delete it. 

    const config = this.config; 
    const paths = [config.attachmentsPath, config.previewsPath]; 

    // Check if the base directories exist. 
    for (let path of paths) {
      try {
        fs.statSync(path);
      }
      catch (err) {
        // (Base) directory doesn't exist. This is a problem...
        throw new Error(`Base directory '${path}' doesn't seem to exist.`);
      }
    }

    // Check if the user has files in any of these. WIP
    for (let path of paths) {
      let stat; 
      try {
        stat = fs.statSync(path);
      }
      catch (err) { 
        // If the directory doesn't exist, skip it. 
        continue; 
      }

      // assert: path returned a stat, exists in some form. 
      if (! stat.isDirectory())
        throw new Error(`Path '${path}' exists, but is not a directory.`);

      // Now: Can we remove this path and all the files it contains? 
      try {
        fs.accessSync(path, fs.constants.W_OK | fs.constants.X_OK); 
      }
      catch (err) {
        // path is not accessible, abort: 
        throw new Error(`Path '${path}': Access denied.`);
      }
    }
  }
  deleteUser(username: string): Promise<void> {
    username;
    throw new Error('Not Implemented');
  }
}

module.exports = FileStore;
