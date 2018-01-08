// @flow

// Load configuration file, set up execution context and start the server. 

const logComponent = require('components/utils').logging;
const business = require('components/business');
const storage = require('components/storage');

const Context = require('./context');
const Settings = require('./Settings');
const Server = require('./server'); 

import type {LogFactory} from 'components/utils/src/logging';

function createSettings(): Settings {
  try {
    return Settings.load(); 
  } catch(err) {
    if (err.code == 'ENOENT') {
      console.error('Configuration file not found. '     // eslint-disable-line no-console
        + 'Default location is \'./hfs-server.json\'. '
        + 'Use --config to modify expected location.');
      process.exit(1);
      // NOT REACHED
    }
    
    throw err; 
  }
}
function createLogFactory(settings): LogFactory {
  const logSettings = settings.get('logs').obj();
  return logComponent(logSettings).getLogger;
}
function createContext(settings: Settings, logFactory: LogFactory): Context {
  const influx = new business.series.InfluxConnection(
    {host: 'localhost'}, logFactory('influx')); 
  
  const mongo = new storage.Database(
    settings.get('mongodb').obj(), logFactory('database'));
    
  return new Context(influx, mongo, logFactory('model'));
}

/** The HF application holds references to all subsystems and ties everything
 * together. 
 */
class Application {
  settings: Settings; 
  logFactory: LogFactory; 
  context: Context; 
  
  server: Server; 
  
  init(settings?: Settings): Application {
    this.settings = settings || createSettings(); 
    this.logFactory = createLogFactory(this.settings);
    this.context = createContext(this.settings, this.logFactory);

    this.server = new Server(this.settings, this.context);
    
    return this; 
  }
  
  start(): Application {
    this.server.start(); 
    
    return this; 
  }
  
  run() {
    this.init(); 
    this.start(); 
  }
}

module.exports = Application; 
