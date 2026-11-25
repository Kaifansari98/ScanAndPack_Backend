import { redis } from "../../config/redis";
import { prisma } from "../../prisma/client";
import { ClientChatAutoKind, ClientChatKind, ClientChatSender, NotificationType } from "../../prisma/generated";
import logger from "../../utils/logger";
import {
  CLIENT_CHAT_FILE_TYPES,
  deleteWasabiObjects,
  generateSignedUrl,
  uploadClientChatFile,
} from "../../utils/wasabiClient";
import { validFMFileSignature } from "../fmRequirements/schema";
import { NotificationService } from "../notification/notification.service";
import { sendClientPush } from "./clientPush";

// Client chat: one conversation per booking (lead) between the client and the
// lead's team, separate from the internal LeadChatRoom. Shared by the client
// app API and the CRM / FurnixChats staff API.
//
// Members shown to the client: the sales executive (lead.assign_to) and the
// site supervisor. Anyone mapped to the lead, and admins, can also read and
// reply from the CRM.

export type ChatActor =
  | { kind: "client"; email: string }
  | { kind: "staff"; vendorId: number; userId: number; role: string };

export type ChatUpload = Express.Multer.File;

export class ChatError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

const ADMIN_ROLES = ["admin", "super-admin"];
export const CHAT_MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_TEXT = 4000;
const PAGE = 50;
const RECENT_STATE = 60;
const FILE_URL_TTL = 60 * 60;
const DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;
const TYPING_MS = 6000;
const ONLINE_MS = 2 * 60 * 1000;
const STAFF_ALERT_GAP_S = 60;
export const REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "🔥"];

const isAdmin = (role: string) => ADMIN_ROLES.includes(role);
const who = (actor: ChatActor) => (actor.kind === "client" ? "client" : `user:${actor.userId}`);

/* --------------------------------- Access --------------------------------- */

const leadSelect = {
  id: true,
  vendor_id: true,
  lead_code: true,
  firstname: true,
  lastname: true,
  email: true,
  assign_to: true,
} as const;

type ChatLead = { id: number; vendor_id: number; lead_code: string | null; firstname: string; lastname: string; email: string | null; assign_to: number | null };

// Same rule as the client app's project list.
const clientLeadsWhere = (email: string) => ({
  email: { equals: email, mode: "insensitive" as const },
  is_deleted: false,
  vendor: { is_furnixcrm_app_enabled: true, status: "active" },
});

async function staffCanAccess(actor: Extract<ChatActor, { kind: "staff" }>, lead: ChatLead) {
  if (isAdmin(actor.role) || lead.assign_to === actor.userId) return true;
  const [mapped, supervisor] = await Promise.all([
    prisma.leadUserMapping.count({ where: { lead_id: lead.id, user_id: actor.userId, status: "active" } }),
    prisma.leadSiteSupervisorMapping.count({ where: { lead_id: lead.id, user_id: actor.userId, status: "active" } }),
  ]);
  return mapped + supervisor > 0;
}

async function leadFor(actor: ChatActor, leadId: number): Promise<ChatLead> {
  if (!Number.isSafeInteger(leadId) || leadId <= 0) throw new ChatError("Invalid project.");
  const lead =
    actor.kind === "client"
      ? await prisma.leadMaster.findFirst({ where: { id: leadId, ...clientLeadsWhere(actor.email) }, select: leadSelect })
      : await prisma.leadMaster.findFirst({ where: { id: leadId, vendor_id: actor.vendorId, is_deleted: false }, select: leadSelect });
  if (!lead) throw new ChatError("Chat not found.", 404);
  if (actor.kind === "staff" && !(await staffCanAccess(actor, lead)))
    throw new ChatError("Only the lead's team or admins can use this chat.", 403);
  return lead;
}

async function roomFor(lead: ChatLead) {
  return prisma.clientChatRoom.upsert({
    where: { lead_id: lead.id },
    create: { lead_id: lead.id, vendor_id: lead.vendor_id },
    update: {},
  });
}

/* --------------------------------- Members -------------------------------- */

export type ChatMember = { id: number; name: string; role: "Sales Executive" | "Site Supervisor"; phone: string | null; online: boolean };

async function members(lead: ChatLead): Promise<ChatMember[]> {
  const [salesExec, supervisorMap, supervisorTask] = await Promise.all([
    lead.assign_to
      ? prisma.userMaster.findUnique({ where: { id: lead.assign_to }, select: { id: true, user_name: true, user_contact: true } })
      : null,
    prisma.leadSiteSupervisorMapping.findFirst({
      where: { lead_id: lead.id, status: "active" },
      select: { supervisor: { select: { id: true, user_name: true, user_contact: true } } },
      orderBy: { created_at: "desc" },
    }),
    prisma.leadUserMapping.findFirst({
      where: { lead_id: lead.id, type: "site-supervisor", status: "active" },
      select: { user: { select: { id: true, user_name: true, user_contact: true } } },
      orderBy: { created_at: "desc" },
    }),
  ]);
  const supervisor = supervisorMap?.supervisor ?? supervisorTask?.user ?? null;
  const list: Omit<ChatMember, "online">[] = [];
  if (salesExec) list.push({ id: salesExec.id, name: salesExec.user_name, role: "Sales Executive", phone: salesExec.user_contact || null });
  if (supervisor && supervisor.id !== salesExec?.id)
    list.push({ id: supervisor.id, name: supervisor.user_name, role: "Site Supervisor", phone: supervisor.user_contact || null });
  const seen = await Promise.all(list.map((m) => safeGet(`cchat:seen:user:${m.id}`)));
  return list.map((m, i) => ({ ...m, online: !!seen[i] && Date.now() - Number(seen[i]) < ONLINE_MS }));
}

/* ------------------------------ Redis helpers ------------------------------ */

// Chat must keep working if Redis is briefly unavailable.
async function safeGet(key: string) {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}
async function safeSet(key: string, value: string, seconds: number) {
  try {
    await redis.set(key, value, { EX: seconds });
  } catch {
    /* presence is best-effort */
  }
}

const touchSeen = (actor: ChatActor, roomId: number) =>
  safeSet(actor.kind === "client" ? `cchat:seen:client:${roomId}` : `cchat:seen:user:${actor.userId}`, String(Date.now()), 600);

/** Names of people typing in the room, other than the viewer. */
async function typingIn(roomId: number, viewer: ChatActor, memberNames: Map<string, string>) {
  try {
    const all = await redis.hGetAll(`cchat:typing:${roomId}`);
    const now = Date.now();
    return Object.entries(all)
      .filter(([key, until]) => key !== who(viewer) && Number(until) > now)
      .map(([key]) => memberNames.get(key) ?? (key === "client" ? "Client" : "Team"));
  } catch {
    return [];
  }
}

/* ------------------------------ Serialization ------------------------------ */

type Row = Awaited<ReturnType<typeof loadRows>>[number];

function loadRows(roomId: number, where: Record<string, unknown>, take: number, order: "asc" | "desc") {
  return prisma.clientChatMessage.findMany({
    where: { room_id: roomId, ...where },
    include: { reactions: { select: { emoji: true, reactor_key: true } } },
    orderBy: { id: order },
    take,
  });
}

async function userNames(ids: number[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<number, string>();
  const users = await prisma.userMaster.findMany({ where: { id: { in: unique } }, select: { id: true, user_name: true } });
  return new Map(users.map((u) => [u.id, u.user_name]));
}

type Receipts = { delivered: number; read: number };

async function serialize(rows: Row[], viewer: ChatActor, team: ChatMember[], receipts: { client: Receipts; staff: Receipts }) {
  const names = await userNames(rows.map((r) => r.sender_user_id).filter((x): x is number => x !== null));
  const roleOf = new Map(team.map((m) => [m.id, m.role]));
  const me = who(viewer);
  return Promise.all(
    rows.map(async (r) => {
      const deleted = !!r.deleted_at;
      const own = r.sender_type === "CLIENT" ? me === "client" : r.sender_user_id !== null && me === `user:${r.sender_user_id}`;
      // Ticks for your own messages: what the other side has received / read.
      const other = r.sender_type === "CLIENT" ? receipts.staff : receipts.client;
      const delivery = own ? (r.id <= other.read ? "read" : r.id <= other.delivered ? "delivered" : "sent") : null;
      const counts = new Map<string, { count: number; mine: boolean }>();
      for (const x of deleted ? [] : r.reactions) {
        const c = counts.get(x.emoji) ?? { count: 0, mine: false };
        counts.set(x.emoji, { count: c.count + 1, mine: c.mine || x.reactor_key === me });
      }
      return {
        id: r.id,
        at: r.created_at.toISOString(),
        sender:
          r.sender_type === "CLIENT"
            ? { type: "client" as const }
            : r.sender_type === "SYSTEM"
              ? { type: "system" as const }
              : {
                  type: "staff" as const,
                  id: r.sender_user_id,
                  name: names.get(r.sender_user_id ?? 0) ?? "Team member",
                  role: roleOf.get(r.sender_user_id ?? 0) ?? "Team",
                },
        own,
        kind: r.kind,
        text: deleted ? null : r.text,
        file:
          !deleted && r.file_key
            ? {
                url: await generateSignedUrl(r.file_key, FILE_URL_TTL, "inline"),
                name: r.file_name,
                size: r.file_size,
                mime: r.mime_type,
              }
            : null,
        duration_sec: deleted ? null : r.duration_sec,
        auto: r.kind === "AUTO" ? { kind: r.auto_kind, title: r.auto_title } : null,
        reply_to_id: r.reply_to_id,
        deleted,
        reactions: [...counts].map(([emoji, c]) => ({ emoji, ...c })),
        delivery,
      };
    }),
  );
}

async function receiptsOf(room: { id: number; client_delivered_id: number; client_read_id: number }) {
  const agg = await prisma.clientChatStaffRead.aggregate({
    where: { room_id: room.id },
    _max: { delivered_id: true, read_id: true },
  });
  return {
    client: { delivered: room.client_delivered_id, read: room.client_read_id },
    staff: { delivered: agg._max.delivered_id ?? 0, read: agg._max.read_id ?? 0 },
  };
}

/** Marks what the viewer's app has now received. */
async function markDelivered(actor: ChatActor, roomId: number, upTo: number) {
  if (!upTo) return;
  if (actor.kind === "client") {
    await prisma.clientChatRoom.updateMany({ where: { id: roomId, client_delivered_id: { lt: upTo } }, data: { client_delivered_id: upTo } });
  } else {
    await prisma.clientChatStaffRead.upsert({
      where: { room_id_user_id: { room_id: roomId, user_id: actor.userId } },
      create: { room_id: roomId, user_id: actor.userId, delivered_id: upTo },
      update: {},
    });
    await prisma.clientChatStaffRead.updateMany({
      where: { room_id: roomId, user_id: actor.userId, delivered_id: { lt: upTo } },
      data: { delivered_id: upTo },
    });
  }
}

/* ------------------------------- Conversation ------------------------------ */

const intParam = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new ChatError("Invalid message cursor.");
  return n;
};

/**
 * Messages of one chat, oldest first. Without cursors: the latest page.
 * `after`: newer messages only (polling). `before`: older history.
 */
export async function getConversation(actor: ChatActor, leadId: number, query: Record<string, unknown>) {
  const lead = await leadFor(actor, leadId);
  const room = await roomFor(lead);
  const after = intParam(query.after);
  const before = intParam(query.before);

  const rows =
    after !== undefined
      ? await loadRows(room.id, { id: { gt: after } }, 200, "asc")
      : (await loadRows(room.id, before ? { id: { lt: before } } : {}, PAGE + 1, "desc")).reverse();
  const hasMore = after === undefined && rows.length > PAGE;
  const page = hasMore ? rows.slice(1) : rows;

  const latestId = page.length ? page[page.length - 1].id : 0;
  await Promise.all([markDelivered(actor, room.id, latestId), touchSeen(actor, room.id)]);

  const team = await members(lead);
  const fresh = await prisma.clientChatRoom.findUniqueOrThrow({ where: { id: room.id } });
  const receipts = await receiptsOf(fresh);
  const memberNames = new Map<string, string>([["client", `${lead.firstname} ${lead.lastname}`.trim()]]);
  for (const m of team) memberNames.set(`user:${m.id}`, m.name);

  // Current state of the latest messages the viewer already has: deletes,
  // reactions and ticks change after a message is first loaded.
  const recentState =
    after !== undefined && after > 0
      ? (
          await serialize(
            (await loadRows(room.id, { id: { lte: after } }, RECENT_STATE, "desc")).reverse(),
            actor,
            team,
            receipts,
          )
        ).map((m) => ({ id: m.id, deleted: m.deleted, reactions: m.reactions, delivery: m.delivery }))
      : [];

  const clientSeen = await safeGet(`cchat:seen:client:${room.id}`);
  return {
    room_id: room.id,
    lead: { id: lead.id, lead_code: lead.lead_code, client_name: `${lead.firstname} ${lead.lastname}`.trim() },
    members: team,
    client_online: !!clientSeen && Date.now() - Number(clientSeen) < ONLINE_MS,
    typing: await typingIn(room.id, actor, memberNames),
    messages: await serialize(page, actor, team, receipts),
    recent_state: recentState,
    // Ticks for messages the viewer already has.
    receipts: actor.kind === "client" ? receipts.staff : receipts.client,
    your_read_id: actor.kind === "client" ? fresh.client_read_id : (await staffReadId(room.id, actor.userId)),
    has_more: hasMore,
    server_time: Date.now(),
  };
}

async function staffReadId(roomId: number, userId: number) {
  const row = await prisma.clientChatStaffRead.findUnique({ where: { room_id_user_id: { room_id: roomId, user_id: userId } } });
  return row?.read_id ?? 0;
}

/* ---------------------------------- Send ---------------------------------- */

function classify(file: ChatUpload): { kind: ClientChatKind; mime: string } {
  const mime = file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype;
  if (!CLIENT_CHAT_FILE_TYPES[mime]) throw new ChatError("Send a photo, a PDF or a voice note.");
  if (file.size > CHAT_MAX_FILE_SIZE) throw new ChatError("That file is too large (max 25 MB).");
  if (mime.startsWith("image/")) {
    if (!validFMFileSignature(file.buffer, mime)) throw new ChatError("That photo couldn't be read.");
    return { kind: "PHOTO", mime };
  }
  if (mime === "application/pdf") {
    if (file.buffer.subarray(0, 5).toString() !== "%PDF-") throw new ChatError("That PDF couldn't be read.");
    return { kind: "DOCUMENT", mime };
  }
  return { kind: "VOICE", mime };
}

export async function sendMessage(actor: ChatActor, leadId: number, body: Record<string, unknown>, file?: ChatUpload) {
  const lead = await leadFor(actor, leadId);
  const room = await roomFor(lead);

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length > MAX_TEXT) throw new ChatError(`Messages can be at most ${MAX_TEXT} characters.`);
  const replyTo = intParam(body.reply_to_id);
  if (replyTo) {
    const exists = await prisma.clientChatMessage.count({ where: { id: replyTo, room_id: room.id } });
    if (!exists) throw new ChatError("The message you replied to no longer exists.");
  }

  let kind: ClientChatKind = "TEXT";
  let fileData: { file_key: string; file_name: string; file_size: number; mime_type: string } | null = null;
  let duration: number | null = null;
  if (file) {
    const c = classify(file);
    kind = c.kind;
    const key = await uploadClientChatFile(file.buffer, lead.vendor_id, lead.id, c.mime);
    fileData = { file_key: key, file_name: (file.originalname || `file.${CLIENT_CHAT_FILE_TYPES[c.mime]}`).slice(0, 255), file_size: file.size, mime_type: c.mime };
    if (kind === "VOICE") {
      const d = Number(body.duration_sec);
      duration = Number.isFinite(d) && d > 0 ? Math.min(Math.round(d), 60 * 30) : null;
    }
  } else if (!text) {
    throw new ChatError("Type a message first.");
  }

  const sender: ClientChatSender = actor.kind === "client" ? "CLIENT" : "STAFF";
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.clientChatMessage.create({
      data: {
        room_id: room.id,
        sender_type: sender,
        sender_user_id: actor.kind === "staff" ? actor.userId : null,
        kind,
        text: kind === "VOICE" ? null : text || null,
        duration_sec: duration,
        reply_to_id: replyTo ?? null,
        ...(fileData ?? {}),
      },
      include: { reactions: { select: { emoji: true, reactor_key: true } } },
    });
    await tx.clientChatRoom.update({ where: { id: room.id }, data: { last_message_at: m.created_at } });
    return m;
  });

  // Sending also means the sender has read everything before it.
  await markRead(actor, leadId, message.id).catch(() => undefined);
  await clearTyping(room.id, actor);

  const team = await members(lead);
  void alertOtherSide(actor, lead, team, preview(kind, text)).catch((e) => logger.warn("[client-chat] alert failed", e));

  const [out] = await serialize([message], actor, team, await receiptsOf(await prisma.clientChatRoom.findUniqueOrThrow({ where: { id: room.id } })));
  return out;
}

const preview = (kind: ClientChatKind, text: string) =>
  kind === "PHOTO" ? `📷 ${text || "Photo"}` : kind === "DOCUMENT" ? "📄 Document" : kind === "VOICE" ? "🎤 Voice note" : text;

/** Client message -> push/CRM alert to the team; staff message -> push to the client. */
async function alertOtherSide(actor: ChatActor, lead: ChatLead, team: ChatMember[], body: string) {
  const clientName = `${lead.firstname} ${lead.lastname}`.trim();
  if (actor.kind === "client") {
    for (const m of team) {
      // One alert per person per chat per minute, so a burst of messages doesn't spam.
      const gate = `cchat:alert:${lead.id}:${m.id}`;
      try {
        const first = await redis.set(gate, "1", { EX: STAFF_ALERT_GAP_S, NX: true });
        if (!first) continue;
      } catch {
        /* without Redis, alert every time */
      }
      await NotificationService.createAndSend({
        vendor_id: lead.vendor_id,
        user_id: m.id,
        type: NotificationType.CHAT_MENTION,
        title: `${clientName} · ${lead.lead_code ?? "Client chat"}`,
        message: body.slice(0, 200),
        entity_type: "client_chat",
        entity_id: lead.id,
        redirect_url: null,
      });
    }
  } else if (lead.email) {
    const sender = team.find((m) => m.id === actor.userId)?.name ?? "Your project team";
    await sendClientPush(lead.email, {
      title: sender,
      body: body.slice(0, 200),
      data: { type: "client_chat", lead_id: lead.id },
    });
  }
}

/* --------------------------- Read / delete / react -------------------------- */

export async function markRead(actor: ChatActor, leadId: number, lastId: unknown) {
  const lead = await leadFor(actor, leadId);
  const room = await roomFor(lead);
  const upTo = intParam(lastId) ?? 0;
  const max = await prisma.clientChatMessage.aggregate({ where: { room_id: room.id }, _max: { id: true } });
  const id = Math.min(upTo, max._max.id ?? 0);
  if (!id) return { read_id: 0 };
  await markDelivered(actor, room.id, id);
  if (actor.kind === "client") {
    await prisma.clientChatRoom.updateMany({ where: { id: room.id, client_read_id: { lt: id } }, data: { client_read_id: id } });
  } else {
    await prisma.clientChatStaffRead.updateMany({
      where: { room_id: room.id, user_id: actor.userId, read_id: { lt: id } },
      data: { read_id: id },
    });
  }
  return { read_id: id };
}

async function ownMessage(actor: ChatActor, leadId: number, messageId: number) {
  const lead = await leadFor(actor, leadId);
  const room = await roomFor(lead);
  const message = await prisma.clientChatMessage.findFirst({ where: { id: messageId, room_id: room.id } });
  if (!message) throw new ChatError("Message not found.", 404);
  return { lead, room, message };
}

export async function deleteMessage(actor: ChatActor, leadId: number, messageId: number) {
  const { message } = await ownMessage(actor, leadId, messageId);
  const mine =
    actor.kind === "client" ? message.sender_type === "CLIENT" : message.sender_type === "STAFF" && message.sender_user_id === actor.userId;
  if (!mine) throw new ChatError("You can only delete your own messages.", 403);
  if (message.deleted_at) return { id: message.id, deleted: true };
  if (Date.now() - message.created_at.getTime() > DELETE_WINDOW_MS)
    throw new ChatError("Messages can only be deleted within 48 hours of sending.", 409);
  await prisma.clientChatMessage.update({ where: { id: message.id }, data: { deleted_at: new Date() } });
  if (message.file_key) void deleteWasabiObjects([message.file_key]);
  return { id: message.id, deleted: true };
}

/** Sets the viewer's reaction; the same emoji again removes it. */
export async function react(actor: ChatActor, leadId: number, messageId: number, emoji: unknown) {
  if (typeof emoji !== "string" || !REACTIONS.includes(emoji)) throw new ChatError("Unsupported reaction.");
  const { message } = await ownMessage(actor, leadId, messageId);
  if (message.deleted_at) throw new ChatError("This message was deleted.", 409);
  const key = who(actor);
  const existing = await prisma.clientChatReaction.findUnique({ where: { message_id_reactor_key: { message_id: message.id, reactor_key: key } } });
  if (existing?.emoji === emoji) {
    await prisma.clientChatReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.$transaction([
      prisma.clientChatReaction.deleteMany({ where: { message_id: message.id, reactor_key: key } }),
      prisma.clientChatReaction.create({ data: { message_id: message.id, reactor_key: key, emoji } }),
    ]);
  }
  return { id: message.id };
}

/* --------------------------------- Typing --------------------------------- */

export async function setTyping(actor: ChatActor, leadId: number) {
  const lead = await leadFor(actor, leadId);
  const room = await roomFor(lead);
  try {
    const key = `cchat:typing:${room.id}`;
    await redis.hSet(key, who(actor), String(Date.now() + TYPING_MS));
    await redis.expire(key, 60);
  } catch {
    /* typing is best-effort */
  }
  return { ok: true };
}

async function clearTyping(roomId: number, actor: ChatActor) {
  try {
    await redis.hDel(`cchat:typing:${roomId}`, who(actor));
  } catch {
    /* best-effort */
  }
}

/* ---------------------------------- Lists ---------------------------------- */

function lastPreview(m: { kind: ClientChatKind; text: string | null; auto_title: string | null; deleted_at: Date | null; duration_sec: number | null } | undefined) {
  if (!m) return null;
  if (m.deleted_at) return "This message was deleted";
  if (m.kind === "AUTO") return m.auto_title ?? m.text;
  return preview(m.kind, m.text ?? "");
}

/** The client's chats: one per booking, newest activity first. */
export async function clientThreads(email: string) {
  const leads = await prisma.leadMaster.findMany({
    where: clientLeadsWhere(email),
    select: { ...leadSelect, productMappings: { where: { is_archived: false }, select: { productType: { select: { type: true } } } } },
    orderBy: { created_at: "desc" },
  });
  const actor: ChatActor = { kind: "client", email };
  const rooms = await prisma.clientChatRoom.findMany({ where: { lead_id: { in: leads.map((l) => l.id) } } });
  const roomOf = new Map(rooms.map((r) => [r.lead_id, r]));

  const threads = await Promise.all(
    leads.map(async (lead) => {
      const room = roomOf.get(lead.id);
      const team = await members(lead);
      const last = room
        ? await prisma.clientChatMessage.findFirst({ where: { room_id: room.id }, orderBy: { id: "desc" } })
        : null;
      const unread = room
        ? await prisma.clientChatMessage.count({
            where: { room_id: room.id, id: { gt: room.client_read_id }, sender_type: { not: "CLIENT" }, deleted_at: null },
          })
        : 0;
      const names = new Map(team.map((m) => [`user:${m.id}`, m.name]));
      const types = lead.productMappings.map((m) => m.productType.type);
      return {
        lead_id: lead.id,
        lead_code: lead.lead_code,
        project_name: types.length === 0 ? "Your project" : types.length <= 2 ? types.join(" & ") : `${types.slice(0, 2).join(", ")} +${types.length - 2} more`,
        members: team,
        unread,
        typing: room ? await typingIn(room.id, actor, names) : [],
        last_message: last
          ? {
              at: last.created_at.toISOString(),
              preview: lastPreview(last),
              sender: last.sender_type === "CLIENT" ? "client" : last.sender_type === "SYSTEM" ? "system" : names.get(`user:${last.sender_user_id}`) ?? "Team",
              delivery:
                last.sender_type === "CLIENT"
                  ? await receiptsOf(room!).then((r) => (last.id <= r.staff.read ? "read" : last.id <= r.staff.delivered ? "delivered" : "sent"))
                  : null,
            }
          : null,
      };
    }),
  );
  return threads.sort((a, b) => (b.last_message?.at ?? "").localeCompare(a.last_message?.at ?? ""));
}

/** Staff inbox: client chats the user can see, with unread client messages. */
export async function staffInbox(actor: Extract<ChatActor, { kind: "staff" }>) {
  const leadIds = isAdmin(actor.role)
    ? null
    : [
        ...new Set([
          ...(await prisma.leadMaster.findMany({ where: { vendor_id: actor.vendorId, assign_to: actor.userId }, select: { id: true } })).map((l) => l.id),
          ...(await prisma.leadUserMapping.findMany({ where: { vendor_id: actor.vendorId, user_id: actor.userId, status: "active" }, select: { lead_id: true } })).map((m) => m.lead_id),
          ...(await prisma.leadSiteSupervisorMapping.findMany({ where: { vendor_id: actor.vendorId, user_id: actor.userId, status: "active" }, select: { lead_id: true } })).map((m) => m.lead_id),
        ]),
      ];
  const rooms = await prisma.clientChatRoom.findMany({
    where: { vendor_id: actor.vendorId, last_message_at: { not: null }, ...(leadIds ? { lead_id: { in: leadIds } } : {}) },
    orderBy: { last_message_at: "desc" },
    take: 100,
  });
  const leads = await prisma.leadMaster.findMany({ where: { id: { in: rooms.map((r) => r.lead_id) } }, select: leadSelect });
  const leadOf = new Map(leads.map((l) => [l.id, l]));
  const reads = await prisma.clientChatStaffRead.findMany({ where: { user_id: actor.userId, room_id: { in: rooms.map((r) => r.id) } } });
  const readOf = new Map(reads.map((r) => [r.room_id, r.read_id]));

  return Promise.all(
    rooms
      .filter((r) => leadOf.has(r.lead_id))
      .map(async (room) => {
        const lead = leadOf.get(room.lead_id)!;
        const last = await prisma.clientChatMessage.findFirst({ where: { room_id: room.id }, orderBy: { id: "desc" } });
        const unread = await prisma.clientChatMessage.count({
          where: { room_id: room.id, id: { gt: readOf.get(room.id) ?? 0 }, sender_type: "CLIENT", deleted_at: null },
        });
        return {
          lead_id: lead.id,
          lead_code: lead.lead_code,
          client_name: `${lead.firstname} ${lead.lastname}`.trim(),
          unread,
          last_message: last ? { at: last.created_at.toISOString(), preview: lastPreview(last), from_client: last.sender_type === "CLIENT" } : null,
        };
      }),
  );
}

/* ----------------------------- Automatic posts ----------------------------- */

/** Posts a CRM update (stage, visit, dispatch, payment) into the client chat. */
export async function postAutoMessage(leadId: number, auto: ClientChatAutoKind, title: string, body: string) {
  const lead = await prisma.leadMaster.findFirst({
    where: { id: leadId, is_deleted: false, vendor: { is_furnixcrm_app_enabled: true, status: "active" } },
    select: leadSelect,
  });
  if (!lead) return null;
  const room = await roomFor(lead);
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.clientChatMessage.create({
      data: { room_id: room.id, sender_type: "SYSTEM", kind: "AUTO", auto_kind: auto, auto_title: title.slice(0, 255), text: body },
    });
    await tx.clientChatRoom.update({ where: { id: room.id }, data: { last_message_at: m.created_at } });
    return m;
  });
  if (lead.email) await sendClientPush(lead.email, { title, body: body.slice(0, 200), data: { type: "client_chat", lead_id: lead.id } }).catch(() => undefined);
  return message.id;
}
