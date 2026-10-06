import { Router, type IRouter } from "express";
import authRouter from "./auth.js";
import healthRouter from "./health.js";
import versionRouter from "./version.js";
import meRouter from "./me.js";
import ordersRouter from "./orders.js";
import providersRouter from "./providers.js";
import walletRouter from "./wallet.js";
import referralsRouter from "./referrals.js";
import notificationsRouter from "./notifications.js";
import supportRouter from "./support.js";
import adminRouter from "./admin.js";
import claimsRouter from "./claims.js";
import reportsRouter from "./reports.js";
import expoQrRouter from "./expo-qr.js";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(versionRouter);
router.use(expoQrRouter);
router.use(meRouter);
router.use(ordersRouter);
router.use(walletRouter);
router.use(providersRouter);
router.use(referralsRouter);
router.use(notificationsRouter);
router.use(supportRouter);
router.use(adminRouter);
router.use(claimsRouter);
router.use(reportsRouter);

export default router;
