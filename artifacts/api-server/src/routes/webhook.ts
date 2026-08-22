import { Router, type IRouter, type Request, type Response } from "express";
import {
  markRelayDelivery,
  recordRelayEvents,
} from "../lib/relay-state";

type AlertData = {
  action: string;
  solAmount: string | number;
  tokenSymbol: string;
  ca: string;
  mc: string;
  chartLink: string;
  buyLink: string;
  txLink: string;
  walletLabel: string;
};

const router: IRouter = Router();
const FREE_DELAY_MS = 60 * 1000;
const MIN_SOL_FOR_FREE = 5;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeLink(value: unknown, fallback: string): string {
  const link = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return escapeHtml(link);
}

function formatVIPAlert(data: AlertData): { text: string; options: Record<string, unknown> } {
  const isBuy = String(data.action).toLowerCase() === "buy";
  const emoji = isBuy ? "🟢" : "🔴";

  const text = `
${emoji} <b>SMART MONEY ${escapeHtml(data.action).toUpperCase()}</b>

<b>Wallet:</b> ${escapeHtml(data.walletLabel)}
<b>Size:</b> ${escapeHtml(data.solAmount)} SOL
<b>Token:</b> ${escapeHtml(data.tokenSymbol)}
<b>CA:</b> <code>${escapeHtml(data.ca)}</code>

<b>MC at alert:</b> ${escapeHtml(data.mc)}
`.trim();

  return {
    text,
    options: {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: "📊 Chart", url: safeLink(data.chartLink, "https://dexscreener.com/solana") },
          { text: "⚡ Fast Buy", url: safeLink(data.buyLink, "https://t.me") },
          { text: "🔗 TX", url: safeLink(data.txLink, "https://solscan.io") },
        ]],
      },
    },
  };
}

function formatFreeAlert(data: AlertData): { text: string; options: Record<string, unknown> } {
  const isBuy = String(data.action).toLowerCase() === "buy";
  const emoji = isBuy ? "🟢" : "🔴";

  const text = `
${emoji} <b>${escapeHtml(data.action).toUpperCase()}</b> · ${escapeHtml(data.solAmount)} SOL
${escapeHtml(data.tokenSymbol)}
<code>${escapeHtml(data.ca)}</code>

<b>MC:</b> ${escapeHtml(data.mc)}
`.trim();

  return {
    text,
    options: {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: "📊 Chart", url: safeLink(data.chartLink, "https://dexscreener.com/solana") },
          { text: "🛒 Buy", url: safeLink(data.buyLink, "https://t.me") },
          { text: "🔗 TX", url: safeLink(data.txLink, "https://solscan.io") },
        ]],
      },
    },
  };
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: Record<string, unknown>,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN or BOT_TOKEN is not configured.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...options }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Telegram API returned ${response.status}: ${details.slice(0, 500)}`);
  }
}

async function sendAlert(data: AlertData, log: Request["log"]): Promise<void> {
  try {
    const solAmountNum = Number.parseFloat(String(data.solAmount));
    const vipChannelId = process.env.VIP_CHANNEL_ID;
    const freeChannelId = process.env.FREE_CHANNEL_ID;

    if (vipChannelId) {
      const vip = formatVIPAlert(data);
      await sendTelegramMessage(vipChannelId, vip.text, vip.options);
    }

    if (freeChannelId && solAmountNum >= MIN_SOL_FOR_FREE) {
      const free = formatFreeAlert(data);
      setTimeout(() => {
        void sendTelegramMessage(freeChannelId, free.text, free.options).catch((error: unknown) => {
          log.error({ err: error }, "Free alert error");
        });
      }, FREE_DELAY_MS);
    }
  } catch (error) {
    log.error({ err: error }, "sendAlert error");
    throw error;
  }
}

function normalizeAlert(event: Record<string, unknown>): AlertData {
  const ca = typeof event.ca === "string" && event.ca
    ? event.ca
    : "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump";
  const signature = typeof event.signature === "string" ? event.signature : "";

  return {
    action: typeof event.action === "string" && event.action ? event.action : "Buy",
    solAmount: typeof event.solAmount === "string" || typeof event.solAmount === "number"
      ? event.solAmount
      : 12.8,
    tokenSymbol: typeof event.tokenSymbol === "string" && event.tokenSymbol ? event.tokenSymbol : "$TICKER",
    ca,
    mc: typeof event.mc === "string" && event.mc ? event.mc : "$38K",
    chartLink: typeof event.chartLink === "string" && event.chartLink
      ? event.chartLink
      : `https://dexscreener.com/solana/${ca}`,
    buyLink: typeof event.buyLink === "string" && event.buyLink
      ? event.buyLink
      : "https://t.me/solana_trojanbot?start=r-your_id",
    txLink: typeof event.txLink === "string" && event.txLink
      ? event.txLink
      : `https://solscan.io/tx/${signature}`,
    walletLabel: typeof event.walletLabel === "string" && event.walletLabel
      ? event.walletLabel
      : "Whale #17",
  };
}

router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  res.status(200).send("OK");

  const payload: unknown = req.body;
  if (!payload) {
    return;
  }

  const events = Array.isArray(payload) ? payload : [payload];
  const eventIds = recordRelayEvents(payload);

  try {
    for (const item of events) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        continue;
      }

      const data = normalizeAlert(item as Record<string, unknown>);
      if (data.tokenSymbol && data.ca) {
        await sendAlert(data, req.log);
      }
    }

    markRelayDelivery(eventIds, "delivered");
    req.log.info({ eventCount: events.length }, "Smart money alert forwarded");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    markRelayDelivery(eventIds, "failed", message);
    req.log.error({ err: error }, "Webhook processing error");
  }
});

export default router;