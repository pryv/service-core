
const request = require('superagent');
const url = require('url');
const fs = require('fs');
const path = require('path');

let serviceInfo = null;

class ServiceInfo {

  static async loadFromUrl(serviceInfoUrl) {
    if (serviceInfoUrl != null && serviceInfoUrl.startsWith('file://')) {
      serviceInfoUrl = path.resolve(__dirname, serviceInfoUrl.substring(7));
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
      console.error('Failed fetching "serviceInfoUrl" or "services.register.url" ' + serviceInfoUrl + ' with error' + error.message);
      process.exit(2);
      return null;
    }
    serviceInfo = result;
    return serviceInfo;
  }

  async  get() {
    return serviceInfo;
  }
}

module.exports = ServiceInfo;