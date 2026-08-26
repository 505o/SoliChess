const CALLBACK_PATH = "/oauth/chesscom/callback";
const RESULT_PATH = "/oauth/result";
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function page(status, title, message, success = false) {
  const color = success ? "#72d58b" : "#ff7b72";
  return new Response(`<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)} · SoliChess</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, -apple-system, sans-serif; }
      body { margin:0; min-height:100vh; display:grid; place-items:center; background:#101318; color:#f4f5f7; }
      main { width:min(34rem,calc(100% - 2rem)); padding:2rem; border:1px solid #303640; border-radius:1rem; background:#1b2028; box-sizing:border-box; box-shadow:0 18px 55px #0008; }
      h1 { margin:0 0 1rem; color:${color}; }
      p { margin:0; line-height:1.8; color:#d2d6dc; }
    </style>
  </head>
  <body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing Worker variable: ${name}`);
  return value;
}

function identityFrom(payload) {
  const nestedUser = payload?.user && typeof payload.user === "object" ? payload.user : null;
  const nestedProfile = payload?.profile && typeof payload.profile === "object" ? payload.profile : null;
  const username = [
    payload?.username,
    payload?.preferred_username,
    payload?.name,
    nestedUser?.username,
    nestedUser?.preferred_username,
    nestedProfile?.username
  ].find((value) => typeof value === "string" && /^[a-zA-Z0-9_-]{2,40}$/.test(value.trim()));
  const rawPlayerId = [payload?.player_id, payload?.playerId, nestedUser?.player_id, nestedProfile?.player_id]
    .find((value) => typeof value === "number" || typeof value === "string" && /^\d+$/.test(value));
  const playerId = rawPlayerId === undefined ? null : Number(rawPlayerId);
  return username ? { username: username.trim(), playerId: Number.isSafeInteger(playerId) ? playerId : null } : null;
}

async function exchangeCode(env, code) {
  const clientId = required(env, "CHESSCOM_OAUTH_CLIENT_ID");
  const clientSecret = required(env, "CHESSCOM_OAUTH_CLIENT_SECRET");
  const tokenUrl = required(env, "CHESSCOM_OAUTH_TOKEN_URL");
  const redirectUri = required(env, "CHESSCOM_OAUTH_REDIRECT_URI");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded"
  };

  if ((env.CHESSCOM_OAUTH_TOKEN_AUTH_METHOD ?? "client_secret_post") === "client_secret_basic") {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }

  const response = await fetch(tokenUrl, { method: "POST", headers, body });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error(`Chess.com token endpoint returned ${response.status}`);
  }
  return payload;
}

async function fetchIdentity(env, tokenPayload) {
  const fromToken = identityFrom(tokenPayload);
  const userInfoUrl = env.CHESSCOM_OAUTH_USERINFO_URL?.trim();
  if (!userInfoUrl) {
    if (fromToken) return fromToken;
    throw new Error("Chess.com OAuth response did not include a username and no userinfo URL is configured");
  }

  const accessToken = tokenPayload.access_token;
  if (typeof accessToken !== "string" || !accessToken) throw new Error("Chess.com did not return an access token");
  const response = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error(`Chess.com userinfo endpoint returned ${response.status}`);
  }
  const identity = identityFrom(payload);
  if (!identity) throw new Error("Chess.com userinfo response did not contain a valid username");
  return identity;
}

async function callback(request, env) {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return page(400, "تم إلغاء الربط", "لم يمنح Chess.com الإذن. ارجع إلى Discord وحاول مجددًا.");
  }

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !STATE_PATTERN.test(state)) return page(400, "طلب غير صالح", "بيانات الرجوع ناقصة أو غير صالحة.");

  try {
    const tokenPayload = await exchangeCode(env, code);
    const identity = await fetchIdentity(env, tokenPayload);
    await env.OAUTH_RESULTS.put(`oauth:${state}`, JSON.stringify({ status: "verified", ...identity }), {
      expirationTtl: 1800
    });
    return page(200, "تم تأكيد الحساب", "ارجع الآن إلى Discord واضغط «إكمال الربط» للحصول على الرولات.", true);
  } catch (error) {
    console.error("OAuth callback failed", error);
    await env.OAUTH_RESULTS.put(`oauth:${state}`, JSON.stringify({
      status: "error",
      message: "تعذر تأكيد الحساب عبر Chess.com. ابدأ الربط من جديد."
    }), { expirationTtl: 600 });
    return page(502, "تعذر إكمال الربط", "حدث خطأ أثناء التواصل مع Chess.com. ارجع إلى Discord وابدأ الربط من جديد.");
  }
}

async function result(request, env) {
  const configuredSecret = required(env, "OAUTH_BRIDGE_SECRET");
  const authorization = request.headers.get("Authorization") ?? "";
  if (authorization !== `Bearer ${configuredSecret}`) return json({ message: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  if (!STATE_PATTERN.test(state)) return json({ message: "Invalid state" }, 400);
  const key = `oauth:${state}`;
  const stored = await env.OAUTH_RESULTS.get(key, "json");
  if (!stored) return json({ status: "pending" }, 202);
  if (url.searchParams.get("consume") === "1") await env.OAUTH_RESULTS.delete(key);
  if (stored.status === "error") return json({ message: stored.message }, 400);
  if (stored.status !== "verified") return json({ message: "Invalid stored OAuth result" }, 500);
  return json({ username: stored.username, playerId: stored.playerId });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
    if (url.pathname === "/health" || url.pathname === "/") return json({ status: "ok", service: "solichess-oauth" });
    if (url.pathname === CALLBACK_PATH) return callback(request, env);
    if (url.pathname === RESULT_PATH) return result(request, env);
    return page(404, "غير موجود", "هذا المسار غير موجود.");
  }
};
