/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { getLogger } = require('@pryv/boiler');
const logger = getLogger('audit:syslog:templates');
const path = require('path');

class SyslogTransform {
  key;
  constructor (key) { this.key = key; }
  transform (userId, event) { throw ('Transform must be implemented'); }
}

/**
 * Plugin
 * Use external javascript code
 */
class Plugin extends SyslogTransform {
  plugin;

  constructor (key, format) {
    super(key);
    const rootPath = path.resolve(__dirname, '../../');
    this.plugin = require(path.resolve(rootPath, format.plugin));
    logger.debug('Loaded plugin for [' + key + ']: ' + format.plugin);
  }

  /**
   * @param {string} userId
   * @param {PryvEvent} event
   * @returns {LogItem|null} {level: .. , message: ... }  or null to skip
   */
  transform (userId, event) {
    logger.debug('Using plugin ' + this.key);
    return this.plugin(userId, event);
  }
}

/**
 * Templating
 * Transform an event into a syslog message plus level
 */
class Template extends SyslogTransform {
  template;
  level;

  constructor (key, format) {
    super(key);
    this.template = format.template;
    this.level = format.level;
    logger.debug('Loaded template for [' + key + ']: ' + format.template);
  }

  /**
   * @returns {LogItem|null}
   */
  transform (userId, event) {
    logger.debug('Using template ' + this.key);
    return {
      level: this.level,
      message: transformFromTemplate(this.template, userId, event)
    };
  }
}

/**
 * @typedef LogItem
 * @property {string} level - one of: notice, warning, error, critical, alert, emerg
 * @property {string} message
 */

/**
 * Get the Syslog string correspondig to this event
 * @param {string} userId
 * @param {PryvEvent} event
 * @returns {LogItem|null}
 */
function logForEvent (userId, event) {
  if (event.type in templates) {
    return templates[event.type].transform(userId, event);
  }
  return templates['log/default'].transform(userId, event);
}

const templates = {};
function loadTemplates (templatesFromConfig) {
  for (const key of Object.keys(templatesFromConfig)) {
    const format = templatesFromConfig[key];
    if (format.template) {
      templates['log/' + key] = new Template(key, format);
    } else if (format.plugin) {
      templates['log/' + key] = new Plugin(key, format);
    } else {
      throw ('Error: Invalid syslog fromat [' + key + '] ' + format);
    }
  }
}

module.exports = {
  loadTemplates,
  logForEvent
};

// ---- utils

/**
 * Get a syslog line from a tenplate + event + userid
 * @param {string} template - of the form "{userid} {content.message}"
 * @param {string} userId  - the userid
 * @param {PryvEvent} event
 */
function transformFromTemplate (template, userId, event) {
  logger.debug('transformFromTemplate', template);
  const result = template.replace('{userid}', userId);
  return result.replace(/{([^}]*)}/g, function (match, key) {
    let res = getKey(key, event) || match;
    if (typeof res === 'object') {
      res = JSON.stringify(res);
    }
    return res;
  });
}

/**
 * getKey('foo.bar', {foo: { bar: "I want this"}}); //=> "I want this"
 * @param {string} key
 * @param {*} obj
 */
function getKey (key, obj) {
  return key.split('.').reduce(function (a, b) {
    return a && a[b];
  }, obj);
}
