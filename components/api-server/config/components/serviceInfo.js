/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const request = require('superagent');
const fs = require('fs');
const url = require('url');
const path = require('path');

const Config = require('../Config');

const regPath: string = require('components/api-server/src/routes/Paths').Register;
const wwwPath: string = require('components/api-server/src/routes/Paths').WWW;

const FILE_PROTOCOL: string = 'file://';
const FILE_PROTOCOL_LENGTH: number = FILE_PROTOCOL.length;
const SERVICE_INFO_PATH: string = '/service/info';

async function asyncLoad(config: Config): Config {
  const serviceInfoUrl: string = config.get('serviceInfoUrl');

  if (process.env.NODE_ENV !== 'test')
    console.info('Fetching serviceInfo from: ' + serviceInfoUrl);

  if (serviceInfoUrl == null) {
    console.error(
      'Parameter "serviceInfoUrl" is undefined, set it in the configuration to allow core to provide service info'
    );
    process.exit(2);
    return null;
  }

  let isSingleNode: boolean = config.get('singleNode:isActive');

  try {
    let serviceInfo: ?{};
    if (isSingleNode) {
      serviceInfo = buildServiceInfo(config);
    } else if (isFileUrl(serviceInfoUrl)) {
      serviceInfo = loadFromFile(serviceInfoUrl);
    } else {
      serviceInfo = await loadFromUrl(serviceInfoUrl);
    }
    if (serviceInfo == null) {
      exitServiceInfoNotFound(serviceInfoUrl);
    }
    config.set('service', serviceInfo);
  } catch (err) {
    exitServiceInfoNotFound(serviceInfoUrl, err);
  }
  
}
module.exports.asyncLoad = asyncLoad;

function buildServiceInfo(config: {}): {} {
  let serviceInfo: {} = {};

  let dnsLessPublicUrl: string = config.get('singleNode:publicUrl');

  if (dnsLessPublicUrl == null || (typeof dnsLessPublicUrl != 'string')) {
    console.error('Core started in singleNode mode, but invalid publicUrl was set: "' + dnsLessPublicUrl + '". Exiting');
    process.exit(2);
  }

  if (dnsLessPublicUrl.slice(-1) === '/') dnsLessPublicUrl = dnsLessPublicUrl.slice(0, -1);

  serviceInfo.serial = 't' + Math.round(Date.now() / 1000);
  serviceInfo.api = dnsLessPublicUrl + '/{username}/';
  serviceInfo.register = dnsLessPublicUrl + regPath + '/';
  serviceInfo.access = dnsLessPublicUrl + regPath + '/access/';
  serviceInfo.assets = {
    definitions: dnsLessPublicUrl + wwwPath + '/assets/index.json',
    };
  return serviceInfo;
}

async function loadFromUrl(serviceInfoUrl: string): Promise<{}> {
  const res = await request.get(serviceInfoUrl);
  return res.body;
}

function loadFromFile(serviceInfoUrl: string): {} {
  const filePath: string = stripFileProtocol(serviceInfoUrl);

  if (isRelativePath(filePath)) {
    const serviceCorePath: string = path.resolve(__dirname, '../../../../../');
    serviceInfoUrl = path.resolve(serviceCorePath, filePath);
    serviceInfoUrl = 'file://' + serviceInfoUrl;
  } else {
    // absolute path, do nothing.
  }
  const serviceInfo: {} = JSON.parse(
    fs.readFileSync(stripFileProtocol(serviceInfoUrl), 'utf8')
  );
  return serviceInfo;
}

function exitServiceInfoNotFound(serviceInfoUrl: string, err?: {}): void {
  if (err == null) err.message = 'error';
  console.error('Failed fetching serviceInfo at URL ' + serviceInfoUrl + ' with error: ' + err.message);
  process.exit(2);
}

function isFileUrl(serviceInfoUrl: string): boolean {
  return serviceInfoUrl.startsWith(FILE_PROTOCOL);
}

function isRelativePath(filePath: string): boolean {
  return !path.isAbsolute(filePath);
}

function stripFileProtocol(filePath: string): string {
  return filePath.substring(FILE_PROTOCOL_LENGTH);
}
