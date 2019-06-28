
// @flow

const fs = require('fs');

const bluebird = require('bluebird');
const _ = require('lodash');
const Hjson = require('hjson');
const YAML = require('js-yaml');

const NATS_CONNECTION_URI: string = require('components/utils').messaging.NATS_CONNECTION_URI;

const { ExistingValue, MissingValue } = require('components/utils/src/config/value');

import type { ConfigValue } from 'components/utils/src/config/value';

export interface ConfigAccess {
  has(key: string): boolean;
  get(key: string): ConfigValue;
}

// -----------------------------------------------------------------------------

// Settings of an application. 
// 
// Example:
//    
//    const val = settings.get('foo.bar.baz') // => ConfigValue
//    val.str()     // casts value to a string (or errors out).
// 
class Settings implements ConfigAccess {
  config: Object;

  // Constructs a settings object. If `override` is not null, it is merged 
  // on top of the defaults that are in place. 
  // 
  constructor(override: ?Object) {
    this.config = this.defaults();

    if (override != null)
      _.merge(this.config, override);
  }
  defaults() {
    return {
      webhooks: {
        minIntervalMs: 5000,
        maxRetries: 5,
        runsSize: 20,
      },
      logs: {
        // If you add something here, you might also want to include it into 
        // the #getLogSettingsObject return value below.
        prefix: '',
        console: { active: true, level: 'info', colorize: true },
        file: { active: false },
      },
      mongodb: {
        host: '127.0.0.1', // production will need to override this.
        port: 27017,
        name: 'pryv-node',
        authUser: '',
        authPassword: '',
      },
      nats: {
        uri: NATS_CONNECTION_URI
      }
    };
  }

  // Loads settings from the file `path` and merges them with the settings in 
  // the current instance. 
  // 
  // This uses HJSON under the covers, but will also load from YAML files. 
  //  
  //    -> https://www.npmjs.com/package/hjson
  //    -> https://www.npmjs.com/package/js-yaml
  // 
  async loadFromFile(path: string) {
    const readFile = bluebird.promisify(fs.readFile);
    const text = await readFile(path, { encoding: 'utf8' });

    let obj;

    if (path.endsWith('.yaml'))
      obj = YAML.safeLoad(text);
    else
      obj = Hjson.parse(text);

    _.merge(this.config, obj);
  }

  // Merges settings in `other` with the settings stored here. 
  // 
  merge(other: Object) {
    _.merge(this.config, other);
  }

  get(key: string): ConfigValue {
    const config = this.config;

    if (!_.has(config, key)) return new MissingValue(key);

    const val = _.get(config, key);
    return new ExistingValue(key, val);
  }

  has(key: string): boolean {
    const config = this.config;

    return _.has(config, key);
  }

  getWebhooksSettingsObject(): Object {
    return l_map('webhooks', [
      l_num('minIntervalMs'),
      l_num('maxRetries'),
    ]).apply(this);
  }

  // Compatibility layer to be able to produce the object that the logging 
  // subsystem expects. 
  // 
  getLogSettingsObject(): Object {
    return l_map('logs', [
      l_str('prefix'),
      l_bool('console.active'),
      l_str('console.level'),
      l_bool('console.colorize'),
      l_bool('file.active')
    ]).apply(this);
  }

  // Compatibility layer for setting up mongodb connections.
  // 
  getMongodbSettings(): Object {
    return l_map('mongodb', [
      l_str('host'),
      l_num('port'),
      l_str('name'),
      l_str('authUser'),
      l_str('authPassword'),
    ]).apply(this);
  }
}

// -----------------------------------------------------------------------------

// The following code implements a small system to be able to map current 
// config syntax (full path access) to old object-style access still used by 
// some of the code. 

type LValueMapper = (ConfigValue) => any;

function l_map(name: string, map: Array<LValue>): LMap {
  return new LMap(name, map);
}
function l_bool(key: string) {
  return new LValue(key, cv => cv.bool());
}
function l_str(key: string) {
  return new LValue(key, cv => cv.str());
}
function l_num(key: string) {
  return new LValue(key, cv => cv.num());
}

class LMap {
  name: string;
  map: Array<LValue>;

  constructor(name: string, map: Array<LValue>) {
    this.name = name;
    this.map = map;
  }

  apply(config: ConfigAccess) {
    const res = {};

    for (const entry of this.map) {
      entry.update(res, this.name, config);
    }

    return res;
  }
}

class LValue {
  key: string;
  mapper: LValueMapper;

  constructor(key: string, mapper: LValueMapper) {
    this.key = key;
    this.mapper = mapper;
  }

  // Updates the object given with a value at path `this.key` and with a value
  // that is produced by `this.mapper`. The `prefix` string is prepended to the
  // key and acts as a scope. Finally, `config` is the place where the values
  // come from. 
  // 
  update(res: Object, prefix: string, config: ConfigAccess) {
    const key = [prefix, this.key].join('.');
    const val = config.get(key);
    const mapper = this.mapper;
    _.set(res, this.key, mapper(val));
  }
}

module.exports = Settings;

