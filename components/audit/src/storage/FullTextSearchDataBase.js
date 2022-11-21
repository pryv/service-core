/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// add full text search capabilities
// https://kimsereylam.com/sqlite/2020/03/06/full-text-search-with-sqlite.html

// Important notes.
// We use the "unicode61" tokenizer to be able to prevent word splitting with the
// following characters _-:
// see: https://sqlite.org/fts5.html#tokenizers

/**
 * Add Full text Search capabilities on a specific table
 * @param {Sqlite3} db
 * @param {string} tableName
 * @param {Object} tableData
 * @param {Array} columnsToInclude - names of table to add to FTS
 * @param {string} [id=rowid] - (optional id for the table) ! column must be of "Integer" type an be a primary KEY
 */
function createFTSFor (db, tableName, tableData, columnsToInclude, id) {
  const itemId = id || 'rowid';
  const columnsTypes = [];
  const columnNames = Object.keys(tableData);

  // create virtual table
  columnNames.map((columnName) => {
    const column = tableData[columnName];
    const unindexed = columnsToInclude.includes(columnName) ? '' : ' UNINDEXED';
    if (columnName !== itemId) { columnsTypes.push(columnName + unindexed); }
  });
  columnsTypes.push(`content='${tableName}'`);
  columnsTypes.push(`content_rowid='${itemId}'`);

  db.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName}_fts USING fts5(` +
      columnsTypes.join(', ') + ', tokenize = "unicode61 remove_diacritics 0 tokenchars \'-_:.\'"' +
    ');').run();

  // create an fts_v table to query list of available terms
  db.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName}_fts_v USING fts5vocab(${tableName}_fts, 'row');`).run();

  // Triggers to update FTS table
  db.prepare(`CREATE TRIGGER IF NOT EXISTS ${tableName}_ai AFTER INSERT ON ${tableName}
    BEGIN
      INSERT INTO ${tableName}_fts (rowid, ${columnsToInclude.join(', ')})
        VALUES (new.${itemId}, new.${columnsToInclude.join(', new.')});
    END;
    `).run();

  db.prepare(`CREATE TRIGGER IF NOT EXISTS ${tableName}_ad AFTER DELETE ON ${tableName}
    BEGIN
      INSERT INTO ${tableName}_fts (${tableName}_fts, rowid, ${columnsToInclude.join(', ')})
        VALUES ('delete', old.${itemId}, old.${columnsToInclude.join(', old.')});
    END;
  `).run();

  db.prepare(`CREATE TRIGGER IF NOT EXISTS ${tableName}_au AFTER UPDATE ON ${tableName}
    BEGIN
      INSERT INTO ${tableName}_fts (${tableName}_fts, rowid, ${columnsToInclude.join(', ')})
        VALUES ('delete', old.${itemId}, old.${columnsToInclude.join(', old.')});
      INSERT INTO ${tableName}_fts (rowid,  ${columnsToInclude.join(', ')})
        VALUES (new.${itemId}, new.${columnsToInclude.join(', new.')});
    END;
  `).run();
}

module.exports = {
  createFTSFor
};
