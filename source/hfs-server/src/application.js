// @flow

// Load configuration file, set up execution context and start the server. 

const logComponent = require('components/utils').logging;
const business = require('components/business');
const storage = require('components/storage');

const Context = require('./context');
const Settings = require('./Settings');
const Server = require('./Server'); 

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
function createContext(logFactory: LogFactory): Context {
  const influx = new business.series.InfluxConnection(
    {host: 'localhost'}, logFactory('influx')); 
  
  const logAdapter = { getLogger: (name) => logFactory(name) };
  const mongo = new storage.Database(
    {host: 'localhost', port: 27017}, logAdapter);
    
  return new Context(influx, mongo);
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
    this.context = createContext(this.logFactory);

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
