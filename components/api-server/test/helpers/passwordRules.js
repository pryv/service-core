/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Helpers for testing password rules.
 */
module.exports = {
  settingsOverride: {
    auth: {
      passwordComplexityMinCharCategories: 3,
      passwordComplexityMinLength: 8,
      passwordAgeMaxDays: 365,
      passwordAgeMinDays: 0,
      passwordPreventReuseHistoryLength: 3
    }
  },

  passwords: {
    good3CharCats: '1L0v3T0p', // 8 chars long == min length
    good4CharCats: '1.L0v3.T0p1n4mb0urz',
    bad2CharCats: '1l0v3c0urg3tt3z', // missing caps & special chars
    badTooShort: '1L0v3U!' // 7 chars vs 8 minimum
  }
};
