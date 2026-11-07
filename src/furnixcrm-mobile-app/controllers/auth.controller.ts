import { Request, Response } from "express";
import { MobileAuthService } from "../services/auth.service";

const mobileAuthService = new MobileAuthService();

type Handler = (req: Request) => Promise<{ status: number; body: unknown }>;

const handle =
  (label: string, handler: Handler) => async (req: Request, res: Response) => {
    try {
      const response = await handler(req);
      return res.status(response.status).json(response.body);
    } catch (err) {
      console.error(`[furnixcrm-app] ${label} error:`, err);
      return res.status(500).json({ message: "Server error" });
    }
  };

export const identify = handle("Identify", (req) => mobileAuthService.identify(req));
export const login = handle("Login", (req) => mobileAuthService.loginSystemUser(req));
export const sendClientOtp = handle("Send OTP", (req) =>
  mobileAuthService.sendClientOtp(req),
);
export const verifyClientOtp = handle("Verify OTP", (req) =>
  mobileAuthService.verifyClientOtp(req),
);
