import { randomUUID } from "node:crypto";

export type RelayDeliveryStatus = "delivered" | "failed";

export interface RelayEvent {
  id: string;
  receivedAt: string;
  eventType: string;
  summary: string;
  signature: string | null;
  status: RelayDeliveryStatus;
  error: string | null;
}

const MAX_RECENT_EVENTS = 50;
const recentEvents: RelayEvent[] = [];

let lastDeliveryAt: string | null = null;
let lastDeliveryStatus: RelayDeliveryStatus | null = null;
let lastDeliveryError: string | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
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

function summarizeEvent(event: Record<string, unknown>): string {
  const description = asString(event.description);
  if (description) {
    return description.slice(0, 180);
  }

  const type = asString(event.type);
  if (type) {
    return `${type} event received`;
  }

  return "Solana activity received";
}

export function recordRelayEvents(payload: unknown): string[] {
  const events = Array.isArray(payload) ? payload : [payload];
  const receivedAt = new Date().toISOString();
  const ids: string[] = [];

  for (const item of events) {
    const event = asRecord(item);
    if (!event) {
      continue;
    }

    const id = randomUUID();
    ids.push(id);
    recentEvents.unshift({
      id,
      receivedAt,
      eventType: asString(event.type) ?? "Solana activity",
      summary: summarizeEvent(event),
      signature: asString(event.signature),
      status: "failed",
      error: "Delivery pending",
    });
  }

  recentEvents.splice(MAX_RECENT_EVENTS);
  return ids;
}

export function markRelayDelivery(
  eventIds: string[],
  status: RelayDeliveryStatus,
  error: string | null = null,
): void {
  const deliveryAt = new Date().toISOString();
  lastDeliveryAt = deliveryAt;
  lastDeliveryStatus = status;
  lastDeliveryError = error;

  for (const event of recentEvents) {
    if (eventIds.includes(event.id)) {
      event.status = status;
      event.error = error;
    }
  }
}

export function getRelayEvents(): RelayEvent[] {
  return recentEvents.map((event) => ({ ...event }));
}

export function getRelayStatus() {
  const tokenConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const chatIdConfigured = Boolean(process.env.CHAT_ID);

  return {
    configured: tokenConfigured && chatIdConfigured,
    tokenConfigured,
    chatIdConfigured,
    endpointPath: "/webhook",
    recentEventCount: recentEvents.length,
    lastDeliveryAt,
    lastDeliveryStatus,
    lastDeliveryError,
  };
}