'use strict';
// @flow

import type Settings from './Settings';

/**
 * HTTP server responsible for the REST api that the HFS server exposes. 
 */
class Server {
  settings: Settings;
  
  constructor(settings: Settings) {
    this.settings = settings; 
  }
}

module.exports = Server;