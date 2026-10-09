const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS keys (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    key           TEXT UNIQUE NOT NULL,
    note          TEXT,
    max_uses      INTEGER NOT NULL DEFAULT 1,
    uses          INTEGER NOT NULL DEFAULT 0,
    loader_string TEXT,
    raw_link      TEXT,
    expires_at    INTEGER,
    revoked       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    redeemed_by   TEXT,
    redeemed_at   INTEGER
  );

  CREATE TABLE IF NOT EXISTS whitelist (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id   TEXT UNIQUE NOT NULL,
    note         TEXT,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS links (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id   TEXT UNIQUE NOT NULL,
    key          TEXT,
    external_id  TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    FOREIGN KEY (key) REFERENCES keys(key) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS access_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id   TEXT,
    username     TEXT,
    reason       TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_keys_key ON keys(key);
  CREATE INDEX IF NOT EXISTS idx_whitelist_discord_id ON whitelist(discord_id);
  CREATE INDEX IF NOT EXISTS idx_links_discord_id ON links(discord_id);
`);

module.exports = db;
