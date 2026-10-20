import { Request, Response } from "express";

import {
  verifyCadbidToken,
  checkStudioAccess,
  requestStudioSsoTicket,
  getUserCadbidToken,
  saveUserCadbidToken,
  clearUserCadbidToken,
  getStudioBaseUrl,
} from "../../services/cadbid.service";

export const verifyTokenController = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    console.log("token", token);

    if (!token || typeof token !== "string" || !token.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Cadbid secret key is required" });
    }

    const result = await verifyCadbidToken(token);

    console.log("result", result);

    if (!result.success || !result.data) {
      return res.status(result.statusCode || 401).json({
        success: false,
        message: result.error || "Invalid Cadbid secret key",
      });
    }

    const studioAccess = await checkStudioAccess(token);

    return res.status(200).json({
      success: true,
      message: "Cadbid secret key verified successfully",
      data: {
        cadbidUser: result.data,
        studioAccess: studioAccess.eligible,
      },
    });
  } catch (err: any) {
    console.error("Error in verifyTokenController:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const connectCadbidController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { token } = req.body;
    if (!token || typeof token !== "string" || !token.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Cadbid secret key is required" });
    }

    const result = await verifyCadbidToken(token);
    if (!result.success || !result.data) {
      return res.status(result.statusCode || 401).json({
        success: false,
        message: result.error || "Invalid Cadbid secret key",
      });
    }

    try {
      await saveUserCadbidToken(userId, token);
    } catch (saveErr: any) {
      return res.status(400).json({
        success: false,
        message: saveErr.message || "Failed to save Cadbid connection",
      });
    }

    const studioAccess = await checkStudioAccess(token);

    return res.status(200).json({
      success: true,
      message: "Cadbid account connected successfully",
      data: {
        connected: true,
        studioAccess: studioAccess.eligible,
        cadbidUser: result.data,
      },
    });
  } catch (err: any) {
    console.error("Error in connectCadbidController:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const getCadbidStatusController = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = await getUserCadbidToken(userId);
    if (!token) {
      return res.status(200).json({
        success: true,
        data: {
          connected: false,
          studioAccess: false,
          cadbidUser: null,
        },
      });
    }

    const result = await verifyCadbidToken(token);
    if (!result.success || !result.data) {
      return res.status(200).json({
        success: true,
        data: {
          connected: false,
          studioAccess: false,
          cadbidUser: null,
          error: "Cadbid secret key is invalid or has expired",
        },
      });
    }

    const studioAccess = await checkStudioAccess(token);

    return res.status(200).json({
      success: true,
      data: {
        connected: true,
        studioAccess: studioAccess.eligible,
        cadbidUser: result.data,
      },
    });
  } catch (err: any) {
    console.error("Error in getCadbidStatusController:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const disconnectCadbidController = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await clearUserCadbidToken(userId);

    return res.status(200).json({
      success: true,
      message: "Cadbid account disconnected successfully",
    });
  } catch (err: any) {
    console.error("Error in disconnectCadbidController:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const getStudioSsoUrlController = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = await getUserCadbidToken(userId);
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Cadbid account is not connected",
      });
    }

    const studioAccess = await checkStudioAccess(token);
    if (!studioAccess.eligible) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have access to CADX Studio. Please check your Cadbid subscription.",
      });
    }

    const ticketResult = await requestStudioSsoTicket(token);
    if (!ticketResult.ticket) {
      return res.status(502).json({
        success: false,
        message: ticketResult.error || "Failed to generate Studio login ticket",
      });
    }

    const studioUrl = `${getStudioBaseUrl()}/sso?ticket=${encodeURIComponent(ticketResult.ticket)}`;

    return res.status(200).json({
      success: true,
      data: {
        url: studioUrl,
      },
    });
  } catch (err: any) {
    console.error("Error in getStudioSsoUrlController:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
