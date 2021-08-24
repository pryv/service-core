/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Inspired from multer/storage/DiskStorage
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const mkdirp = require('mkdirp');

function getFilename (req, file, cb) {
  crypto.randomBytes(16, function (err, raw) {
    cb(err, err ? undefined : raw.toString('hex'))
  })
}

function getDestination (req, file, cb) {
  cb(null, os.tmpdir())
}

function IntegrityDiskStorage (opts) {
  this.getFilename = (opts.filename || getFilename)

  if (typeof opts.destination === 'string') {
    mkdirp.sync(opts.destination)
    this.getDestination = function ($0, $1, cb) { cb(null, opts.destination) }
  } else {
    this.getDestination = (opts.destination || getDestination)
  }
}

let count = 0;

IntegrityDiskStorage.prototype._handleFile = function _handleFile (req, file, cb) {
  var that = this

  that.getDestination(req, file, function (err, destination) {
    if (err) return cb(err)

    that.getFilename(req, file, function (err, filename) {
      if (err) return cb(err)

      var finalPath = path.join(destination, filename)
      var outStream = fs.createWriteStream(finalPath)
      var integrityStream = new IntegrityStream('sha256');

      file.stream.pipe(integrityStream).pipe(outStream)
      outStream.on('error', cb)
      outStream.on('finish', function () {
        cb(null, {
          destination: destination,
          filename: filename,
          path: finalPath,
          size: outStream.bytesWritten,
          integrity: integrityStream.getDigest()
        })
      })
    })
  })
}

IntegrityDiskStorage.prototype._removeFile = function _removeFile (req, file, cb) {
  var path = file.path

  delete file.destination
  delete file.filename
  delete file.path

  fs.unlink(path, cb)
}

module.exports = function (opts) {
  return new IntegrityDiskStorage(opts)
}

// -- CHECKSUM STREAM 

const PassThrough = require('stream').PassThrough;

class IntegrityStream extends PassThrough {
  checksum;
  digest;
  hashOptionsAlgorythm;

  constructor(hashOptionsAlgorythm, hashOptions) {
    super();
    this.hashOptionsAlgorythm = hashOptionsAlgorythm;
    this.checksum = crypto.createHash(hashOptionsAlgorythm, hashOptions);
    this.on('finish', () => {
      this.digest = this.checksum.digest('hex')
    });
  }

  _transform(chunk, encoding, done) {
    try {
      this.checksum.update(chunk)
      this.push(chunk)
      done()
    } catch(e){
      done(e)
    }
  }

  getDigest() {
    if (this.digest == null) throw new Error('Failed computing checksum on event');
    return this.hashOptionsAlgorythm + ' ' + this.digest;
  }
}