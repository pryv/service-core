# Pryv base utils for Node.js application

## Usage

#### Initialization

The "boiler" must me initialized before invoking `getConfig` or `getLogger`. This will set the application name and configuration files information.

```javascript
require('boiler').init({
  appName: 'my-app', // This will will be prefixed to any log messages
  baseConfigDir: path.resolve(__dirname, '../config'),
  extraConfigs: [{
    scope: 'extra-config',
    file: path.resolve(__dirname, '../config/extras.js')
  }]
});
```

### Config

#### Base Config Directory structure

During initialization `default-config.yaml` and `${NODE_ENV}-config.yaml` will be loaded if present in `baseConfigDir`.

#### Configuration loading order and priorities.

Based on [nconf](https://www.npmjs.com/package/nconf) the configuration order is important.

Each configuration has a is loaded under a "scope" name. This scope name can be used to replace a configuration content at any point of time in the configuration list.

<u>The configuration contents are loaded in the following order:</u>

- **1- 'test'** -> empty slot reserved for tests to override any other config parameter
- **2- 'argv'** -> Loaded from arguments
- **3- 'env'** -> Loaded from environment variables 
- **4- 'base'** -> Loaded from `${NODE_ENV}-config.yaml` (if present) or --config parameters
- **5 and next** -> Loaded from extras 
- **end** 
  - **'default-file'** -> Loaded from `${baseConfigDir}/default-config.yaml`
  - **'defaults'** -> Hard-coded defaults for logger

#### Extra configurations

At initialization a list of extra configuration can be set or reserved. The `extraConfigs`parameter array can take any  of the following items:

- File: `{scope: <name>, file: <path to file> }` accepts `.yaml`, `.json` and `.js` files. Note `.js` content is loaded with `require(<path to file>)` 
- Data: `{scope: <name>, key: <optional key>, data: <object> }` if a `key` is provided the content of `data` will be accessible by this key otherwise the content of data is loaded at the root of the configuration.
- RemoteUrl: `{scope: <name>, key: <optional key>, url: <URL to json content> }`  The remote content of this URL will be loaded asynchronously.
- URLFromKey: `{scope: <name>, key: <optional key>, urlFromKey: <key> }` The url is obtained from a configuration item already available.

#### Working with the configuration

The configuration can be obtained in two ways:

```javascript
// synchronous loading of the configuration 
const { config } = require('boiler'); // Util the asynchronous contents such as URL are loaded, items might not be available.

// promised based loading of the configuration
const { getConfig } = require('boiler');
const config = await getConfig(); // Here we can be sure all items are fully loaded
```

Getting items.

```javascript
// configuration content is {foo: { bar: 'hello'}};
const foo = config.get('foo'); // {bar: 'hello'}
const bar = config.get('foo:bar'); // 'hello'

const barExists = config.has('bar'); // true
```

Setting items

```javascript
// configuration content is {foo: { bar: 'hello'}};
config.set('foo', 'bye bye'); // {bar: 'hello'}
const foo = config.get('foo'); // 'bye bye'
```

Changing a scope content

```javascript
// configuration content is {foo: { bar: 'hello'}};
config.get('foo'); // {bar: 'hello'}
// replace 'test' existing content (test is always present on to of the configurations list)
config.replaceScopeConfig('test', {foo: 'test'});
config.get('foo'); // 'test'
// reset content of 'test' scope
config.replaceScopeConfig('test', {});
config.get('foo'); // {bar: 'hello'}

// Note: for 'test' scope there is a sugar function with config.injectTestConfig(object)
```

### logging 

All messages are prefixed by `appName` initialization value. appName can be postfixed with a string by setting the environment variable `PRYV_BOILER_POSTFIX` this is useful when spawning several concurrent processed of the same applications.

#### **Logs**

```javascript
const {getLogger} = require('boiler');

logger.info('Message', item); // standard log
logger.warn('Message', item); // warning
logger.error('Message', item); // warning
logger.debug('Message', item); // debug

logger.getLogger('sub'); // new logger name spaced with parent, here '{appName}:boiler:sub'
```

While `info`, `warn` and `error` uses [winston](https://www.npmjs.com/package/winston) `debug` is based on [debug](https://www.npmjs.com/package/debug) package.

#### **Debug**

example `DEBUG="*" node app.js` to get all debug lines

As debug is a widely used package, you might have way more debug lines than you expect.

The `appName` property can be used to filter only debug lines from your application. 

#### Log configuration sample

```javascript
logs: {
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
      path: 'application.log'
    }
  }
```



