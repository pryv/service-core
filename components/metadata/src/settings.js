
// @flow

const lodash = require('lodash');

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
  
  constructor() {
    this.config = this.defaults();
  }
  defaults() {
    return {
      logs: {
        // If you add something here, you might also want to include it into 
        // the #getLogSettingsObject return value below.
        prefix: '',
        console: { active: true, level: 'debug', colorize: true }, 
        file: { active: false },
      }
    };
  }
  
  get(key: string): ConfigValue {
    const config = this.config;
    
    if (! lodash.has(config, key)) return new MissingValue(key);

    const val = lodash.get(config, key);
    return new ExistingValue(key, val);
  }
  
  has(key: string): boolean {
    const config = this.config;

    return lodash.has(config, key);
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
    lodash.set(res, this.key, mapper(val));
  }
}

module.exports = Settings;

