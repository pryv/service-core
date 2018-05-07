// @flow

// Retrieves the projects version from git and from our deploy process. 

const bluebird = require('bluebird');
const child_process = require('child_process');

class ProjectVersion {
  // Returns the projects version number. 
  // 
  async version(): Promise<string> {
    const exec = (cmd) => bluebird.fromCallback(
      cb => child_process.exec(cmd, cb));
      
    const version = await exec('git describe');
    
    return version.slice(0, -1);
  }
}

module.exports = {
  ProjectVersion
};
