/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');

const errors = require('errors').factory;

const { getConfig } = require('@pryv/boiler');
const pathForAttachment = require('business').users.UserLocalDirectory.pathForAttachment;
const getHTTPDigestHeaderForAttachment = require('business').integrity.attachments.getHTTPDigestHeaderForAttachment;
const { getMall } = require('mall');

const fs = require('fs');
const path = require('path');

let initialized = false;
let config = null;
let mall = null;
let isAuditActive = false;
let audit = null;

async function middlewareFactory() {
  if (initialized) return attachmentsAccessMiddleware;

  config = await getConfig();
  mall = await getMall();

  // -- Audit 
  isAuditActive = (!config.get('openSource:isActive')) && config.get('audit:active');
  if (isAuditActive) {
    const throwIfMethodIsNotDeclared = require('audit/src/ApiMethods').throwIfMethodIsNotDeclared;
    throwIfMethodIsNotDeclared('events.getAttachment');
    audit = require('audit');
  }
  // -- end Audit
  initialized = true;
  return attachmentsAccessMiddleware
}
module.exports = middlewareFactory;

// A middleware that checks permissions to access the file attachment, then
// translates the request's resource path to match the actual physical path for
// static-serving the file.
// 
async function attachmentsAccessMiddleware(req, res, next) {
  const event = await mall.events.getOne(req.context.user, req.params.id);

  if (!event) {
    return next(errors.unknownResource('event', req.params.id));
  }
  let canReadEvent = false;
  for (let i = 0; i < event.streamIds.length; i++) {
    if (await req.context.access.canGetEventsOnStream(event.streamIds[i], 'local')) {
      canReadEvent = true;
      break;
    }
  }
  if (!canReadEvent) {
    return next(errors.forbidden());
  }

  // set response content type (we can't rely on the filename)
  const attachment = event.attachments ?
    _.find(event.attachments, { id: req.params.fileId }) : null;
  if (!attachment) {
    return next(errors.unknownResource(
      'attachment', req.params.fileId
    ));
  }
  res.header('Content-Type', attachment.type);
  res.header('Content-Length', attachment.size);
  res.header('Content-Disposition', 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(attachment.fileName));
  if (attachment.integrity != null) {
    const digest = getHTTPDigestHeaderForAttachment(attachment.integrity)
    if (digest != null) {
      res.header('Digest', digest);
    }
  }
  const fullPath = pathForAttachment(req.context.user.id, req.params.id, req.params.fileId);
  const fsReadStream = fs.createReadStream(fullPath);

  // for Audit
  req.context.originalQuery = req.params;

  const pipedStream = fsReadStream.pipe(res);
  let streamHasErrors = false;
  fsReadStream.on('error', async (err) => {
    streamHasErrors = true;
    try {
      fsReadStream.unpipe(res);
    } catch (e) { }
    // error audit is taken in charge by express error management
    next(err);
  });
  pipedStream.on('finish', async (a) => {
    if (streamHasErrors) return;
    if (isAuditActive) await audit.validApiCall(req.context, null);
    // do not call "next()" 
  });
}
