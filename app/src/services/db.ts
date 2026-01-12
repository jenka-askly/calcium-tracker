// Purpose: Initialize and provide access to the local SQLite database tables.
// Persists: Creates and updates SQLite tables meals and settings.
// Security Risks: Handles local storage of device identifiers and meal metadata.
import * as SQLite from "expo-sqlite";

const DB_NAME = "calcium_camera.db";

export type DatabaseConnection = SQLite.SQLiteDatabase;

let db: DatabaseConnection | null = null;

export function getDatabase(): DatabaseConnection {
  if (!db) {
    db = SQLite.openDatabase(DB_NAME);
  }
  return db;
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
  return new Promise((resolve, reject) => {
    database.transaction((tx) => {
      tx.executeSql(
        statement,
        args,
        (_, result) => resolve(result as T),
        (_, error) => {
          reject(error);
          return false;
        }
      );
    });
  });
}
