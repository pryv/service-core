// @flow

const debug = require('debug')('child_process');
const bluebird = require('bluebird');

const Application = require('../../src/application');
const Settings = require('../../src/settings');
const { InfluxRowType, TypeRepository } = require('components/business').types;
const ChildProcess = require('components/test-helpers').child_process;

import type {MetadataRepository} from '../../src/metadata_cache';

const typeRepo = new TypeRepository(); 

class ApplicationLauncher {
  app: ?Application; 
  
  constructor() {
    this.app = null; 
  }
  
  // Gets called by the test process to mock out authentication and allow everyone
  // access. 
  // 
  mockAuthentication(allowAll: boolean) {
    const app = this.app; 
    if (app == null) throw new Error('AF: app should not be null anymore');
    
    const context = app.context; 
    
    context.metadata = this.produceMetadataLoader(allowAll);
  }
  produceMetadataLoader(authTokenValid=true): MetadataRepository {
    const seriesMeta = {
      canWrite: () => authTokenValid,
      canRead: () => authTokenValid, 
      namespaceAndName: () => ['test', 'foo'],
      produceRowType: () => new InfluxRowType(typeRepo.lookup('mass/kg')),
    };
    return {
      forSeries: function forSeries() { return bluebird.resolve(seriesMeta); }
    };
  }

  launch(injectSettings: {}) {
    const settings = new Settings(); 
    settings.loadFromFile('config/dev.json');
    settings.loadFromObject(injectSettings);
    
    debug(settings.get('http.port').num());
    
    const app = this.app = new Application();
    app.init(settings);
    app.start(); 
  }
}

const appLauncher = new ApplicationLauncher(); 
const childProcess = new ChildProcess(appLauncher);
childProcess.run();
