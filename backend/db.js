const { Pool } = require('pg');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let dbInstance;
let isPostgres = false;

async function initDb() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString && (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://'))) {
    console.log('Connecting to PostgreSQL database...');
    isPostgres = true;
    const pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    let client;
    let retries = 5;
    while (retries > 0) {
      try {
        client = await pool.connect();
        break;
      } catch (err) {
        retries -= 1;
        console.warn(`PostgreSQL connection failed. Retries remaining: ${retries}. Error: ${err.message}`);
        if (retries === 0) {
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE,
          phone VARCHAR(50) UNIQUE,
          password_hash TEXT NOT NULL,
          public_key TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS offline_messages (
          id SERIAL PRIMARY KEY,
          recipient_id INTEGER NOT NULL REFERENCES users(id),
          sender_id INTEGER NOT NULL REFERENCES users(id),
          encrypted_payload TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50) UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      `);
      console.log('PostgreSQL database initialized.');
      client.release();
      
      dbInstance = {
        query: async (text, params) => {
          return await pool.query(text, params);
        }
      };
    } catch (err) {
      console.error("PostgreSQL database initialization failed:", err);
      if (client) client.release();
      throw err;
    }
  } else {
    console.log('No DATABASE_URL or non-Postgres URL found. Initializing SQLite database...');
    isPostgres = false;
    try {
      const dbPath = path.join(__dirname, 'prochat.db');
      const sqliteDb = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      await sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE,
          phone TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          public_key TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS offline_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recipient_id INTEGER NOT NULL REFERENCES users(id),
          sender_id INTEGER NOT NULL REFERENCES users(id),
          encrypted_payload TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('SQLite database initialized at:', dbPath);

      dbInstance = {
        query: async (text, params = []) => {
          const expandedParams = [];
          const sqliteText = text.replace(/\$(\d+)/g, (match, num) => {
            const index = parseInt(num, 10) - 1;
            expandedParams.push(params[index]);
            return '?';
          });
          
          try {
            if (sqliteText.trim().toUpperCase().startsWith('SELECT') || sqliteText.includes('RETURNING')) {
              const rows = await sqliteDb.all(sqliteText, expandedParams);
              return { rows };
            } else {
              const result = await sqliteDb.run(sqliteText, expandedParams);
              return {
                rows: [],
                insertId: result.lastID,
                changes: result.changes
              };
            }
          } catch (err) {
            if (err.message && (err.message.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT')) {
              err.code = '23505'; // Postgres unique violation code
            }
            throw err;
          }
        }
      };
    } catch (err) {
      console.error("SQLite database initialization failed:", err);
      throw err;
    }
  }

  return dbInstance;
}

async function clearAllData() {
  if (!dbInstance) return;
  try {
    if (isPostgres) {
      await dbInstance.query('TRUNCATE offline_messages, users RESTART IDENTITY CASCADE;');
    } else {
      await dbInstance.query('DELETE FROM offline_messages;');
      await dbInstance.query('DELETE FROM users;');
    }
    console.log('All database data cleared successfully.');
    return true;
  } catch (err) {
    console.error('Failed to clear database data:', err);
    throw err;
  }
}

module.exports = { initDb, clearAllData, getPool: () => dbInstance };

