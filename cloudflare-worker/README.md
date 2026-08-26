# SoliChess OAuth Worker

This Worker is the public Chess.com OAuth callback for SoliChess. It exchanges the authorization code, reads the authenticated public account identity, and keeps only that identity in Cloudflare KV for up to 30 minutes. Access and refresh tokens are not stored.

Required KV binding:

- `OAUTH_RESULTS`

Required Worker secrets/variables after Chess.com approval:

- `CHESSCOM_OAUTH_CLIENT_ID`
- `CHESSCOM_OAUTH_CLIENT_SECRET` (secret)
- `CHESSCOM_OAUTH_TOKEN_URL`
- `CHESSCOM_OAUTH_USERINFO_URL` if the token response does not contain the username
- `CHESSCOM_OAUTH_REDIRECT_URI`
- `CHESSCOM_OAUTH_TOKEN_AUTH_METHOD` (`client_secret_post` or `client_secret_basic`)
- `OAUTH_BRIDGE_SECRET` (secret, at least 32 random characters; the same value is configured on the Discord bot)

The production callback must remain exactly:

`https://solichess-oauth.discord-qh.workers.dev/oauth/chesscom/callback`
