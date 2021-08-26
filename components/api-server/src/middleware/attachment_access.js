/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const lodash = require('lodash');

const storage = require('storage');
const errors = require('errors').factory;

const config = require('@pryv/boiler').getConfigUnsafe(true);
const pathForAttachment = require('business').users.UserLocalDirectory.pathForAttachment;

// -- Audit 
const isAuditActive = (!  config.get('openSource:isActive')) && config.get('audit:active');
let audit;
if (isAuditActive) {
  const throwIfMethodIsNotDeclared = require('audit/src/ApiMethods').throwIfMethodIsNotDeclared;
  throwIfMethodIsNotDeclared('events.getAttachment');
  audit = require('audit');
}
// -- end Audit

const fs = require('fs');
const path = require('path');

function middlewareFactory(userEventsStorage: storage.user.Events) {
  return lodash.partial(attachmentsAccessMiddleware, userEventsStorage);
}
module.exports = middlewareFactory;

// mapping algo codes to https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Digest supported codes
const algoMap = {
  sha256: 'SHA-256',
  sha512: 'SHA-512',
  sha1: 'SHA',
  sha: 'SHA',
  md5: 'MD5'
}

// A middleware that checks permissions to access the file attachment, then
// translates the request's resource path to match the actual physical path for
// static-serving the file.
// 
async function attachmentsAccessMiddleware(userEventsStorage, req, res, next) {
  userEventsStorage.findOne(req.context.user, {id: req.params.id}, null, async function (err, event) {
    const _ = lodash; 
    
    if (err) {
      return next(errors.unexpectedError(err));
    }
    if (! event) {
      return next(errors.unknownResource('event', req.params.id));
    }
    let canReadEvent = false;
    for (let i = 0; i < event.streamIds.length ; i++) {
      if (await req.context.access.canGetEventsOnStream(event.streamIds[i], 'local')) {
        canReadEvent = true;
        break;
      }
    }
    if (! canReadEvent) {
      return next(errors.forbidden());
    }

    // set response content type (we can't rely on the filename)
    const attachment = event.attachments ?
      _.find(event.attachments, {id: req.params.fileId}) : null;
    if (! attachment) {
      return next(errors.unknownResource(
        'attachment', req.params.fileId
      ));
    }
    res.header('Content-Type', attachment.type);
    res.header('Content-Length', attachment.size);
    res.header('Content-Disposition', 'attachment; filename="' + attachment.fileName + '"');
    if (attachment.integrity) {
      const splitAt = attachment.integrity.indexOf('-');
      const algo = attachment.integrity.substr(0, splitAt);
      const sum = attachment.integrity.substr(splitAt + 1);
      const digestAlgo = algoMap[algo];
      if (digestAlgo != null) {
        res.header('Digest', digestAlgo + '=' + sum);
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
      } catch(e) {}
      // error audit is taken in charge by express error management
      next(err);
    });
    pipedStream.on('finish', async (a) => {
      if (streamHasErrors) return;
      if (isAuditActive) await audit.validApiCall(req.context, null);
      // do not call "next()" 
    });
  });
}
