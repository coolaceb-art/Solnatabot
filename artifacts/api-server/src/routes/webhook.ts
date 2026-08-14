import { Router, type IRouter, type Request, type Response } from "express";

type JsonRecord = Record<string, unknown>;

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const router: IRouter = Router();

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shorten(value: unknown, maxLength = 180): string {
  const text = asString(value) ?? "Unknown";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatLamports(value: unknown): string {
  const amount = typeof value === "string" ? Number(value) : value;

  if (typeof amount === "number" && Number.isFinite(amount)) {
    return `${(amount / 1_000_000_000).toLocaleString("en-US", {
      maximumFractionDigits: 9,
    })} SOL`;
  }

  return shorten(value);
}

function formatFields(record: JsonRecord, fields: string[]): string[] {
  return fields.flatMap((field) => {
    const value = asString(record[field]);
    return value ? [`<b>${escapeHtml(field)}:</b> ${escapeHtml(shorten(value))}`] : [];
  });
}

function formatTransferList(
  value: unknown,
  label: string,
  amountFormatter: (value: unknown) => string,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const lines = [`<b>${escapeHtml(label)}:</b>`];

  for (const item of value.slice(0, 10)) {
    const transfer = asRecord(item);
    if (!transfer) {
      continue;
    }

    const from =
      asString(transfer.fromUserAccount) ??
      asString(transfer.fromTokenAccount) ??
      "Unknown sender";
    const to =
      asString(transfer.toUserAccount) ??
      asString(transfer.toTokenAccount) ??
      "Unknown recipient";
    const amount =
      transfer.amount !== undefined
        ? amountFormatter(transfer.amount)
        : shorten(transfer.tokenAmount);
    const mint = asString(transfer.mint);
    const suffix = mint ? ` | Mint: <code>${escapeHtml(shorten(mint, 90))}</code>` : "";

    lines.push(
      `• <code>${escapeHtml(shorten(from, 90))}</code> → <code>${escapeHtml(shorten(to, 90))}</code>: ${escapeHtml(amount)}${suffix}`,
    );
  }

  if (value.length > 10) {
    lines.push(`…and ${value.length - 10} more`);
  }

  return lines;
}

function formatEvent(event: JsonRecord, index: number): string {
  const lines = [
    index > 0 ? "" : "",
    `<b>${escapeHtml(asString(event.type) ?? "Solana activity")}</b>`,
  ];

  lines.push(...formatFields(event, ["source", "description", "feePayer", "slot", "timestamp"]));

  const signature = asString(event.signature);
  if (signature) {
    const link = `https://solscan.io/tx/${encodeURIComponent(signature)}`;
    lines.push(`<b>Transaction:</b> <a href="${escapeHtml(link)}">${escapeHtml(shorten(signature, 100))}</a>`);
  }

  if (event.fee !== undefined) {
    lines.push(`<b>Fee:</b> ${escapeHtml(formatLamports(event.fee))}`);
  }

  const transactionError = event.transactionError ?? event.err;
  if (transactionError !== undefined && transactionError !== null) {
    lines.push(`<b>Transaction error:</b> <code>${escapeHtml(shorten(transactionError, 300))}</code>`);
  }

  lines.push(...formatTransferList(event.nativeTransfers, "Native transfers", formatLamports));
  lines.push(
    ...formatTransferList(event.tokenTransfers, "Token transfers", (amount) => shorten(amount)),
  );

  if (Array.isArray(event.accountData) && event.accountData.length > 0) {
    lines.push(`<b>Account changes:</b> ${event.accountData.length}`);
  }

  if (lines.length === 2) {
    const fallback = JSON.stringify(event, null, 2) ?? "{}";
    lines.push(`<pre>${escapeHtml(shorten(fallback, 2_000))}</pre>`);
  }

  return lines.join("\n");
}

function formatHeliusPayload(payload: unknown): string {
  const events = Array.isArray(payload) ? payload : [payload];
  const validEvents = events
    .map(asRecord)
    .filter((event): event is JsonRecord => event !== null);

  const sections = [
    "<b>Helius Solana Alert</b>",
    `<i>${validEvents.length} event${validEvents.length === 1 ? "" : "s"} received</i>`,
    ...validEvents.map(formatEvent),
  ];

  const message = sections.join("\n\n");
  if (message.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 40)}\n\n<i>Alert truncated.</i>`;
}

async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.CHAT_ID;

  if (!token || !chatId) {
    throw new Error(
      "Telegram configuration is missing. Set TELEGRAM_BOT_TOKEN and CHAT_ID.",
    );
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Telegram API returned ${response.status}: ${shorten(responseText, 500)}`,
    );
  }
}

async function handleWebhook(req: Request, res: Response): Promise<void> {
  const payload = req.body;
  const hasPayload =
    Array.isArray(payload)
      ? payload.length > 0
      : (() => {
          const record = asRecord(payload);
          return record !== null && Object.keys(record).length > 0;
        })();

  if (!hasPayload) {
    res.status(400).json({ ok: false, error: "A Helius JSON payload is required." });
    return;
  }

  try {
    const message = formatHeliusPayload(payload);
    await sendTelegramAlert(message);
    req.log.info({ eventCount: Array.isArray(payload) ? payload.length : 1 }, "Helius alert forwarded to Telegram");
    res.status(200).json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "Failed to forward Helius alert to Telegram");
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to send Telegram alert.",
    });
  }
}

router.post("/webhook", handleWebhook);

export default router;