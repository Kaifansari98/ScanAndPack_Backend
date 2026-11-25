import { redis } from "../../config/redis";
import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";
import { STAGES, tagNumber } from "../projectTracker/projectTracker.core";
import { postAutoMessage } from "./clientChat.service";

// Posts CRM events into client chats as "Shambhala update" cards, by reading
// new rows since the last run instead of hooking every CRM service:
//   - stage changes (LeadStatusLogs), incl. dispatch details at "Dispatch"
//   - visits scheduled (Final Measurements / Site Readiness tasks)
//   - payments received (PaymentInfo)
// Each source keeps its cursor in Redis. On the first run the cursor starts at
// the newest row, so existing history isn't replayed into chats.

const BATCH = 200;
const VISIT_TASKS: Record<string, string> = {
  "Final Measurements": "Final measurement",
  "Site Readiness": "Site readiness check",
};

const PAYMENT_LABELS: Record<string, string> = {
  initial_site_measurement_payment: "your site measurement",
  "bd-ism-payment": "your site measurement",
  booking_amount: "your booking",
  client_approval_payment: "your design approval",
  additional_payment: "your project",
  "dispatch-planning-additional_payment": "your dispatch",
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (d: Date) =>
  d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const time = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

// Date-only due dates are stored as midnight UTC: show no time for those.
const hasTime = (d: Date) => d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;

// Client stage (tracker index) for a CRM tag; tags 1–3 are pre-booking.
const stageIndex = (tag: number) => (tag >= 17 ? STAGES.length : STAGES.findIndex((s) => s.tags.includes(tag)));

async function cursor(name: string, newest: () => Promise<number>) {
  const key = `cchat:auto:${name}`;
  const value = await redis.get(key);
  if (value !== null) return { key, from: Number(value) };
  const start = await newest();
  await redis.set(key, String(start));
  return { key, from: start };
}

/** App-enabled vendors only: other vendors' clients have no chat. */
async function appVendors() {
  const vendors = await prisma.vendorMaster.findMany({
    where: { is_furnixcrm_app_enabled: true, status: "active" },
    select: { id: true, vendor_name: true },
  });
  return new Map(vendors.map((v) => [v.id, v.vendor_name]));
}

async function stageChanges(vendors: Map<number, string>) {
  const c = await cursor("statuslog", async () => (await prisma.leadStatusLogs.aggregate({ _max: { id: true } }))._max.id ?? 0);
  const logs = await prisma.leadStatusLogs.findMany({
    where: { id: { gt: c.from } },
    select: {
      id: true,
      lead_id: true,
      statusType: { select: { tag: true } },
      lead: {
        select: {
          vendor_id: true,
          is_deleted: true,
          dispatch_date: true,
          driver_name: true,
          driver_number: true,
          vehicle_no: true,
        },
      },
    },
    orderBy: { id: "asc" },
    take: BATCH,
  });
  for (const log of logs) {
    const tag = tagNumber(log.statusType.tag);
    if (log.lead.is_deleted || !vendors.has(log.lead.vendor_id) || tag < 4) continue;
    const prev = await prisma.leadStatusLogs.findFirst({
      where: { lead_id: log.lead_id, id: { lt: log.id } },
      orderBy: { id: "desc" },
      select: { statusType: { select: { tag: true } } },
    });
    const prevTag = tagNumber(prev?.statusType.tag);
    if (prevTag === tag) continue;

    if (tag === 14) {
      const l = log.lead;
      const details = [
        l.dispatch_date ? `Dispatched on ${day(l.dispatch_date)}.` : "Your furniture is on its way.",
        l.driver_name ? `Driver: ${l.driver_name}${l.driver_number ? ` (${l.driver_number})` : ""}.` : null,
        l.vehicle_no ? `Vehicle: ${l.vehicle_no}.` : null,
        "Please keep space ready for unloading.",
      ].filter(Boolean);
      await postAutoMessage(log.lead_id, "DISPATCH", "Your furniture is on its way", details.join(" "));
      continue;
    }

    const now = stageIndex(tag);
    if (now < 0 || now === stageIndex(prevTag)) continue;
    if (now >= STAGES.length) {
      await postAutoMessage(log.lead_id, "STAGE", "Project handed over", "Your project is complete. Thank you for choosing us; we're always here to help.");
    } else if (STAGES[now].key === "BOOKING") {
      await postAutoMessage(
        log.lead_id,
        "STAGE",
        "Booking confirmed",
        `Welcome to the ${vendors.get(log.lead.vendor_id)} family! Your project team will keep you posted here.`,
      );
    } else {
      await postAutoMessage(log.lead_id, "STAGE", `Your project is now in ${STAGES[now].name}`, STAGES[now].description);
    }
  }
  if (logs.length) await redis.set(c.key, String(logs[logs.length - 1].id));
}

async function visits(vendors: Map<number, string>) {
  const c = await cursor("visit", async () => (await prisma.userLeadTask.aggregate({ _max: { id: true } }))._max.id ?? 0);
  const tasks = await prisma.userLeadTask.findMany({
    where: { id: { gt: c.from } },
    select: {
      id: true,
      lead_id: true,
      vendor_id: true,
      task_type: true,
      due_date: true,
      user: { select: { user_name: true } },
    },
    orderBy: { id: "asc" },
    take: BATCH,
  });
  for (const t of tasks) {
    const label = VISIT_TASKS[t.task_type];
    if (!label || !vendors.has(t.vendor_id)) continue;
    await postAutoMessage(
      t.lead_id,
      "VISIT",
      `${label} scheduled`,
      `${day(t.due_date)}${hasTime(t.due_date) ? ` · ${time(t.due_date)}` : ""}. ${t.user?.user_name ?? "Our team"} will visit your site.`,
    );
  }
  if (tasks.length) await redis.set(c.key, String(tasks[tasks.length - 1].id));
}

async function payments(vendors: Map<number, string>) {
  const c = await cursor("payment", async () => (await prisma.paymentInfo.aggregate({ _max: { id: true } }))._max.id ?? 0);
  const rows = await prisma.paymentInfo.findMany({
    where: { id: { gt: c.from } },
    select: { id: true, lead_id: true, vendor_id: true, amount: true, total_amount: true, is_archived: true, paymentType: { select: { type: true } } },
    orderBy: { id: "asc" },
    take: BATCH,
  });
  for (const p of rows) {
    const amount = p.total_amount ?? p.amount ?? 0;
    if (p.is_archived || amount <= 0 || !vendors.has(p.vendor_id)) continue;
    const towards = PAYMENT_LABELS[p.paymentType.type];
    await postAutoMessage(
      p.lead_id,
      "PAYMENT",
      "Payment received",
      `We've received ${inr(amount)}${towards ? ` towards ${towards}` : ""}. Thank you!`,
    );
  }
  if (rows.length) await redis.set(c.key, String(rows[rows.length - 1].id));
}

let running = false;

const LOCK = "cchat:auto:lock";

export async function processClientChatAutoMessages() {
  if (running) return;
  running = true;
  let locked = false;
  try {
    // One run at a time across server processes, so nothing is posted twice.
    locked = (await redis.set(LOCK, String(process.pid), { NX: true, EX: 120 })) === "OK";
    if (!locked) return;
    const vendors = await appVendors();
    if (!vendors.size) return;
    await stageChanges(vendors);
    await visits(vendors);
    await payments(vendors);
  } catch (error) {
    logger.error("[client-chat] auto messages failed", error);
  } finally {
    if (locked) await redis.del(LOCK).catch(() => undefined);
    running = false;
  }
}
