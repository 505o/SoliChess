export type TimeClass = "rapid" | "blitz" | "bullet";

export interface ChessComProfile {
  player_id: number;
  username: string;
  status: string;
  title?: string;
  location?: string;
  url: string;
}

export interface RatingStat {
  last?: {
    rating: number;
    date: number;
    rd?: number;
  };
  best?: {
    rating: number;
    date: number;
    game?: string;
  };
  record?: {
    win: number;
    loss: number;
    draw: number;
  };
}

export interface ChessComStats {
  chess_rapid?: RatingStat;
  chess_blitz?: RatingStat;
  chess_bullet?: RatingStat;
}

export interface RatingSnapshot {
  rapid: number | null;
  blitz: number | null;
  bullet: number | null;
}

export interface GuildSettings {
  guildId: string;
  verifiedRoleId: string;
  reviewRoleId: string;
  onboardingCategoryId: string;
  rulesChannelId: string;
  verifyChannelId: string;
  logChannelId: string;
}

export interface LinkRecord {
  guildId: string;
  discordUserId: string;
  chessPlayerId: number;
  chessUsername: string;
  linkedAt: number;
  verifiedVia: string;
  accountStatus: string;
  lastCheckedAt: number | null;
  lastStatsJson: string | null;
}

export interface PendingVerification {
  guildId: string;
  discordUserId: string;
  chessUsername: string;
  chessPlayerId: number;
  challengeCode: string;
  createdAt: number;
  expiresAt: number;
}
