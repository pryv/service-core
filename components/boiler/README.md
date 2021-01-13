# Pryv base utils for Node.js application

## Usage

### config

```javascript
const { getConfig } = require('./utils/config');

// ...
   
   const config = await getConfig();

   const value = config.get('key'); // to get a setting

   config.set('key', value); // to change or set a setting
```

Config will look for configurations files in `./configs`.

It will load `./configs/default-config.yaml` if present.

Depending on `NODE_ENV` environement value, will load the corresponding `./configs/${NODE_ENV}-config.yaml` file unless the application if the application is loaded with `--config=<config file>`

### logging 

**Logs**
```javascript
const logger = require('./utils/logging');

logger.info('Message', item1, ...); // standard log
logger.warn('Message', item1, ...); // warning
logger.error('Message', item1, ...); // warning
```

**Debug**

Base on [debug](https://www.npmjs.com/package/debug)

example `DEBUG="*" node app.js` to get all debug lines


```javascript
const logger = require('./utils/logging');
const reggol =logger.produceDebugger('Name');

debug('Hello'); // output > Name Hello

const subDebug = debug.produceDebugger('SubName');

subDebug('Hello');  // output > Name:SubName Hello

```

`DEBUG="Name*" node app.js` to get all debug lines of `Name` and sub-debugs.

A gobal namespace can be set at entry point of the Application with:

```javascript
const logger = require('./utils/logging');
logger.setGlobalName('SACS'); 
```
