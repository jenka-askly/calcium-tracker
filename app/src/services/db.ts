// Purpose: Initialize and provide access to the local SQLite database tables with diagnostics.
// Persists: Creates and updates SQLite tables meals and settings.
// Security Risks: Handles local storage of device identifiers and meal metadata.
import * as SQLite from "expo-sqlite";

import { log } from "../utils/logger";

const DB_NAME = "calcium_camera.db";

export type DatabaseConnection = SQLite.SQLiteDatabase;

type SQLiteModule = typeof SQLite & { default?: typeof SQLite };

const sqliteModule = SQLite as SQLiteModule;
const openDatabase =
  sqliteModule.openDatabase ?? sqliteModule.default?.openDatabase;

let db: DatabaseConnection | null = null;

export function getDatabase(): DatabaseConnection {
  if (!db) {
    log("db", "open", { name: DB_NAME });
    // TEMP DEBUG
    log("db", "open:sqlite-debug", {
      sqliteImport: SQLite,
      sqliteKeys: Object.keys(SQLite),
      openDatabaseExists: Boolean(openDatabase),
      openDatabaseType: typeof openDatabase,
    });
    if (!openDatabase) {
      const message = "SQLite.openDatabase is unavailable.";
      log("db", "open:error", { message });
      throw new Error(message);
    }
    db = openDatabase(DB_NAME);
  }
  return db;
}

function getStatementLabel(statement: string): string {
  const trimmed = statement.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "empty";
  }
  const tokens = trimmed.split(" ").slice(0, 3);
  return tokens.join(" ").toLowerCase();
}

export function initDatabase(): Promise<void> {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS meals (
            id TEXT PRIMARY KEY NOT NULL,
            timestamp INTEGER NOT NULL,
            calcium_mg INTEGER NOT NULL,
            confidence REAL NOT NULL,
            confidence_label TEXT NOT NULL,
            photo_uri TEXT,
            answers_json TEXT,
            status TEXT NOT NULL
          );`
        );
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
          );`
        );
      },
      (error) => reject(error),
      () => resolve()
    );
  });
}

export function executeSql<T = SQLite.SQLResultSet>(
  statement: string,
  args: (string | number | null)[] = []
): Promise<T> {
  const database = getDatabase();
  const statementLabel = getStatementLabel(statement);
  log("db", "exec", { statement: statementLabel });
  return new Promise((resolve, reject) => {
    database.transaction((tx) => {
      tx.executeSql(
        statement,
        args,
        (_, result) => resolve(result as T),
        (_, error) => {
          const message = error instanceof Error ? error.message : String(error);
          log("db", "exec:error", { statement: statementLabel, message });
          console.error(error);
          reject(error);
          return false;
        }
      );
    });
  });
}
