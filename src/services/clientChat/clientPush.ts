import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";

// Push to client-app users through Expo's push service. Clients sign in by
// email, so tokens are stored per email (ClientPushToken).

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function registerClientPushToken(email: string, token: unknown, platform: unknown) {
  if (typeof token !== "string" || !/^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(token))
    return { ok: false, message: "Invalid push token." };
  await prisma.clientPushToken.upsert({
    where: { token },
    create: { email: email.toLowerCase(), token, platform: String(platform ?? "unknown").slice(0, 20), is_active: true },
    update: { email: email.toLowerCase(), platform: String(platform ?? "unknown").slice(0, 20), is_active: true },
  });
  return { ok: true };
}

export async function unregisterClientPushToken(token: unknown) {
  if (typeof token === "string") await prisma.clientPushToken.updateMany({ where: { token }, data: { is_active: false } });
  return { ok: true };
}

export async function sendClientPush(
  email: string,
  message: { title: string; body: string; data?: Record<string, unknown> },
) {
  const tokens = await prisma.clientPushToken.findMany({
    where: { email: { equals: email, mode: "insensitive" }, is_active: true },
    select: { token: true },
  });
  if (!tokens.length) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        tokens.map((t) => ({ to: t.token, sound: "default", title: message.title, body: message.body, data: message.data ?? {} })),
      ),
    });
    const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    // Tokens of uninstalled apps stop receiving pushes.
    const dead = (json.data ?? [])
      .map((r, i) => (r.status === "error" && r.details?.error === "DeviceNotRegistered" ? tokens[i].token : null))
      .filter((t): t is string => !!t);
    if (dead.length) await prisma.clientPushToken.updateMany({ where: { token: { in: dead } }, data: { is_active: false } });
  } catch (error) {
    logger.warn("[client-push] send failed", error);
  }
}
