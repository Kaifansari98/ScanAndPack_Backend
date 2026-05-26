import { prisma } from "../../prisma/client";
import { NotificationType } from "../../prisma/generated";
import { NotificationService } from "../notification/notification.service";
import logger from "../../utils/logger";
import {
  generateSignedUrl,
  uploadToWasabiLeadChatAttachment,
} from "../../utils/wasabiClient";
import fs from "node:fs/promises";

export class ChatService {
  private static mapReplyPreview(
    row:
      | {
          id: number;
          sender_id: number;
          message_text: string | null;
          sender: { user_name: string | null };
          attachments: Array<{
            document: { doc_og_name: string };
          }>;
        }
      | null
      | undefined,
  ) {
    if (!row) return null;

    return {
      id: row.id,
      sender_id: row.sender_id,
      sender_name: row.sender?.user_name ?? "Unknown",
      message_text: row.message_text,
      attachment_name: row.attachments[0]?.document?.doc_og_name ?? null,
      attachment_count: row.attachments.length,
    };
  }

  private static async resolveChatMemberIds(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
      leadId: number;
      vendorId: number;
      franchiseId: number | null;
      userId: number;
    }
  ) {
    const { leadId, vendorId, franchiseId, userId } = params;

    const [superAdminUsers, adminUsers, mappedUsers] = await Promise.all([
      tx.userMaster.findMany({
        where: {
          vendor_id: vendorId,
          status: "active",
          user_type: { user_type: "super-admin" },
        },
        select: { id: true },
      }),
      franchiseId == null
        ? Promise.resolve([])
        : tx.userMaster.findMany({
            where: {
              vendor_id: vendorId,
              franchise_id: franchiseId,
              status: "active",
              user_type: { user_type: "admin" },
            },
            select: { id: true },
          }),
      tx.leadUserMapping.findMany({
        where: {
          lead_id: leadId,
          vendor_id: vendorId,
          status: "active",
        },
        select: { user_id: true },
      }),
    ]);

    return new Set<number>([
      ...superAdminUsers.map((user) => user.id),
      ...adminUsers.map((user) => user.id),
      ...mappedUsers.map((mapping) => mapping.user_id),
      userId,
    ]);
  }

  static async checkChatRoomByLeadId(leadId: number) {
    const lead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: { id: true },
    });

    if (!lead) {
      const error = new Error(`Lead ${leadId} not found`);
      (error as any).statusCode = 404;
      throw error;
    }

    const room = await prisma.leadChatRoom.findFirst({
      where: { lead_id: leadId },
      select: {
        id: true,
        lead_id: true,
        vendor_id: true,
        created_at: true,
      },
    });

    return { exists: !!room, room };
  }

  static async createChatRoomIfMissing(leadId: number, userId: number) {
    const messageResult = await prisma.$transaction(async (tx) => {
      const lead = await tx.leadMaster.findUnique({
        where: { id: leadId },
        select: { id: true, vendor_id: true, franchise_id: true },
      });

      if (!lead) {
        const error = new Error(`Lead ${leadId} not found`);
        (error as any).statusCode = 404;
        throw error;
      }

      const existingRoom = await tx.leadChatRoom.findFirst({
        where: { lead_id: leadId },
        select: {
          id: true,
          lead_id: true,
          vendor_id: true,
          created_at: true,
        },
      });

      const desiredMemberIds = await ChatService.resolveChatMemberIds(tx, {
        leadId,
        vendorId: lead.vendor_id,
        franchiseId: lead.franchise_id ?? null,
        userId,
      });

      if (existingRoom) {
        const existingMembers = await tx.leadChatMember.findMany({
          where: { chat_room_id: existingRoom.id },
          select: { user_id: true },
        });

        const existingMemberIds = new Set(
          existingMembers.map((member) => member.user_id)
        );

        const newMemberIds = Array.from(desiredMemberIds).filter(
          (memberId) => !existingMemberIds.has(memberId)
        );

        if (newMemberIds.length > 0) {
          await tx.leadChatMember.createMany({
            data: newMemberIds.map((memberId) => ({
              chat_room_id: existingRoom.id,
              user_id: memberId,
              added_by: userId,
            })),
            skipDuplicates: true,
          });
        }

        return { created: false, room: existingRoom };
      }

      const room = await tx.leadChatRoom.create({
        data: {
          lead_id: leadId,
          vendor_id: lead.vendor_id,
        },
        select: {
          id: true,
          lead_id: true,
          vendor_id: true,
          created_at: true,
        },
      });

      if (desiredMemberIds.size > 0) {
        await tx.leadChatMember.createMany({
          data: Array.from(desiredMemberIds).map((memberId) => ({
            chat_room_id: room.id,
            user_id: memberId,
            added_by: userId,
          })),
          skipDuplicates: true,
        });
      }

      return { created: true, room };
    });

    return messageResult;
  }

  static async getChatMembersByLead(leadId: number, vendorId: number) {
    const room = await prisma.leadChatRoom.findFirst({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
      },
      select: {
        id: true,
        members: {
          select: {
            user: {
              select: {
                id: true,
                user_name: true,
                user_email: true,
                user_contact: true,
                user_type: { select: { user_type: true } },
              },
            },
          },
        },
      },
    });

    if (!room) {
      return [];
    }

    return room.members.map((member) => ({
      id: member.user.id,
      user_name: member.user.user_name,
      role: member.user.user_type.user_type,
      email: member.user.user_email,
      number: member.user.user_contact,
    }));
  }

  static async sendMessage(params: {
    leadId: number;
    vendorId: number;
    userId: number;
    messageText?: string;
    files?: Express.Multer.File[];
    mentionUserIds?: number[];
    replyToMessageId?: number;
    clientBaseUrl?: string;
  }) {
    const {
      leadId,
      vendorId,
      userId,
      messageText,
      files,
      mentionUserIds,
      replyToMessageId,
      clientBaseUrl,
    } = params;
  
    const trimmedText = messageText?.trim() || "";
    const attachmentFiles = files || [];
  
    if (!trimmedText && attachmentFiles.length === 0) {
      const error = new Error("message_text or attachments are required");
      (error as any).statusCode = 400;
      throw error;
    }
  
    if (attachmentFiles.length > 5) {
      const error = new Error("Maximum 5 attachments allowed");
      (error as any).statusCode = 400;
      throw error;
    }
  
    // ==============================
    // PHASE 1: UPLOAD FILES (NO DB)
    // ==============================
    const uploadedFiles: {
      originalName: string;
      sysName: string;
    }[] = [];
  
    for (const file of attachmentFiles) {
      const sysName = await uploadToWasabiLeadChatAttachment(
        file.path,
        vendorId,
        leadId,
        file.originalname,
        file.mimetype
      );
  
      uploadedFiles.push({
        originalName: file.originalname,
        sysName,
      });
  
      await fs.unlink(file.path); // cleanup temp file
    }
  
    // ==============================
    // PHASE 2: DATABASE TRANSACTION
    // ==============================
    const messageResult = await prisma.$transaction(async (tx) => {
      const lead = await tx.leadMaster.findFirst({
        where: { id: leadId, vendor_id: vendorId, is_deleted: false },
        select: { id: true, vendor_id: true, account_id: true, franchise_id: true },
      });
  
      if (!lead) {
        const error = new Error(
          `Lead ${leadId} not found for vendor ${vendorId}`
        );
        (error as any).statusCode = 404;
        throw error;
      }

      let repliedToMessage:
        | {
            id: number;
            chat_room_id: number;
          }
        | null = null;
  
      let chatRoom = await tx.leadChatRoom.findFirst({
        where: { lead_id: leadId, vendor_id: vendorId },
        select: { id: true },
      });
  
      if (!chatRoom) {
        chatRoom = await tx.leadChatRoom.create({
          data: { lead_id: leadId, vendor_id: vendorId },
          select: { id: true },
        });

        const memberIds = await ChatService.resolveChatMemberIds(tx, {
          leadId,
          vendorId,
          franchiseId: lead.franchise_id ?? null,
          userId,
        });

        if (memberIds.size > 0) {
          await tx.leadChatMember.createMany({
            data: Array.from(memberIds).map((memberId) => ({
              chat_room_id: chatRoom!.id,
              user_id: memberId,
              added_by: userId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (replyToMessageId) {
        repliedToMessage = await tx.leadChatMessage.findFirst({
          where: {
            id: replyToMessageId,
            chat_room_id: chatRoom.id,
          },
          select: {
            id: true,
            chat_room_id: true,
          },
        });

        if (!repliedToMessage) {
          const error = new Error("Reply target message not found in this chat");
          (error as any).statusCode = 400;
          throw error;
        }
      }
  
      const message = await tx.leadChatMessage.create({
        data: {
          chat_room_id: chatRoom.id,
          sender_id: userId,
          reply_to_message_id: repliedToMessage?.id ?? null,
          message_type: uploadedFiles.length ? "attachment" : "text",
          message_text: trimmedText || null,
        },
        select: {
          id: true,
          chat_room_id: true,
          sender_id: true,
          reply_to_message_id: true,
          message_type: true,
          message_text: true,
          created_at: true,
          repliedToMessage: {
            select: {
              id: true,
              sender_id: true,
              message_text: true,
              sender: {
                select: {
                  user_name: true,
                },
              },
              attachments: {
                include: {
                  document: {
                    select: {
                      doc_og_name: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
  
      // Mentions
      const mentionIds = Array.from(
        new Set((mentionUserIds || []).filter((id) => id && id > 0))
      );
  
      if (mentionIds.length > 0) {
        await tx.leadChatMention.createMany({
          data: mentionIds.map((mentioned_user_id) => ({
            msg_id: message.id,
            mentioned_user_id,
          })),
          skipDuplicates: true,
        });
      }
  
      // Attachments
      const attachments: {
        id: number;
        doc_og_name: string;
        doc_sys_name: string;
        created_at: Date;
        signed_url: string;
      }[] = [];
  
      for (const file of uploadedFiles) {
        const doc = await tx.leadChatDocument.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            created_by: userId,
            lead_id: leadId,
            vendor_id: vendorId,
            account_id: lead.account_id || null,
          },
        });
  
        await tx.leadChatAttachment.create({
          data: {
            msg_id: message.id,
            doc_id: doc.id,
          },
        });
  
        attachments.push({
          id: doc.id,
          doc_og_name: doc.doc_og_name,
          doc_sys_name: doc.doc_sys_name,
          created_at: doc.created_at,
          signed_url: await generateSignedUrl(doc.doc_sys_name),
        });
      }
  
      return {
        ...message,
        attachments,
        reply_to: ChatService.mapReplyPreview(message.repliedToMessage),
      };
    });

    const mentionIds = Array.from(
      new Set((mentionUserIds || []).filter((id) => id && id > 0))
    ).filter((id) => id !== userId);

    if (mentionIds.length > 0) {
      try {
        const [lead, sender] = await Promise.all([
          prisma.leadMaster.findUnique({
            where: { id: leadId },
            select: { account_id: true, firstname: true, lastname: true, lead_code: true, franchise_id: true },
          }),
          prisma.userMaster.findUnique({
            where: { id: userId },
            select: { user_name: true },
          }),
        ]);

        const leadName = `${lead?.firstname ?? ""} ${lead?.lastname ?? ""}`.trim();
        const leadCode =
          lead?.lead_code ?? `LEAD-${String(leadId).padStart(4, "0")}`;
        const senderName = sender?.user_name ?? "Someone";
        const redirectUrl = lead?.account_id
          ? `/dashboard/leads/details/${leadId}?accountId=${lead.account_id}&tab=chats&messageId=${messageResult.id}`
          : `/dashboard/leads/details/${leadId}?tab=chats&messageId=${messageResult.id}`;
        const franchiseId = lead?.franchise_id ?? null;

        await Promise.all(
          mentionIds.map((mentionedUserId) =>
            NotificationService.createAndSend({
              vendor_id: vendorId,
              user_id: mentionedUserId,
              sender_id: userId,
              type: NotificationType.CHAT_MENTION,
              title: "Mentioned in chat",
              message:
                leadName.length > 0
                  ? `${senderName} mentioned you in ${leadName}.`
                  : `${senderName} mentioned you in a lead chat.`,
              entity_type: "chat",
              entity_id: messageResult.id,
              redirect_url: redirectUrl,
            })
          )
        );

        const mentionedUsers = await prisma.userMaster.findMany({
          where: {
            id: { in: mentionIds },
            vendor_id: vendorId,
            status: "active",
          },
          select: { id: true, user_name: true, user_email: true },
        });

        const baseUrl = clientBaseUrl || "http://localhost:3000";
        const conversationUrl = `${baseUrl}${redirectUrl}`;
        const mentionText =
          trimmedText.length > 0 ? trimmedText : "Attachment shared.";

        // await Promise.allSettled(
        //   mentionedUsers
        //     .filter((user) => user.user_email && user.id !== userId)
        //     .map((user) =>
        //       sendChatMentionEmail({
        //         vendor_id: vendorId,
        //         toEmail: user.user_email!,
        //         toName: user.user_name ?? undefined,
        //         leadCode,
        //         senderName,
        //         leadName: leadName || "Lead",
        //         messageText: mentionText,
        //         conversationUrl,
        //       })
        //     )
        // );
      } catch (error: any) {
        logger.warn("⚠️ Failed to send chat mention notifications", {
          error: error?.message,
          lead_id: leadId,
          mention_ids: mentionIds,
        });
      }
    }

    return messageResult;
  }

  static async getMessagesByLead(params: {
    leadId: number;
    vendorId: number;
    page: number;
    limit: number;
  }) {
    const { leadId, vendorId, page, limit } = params;

    const room = await prisma.leadChatRoom.findFirst({
      where: { lead_id: leadId, vendor_id: vendorId },
      select: { id: true },
    });

    if (!room) {
      return { todayMessages: [], messages: [], total: 0 };
    }

    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      prisma.leadChatMessage.count({
        where: {
          chat_room_id: room.id,
        },
      }),
      prisma.leadChatMessage.findMany({
        where: {
          chat_room_id: room.id,
        },
        include: {
          attachments: {
            include: {
              document: true,
            },
          },
          repliedToMessage: {
            include: {
              sender: {
                select: {
                  user_name: true,
                },
              },
              attachments: {
                include: {
                  document: {
                    select: {
                      doc_og_name: true,
                    },
                  },
                },
              },
            },
          },
          mentions: {
            include: {
              mentionedUser: {
                select: { id: true, user_name: true },
              },
            },
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayMessages = [];
    const messages = [];

    const mappedRows = await Promise.all(
      rows.map(async (row) => {
        const attachments = await Promise.all(
          row.attachments.map(async (attachment) => ({
            id: attachment.id,
            doc_id: attachment.doc_id,
            doc_og_name: attachment.document.doc_og_name,
            doc_sys_name: attachment.document.doc_sys_name,
            created_at: attachment.document.created_at,
            signed_url: await generateSignedUrl(attachment.document.doc_sys_name),
          }))
        );

        return {
          id: row.id,
          chat_room_id: row.chat_room_id,
          sender_id: row.sender_id,
          reply_to_message_id: row.reply_to_message_id,
          message_type: row.message_type,
          message_text: row.message_text,
          created_at: row.created_at,
          attachments,
          reply_to: ChatService.mapReplyPreview(row.repliedToMessage),
          mentions: row.mentions.map((mention) => ({
            id: mention.mentionedUser.id,
            user_name: mention.mentionedUser.user_name,
          })),
        };
      })
    );

    for (const row of mappedRows) {
      if (row.created_at >= startOfToday) {
        todayMessages.push(row);
      } else {
        messages.push(row);
      }
    }

    return { todayMessages, messages, total };
  }
}
