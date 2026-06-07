// Verifies a Cloudflare Turnstile token server-side. The client form gets a
// token from the Turnstile widget; we POST it here, this route forwards to
// Cloudflare's siteverify endpoint with the secret key, returns ok/not.
//
// Env vars (set in Vercel):
//   TURNSTILE_SECRET_KEY — Cloudflare-issued secret, server-only
//
// Graceful degradation: if no secret is configured, returns ok with a
// skipped flag. Lets us ship the code before the keys are in place; once
// the env vars are set, the check activates automatically.

export async function POST(request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return Response.json({ ok: true, skipped: true });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }
  const token = body?.token;
  if (!token || typeof token !== "string") {
    return Response.json(
      { ok: false, error: "Missing captcha token." },
      { status: 400 },
    );
  }

  // Forward to Cloudflare. They reply with { success: bool, "error-codes": [...] }.
  const form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", token);

  let cf;
  try {
    const r = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      },
    );
    cf = await r.json();
  } catch (err) {
    return Response.json(
      { ok: false, error: "Captcha verification network error." },
      { status: 502 },
    );
  }

  if (!cf?.success) {
    return Response.json(
      {
        ok: false,
        error: "Captcha verification failed.",
        codes: cf?.["error-codes"] || [],
      },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}
