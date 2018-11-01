// @flow

// NOTE I've chosen to implement directory path construction using the base API
//  (path, fs) and not the API in EventFiles. As soon as path creation gets more
//  complex than 'path.join(a, b)', we should consider merging these bits. 

import type { FileStoreSettings } from '../configuration'; 

const bluebird = require('bluebird');
const rimraf = require('rimraf');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

interface UserAttributes {
  id: string, 
}
interface UserLoader {
  findUser(username: string): Promise<?UserAttributes>; 
}

class FileStore {
  config: *; 
  mongodb: *; 

  /// Constructs a file store connection; uses `mongodb` to retrieve metadata 
  /// about the user. 
  /// 
  constructor(config: FileStoreSettings, mongodb: UserLoader) {
    this.config = config;
    this.mongodb = mongodb;
  }

  async preflight(username: string): Promise<void> {
    // NOTE Not much to do in the way of a preflight test, since file stores
    //  are created lazily. However: If a file store exists, we need to make sure
    //  we'll be able to delete it. 

    const config = this.config; 
    const paths = [config.attachmentsPath, config.previewsPath]; 

    // Check if the base directories exist. 
    const missingBaseDirectory = firstThrow(paths, path => fs.statSync(path));
    if (missingBaseDirectory != null) 
      throw new Error(`Base directory '${missingBaseDirectory}' doesn't seem to exist.`);

    // NOTE User specific paths are constructed by appending the user _id_ to the
    // `paths` constant above. I know this because I read EventFiles#getXPath(...)
    // in components/storage/src/user/EventFiles.js.

    // NOTE Since user specific paths are created lazily, we should not expect 
    //  them to be there. But _if_ they are, they need be accessible. 

    const mongodb = this.mongodb;
    const user = await mongodb.findUser(username);
    if (user == null) 
      throw new Error(`Could not find user '${username}' in main database.`);

    assert(user.id != null);
    
    // Let's check if we can change into and write into the user's paths: 
    const inaccessibleDirectory = firstThrow(
      paths.map(p => path.join(p, user.id)),
      userPath => {
        let stat; 
        try {
          stat = fs.statSync(userPath); // throws if userPath doesn't exist
        }
        catch (err) {
          // We accept that the user specific directory may be missing from the
          // disk, see above. 
          if (err.code === 'ENOENT') 
            return; 
          else
            throw err; 
        }

        if (!stat.isDirectory())
          throw new Error(`Path '${userPath}' exists, but is not a directory.`);

        fs.accessSync(userPath, fs.constants.W_OK + fs.constants.X_OK);
      });

    if (inaccessibleDirectory != null) 
      throw new Error(`Directory '${inaccessibleDirectory}' is inaccessible or missing.`);
  }
  async deleteUser(username: string): Promise<void> {
    const config = this.config; 
    const paths = [config.attachmentsPath, config.previewsPath]; 

    const mongodb = this.mongodb;
    const user = await mongodb.findUser(username);
    if (user == null)
      throw new Error(`Could not find user '${username}' in main database.`);

    const userPaths =  paths.map(p => path.join(p, user.id));
    const opts = {
      disableGlob: true, 
    };

    await bluebird.map(userPaths, 
      path => bluebird.fromCallback(cb => rimraf(path, opts, cb)));
  }
}

module.exports = FileStore;

/// Calls `fun` on each element of `collection`. Returns the first offending
/// element or `null` if none of the function calls throw an error. Yes, `null`
/// is the success value here. 
/// 
function firstThrow<T>(collection: Array<T>, fun: (T) => mixed): ?T {
  for (const el of collection) {
    try {
      fun(el);
    }
    catch (err) {
      return el; 
    }
  }

  return null; 
}