# SoliChess

SoliChess is a Discord bot for mandatory Chess.com account verification, rating roles, server leaderboards, and public account-status monitoring.

## Current features

- One onboarding channel containing the rules and a native Discord verification button.
- Temporary ownership verification using a short code in the public Chess.com `Location` field.
- One-to-one linking based on the stable Chess.com `player_id`.
- Rapid, Blitz, Bullet, and chess-title roles.
- `/profile` and `/leaderboard` commands with rankings inside the Discord server.
- Periodic account-status checks and quarantine for closed accounts.
- Administrative restoration and unlinking with an audit trail.
- Health endpoint and the registered OAuth callback route.

The temporary profile challenge will be replaced with Chess.com OAuth after application approval. SoliChess never asks for a Chess.com or Discord password and does not provide assistance during active games.

## Requirements

- Node.js 24 or later
- A Discord application and bot token
- Discord's **Server Members Intent** enabled

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and `CHESSCOM_USER_AGENT` locally. Never commit `.env`.
3. Install and verify the project:

```powershell
npm install
npm run check
```

4. Start the bot:

```powershell
npm run dev
```

5. Run `/setup` inside the Discord server. Select `lock_existing: true` to require verification before members can see existing channels.
6. Check the result with Discord's **View Server As Role** feature before inviting members.

The bot needs View Channels, Send Messages, Embed Links, Read Message History, Manage Roles, and Manage Channels. Its role must be above every role it assigns. Do not grant Administrator.

## OAuth callback

The development callback registered with Chess.com is:

```text
http://localhost:3000/oauth/chesscom/callback
```

The route exists now but intentionally returns `503 OAuth setup pending` until Chess.com supplies the client credentials and endpoint details. A production deployment must use its exact public HTTPS callback URL. Wildcards and redirect mismatches will not work.

Health check:

```text
GET /health
```

## Commands

- `/setup lock_existing log_channel?`
- `/profile member?`
- `/leaderboard mode`
- `/refresh member`
- `/restore member`
- `/unlink member reason`

## Privacy

See [PRIVACY.md](./PRIVACY.md).
