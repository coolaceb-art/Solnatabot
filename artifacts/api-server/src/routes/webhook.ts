import { Router, Request, Response } from "express";

const router = Router();

// Environment Variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
const VIP_CHANNEL_ID = process.env.VIP_CHANNEL_ID || "";
const FREE_CHANNEL_ID = process.env.FREE_CHANNEL_ID || "";
const MIN_SOL_TO_ALERT = 0.1; // Minimum SOL threshold to trigger alerts

// Ignore stablecoins (USDC, USDT, USD1)
const IGNORED_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"  // USD1
]);

const WSOL_MINT = "So11111111111111111111111111111111111111112";

interface ParsedSwap {
  type: "BUY" | "SELL";
  tokenMint: string;
  solAmount: number;
  tokenAmount: number;
  wallet: string;
  walletLabel: string;
  signature: string;
  source: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 8) return "Unknown";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function parseHeliusSwap(tx: any): ParsedSwap | null {
  try {
    if (!tx || (tx.type && tx.type !== "SWAP")) return null;

    const tokenTransfers: any[] = tx.tokenTransfers || [];
    const nativeTransfers: any[] = tx.nativeTransfers || [];
    const source: string = tx.source || "DEX";
    const signature: string = tx.signature || "";

    // Dynamic wallet resolution directly from Helius feePayer
    const activeWallet: string = tx.feePayer || (tokenTransfers[0]?.fromUserAccount) || "";
    if (!activeWallet) return null;

    let targetTokenMint = "";
    let targetTokenAmount = 0;
    let isBuy = false;

    // Identify primary non-stable token involved in the trade
    for (const t of tokenTransfers) {
      if (IGNORED_MINTS.has(t.mint)) continue;

      if (t.fromUserAccount === activeWallet || t.toUserAccount === activeWallet) {
        const amt = Number(t.tokenAmount) || 0;
        if (!targetTokenMint || amt > targetTokenAmount) {
          targetTokenMint = t.mint;
          targetTokenAmount = amt;
          isBuy = t.toUserAccount === activeWallet;
        }
      }
    }

    if (!targetTokenMint) return null;

    // Calculate SOL volume (Check WSOL transfers first, then Native SOL fallback)
    let solAmount = 0;

    for (const t of tokenTransfers) {
      if (t.mint === WSOL_MINT && (t.fromUserAccount === activeWallet || t.toUserAccount === activeWallet)) {
        solAmount += Number(t.tokenAmount) || 0;
      }
    }

    if (solAmount === 0) {
      for (const n of nativeTransfers) {
        if (n.fromUserAccount === activeWallet || n.toUserAccount === activeWallet) {
          const amt = (Number(n.amount) || 0) / 1e9;
          if (amt > 0.005) { // Filter out minor network gas/rent fees
            solAmount += amt;
          }
        }
      }
    }

    if (solAmount < MIN_SOL_TO_ALERT) return null;

    return {
      type: isBuy ? "BUY" : "SELL",
      tokenMint: targetTokenMint,
      solAmount: Number(solAmount.toFixed(4)),
      tokenAmount: targetTokenAmount,
      wallet: activeWallet,
      walletLabel: shortAddress(activeWallet),
      signature,
      source
    };
  } catch (err: any) {
    console.error("parseHeliusSwap error:", err.message);
    return null;
  }
}

async function getDexScreenerData(mint: string) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const data = (await res.json()) as any;
    const pair = data?.pairs?.[0];
    return {
      symbol: escapeHtml(pair?.baseToken?.symbol || "TOKEN"),
      name: escapeHtml(pair?.baseToken?.name || "Solana Token"),
      marketCap: pair?.marketCap ? `$${pair.marketCap.toLocaleString()}` : "N/A",
    };
  } catch {
    return { symbol: "MEME", name: "Solana Token", marketCap: "N/A" };
  }
}

async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: any) {
  if (!chatId || !TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      }),
    });
  } catch (err: any) {
    console.error("Telegram Delivery Error:", err.message);
  }
}

router.post("/", async (req: Request, res: Response) => {
  res.status(200).send("OK");

  const events = Array.isArray(req.body) ? req.body : [req.body];

  for (const event of events) {
    const swap = parseHeliusSwap(event);
    if (!swap) continue;

    const meta = await getDexScreenerData(swap.tokenMint);
    const emoji = swap.type === "BUY" ? "🟢" : "🔴";

    const vipMsg =
      `${emoji} <b>WHALE ${swap.type}</b> [${escapeHtml(swap.source)}]\n\n` +
      `<b>Wallet:</b> <code>${swap.walletLabel}</code>\n` +
      `<b>Amount:</b> ${swap.solAmount.toFixed(2)} SOL\n` +
      `<b>Token:</b> $${meta.symbol}\n` +
      `<b>Market Cap:</b> ${meta.marketCap}\n\n` +
      `<b>CA:</b> <code>${swap.tokenMint}</code>`;

    const freeMsg =
      `${emoji} <b>WHALE ${swap.type} · ${swap.solAmount.toFixed(1)} SOL</b>\n\n` +
      `<b>Token:</b> $${meta.symbol}\n` +
      `<b>Market Cap:</b> ${meta.marketCap}\n\n` +
      `<b>CA:</b> <code>${swap.tokenMint}</code>`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "📊 Chart", url: `https://dexscreener.com/solana/${swap.tokenMint}` },
          { text: "⚡ Fast Buy", url: `https://photon-sol.tinyastro.io/en/lp/${swap.tokenMint}` },
          { text: "🔗 TX", url: `https://solscan.io/tx/${swap.signature}` },
        ],
      ],
    };

    if (VIP_CHANNEL_ID) {
      await sendTelegramMessage(VIP_CHANNEL_ID, vipMsg, inlineKeyboard);
    }

    if (FREE_CHANNEL_ID && swap.solAmount >= 5) {
      setTimeout(() => {
        sendTelegramMessage(FREE_CHANNEL_ID, freeMsg, inlineKeyboard).catch((err) => {
          console.error("Delayed Send Error:", err.message);
        });
      }, 60000);
    }
  }
});

export default router;
