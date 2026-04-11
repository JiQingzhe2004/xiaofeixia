/**
 * Token 和应用配置持久化存储
 * 使用 SQLite 单文件数据库保存在 Electron userData 目录
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app } from "electron";

const DB_FILE = "feizhu.db";
const LEGACY_CONFIG_FILE = "feizhu-config.json";

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  brand: string;
  userInfo?: Record<string, unknown>;
  createdAt?: string;
}

export interface UserToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
  userInfo?: { openId?: string; name?: string };
  loginAt?: string;
}

interface LegacyConfig {
  app?: AppConfig;
  user?: UserToken;
}

let db: DatabaseSync | null = null;

function getDbPath(): string {
  return path.join(app.getPath("userData"), DB_FILE);
}

function getLegacyConfigPath(): string {
  return path.join(app.getPath("userData"), LEGACY_CONFIG_FILE);
}

function ensureDb(): DatabaseSync {
  if (db) return db;

  db = new DatabaseSync(getDbPath());
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      brand TEXT NOT NULL,
      user_info_json TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_token (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_in INTEGER,
      refresh_token_expires_in INTEGER,
      scope TEXT,
      user_info_json TEXT,
      login_at TEXT
    );
  `);

  migrateLegacyJsonIfNeeded(db);
  return db;
}

function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function stringifyJson(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value);
}

function hasAnyStoredData(database: DatabaseSync): boolean {
  const appRow = database
    .prepare("SELECT 1 AS present FROM app_config WHERE id = 1 LIMIT 1")
    .get() as { present?: number } | undefined;
  const userRow = database
    .prepare("SELECT 1 AS present FROM user_token WHERE id = 1 LIMIT 1")
    .get() as { present?: number } | undefined;
  return !!appRow?.present || !!userRow?.present;
}

function loadLegacyConfig(): LegacyConfig {
  try {
    const filePath = getLegacyConfigPath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as LegacyConfig;
  } catch {
    return {};
  }
}

function migrateLegacyJsonIfNeeded(database: DatabaseSync): void {
  if (hasAnyStoredData(database)) return;

  const legacyPath = getLegacyConfigPath();
  if (!fs.existsSync(legacyPath)) return;

  const legacy = loadLegacyConfig();
  const insertApp = database.prepare(`
    INSERT INTO app_config (id, client_id, client_secret, brand, user_info_json, created_at)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_id = excluded.client_id,
      client_secret = excluded.client_secret,
      brand = excluded.brand,
      user_info_json = excluded.user_info_json,
      created_at = excluded.created_at
  `);
  const insertUser = database.prepare(`
    INSERT INTO user_token (
      id, access_token, refresh_token, expires_in, refresh_token_expires_in, scope, user_info_json, login_at
    )
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_in = excluded.expires_in,
      refresh_token_expires_in = excluded.refresh_token_expires_in,
      scope = excluded.scope,
      user_info_json = excluded.user_info_json,
      login_at = excluded.login_at
  `);

  database.exec("BEGIN");
  try {
    if (legacy.app?.clientId) {
      insertApp.run(
        legacy.app.clientId,
        legacy.app.clientSecret,
        legacy.app.brand,
        stringifyJson(legacy.app.userInfo),
        legacy.app.createdAt || new Date().toISOString()
      );
    }

    if (legacy.user?.accessToken) {
      insertUser.run(
        legacy.user.accessToken,
        legacy.user.refreshToken ?? null,
        legacy.user.expiresIn ?? null,
        legacy.user.refreshTokenExpiresIn ?? null,
        legacy.user.scope ?? null,
        stringifyJson(legacy.user.userInfo),
        legacy.user.loginAt || new Date().toISOString()
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  try {
    fs.renameSync(legacyPath, `${legacyPath}.migrated`);
  } catch {
    // 不阻断正常使用，旧文件保留即可
  }
}

export function saveAppConfig(data: {
  clientId: string;
  clientSecret: string;
  brand: string;
  userInfo?: Record<string, unknown>;
}): void {
  const database = ensureDb();
  database.prepare(`
    INSERT INTO app_config (id, client_id, client_secret, brand, user_info_json, created_at)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_id = excluded.client_id,
      client_secret = excluded.client_secret,
      brand = excluded.brand,
      user_info_json = excluded.user_info_json,
      created_at = excluded.created_at
  `).run(
    data.clientId,
    data.clientSecret,
    data.brand,
    stringifyJson(data.userInfo),
    new Date().toISOString()
  );
}

export function saveUserToken(data: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
  userInfo?: { openId?: string; name?: string };
}): void {
  const database = ensureDb();
  database.prepare(`
    INSERT INTO user_token (
      id, access_token, refresh_token, expires_in, refresh_token_expires_in, scope, user_info_json, login_at
    )
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_in = excluded.expires_in,
      refresh_token_expires_in = excluded.refresh_token_expires_in,
      scope = excluded.scope,
      user_info_json = excluded.user_info_json,
      login_at = excluded.login_at
  `).run(
    data.accessToken,
    data.refreshToken ?? null,
    data.expiresIn ?? null,
    data.refreshTokenExpiresIn ?? null,
    data.scope ?? null,
    stringifyJson(data.userInfo),
    new Date().toISOString()
  );
}

export function getAppConfig(): AppConfig | null {
  const row = ensureDb().prepare(`
    SELECT client_id, client_secret, brand, user_info_json, created_at
    FROM app_config
    WHERE id = 1
  `).get() as
    | {
        client_id: string;
        client_secret: string;
        brand: string;
        user_info_json: string | null;
        created_at: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    clientId: row.client_id,
    clientSecret: row.client_secret,
    brand: row.brand,
    userInfo: parseJson<Record<string, unknown>>(row.user_info_json),
    createdAt: row.created_at ?? undefined,
  };
}

export function getUserToken(): UserToken | null {
  const row = ensureDb().prepare(`
    SELECT access_token, refresh_token, expires_in, refresh_token_expires_in, scope, user_info_json, login_at
    FROM user_token
    WHERE id = 1
  `).get() as
    | {
        access_token: string;
        refresh_token: string | null;
        expires_in: number | null;
        refresh_token_expires_in: number | null;
        scope: string | null;
        user_info_json: string | null;
        login_at: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token ?? undefined,
    expiresIn: row.expires_in ?? undefined,
    refreshTokenExpiresIn: row.refresh_token_expires_in ?? undefined,
    scope: row.scope ?? undefined,
    userInfo: parseJson<{ openId?: string; name?: string }>(row.user_info_json),
    loginAt: row.login_at ?? undefined,
  };
}

export function getInitStatus() {
  const appConfig = getAppConfig();
  const userToken = getUserToken();
  return {
    hasApp: !!appConfig?.clientId,
    hasUser: !!userToken?.accessToken,
    app: appConfig,
    user: userToken,
  };
}

export function clearConfig(): void {
  const database = ensureDb();
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM app_config WHERE id = 1").run();
    database.prepare("DELETE FROM user_token WHERE id = 1").run();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
