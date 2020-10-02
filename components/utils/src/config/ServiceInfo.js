/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const request = require('superagent');
const fs = require('fs');
const url = require('url');
const path = require('path');

const regPath = require('components/api-server/src/routes/Paths').Register;
const wwwPath = require('components/api-server/src/routes/Paths').WWW;

let serviceInfo = {};

const FILE_PROTOCOL = 'file://';
const FILE_PROTOCOL_LENGTH = FILE_PROTOCOL.length;
const SERVICE_INFO_PATH = '/service/info';
const REGISTER_URL_CONFIG = 'services.register.url';
const SERVICE_INFO_URL_CONFIG = 'serviceInfoUrl';
const SINGLE_NODE_VERSION_CONFIG = 'singleNode.isActive'; 
const SINGLE_NODE_PUBLIC_URL_CONFIG = 'singleNode.publicUrl';

class ServiceInfo {

  static async loadFromUrl(serviceInfoUrl) {
    if (serviceInfo[serviceInfoUrl]) return serviceInfo[serviceInfoUrl];

    if (isFileUrl(serviceInfoUrl)) {
      const filePath = stripFileProtocol(serviceInfoUrl);
      
      if (isRelativePath(filePath)) {
        const serviceCorePath = path.resolve(__dirname, '../../../../../');
        serviceInfoUrl = path.resolve(serviceCorePath, filePath);
        serviceInfoUrl = 'file://' + serviceInfoUrl;
      } else {
        // absolute path, do nothing.
      }
    }
    if (process.env.NODE_ENV !== 'test')
      console.info('Fetching serviceInfo from: ' + serviceInfoUrl);
    if (serviceInfoUrl == null) {
      console.error('Parameter "serviceInfoUrl" is undefined, set it in the configuration to allow core to provide service info');
      process.exit(2);
      return null;
    }
    let result = null;
    try {
      if (isFileUrl(serviceInfoUrl)) {
        result = JSON.parse(fs.readFileSync(stripFileProtocol(serviceInfoUrl), 'utf8'));
      } else {
        const res = await request.get(serviceInfoUrl);
        result = res.body;
      }
    } catch (error) {
      console.error('Failed fetching "serviceInfoUrl" ' + serviceInfoUrl + ' with error' + error.message);
      process.exit(2);
      return null;
    }
    serviceInfo[serviceInfoUrl] = result;
    return serviceInfo[serviceInfoUrl];
  }

  static async addToConvict(convictInstance) {

    let isSingleNode = convictInstance.get(SINGLE_NODE_VERSION_CONFIG);
    if (isSingleNode) {
      let singleNodePublicUrl = convictInstance.get(SINGLE_NODE_PUBLIC_URL_CONFIG);
      if (singleNodePublicUrl.slice(-1) === '/') singleNodePublicUrl = singleNodePublicUrl.slice(0, -1);
      convictInstance.set('service.serial', 't' + Math.round(Date.now() / 1000));
      convictInstance.set('service.api', singleNodePublicUrl + '/{username}/');
      convictInstance.set('service.register', singleNodePublicUrl + regPath + '/');
      convictInstance.set('service.access', singleNodePublicUrl + regPath + '/access/');
      convictInstance.set('service.eventTypes', 'https://api.pryv.com/event-types/flat.json');
      convictInstance.set('service.assets', {
        definitions: singleNodePublicUrl + wwwPath + '/assets/index.json',
      });
      return;
    }

    // -- from url
    let serviceInfoUrl;
    try {
      serviceInfoUrl = convictInstance.get(SERVICE_INFO_URL_CONFIG);
      // HACK: in tests, convictInstance is convict(), with bin/server it is hfs/src/config
      serviceInfoUrl = serviceInfoUrl.value || serviceInfoUrl;
    } catch (e) {
      console.info(SERVICE_INFO_URL_CONFIG + ' not provided. Falling back to ' + REGISTER_URL_CONFIG);
    }
    if (serviceInfoUrl == null) {
      try {
        serviceInfoUrl = convictInstance.get(REGISTER_URL_CONFIG);
        // HACK: in tests, convictInstance is convict(), with bin/server it is hfs/src/config
        serviceInfoUrl = serviceInfoUrl.value || serviceInfoUrl;
        serviceInfoUrl = url.resolve(serviceInfoUrl, SERVICE_INFO_PATH);
      } catch (e) {
        console.error('Configuration error: ' + REGISTER_URL_CONFIG + 
        ' not provided. Please provide either ' + REGISTER_URL_CONFIG + 
        ' or ' + SERVICE_INFO_URL_CONFIG + ' to boot service.');
      }
    }
    const serviceInfo = await ServiceInfo.loadFromUrl(serviceInfoUrl);
    convictInstance.set('service', serviceInfo);
    return;
  }
}

module.exports = ServiceInfo;

function isFileUrl(serviceInfoUrl) {
  return serviceInfoUrl.startsWith(FILE_PROTOCOL);
}

function isRelativePath(filePath) {
  return ! path.isAbsolute(filePath);
}

function stripFileProtocol(filePath) {
  return filePath.substring(FILE_PROTOCOL_LENGTH);
}