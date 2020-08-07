/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// global config for the nconf that should be reused in every new setting component
const nconf = require('nconf');
const yaml = require('js-yaml');
const fs = require('fs');

// get config from arguments and env variables
// memory must come first for config.set() to work without loading config files
nconf.use('memory').argv().env();

/**
 * Add a function to read a yaml or json file  or json stored in env variable 
 * and return its content
 * Priority list
 * 1) read it from yaml file
 * 2) if there is no yaml, read it from json file
 * 3) if there is no json check env variables (configPropertyWithUrl + '_JSON' property)
 * 4) if no env variables with json, skip it
 * 
 * !!! NOTE json and yaml file should have a 'content' as a parent element
 */
nconf.readConfigFile = (configPropertyWithUrl: string) => {
  const configFile = nconf.get(configPropertyWithUrl);
  let content;
  try {
    if (configFile) {
      // check if it is yaml
      if (configFile.endsWith(".yaml")) {
        content = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'))['content'];
      } else {
        // otherwise, try to read it with nconf
        nconf.file(configPropertyWithUrl, configFile);
        content = nconf.get(propertyToReadFromFile)['content'];
      }
    } else if (nconf.get(configPropertyWithUrl + '_JSON')) {
      // if nested json is passed as an env variable directly, read it
      const parsedJsonFromEnv = JSON.parse(nconf.get(configPropertyWithUrl + '_JSON'));
      if (parsedJsonFromEnv) {
        content = parsedJsonFromEnv;
      }
    }
  } catch (e) {
    //TODO IEVA -what should I do with parsing errors?
    console.log(e);
  }
  return content;
};
module.exports = nconf;