# Third-Party Notices

SoliChess uses the following third-party projects and data sources.

## Stockfish

Game analysis is powered by Stockfish 18 Lite through the `stockfish` npm package maintained by Nathan Rugg and the Stockfish contributors.

- Project: <https://github.com/nmrugg/stockfish.js>
- Upstream engine: <https://github.com/official-stockfish/Stockfish>
- License: GNU General Public License v3.0

The installed package includes its full license text in `node_modules/stockfish/Copying.txt`.

## Lichess puzzle database

Tactical puzzles are supplied through the Lichess puzzle API and originate from the Lichess open puzzle database.

- Database: <https://database.lichess.org/#puzzles>
- License: Creative Commons CC0

SoliChess converts the provided positions and UCI solution moves into its own Discord presentation. It does not copy Chess.com puzzle content, board assets, sounds, or move-classification artwork.
