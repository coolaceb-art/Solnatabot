import { Router, type IRouter } from "express";
import healthRouter from "./health";
import relayRouter from "./relay";
import webhookRouter from "./webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(relayRouter);
router.use(webhookRouter);

export default router;
