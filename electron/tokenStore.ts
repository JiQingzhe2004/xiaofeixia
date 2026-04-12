/**
 * Token 和应用配置持久化存储
 * 使用 SQLite 单文件数据库保存在 Electron userData 目录
 */

import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app } from "electron";

const DB_FILE = "feizhu.db";

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  brand: string;
  userInfo?: Record<string, unknown>;
  uiPreferences?: {
    themeMode?: "system" | "light" | "dark";
  };
  createdAt?: string;
}

export interface UserToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
  userInfo?: { openId?: string; name?: string; avatarUrl?: string };
  loginAt?: string;
}

export interface BotRecentChat {
  chatId: string;
  userOpenId: string;
  title?: string;
  avatarUrl?: string;
  lastMessagePreview?: string;
  lastMessageAt?: number;
  updatedAt?: string;
}

let db: DatabaseSync | null = null;

function getDbPath(): string {
  return path.join(app.getPath("userData"), DB_FILE);
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
      ui_preferences_json TEXT,
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

    CREATE TABLE IF NOT EXISTS bot_recent_chat (
      chat_id TEXT PRIMARY KEY,
      user_open_id TEXT NOT NULL,
      title TEXT,
      avatar_url TEXT,
      last_message_preview TEXT,
      last_message_at INTEGER,
      updated_at TEXT
    );
  `);
  ensureColumn(db, "app_config", "ui_preferences_json", "TEXT");

  return db;
}

function ensureColumn(
  database: DatabaseSync,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  if (columns.some((column) => column.name === columnName)) return;
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
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

export function saveAppConfig(data: {
  clientId: string;
  clientSecret: string;
  brand: string;
  userInfo?: Record<string, unknown>;
  uiPreferences?: {
    themeMode?: "system" | "light" | "dark";
  };
}): void {
  const database = ensureDb();
  database.prepare(`
    INSERT INTO app_config (id, client_id, client_secret, brand, user_info_json, ui_preferences_json, created_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_id = excluded.client_id,
      client_secret = excluded.client_secret,
      brand = excluded.brand,
      user_info_json = excluded.user_info_json,
      ui_preferences_json = excluded.ui_preferences_json,
      created_at = excluded.created_at
  `).run(
    data.clientId,
    data.clientSecret,
    data.brand,
    stringifyJson(data.userInfo),
    stringifyJson(data.uiPreferences),
    new Date().toISOString()
  );
}

export function saveUserToken(data: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
  userInfo?: { openId?: string; name?: string; avatarUrl?: string };
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
    SELECT client_id, client_secret, brand, user_info_json, ui_preferences_json, created_at
    FROM app_config
    WHERE id = 1
  `).get() as
    | {
        client_id: string;
        client_secret: string;
        brand: string;
        user_info_json: string | null;
        ui_preferences_json: string | null;
        created_at: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    clientId: row.client_id,
    clientSecret: row.client_secret,
    brand: row.brand,
    userInfo: parseJson<Record<string, unknown>>(row.user_info_json),
    uiPreferences: parseJson<{ themeMode?: "system" | "light" | "dark" }>(
      row.ui_preferences_json
    ),
    createdAt: row.created_at ?? undefined,
  };
}

export function saveUiPreferences(data: { themeMode?: "system" | "light" | "dark" }): void {
  const database = ensureDb();
  const existing = getAppConfig();
  database.prepare(`
    INSERT INTO app_config (
      id, client_id, client_secret, brand, user_info_json, ui_preferences_json, created_at
    )
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ui_preferences_json = excluded.ui_preferences_json
  `).run(
    existing?.clientId ?? "",
    existing?.clientSecret ?? "",
    existing?.brand ?? "feishu",
    stringifyJson(existing?.userInfo),
    stringifyJson(data),
    existing?.createdAt ?? new Date().toISOString()
  );
}

export function getUiPreferences() {
  return getAppConfig()?.uiPreferences ?? {};
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
    userInfo: parseJson<{ openId?: string; name?: string; avatarUrl?: string }>(row.user_info_json),
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

export function saveBotRecentChat(data: {
  chatId: string;
  userOpenId: string;
  title?: string;
  avatarUrl?: string;
  lastMessagePreview?: string;
  lastMessageAt?: number;
}): void {
  const database = ensureDb();
  database.prepare(`
    INSERT INTO bot_recent_chat (
      chat_id,
      user_open_id,
      title,
      avatar_url,
      last_message_preview,
      last_message_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      user_open_id = excluded.user_open_id,
      title = COALESCE(excluded.title, bot_recent_chat.title),
      avatar_url = COALESCE(excluded.avatar_url, bot_recent_chat.avatar_url),
      last_message_preview = COALESCE(excluded.last_message_preview, bot_recent_chat.last_message_preview),
      last_message_at = COALESCE(excluded.last_message_at, bot_recent_chat.last_message_at),
      updated_at = excluded.updated_at
  `).run(
    data.chatId,
    data.userOpenId,
    data.title ?? null,
    data.avatarUrl ?? null,
    data.lastMessagePreview ?? null,
    data.lastMessageAt ?? null,
    new Date().toISOString()
  );
}

export function getBotRecentChats(limit?: number): BotRecentChat[] {
  const statement = ensureDb().prepare(`
    SELECT chat_id, user_open_id, title, avatar_url, last_message_preview, last_message_at, updated_at
    FROM bot_recent_chat
    ORDER BY COALESCE(last_message_at, 0) DESC, updated_at DESC
    ${limit ? "LIMIT ?" : ""}
  `);
  const rows = (limit ? statement.all(limit) : statement.all()) as Array<{
    chat_id: string;
    user_open_id: string;
    title: string | null;
    avatar_url: string | null;
    last_message_preview: string | null;
    last_message_at: number | null;
    updated_at: string | null;
  }>;

  return rows.map((row) => ({
    chatId: row.chat_id,
    userOpenId: row.user_open_id,
    title: row.title ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    lastMessagePreview: row.last_message_preview ?? undefined,
    lastMessageAt: row.last_message_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  }));
}

export function clearConfig(): void {
  const database = ensureDb();
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM app_config WHERE id = 1").run();
    database.prepare("DELETE FROM user_token WHERE id = 1").run();
    database.prepare("DELETE FROM bot_recent_chat").run();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
