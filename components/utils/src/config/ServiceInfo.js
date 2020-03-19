
const request = require('superagent');
const fs = require('fs');
const path = require('path');

let serviceInfo = {};

const FILE_PROTOCOL = 'file://';
const FILE_PROTOCOL_LENGTH = FILE_PROTOCOL.length;

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
    const serviceInfoUrl = convictInstance.get('serviceInfoUrl');
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