/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

// Retrieves the projects version from git and from our deploy process. 

const path = require('path');
const fs = require('fs');

const API_VERSION_FILENAME = '.api-version';
const DEFAULT_VERSION = 'unset';

const { execSync } = require('child_process');

// The method '#version' returns a version string for this project; it
// determines it using the following:
// 
//   If the project contains a file called '.api-version' at its root, 
//   the contents of the file are returned as version string. 
//   Take care to strip newlines from the file. 
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
  version() {
    const version = this.readStaticVersion(); 
    if (version != null && version != '1.2.3') return version; 

    let versionFromGitTag = null;
    try {
      const options = { stdio: 'pipe' }; // in order to mute stderr from console stdout. https://stackoverflow.com/a/45578119/3967660
      versionFromGitTag = execSync('git describe --tags', options).toString(); 
      if (versionFromGitTag) versionFromGitTag = versionFromGitTag.trim();
    } catch (e) {
      // remove log because we don't want it to appear in CI logs
    }

    return versionFromGitTag || version || DEFAULT_VERSION;
  }
  
  readStaticVersion() {
    const searchPaths = process.mainModule.paths; 
      
    for (const current of searchPaths) {
      // Otherwise try to locate '.api-version' as a sibling to the path we found.
      const rootPath = path.dirname(current);
      const versionFilePath = path.join(rootPath, API_VERSION_FILENAME);
      
      // If the version file does not exist, give up. 
      if (! fs.existsSync(versionFilePath)) continue; 
      return fs.readFileSync(versionFilePath).toString();
    }            
    
    // We've searched everything, let's give up.
    return null;
  }
}

let version = null;
async function getAPIVersion(forceRefresh) {
  if (! version || forceRefresh) {
    const pv = new ProjectVersion();
    version = pv.version();
  }
  return version;
}

module.exports = {
  ProjectVersion,
  getAPIVersion
};
