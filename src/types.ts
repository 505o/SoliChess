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
  analysisChannelId: string;
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
  lastAnalyzedGameUrl: string | null;
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

export interface ChessComGamePlayer {
  username: string;
  rating: number;
  result: string;
}

export interface ChessComGame {
  url: string;
  pgn: string;
  end_time: number;
  time_class: string;
  time_control: string;
  rules: string;
  rated?: boolean;
  white: ChessComGamePlayer;
  black: ChessComGamePlayer;
  accuracies?: {
    white?: number;
    black?: number;
  };
}

export interface PuzzleSession {
  guildId: string;
  discordUserId: string;
  puzzleId: string;
  currentFen: string;
  solutionMoves: string[];
  currentIndex: number;
  puzzleRating: number;
  themes: string[];
  userColor: "w" | "b";
  failedOnce: boolean;
  startedAt: number;
}

export interface PuzzleStats {
  guildId: string;
  discordUserId: string;
  rating: number;
  solved: number;
  failed: number;
  streak: number;
  bestStreak: number;
  updatedAt: number;
}

export interface DailyPuzzleSettings {
  guildId: string;
  channelId: string;
  intervalHours: 6 | 12;
  nextPuzzleAt: number;
}

export interface DailyPuzzleChallenge {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  puzzleId: string;
  initialFen: string;
  solutionMoves: string[];
  puzzleRating: number;
  themes: string[];
  userColor: "w" | "b";
  startedAt: number;
  endsAt: number;
  status: "active" | "completed";
}

export interface DailyPuzzleAttempt {
  challengeId: string;
  guildId: string;
  discordUserId: string;
  currentFen: string;
  currentIndex: number;
  mistakes: number;
  solvedAt: number | null;
  startedAt: number;
  updatedAt: number;
}
