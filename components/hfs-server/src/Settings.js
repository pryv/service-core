'use strict';
// @flow

/** 
 * Handles loading and access to project settings. 
 */
class Settings {
  http: {
    port: number, 
    ip: string, 
  }
  
  constructor() {
    this.http = {
      port: 9000, 
      ip: '127.0.0.1',
    };
  }
}

module.exports = Settings;
