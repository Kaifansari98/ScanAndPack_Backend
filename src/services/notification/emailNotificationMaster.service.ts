"use strict";

import { prisma } from "../../prisma/client";

export type CreateEmailNotificationMasterInput = {
  vendor_id: number;
  template_key: string;
  subject: string;
  text: string;
  html: string;
  active?: boolean;
};

export const EmailNotificationMasterService = {
  async create(input: CreateEmailNotificationMasterInput) {
    const vendor = await prisma.vendorMaster.findUnique({
      where: { id: input.vendor_id },
      select: { id: true },
    });

    if (!vendor) {
      throw new Error("Invalid vendor_id");
    }

    return prisma.emailNotificationMaster.create({
      data: {
        vendor_id: input.vendor_id,
        template_key: input.template_key,
        subject: input.subject,
        text: input.text,
        html: input.html,
        active: input.active ?? true,
      },
    });
  },
};
