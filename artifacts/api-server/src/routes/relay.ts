import { Router, type IRouter } from "express";
import {
  GetRelayEventsResponse,
  GetRelayStatusResponse,
} from "@workspace/api-zod";
import { getRelayEvents, getRelayStatus } from "../lib/relay-state";

const router: IRouter = Router();

router.get("/relay/status", (_req, res) => {
  res.json(GetRelayStatusResponse.parse(getRelayStatus()));
});

router.get("/relay/events", (_req, res) => {
  res.json(GetRelayEventsResponse.parse(getRelayEvents()));
});

export default router;