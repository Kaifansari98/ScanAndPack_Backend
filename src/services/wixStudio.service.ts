import { prisma } from "../prisma/client";

export class WixStudioService {
  captureData = async (payload: any) => {
    return prisma.wixStudioDataCapture.create({
      data: {
        payload: payload ?? {},
      },
    });
  };
}

export const wixStudioService = new WixStudioService();
