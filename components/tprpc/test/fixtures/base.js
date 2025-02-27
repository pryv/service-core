/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
// THIS FILE IS AUTOGENERATED FROM test/fixtures/base.proto
// PLEASE DONT EDIT MANUALLY
const Corpus = {
  UNIVERSAL: 0,
  WEB: 1,
  IMAGES: 2,
  LOCAL: 3,
  NEWS: 4,
  PRODUCTS: 5,
  VIDEO: 6
};
module.exports = { Corpus };

/** @typedef {Object} ISearchRequest
 * @property {string} query
 * @property {number} pageNumber
 * @property {number} resultPerPage
 * @property {0|1|2|3|4|5|6} corpus
 */

/** @typedef {Object} ISearchResponse
 * @property {Array<IResult>} results
 */

/** @typedef {Object} IResult
 * @property {string} url
 * @property {string} title
 * @property {Array<string>} snippets
 */

/** @typedef {Object} ISearchService */
