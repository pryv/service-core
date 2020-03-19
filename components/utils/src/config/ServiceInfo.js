
const request = require('superagent');
const url = require('url');
const fs = require('fs');
const path = require('path');

let serviceInfos = {};

class ServiceInfo {

  static async loadFromUrl(serviceInfoUrl) {
    if (serviceInfos[serviceInfoUrl]) return serviceInfos[serviceInfoUrl];

    if (serviceInfoUrl != null && serviceInfoUrl.startsWith('file://')) {
      const filePath = serviceInfoUrl.substring(7);
      const serviceCorePath = path.resolve(__dirname, '../../../../../');
      serviceInfoUrl = path.resolve(serviceCorePath, filePath);
      serviceInfoUrl = 'file://' + serviceInfoUrl;
    }

    serviceInfoUrl = serviceInfoUrl || url.resolve(regUrlPath.value, '/service/info');
    console.info('Fetching serviceInfo from: ' + serviceInfoUrl);
    if (serviceInfoUrl == null) {
      console.error('Parameter "serviceInfoUrl" or "services.register.url" is undefined, set it in the configuration to allow core to provide service info');
      process.exit(2);
      return null;
    }
    let result = null;
    try {
      if (serviceInfoUrl.startsWith('file://')) {
        result = JSON.parse(fs.readFileSync(serviceInfoUrl.substring(7), 'utf8'));
      } else {
        const res = await request.get(serviceInfoUrl);
        result = res.body;
      }
    } catch (error) {
      console.log(__dirname);
      console.error('Failed fetching "serviceInfoUrl" or "services.register.url" ' + serviceInfoUrl + ' with error' + error.message);
      process.exit(2);
      return null;
    }
    serviceInfos[serviceInfoUrl] = result;
    return serviceInfos[serviceInfoUrl];
  }

  static async addToConvict(convictInstance) {
    let regUrlPath = null;
    let serviceInfoUrl = null;
  
    try { 
       convictInstance.get('services.register.url');
    } catch (e) { }
    try { 
     serviceInfoUrl = convictInstance.get('serviceInfoUrl');
    } catch (e) { }
    serviceInfoUrl = serviceInfoUrl || url.resolve(regUrlPath.value, '/service/info');
    const serviceInfo = await ServiceInfo.loadFromUrl(serviceInfoUrl);
    convictInstance.set('service', serviceInfo);
    return;
  }

  async  get() {
    return serviceInfo;
  }
}

module.exports = ServiceInfo;