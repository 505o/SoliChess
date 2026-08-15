import { google, type sheets_v4 } from "googleapis";
import type { AppDatabase } from "./database.js";
import type { ChessComStats } from "./types.js";

const SHEET_COLUMNS = {
  Members: 11,
  "Puzzle Stats": 9,
  "Guild Settings": 9,
  "Audit Log": 6,
  "Sync Status": 2
} as const;

type SheetTitle = keyof typeof SHEET_COLUMNS;
type CellValue = string | number | boolean;
type SheetRows = Record<SheetTitle, CellValue[][]>;

export interface GoogleSheetsSyncOptions {
  spreadsheetId: string;
  serviceAccountKeyFile: string;
  syncMinutes: number;
}

export interface GoogleSheetsSyncResult {
  syncedAt: number;
  members: number;
  puzzleStats: number;
  auditRecords: number;
}

function isoDate(timestamp: number | null): string {
  return timestamp ? new Date(timestamp).toISOString() : "";
}

function quoteSheet(title: string): string {
  return `'${title.replaceAll("'", "''")}'`;
}

function ratingsFromJson(value: string | null): { rapid: number | ""; blitz: number | ""; bullet: number | "" } {
  if (!value) return { rapid: "", blitz: "", bullet: "" };
  try {
    const stats = JSON.parse(value) as ChessComStats;
    return {
      rapid: stats.chess_rapid?.last?.rating ?? "",
      blitz: stats.chess_blitz?.last?.rating ?? "",
      bullet: stats.chess_bullet?.last?.rating ?? ""
    };
  } catch {
    return { rapid: "", blitz: "", bullet: "" };
  }
}

export class GoogleSheetsSync {
  readonly spreadsheetUrl: string;
  private readonly sheets: sheets_v4.Sheets;
  private syncPromise: Promise<GoogleSheetsSyncResult> | null = null;
  private scheduled: NodeJS.Timeout | null = null;

  constructor(
    private readonly options: GoogleSheetsSyncOptions,
    private readonly database: AppDatabase
  ) {
    const auth = new google.auth.GoogleAuth({
      keyFile: options.serviceAccountKeyFile,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    this.sheets = google.sheets({ version: "v4", auth });
    this.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(options.spreadsheetId)}/edit`;
  }

  async start(): Promise<GoogleSheetsSyncResult> {
    setInterval(() => void this.syncAll().catch((error: unknown) => {
      console.error("Google Sheets scheduled sync failed", error);
    }), this.options.syncMinutes * 60_000).unref();
    return this.syncAll();
  }

  requestSync(): void {
    if (this.scheduled) clearTimeout(this.scheduled);
    this.scheduled = setTimeout(() => {
      this.scheduled = null;
      void this.syncAll().catch((error: unknown) => console.error("Google Sheets change sync failed", error));
    }, 10_000);
    this.scheduled.unref();
  }

  syncAll(): Promise<GoogleSheetsSyncResult> {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.performSync().finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  private buildRows(syncedAt: number): SheetRows {
    const links = this.database.listLinks();
    const puzzleStats = this.database.listAllPuzzleStats();
    const settings = this.database.listGuildSettings();
    const audit = this.database.listAuditLog();

    const memberRows: CellValue[][] = [[
      "Guild ID", "Discord User ID", "Chess.com Username", "Chess.com Player ID", "Account Status",
      "Rapid", "Blitz", "Bullet", "Linked At", "Last Checked At", "Last Reviewed Game"
    ]];
    for (const link of links) {
      const ratings = ratingsFromJson(link.lastStatsJson);
      memberRows.push([
        link.guildId,
        link.discordUserId,
        link.chessUsername,
        link.chessPlayerId,
        link.accountStatus,
        ratings.rapid,
        ratings.blitz,
        ratings.bullet,
        isoDate(link.linkedAt),
        isoDate(link.lastCheckedAt),
        link.lastAnalyzedGameUrl ?? ""
      ]);
    }

    const puzzleRows: CellValue[][] = [[
      "Guild ID", "Discord User ID", "Puzzle Rating", "Solved", "Failed", "Current Streak",
      "Best Streak", "Success Rate", "Updated At"
    ]];
    for (const stats of puzzleStats) {
      const attempts = stats.solved + stats.failed;
      puzzleRows.push([
        stats.guildId,
        stats.discordUserId,
        stats.rating,
        stats.solved,
        stats.failed,
        stats.streak,
        stats.bestStreak,
        attempts ? `${Math.round((stats.solved / attempts) * 100)}%` : "",
        isoDate(stats.updatedAt)
      ]);
    }

    const settingsRows: CellValue[][] = [[
      "Guild ID", "Verified Role ID", "Review Role ID", "Onboarding Category ID", "Rules Channel ID",
      "Verify Channel ID", "Log Channel ID", "Analysis Channel ID", "Synced At"
    ]];
    for (const entry of settings) {
      settingsRows.push([
        entry.guildId,
        entry.verifiedRoleId,
        entry.reviewRoleId,
        entry.onboardingCategoryId,
        entry.rulesChannelId,
        entry.verifyChannelId,
        entry.logChannelId,
        entry.analysisChannelId,
        isoDate(syncedAt)
      ]);
    }

    const auditRows: CellValue[][] = [["ID", "Guild ID", "Discord User ID", "Action", "Details", "Created At"]];
    for (const entry of audit) {
      auditRows.push([
        entry.id,
        entry.guildId,
        entry.discordUserId ?? "",
        entry.action,
        entry.details,
        isoDate(entry.createdAt)
      ]);
    }

    const statusRows: CellValue[][] = [
      ["Metric", "Value"],
      ["Last successful sync", isoDate(syncedAt)],
      ["Members", links.length],
      ["Puzzle profiles", puzzleStats.length],
      ["Guilds", settings.length],
      ["Audit records exported", audit.length],
      ["Operational database", "SQLite (Google Sheets is the synchronized administration view)"]
    ];

    return {
      Members: memberRows,
      "Puzzle Stats": puzzleRows,
      "Guild Settings": settingsRows,
      "Audit Log": auditRows,
      "Sync Status": statusRows
    };
  }

  private async ensureSheets(): Promise<void> {
    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.options.spreadsheetId,
      fields: "sheets.properties"
    });
    const existing = new Map(
      (response.data.sheets ?? []).flatMap((sheet) => sheet.properties?.title && sheet.properties.sheetId !== undefined
        ? [[sheet.properties.title, sheet.properties.sheetId] as const]
        : [])
    );
    const missing = (Object.keys(SHEET_COLUMNS) as SheetTitle[]).filter((title) => !existing.has(title));
    if (missing.length > 0) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.options.spreadsheetId,
        requestBody: {
          requests: missing.map((title) => ({
            addSheet: { properties: { title, gridProperties: { rowCount: 6_000, columnCount: 20, frozenRowCount: 1 } } }
          }))
        }
      });
    }

    const updated = await this.sheets.spreadsheets.get({
      spreadsheetId: this.options.spreadsheetId,
      fields: "sheets.properties"
    });
    const formattingRequests: sheets_v4.Schema$Request[] = [];
    for (const sheet of updated.data.sheets ?? []) {
      const title = sheet.properties?.title as SheetTitle | undefined;
      const sheetId = sheet.properties?.sheetId;
      if (!title || sheetId === undefined || !(title in SHEET_COLUMNS)) continue;
      formattingRequests.push(
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1, rowCount: 6_000, columnCount: 20 } },
            fields: "gridProperties.frozenRowCount,gridProperties.rowCount,gridProperties.columnCount"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: SHEET_COLUMNS[title] },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.12, green: 0.16, blue: 0.20 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                horizontalAlignment: "CENTER"
              }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
          }
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: SHEET_COLUMNS[title] }
          }
        }
      );
    }
    if (formattingRequests.length > 0) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.options.spreadsheetId,
        requestBody: { requests: formattingRequests }
      });
    }
  }

  private async performSync(): Promise<GoogleSheetsSyncResult> {
    await this.ensureSheets();
    const syncedAt = Date.now();
    const rows = this.buildRows(syncedAt);
    const titles = Object.keys(SHEET_COLUMNS) as SheetTitle[];
    await this.sheets.spreadsheets.values.batchClear({
      spreadsheetId: this.options.spreadsheetId,
      requestBody: { ranges: titles.map((title) => `${quoteSheet(title)}!A:Z`) }
    });
    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.options.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: titles.map((title) => ({ range: `${quoteSheet(title)}!A1`, values: rows[title] }))
      }
    });
    return {
      syncedAt,
      members: rows.Members.length - 1,
      puzzleStats: rows["Puzzle Stats"].length - 1,
      auditRecords: rows["Audit Log"].length - 1
    };
  }
}
