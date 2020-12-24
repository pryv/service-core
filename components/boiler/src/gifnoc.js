function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const fs = require('fs');

const path = require('path');

const nconf = require('nconf');

nconf.formats.yaml = require('nconf-yaml');

const superagent = require('superagent');
/**
 * Default values for Logger
 */


const defaults = {
  logger: {
    console: {
      active: true,
      level: 'info',
      format: {
        color: true,
        time: true,
        aligned: true
      }
    },
    file: {
      active: true,
      filename: 'application.log'
    }
  }
};
/**
 * Config manager
 */

class Config {
  /**
   * @private
   * Init Config with Files should be called just once when starting an APP
   * @param {Object} options
   * @param {string} [options.baseConfigDir] - (optional) directory to use to look for configs
   * @param {Array<ConfigFile>} [options.extraConfigFiles] - (optional) and array of extra files to load
   * @param {Object} gniggol 
   * @param {Object} gniggol
   * @param {Function} initLoggerWithConfig - Init Logger when options are loaded
   * @returns {Config} this
   */
  initSync(options, gniggol) {
    const logger = gniggol.getReggol('config');
    const store = new nconf.Provider();
    const baseConfigDir = options.baseConfigDir || 'config';
    logger.debug('Init with baseConfigDir: ' + baseConfigDir); // get config from arguments and env variables
    // memory must come first for config.set() to work without loading config files
    // 1. `process.env`
    // 2. `process.argv`

    store.use('memory').argv().env(); // 3. Values in `config.json`

    let configFile;

    if (store.get('config')) {
      configFile = store.get('config');
    } else if (store.get('NODE_ENV')) {
      configFile = path.join(baseConfigDir, store.get('NODE_ENV') + '-config.yaml');
    }

    function loadFile(scope, filename) {
      if (fs.existsSync(filename)) {
        const options = {
          file: filename
        };

        if (filename.endsWith('.yaml')) {
          options.format = nconf.formats.yaml;
        }

        store.file(scope, options);
        logger.debug('Loaded[' + scope + '] from file: ' + filename);
      } else {
        logger.debug('Cannot find: ' + filename);
      }
    } // load default and custom config from configs/default-config.json


    const defaultsFile = path.join(baseConfigDir, 'default-config.yaml');
    loadFile('default', defaultsFile);
    loadFile('custom', configFile); // load extra config files

    if (options.extraConfigFiles) {
      options.extraConfigFiles.forEach(extra => {
        loadFile(extra.scope, extra.file);
      });
    } // add defaults value


    store.defaults(defaults);
    this.store = store;
    this.logger = logger; // init Logger 

    gniggol.initLoggerWithConfig(this);
    return this;
  }

  async initASync(options) {
    const store = this.store;
    const logger = this.logger;

    async function loadUrl(scope, key, url) {
      const res = await superagent.get(url);
      const conf = key ? {
        [key]: res.body
      } : res.body;
      store.add(scope, {
        type: 'literal',
        store: conf
      });
      logger.debug('Loaded URL: ' + url + (key ? ' under [' + key + ']' : ''));
    } // load remote config files


    if (options.extraConfigRemotes) {
      for (let extra of options.extraConfigRemotes) {
        if (extra.url) {
          await loadUrl(extra.scope, extra.key, extra.url);
        } else if (extra.fromKey) {
          const url = store.get(extra.fromKey);
          await loadUrl(extra.scope, extra.key, url);
        }
      }
    }

    return this;
  }

  constructor() {
    _defineProperty(this, "store", void 0);

    _defineProperty(this, "logger", void 0);
  }
  /**
   * Retreive value
   * @param {string} key 
   */


  get(key) {
    return this.store.get(key);
  }
  /**
   * Set value
   * @param {string} key 
   * @param {Object} value
   */


  set(key, value) {
    this.store.set(key, value);
  }

}

const config = new Config();
module.exports = config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL2NvbXBvbmVudHMvYm9pbGVyL3NyYy9naWZub2MuanMiXSwibmFtZXMiOlsiZnMiLCJyZXF1aXJlIiwicGF0aCIsIm5jb25mIiwiZm9ybWF0cyIsInlhbWwiLCJzdXBlcmFnZW50IiwiZGVmYXVsdHMiLCJsb2dnZXIiLCJjb25zb2xlIiwiYWN0aXZlIiwibGV2ZWwiLCJmb3JtYXQiLCJjb2xvciIsInRpbWUiLCJhbGlnbmVkIiwiZmlsZSIsImZpbGVuYW1lIiwiQ29uZmlnIiwiaW5pdFN5bmMiLCJvcHRpb25zIiwiZ25pZ2dvbCIsImdldFJlZ2dvbCIsInN0b3JlIiwiUHJvdmlkZXIiLCJiYXNlQ29uZmlnRGlyIiwiZGVidWciLCJ1c2UiLCJhcmd2IiwiZW52IiwiY29uZmlnRmlsZSIsImdldCIsImpvaW4iLCJsb2FkRmlsZSIsInNjb3BlIiwiZXhpc3RzU3luYyIsImVuZHNXaXRoIiwiZGVmYXVsdHNGaWxlIiwiZXh0cmFDb25maWdGaWxlcyIsImZvckVhY2giLCJleHRyYSIsImluaXRMb2dnZXJXaXRoQ29uZmlnIiwiaW5pdEFTeW5jIiwibG9hZFVybCIsImtleSIsInVybCIsInJlcyIsImNvbmYiLCJib2R5IiwiYWRkIiwidHlwZSIsImV4dHJhQ29uZmlnUmVtb3RlcyIsImZyb21LZXkiLCJjb25zdHJ1Y3RvciIsInNldCIsInZhbHVlIiwiY29uZmlnIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxFQUFFLEdBQUdDLE9BQU8sQ0FBQyxJQUFELENBQWxCOztBQUNBLE1BQU1DLElBQUksR0FBR0QsT0FBTyxDQUFDLE1BQUQsQ0FBcEI7O0FBRUEsTUFBTUUsS0FBSyxHQUFHRixPQUFPLENBQUMsT0FBRCxDQUFyQjs7QUFDQUUsS0FBSyxDQUFDQyxPQUFOLENBQWNDLElBQWQsR0FBcUJKLE9BQU8sQ0FBQyxZQUFELENBQTVCOztBQUVBLE1BQU1LLFVBQVUsR0FBR0wsT0FBTyxDQUFDLFlBQUQsQ0FBMUI7QUFHQTtBQUNBO0FBQ0E7OztBQUNBLE1BQU1NLFFBQVEsR0FBRztBQUNmQyxFQUFBQSxNQUFNLEVBQUU7QUFDTkMsSUFBQUEsT0FBTyxFQUFFO0FBQ1BDLE1BQUFBLE1BQU0sRUFBRSxJQUREO0FBRVBDLE1BQUFBLEtBQUssRUFBRSxNQUZBO0FBR1BDLE1BQUFBLE1BQU0sRUFBRTtBQUNOQyxRQUFBQSxLQUFLLEVBQUUsSUFERDtBQUVOQyxRQUFBQSxJQUFJLEVBQUUsSUFGQTtBQUdOQyxRQUFBQSxPQUFPLEVBQUU7QUFISDtBQUhELEtBREg7QUFVTkMsSUFBQUEsSUFBSSxFQUFFO0FBQ0pOLE1BQUFBLE1BQU0sRUFBRSxJQURKO0FBRUpPLE1BQUFBLFFBQVEsRUFBRTtBQUZOO0FBVkE7QUFETyxDQUFqQjtBQW9CQTtBQUNBO0FBQ0E7O0FBQ0EsTUFBTUMsTUFBTixDQUFhO0FBSVg7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNFQyxFQUFBQSxRQUFRLENBQUNDLE9BQUQsRUFBVUMsT0FBVixFQUFtQjtBQUN6QixVQUFNYixNQUFNLEdBQUdhLE9BQU8sQ0FBQ0MsU0FBUixDQUFrQixRQUFsQixDQUFmO0FBQ0EsVUFBTUMsS0FBSyxHQUFHLElBQUlwQixLQUFLLENBQUNxQixRQUFWLEVBQWQ7QUFFQSxVQUFNQyxhQUFhLEdBQUdMLE9BQU8sQ0FBQ0ssYUFBUixJQUF5QixRQUEvQztBQUNBakIsSUFBQUEsTUFBTSxDQUFDa0IsS0FBUCxDQUFhLDhCQUE4QkQsYUFBM0MsRUFMeUIsQ0FNekI7QUFDQTtBQUNBO0FBQ0E7O0FBQ0FGLElBQUFBLEtBQUssQ0FBQ0ksR0FBTixDQUFVLFFBQVYsRUFBb0JDLElBQXBCLEdBQTJCQyxHQUEzQixHQVZ5QixDQVl6Qjs7QUFDQSxRQUFJQyxVQUFKOztBQUNBLFFBQUlQLEtBQUssQ0FBQ1EsR0FBTixDQUFVLFFBQVYsQ0FBSixFQUF5QjtBQUN2QkQsTUFBQUEsVUFBVSxHQUFHUCxLQUFLLENBQUNRLEdBQU4sQ0FBVSxRQUFWLENBQWI7QUFDRCxLQUZELE1BRU8sSUFBSVIsS0FBSyxDQUFDUSxHQUFOLENBQVUsVUFBVixDQUFKLEVBQTJCO0FBQ2hDRCxNQUFBQSxVQUFVLEdBQUc1QixJQUFJLENBQUM4QixJQUFMLENBQVVQLGFBQVYsRUFBeUJGLEtBQUssQ0FBQ1EsR0FBTixDQUFVLFVBQVYsSUFBd0IsY0FBakQsQ0FBYjtBQUNEOztBQUdELGFBQVNFLFFBQVQsQ0FBa0JDLEtBQWxCLEVBQXlCakIsUUFBekIsRUFBbUM7QUFDakMsVUFBSWpCLEVBQUUsQ0FBQ21DLFVBQUgsQ0FBY2xCLFFBQWQsQ0FBSixFQUE2QjtBQUMzQixjQUFNRyxPQUFPLEdBQUc7QUFBRUosVUFBQUEsSUFBSSxFQUFFQztBQUFSLFNBQWhCOztBQUNBLFlBQUlBLFFBQVEsQ0FBQ21CLFFBQVQsQ0FBa0IsT0FBbEIsQ0FBSixFQUFnQztBQUFFaEIsVUFBQUEsT0FBTyxDQUFDUixNQUFSLEdBQWlCVCxLQUFLLENBQUNDLE9BQU4sQ0FBY0MsSUFBL0I7QUFBcUM7O0FBQ3ZFa0IsUUFBQUEsS0FBSyxDQUFDUCxJQUFOLENBQVdrQixLQUFYLEVBQWtCZCxPQUFsQjtBQUNBWixRQUFBQSxNQUFNLENBQUNrQixLQUFQLENBQWEsWUFBWVEsS0FBWixHQUFvQixlQUFwQixHQUFzQ2pCLFFBQW5EO0FBQ0QsT0FMRCxNQUtPO0FBQ0xULFFBQUFBLE1BQU0sQ0FBQ2tCLEtBQVAsQ0FBYSxrQkFBa0JULFFBQS9CO0FBQ0Q7QUFDRixLQTlCd0IsQ0FnQ3pCOzs7QUFDQSxVQUFNb0IsWUFBWSxHQUFHbkMsSUFBSSxDQUFDOEIsSUFBTCxDQUFVUCxhQUFWLEVBQXlCLHFCQUF6QixDQUFyQjtBQUNBUSxJQUFBQSxRQUFRLENBQUMsU0FBRCxFQUFZSSxZQUFaLENBQVI7QUFDQUosSUFBQUEsUUFBUSxDQUFDLFFBQUQsRUFBV0gsVUFBWCxDQUFSLENBbkN5QixDQXFDekI7O0FBQ0EsUUFBSVYsT0FBTyxDQUFDa0IsZ0JBQVosRUFBOEI7QUFDNUJsQixNQUFBQSxPQUFPLENBQUNrQixnQkFBUixDQUF5QkMsT0FBekIsQ0FBa0NDLEtBQUQsSUFBVztBQUMxQ1AsUUFBQUEsUUFBUSxDQUFDTyxLQUFLLENBQUNOLEtBQVAsRUFBY00sS0FBSyxDQUFDeEIsSUFBcEIsQ0FBUjtBQUNELE9BRkQ7QUFHRCxLQTFDd0IsQ0E0Q3pCOzs7QUFDQU8sSUFBQUEsS0FBSyxDQUFDaEIsUUFBTixDQUFlQSxRQUFmO0FBQ0EsU0FBS2dCLEtBQUwsR0FBYUEsS0FBYjtBQUNBLFNBQUtmLE1BQUwsR0FBY0EsTUFBZCxDQS9DeUIsQ0FpRHpCOztBQUNBYSxJQUFBQSxPQUFPLENBQUNvQixvQkFBUixDQUE2QixJQUE3QjtBQUNBLFdBQU8sSUFBUDtBQUNEOztBQUVELFFBQU1DLFNBQU4sQ0FBZ0J0QixPQUFoQixFQUF5QjtBQUN2QixVQUFNRyxLQUFLLEdBQUcsS0FBS0EsS0FBbkI7QUFDQSxVQUFNZixNQUFNLEdBQUcsS0FBS0EsTUFBcEI7O0FBRUEsbUJBQWVtQyxPQUFmLENBQXVCVCxLQUF2QixFQUE4QlUsR0FBOUIsRUFBbUNDLEdBQW5DLEVBQXdDO0FBQ3RDLFlBQU1DLEdBQUcsR0FBRyxNQUFNeEMsVUFBVSxDQUFDeUIsR0FBWCxDQUFlYyxHQUFmLENBQWxCO0FBQ0EsWUFBTUUsSUFBSSxHQUFHSCxHQUFHLEdBQUc7QUFBQyxTQUFDQSxHQUFELEdBQU9FLEdBQUcsQ0FBQ0U7QUFBWixPQUFILEdBQXVCRixHQUFHLENBQUNFLElBQTNDO0FBQ0F6QixNQUFBQSxLQUFLLENBQUMwQixHQUFOLENBQVVmLEtBQVYsRUFBaUI7QUFBRWdCLFFBQUFBLElBQUksRUFBRSxTQUFSO0FBQW1CM0IsUUFBQUEsS0FBSyxFQUFFd0I7QUFBMUIsT0FBakI7QUFDQXZDLE1BQUFBLE1BQU0sQ0FBQ2tCLEtBQVAsQ0FBYSxpQkFBaUJtQixHQUFqQixJQUF3QkQsR0FBRyxHQUFHLGFBQWFBLEdBQWIsR0FBbUIsR0FBdEIsR0FBNEIsRUFBdkQsQ0FBYjtBQUNELEtBVHNCLENBV3ZCOzs7QUFDQSxRQUFJeEIsT0FBTyxDQUFDK0Isa0JBQVosRUFBZ0M7QUFDOUIsV0FBSyxJQUFJWCxLQUFULElBQWtCcEIsT0FBTyxDQUFDK0Isa0JBQTFCLEVBQThDO0FBQzVDLFlBQUlYLEtBQUssQ0FBQ0ssR0FBVixFQUFlO0FBQ2IsZ0JBQU1GLE9BQU8sQ0FBQ0gsS0FBSyxDQUFDTixLQUFQLEVBQWNNLEtBQUssQ0FBQ0ksR0FBcEIsRUFBeUJKLEtBQUssQ0FBQ0ssR0FBL0IsQ0FBYjtBQUNELFNBRkQsTUFFTyxJQUFJTCxLQUFLLENBQUNZLE9BQVYsRUFBbUI7QUFDeEIsZ0JBQU1QLEdBQUcsR0FBR3RCLEtBQUssQ0FBQ1EsR0FBTixDQUFVUyxLQUFLLENBQUNZLE9BQWhCLENBQVo7QUFDQSxnQkFBTVQsT0FBTyxDQUFDSCxLQUFLLENBQUNOLEtBQVAsRUFBY00sS0FBSyxDQUFDSSxHQUFwQixFQUF5QkMsR0FBekIsQ0FBYjtBQUNEO0FBQ0Y7QUFDRjs7QUFFRCxXQUFPLElBQVA7QUFDRDs7QUFFRFEsRUFBQUEsV0FBVyxHQUFHO0FBQUE7O0FBQUE7QUFFYjtBQUVEO0FBQ0Y7QUFDQTtBQUNBOzs7QUFDRXRCLEVBQUFBLEdBQUcsQ0FBQ2EsR0FBRCxFQUFNO0FBQ1AsV0FBTyxLQUFLckIsS0FBTCxDQUFXUSxHQUFYLENBQWVhLEdBQWYsQ0FBUDtBQUNEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VVLEVBQUFBLEdBQUcsQ0FBQ1YsR0FBRCxFQUFNVyxLQUFOLEVBQWE7QUFDZCxTQUFLaEMsS0FBTCxDQUFXK0IsR0FBWCxDQUFlVixHQUFmLEVBQW9CVyxLQUFwQjtBQUNEOztBQWxIVTs7QUFxSGIsTUFBTUMsTUFBTSxHQUFHLElBQUl0QyxNQUFKLEVBQWY7QUFFQXVDLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQkYsTUFBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKEMpIDIwMjAgUHJ5diBTLkEuIGh0dHBzOi8vcHJ5di5jb20gLSBBbGwgUmlnaHRzIFJlc2VydmVkXG4gKiBVbmF1dGhvcml6ZWQgY29weWluZyBvZiB0aGlzIGZpbGUsIHZpYSBhbnkgbWVkaXVtIGlzIHN0cmljdGx5IHByb2hpYml0ZWRcbiAqIFByb3ByaWV0YXJ5IGFuZCBjb25maWRlbnRpYWxcbiAqL1xuY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcblxuY29uc3QgbmNvbmYgPSByZXF1aXJlKCduY29uZicpO1xubmNvbmYuZm9ybWF0cy55YW1sID0gcmVxdWlyZSgnbmNvbmYteWFtbCcpO1xuXG5jb25zdCBzdXBlcmFnZW50ID0gcmVxdWlyZSgnc3VwZXJhZ2VudCcpO1xuXG5cbi8qKlxuICogRGVmYXVsdCB2YWx1ZXMgZm9yIExvZ2dlclxuICovXG5jb25zdCBkZWZhdWx0cyA9IHtcbiAgbG9nZ2VyOiB7XG4gICAgY29uc29sZToge1xuICAgICAgYWN0aXZlOiB0cnVlLFxuICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgIGZvcm1hdDoge1xuICAgICAgICBjb2xvcjogdHJ1ZSxcbiAgICAgICAgdGltZTogdHJ1ZSxcbiAgICAgICAgYWxpZ25lZDogdHJ1ZVxuICAgICAgfVxuICAgIH0sXG4gICAgZmlsZToge1xuICAgICAgYWN0aXZlOiB0cnVlLFxuICAgICAgZmlsZW5hbWU6ICdhcHBsaWNhdGlvbi5sb2cnXG4gICAgfVxuICB9XG59O1xuXG5cblxuLyoqXG4gKiBDb25maWcgbWFuYWdlclxuICovXG5jbGFzcyBDb25maWcge1xuICBzdG9yZTtcbiAgbG9nZ2VyO1xuXG4gIC8qKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBJbml0IENvbmZpZyB3aXRoIEZpbGVzIHNob3VsZCBiZSBjYWxsZWQganVzdCBvbmNlIHdoZW4gc3RhcnRpbmcgYW4gQVBQXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBbb3B0aW9ucy5iYXNlQ29uZmlnRGlyXSAtIChvcHRpb25hbCkgZGlyZWN0b3J5IHRvIHVzZSB0byBsb29rIGZvciBjb25maWdzXG4gICAqIEBwYXJhbSB7QXJyYXk8Q29uZmlnRmlsZT59IFtvcHRpb25zLmV4dHJhQ29uZmlnRmlsZXNdIC0gKG9wdGlvbmFsKSBhbmQgYXJyYXkgb2YgZXh0cmEgZmlsZXMgdG8gbG9hZFxuICAgKiBAcGFyYW0ge09iamVjdH0gZ25pZ2dvbCBcbiAgICogQHBhcmFtIHtPYmplY3R9IGduaWdnb2xcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gaW5pdExvZ2dlcldpdGhDb25maWcgLSBJbml0IExvZ2dlciB3aGVuIG9wdGlvbnMgYXJlIGxvYWRlZFxuICAgKiBAcmV0dXJucyB7Q29uZmlnfSB0aGlzXG4gICAqL1xuICBpbml0U3luYyhvcHRpb25zLCBnbmlnZ29sKSB7XG4gICAgY29uc3QgbG9nZ2VyID0gZ25pZ2dvbC5nZXRSZWdnb2woJ2NvbmZpZycpO1xuICAgIGNvbnN0IHN0b3JlID0gbmV3IG5jb25mLlByb3ZpZGVyKCk7XG5cbiAgICBjb25zdCBiYXNlQ29uZmlnRGlyID0gb3B0aW9ucy5iYXNlQ29uZmlnRGlyIHx8wqAnY29uZmlnJztcbiAgICBsb2dnZXIuZGVidWcoJ0luaXQgd2l0aCBiYXNlQ29uZmlnRGlyOiAnICsgYmFzZUNvbmZpZ0RpcilcbiAgICAvLyBnZXQgY29uZmlnIGZyb20gYXJndW1lbnRzIGFuZCBlbnYgdmFyaWFibGVzXG4gICAgLy8gbWVtb3J5IG11c3QgY29tZSBmaXJzdCBmb3IgY29uZmlnLnNldCgpIHRvIHdvcmsgd2l0aG91dCBsb2FkaW5nIGNvbmZpZyBmaWxlc1xuICAgIC8vIDEuIGBwcm9jZXNzLmVudmBcbiAgICAvLyAyLiBgcHJvY2Vzcy5hcmd2YFxuICAgIHN0b3JlLnVzZSgnbWVtb3J5JykuYXJndigpLmVudigpO1xuICAgIFxuICAgIC8vIDMuIFZhbHVlcyBpbiBgY29uZmlnLmpzb25gXG4gICAgbGV0IGNvbmZpZ0ZpbGU7XG4gICAgaWYgKHN0b3JlLmdldCgnY29uZmlnJykpIHtcbiAgICAgIGNvbmZpZ0ZpbGUgPSBzdG9yZS5nZXQoJ2NvbmZpZycpXG4gICAgfSBlbHNlIGlmIChzdG9yZS5nZXQoJ05PREVfRU5WJykpIHtcbiAgICAgIGNvbmZpZ0ZpbGUgPSBwYXRoLmpvaW4oYmFzZUNvbmZpZ0Rpciwgc3RvcmUuZ2V0KCdOT0RFX0VOVicpICsgJy1jb25maWcueWFtbCcpO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gbG9hZEZpbGUoc2NvcGUsIGZpbGVuYW1lKSB7XG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhmaWxlbmFtZSkpIHtcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IHsgZmlsZTogZmlsZW5hbWUgfVxuICAgICAgICBpZiAoZmlsZW5hbWUuZW5kc1dpdGgoJy55YW1sJykpIHsgb3B0aW9ucy5mb3JtYXQgPSBuY29uZi5mb3JtYXRzLnlhbWwgfVxuICAgICAgICBzdG9yZS5maWxlKHNjb3BlLCBvcHRpb25zKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdMb2FkZWRbJyArIHNjb3BlICsgJ10gZnJvbSBmaWxlOiAnICsgZmlsZW5hbWUpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ0Nhbm5vdCBmaW5kOiAnICsgZmlsZW5hbWUpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gbG9hZCBkZWZhdWx0IGFuZCBjdXN0b20gY29uZmlnIGZyb20gY29uZmlncy9kZWZhdWx0LWNvbmZpZy5qc29uXG4gICAgY29uc3QgZGVmYXVsdHNGaWxlID0gcGF0aC5qb2luKGJhc2VDb25maWdEaXIsICdkZWZhdWx0LWNvbmZpZy55YW1sJyk7XG4gICAgbG9hZEZpbGUoJ2RlZmF1bHQnLCBkZWZhdWx0c0ZpbGUpO1xuICAgIGxvYWRGaWxlKCdjdXN0b20nLCBjb25maWdGaWxlKTtcblxuICAgIC8vIGxvYWQgZXh0cmEgY29uZmlnIGZpbGVzXG4gICAgaWYgKG9wdGlvbnMuZXh0cmFDb25maWdGaWxlcykge1xuICAgICAgb3B0aW9ucy5leHRyYUNvbmZpZ0ZpbGVzLmZvckVhY2goKGV4dHJhKSA9PiB7IFxuICAgICAgICBsb2FkRmlsZShleHRyYS5zY29wZSwgZXh0cmEuZmlsZSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBhZGQgZGVmYXVsdHMgdmFsdWVcbiAgICBzdG9yZS5kZWZhdWx0cyhkZWZhdWx0cyk7XG4gICAgdGhpcy5zdG9yZSA9IHN0b3JlO1xuICAgIHRoaXMubG9nZ2VyID0gbG9nZ2VyO1xuICAgIFxuICAgIC8vIGluaXQgTG9nZ2VyIFxuICAgIGduaWdnb2wuaW5pdExvZ2dlcldpdGhDb25maWcodGhpcyk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBhc3luYyBpbml0QVN5bmMob3B0aW9ucykge1xuICAgIGNvbnN0IHN0b3JlID0gdGhpcy5zdG9yZTtcbiAgICBjb25zdCBsb2dnZXIgPSB0aGlzLmxvZ2dlcjtcblxuICAgIGFzeW5jIGZ1bmN0aW9uIGxvYWRVcmwoc2NvcGUsIGtleSwgdXJsKSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBzdXBlcmFnZW50LmdldCh1cmwpO1xuICAgICAgY29uc3QgY29uZiA9IGtleSA/IHtba2V5XTogcmVzLmJvZHl9IDogcmVzLmJvZHk7XG4gICAgICBzdG9yZS5hZGQoc2NvcGUsIHsgdHlwZTogJ2xpdGVyYWwnLCBzdG9yZTogY29uZiB9KTtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnTG9hZGVkIFVSTDogJyArIHVybCArIChrZXkgPyAnIHVuZGVyIFsnICsga2V5ICsgJ10nIDogJycpKTtcbiAgICB9XG5cbiAgICAvLyBsb2FkIHJlbW90ZSBjb25maWcgZmlsZXNcbiAgICBpZiAob3B0aW9ucy5leHRyYUNvbmZpZ1JlbW90ZXMpIHtcbiAgICAgIGZvciAobGV0IGV4dHJhIG9mIG9wdGlvbnMuZXh0cmFDb25maWdSZW1vdGVzKSB7IFxuICAgICAgICBpZiAoZXh0cmEudXJsKSB7XG4gICAgICAgICAgYXdhaXQgbG9hZFVybChleHRyYS5zY29wZSwgZXh0cmEua2V5LCBleHRyYS51cmwpO1xuICAgICAgICB9IGVsc2UgaWYgKGV4dHJhLmZyb21LZXkpIHtcbiAgICAgICAgICBjb25zdCB1cmwgPSBzdG9yZS5nZXQoZXh0cmEuZnJvbUtleSk7XG4gICAgICAgICAgYXdhaXQgbG9hZFVybChleHRyYS5zY29wZSwgZXh0cmEua2V5LCB1cmwpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXRyZWl2ZSB2YWx1ZVxuICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IFxuICAgKi9cbiAgZ2V0KGtleSkge1xuICAgIHJldHVybiB0aGlzLnN0b3JlLmdldChrZXkpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldCB2YWx1ZVxuICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IFxuICAgKiBAcGFyYW0ge09iamVjdH0gdmFsdWVcbiAgICovXG4gIHNldChrZXksIHZhbHVlKSB7XG4gICAgdGhpcy5zdG9yZS5zZXQoa2V5LCB2YWx1ZSk7XG4gIH1cbn1cblxuY29uc3QgY29uZmlnID0gbmV3IENvbmZpZygpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNvbmZpZzsiXX0=
//# sourceMappingURL=gifnoc.js.map