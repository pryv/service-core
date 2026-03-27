/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { createBackupWriter, createUserBackupWriter } = require('./BackupWriter');

const DEFAULT_MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB (uncompressed)

/**
 * Create a FilesystemBackupWriter.
 * @param {string} outputPath - root directory for the backup
 * @param {Object} [options]
 * @param {number} [options.maxChunkSize=52428800] - max uncompressed bytes per chunk file
 * @param {boolean} [options.compress=true] - gzip JSONL/CSV files
 * @returns {BackupWriter}
 */
module.exports.createFilesystemBackupWriter = function createFilesystemBackupWriter (outputPath, options) {
  const opts = Object.assign({ maxChunkSize: DEFAULT_MAX_CHUNK_SIZE, compress: true }, options);
  fs.mkdirSync(outputPath, { recursive: true });

  return createBackupWriter({
    async openUser (userId, username) {
      const userDir = path.join(outputPath, 'users', userId);
      fs.mkdirSync(userDir, { recursive: true });
      return createFilesystemUserBackupWriter(userDir, userId, username, opts);
    },

    async writePlatformData (data) {
      const platformDir = path.join(outputPath, 'platform');
      fs.mkdirSync(platformDir, { recursive: true });
      const filePath = path.join(platformDir, jsonlFileName('platform', opts.compress));
      await writeJsonlFile(filePath, data, opts.compress);
    },

    async writeManifest (params) {
      const manifest = {
        formatVersion: 1,
        coreVersion: params.coreVersion,
        config: params.config,
        backupType: params.backupType,
        backupTimestamp: params.backupTimestamp,
        snapshotBefore: params.snapshotBefore || null,
        users: params.userManifests,
        compressed: opts.compress
      };
      const filePath = path.join(outputPath, 'manifest.json');
      fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
    },

    async close () { /* no-op for filesystem */ }
  });
};

// ---------------------------------------------------------------------------
// FilesystemUserBackupWriter
// ---------------------------------------------------------------------------

function createFilesystemUserBackupWriter (userDir, userId, username, opts) {
  const stats = { streams: 0, accesses: 0, profile: 0, webhooks: 0, events: 0, audit: 0, series: 0, attachments: 0 };
  const chunks = {};

  return createUserBackupWriter({
    async writeStreams (items) {
      const filePath = path.join(userDir, jsonlFileName('streams', opts.compress));
      stats.streams = await writeJsonlFile(filePath, items, opts.compress);
    },

    async writeAccesses (items) {
      const filePath = path.join(userDir, jsonlFileName('accesses', opts.compress));
      stats.accesses = await writeJsonlFile(filePath, items, opts.compress);
    },

    async writeProfile (items) {
      const filePath = path.join(userDir, jsonlFileName('profile', opts.compress));
      stats.profile = await writeJsonlFile(filePath, items, opts.compress);
    },

    async writeWebhooks (items) {
      const filePath = path.join(userDir, jsonlFileName('webhooks', opts.compress));
      stats.webhooks = await writeJsonlFile(filePath, items, opts.compress);
    },

    async writeEvents (items) {
      const eventsDir = path.join(userDir, 'events');
      fs.mkdirSync(eventsDir, { recursive: true });
      const result = await writeChunkedJsonlFiles(eventsDir, 'events', items, opts);
      stats.events = result.totalCount;
      chunks.events = result.chunkFiles;
    },

    async writeAudit (items) {
      const auditDir = path.join(userDir, 'audit');
      fs.mkdirSync(auditDir, { recursive: true });
      const result = await writeChunkedJsonlFiles(auditDir, 'audit', items, opts);
      stats.audit = result.totalCount;
      chunks.audit = result.chunkFiles;
    },

    async writeSeries (items) {
      const seriesDir = path.join(userDir, 'series');
      fs.mkdirSync(seriesDir, { recursive: true });
      const ext = opts.compress ? '.csv.gz' : '.csv';
      const filePath = path.join(seriesDir, 'series' + ext);
      stats.series = await writeCsvFile(filePath, items, opts.compress);
    },

    async writeAttachment (eventId, fileId, readStream) {
      const attachDir = path.join(userDir, 'attachments');
      fs.mkdirSync(attachDir, { recursive: true });
      const filePath = path.join(attachDir, fileId);
      const writeStream = fs.createWriteStream(filePath);
      await pipeline(readStream, writeStream);
      stats.attachments++;
    },

    async writeAccountData (data) {
      const filePath = path.join(userDir, jsonlFileName('account', opts.compress));
      // Account data is a single object, not a collection — write as one JSON line
      await writeJsonlFile(filePath, [data], opts.compress);
    },

    async close () {
      const userManifest = {
        userId,
        username,
        backupTimestamp: Date.now(),
        stats,
        chunks
      };
      const filePath = path.join(userDir, 'user-manifest.json');
      fs.writeFileSync(filePath, JSON.stringify(userManifest, null, 2));
      return userManifest;
    }
  });
}

// ---------------------------------------------------------------------------
// JSONL + gzip helpers
// ---------------------------------------------------------------------------

function jsonlFileName (baseName, compress) {
  return compress ? baseName + '.jsonl.gz' : baseName + '.jsonl';
}

/**
 * Write items to a single JSONL file (optionally gzip-compressed).
 * @param {string} filePath
 * @param {AsyncIterable|Array} items
 * @param {boolean} compress
 * @returns {Promise<number>} count of items written
 */
async function writeJsonlFile (filePath, items, compress) {
  let count = 0;
  const lines = [];
  for await (const item of items) {
    lines.push(JSON.stringify(item));
    count++;
  }
  const content = lines.join('\n') + (lines.length > 0 ? '\n' : '');
  const buffer = Buffer.from(content, 'utf8');

  if (compress) {
    const compressed = zlib.gzipSync(buffer);
    fs.writeFileSync(filePath, compressed);
  } else {
    fs.writeFileSync(filePath, buffer);
  }
  return count;
}

/**
 * Write items to chunked JSONL files, splitting when uncompressed size exceeds maxChunkSize.
 * @param {string} dir - directory for chunk files
 * @param {string} baseName - e.g. 'events', 'audit'
 * @param {AsyncIterable|Array} items
 * @param {Object} opts - { maxChunkSize, compress }
 * @returns {Promise<{totalCount: number, chunkFiles: string[]}>}
 */
async function writeChunkedJsonlFiles (dir, baseName, items, opts) {
  let chunkIndex = 1;
  let currentSize = 0;
  let currentLines = [];
  let totalCount = 0;
  const chunkFiles = [];

  async function flushChunk () {
    if (currentLines.length === 0) return;
    const chunkName = `${baseName}-${String(chunkIndex).padStart(4, '0')}`;
    const fileName = jsonlFileName(chunkName, opts.compress);
    const filePath = path.join(dir, fileName);
    const content = currentLines.join('\n') + '\n';
    const buffer = Buffer.from(content, 'utf8');
    if (opts.compress) {
      fs.writeFileSync(filePath, zlib.gzipSync(buffer));
    } else {
      fs.writeFileSync(filePath, buffer);
    }
    chunkFiles.push(fileName);
    chunkIndex++;
    currentLines = [];
    currentSize = 0;
  }

  for await (const item of items) {
    const line = JSON.stringify(item);
    const lineSize = Buffer.byteLength(line, 'utf8') + 1; // +1 for newline
    if (currentSize + lineSize > opts.maxChunkSize && currentLines.length > 0) {
      await flushChunk();
    }
    currentLines.push(line);
    currentSize += lineSize;
    totalCount++;
  }
  await flushChunk();
  return { totalCount, chunkFiles };
}

/**
 * Write items to a CSV file (optionally gzip-compressed).
 * Items should have consistent keys. First item's keys become the header row.
 * @param {string} filePath
 * @param {AsyncIterable|Array} items
 * @param {boolean} compress
 * @returns {Promise<number>} count of items written
 */
async function writeCsvFile (filePath, items, compress) {
  let count = 0;
  let header = null;
  const lines = [];

  for await (const item of items) {
    if (header == null) {
      header = Object.keys(item);
      lines.push(header.join(','));
    }
    lines.push(header.map(k => csvEscape(item[k])).join(','));
    count++;
  }

  if (lines.length === 0) return 0;

  const content = lines.join('\n') + '\n';
  const buffer = Buffer.from(content, 'utf8');
  if (compress) {
    fs.writeFileSync(filePath, zlib.gzipSync(buffer));
  } else {
    fs.writeFileSync(filePath, buffer);
  }
  return count;
}

function csvEscape (value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
