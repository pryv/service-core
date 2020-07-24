/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Retrieves the projects version from git and from our deploy process. 

const path = require('path');
const fs = require('fs');
const bluebird = require('bluebird');
const child_process = require('child_process');

const API_VERSION_FILENAME = '.api-version';
const DEFAULT_VERSION = 'unset';

// The method '#version' returns a version string for this project; it
// determines it using the following:
// 
//   If the project contains a file called '.api-version' at its root, 
//   the contents of the file are returned as version string. Take care 
//   to strip newlines from the file. 
// 
// The way we find the project root is as follows: Look at the paths in 
// 'process.mainModule' - and try to find the first one which does exist. This
// is where we load our modules from ('node_modules') and we'll expect the 
// .api-version file to be a sibling. 
// 
// Example: 
// 
//  const pv = new ProjectVersion();
//  pv.version(); // => 1.2.3
// 
class ProjectVersion {
  // Returns the projects version number. 
  // 
  version(): string {
    const version = this.readStaticVersion(); 
    if (version != null) return version; 
    
    return DEFAULT_VERSION;
  }
  
  readStaticVersion(): ?string {
    const searchPaths = process.mainModule.paths; 
      
    for (const current of searchPaths) {
      // Otherwise try to locate '.api-version' as a sibling to the path we found.
      const rootPath = path.dirname(current);
      const versionFilePath = path.join(rootPath, API_VERSION_FILENAME);
      
      // If the version file does not exist, give up. 
      if (! fs.existsSync(versionFilePath)) continue; 
      console.log('got', fs.readFileSync(versionFilePath).toString());
      return fs.readFileSync(versionFilePath).toString();
    }            
    
    // We've searched everything, let's give up.
    return null;
  }
}

module.exports = {
  ProjectVersion
};
