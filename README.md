# SoliChess

SoliChess is a private Discord bot developed for a single chess community. It is not publicly distributed and is not currently offered for installation in third-party servers.

## About

The bot creates a structured chess community experience inside Discord. New members connect their Chess.com account before receiving access to the server, helping the community reduce impersonation and duplicate account linking.

After verification, SoliChess uses public Chess.com data to display player information and assign roles based on:

- Rapid rating
- Blitz rating
- Bullet rating
- Verified chess titles
- Ranking among verified members of the Discord server

SoliChess also monitors public account-status changes, maintains an administrative audit trail, and provides a review process for accounts that require moderator attention.

Members can solve interactive tactical puzzles directly in Discord using rendered chessboards, move validation, hints, puzzle ratings, streaks, and server rankings. Puzzle positions come from the Lichess open puzzle database under CC0.

The bot monitors connected accounts for newly completed Chess.com games and posts one automatic review in a dedicated Discord channel. Members can also request the latest review manually. Reports are powered by Stockfish and include an evaluation graph, approximate move-quality statistics, and the most important missed opportunities.

## Account connection

SoliChess currently includes a temporary profile-based ownership challenge for development. The intended production flow uses Chess.com OAuth so members can confirm account ownership without sharing passwords or relying on editable profile information.

The bot never requests or stores Chess.com or Discord passwords. A connected Chess.com account cannot be switched automatically by the member; exceptional corrections are handled by server administrators and recorded for security purposes.

## Fair play

SoliChess does not provide assistance during active games. Game review only accepts completed games returned by the Chess.com public archive and is designed strictly for post-game learning. SoliChess uses its own approximate accuracy model and does not reproduce Chess.com's proprietary Game Review formula or visual classification system.

## Project status

The bot is under active private development. Chess.com OAuth integration is pending application approval and official client details.

## Privacy

See the [SoliChess Privacy Policy](./PRIVACY.md) for information about the public account data and Discord identifiers processed by the bot.
