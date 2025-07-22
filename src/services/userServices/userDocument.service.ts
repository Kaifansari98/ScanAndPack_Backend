import { prisma } from "../../prisma/client";

interface CreateUserDocumentInput {
  user_id: number;
  document_name: string;
  document_number: string;
  filename: string;
}

export const createUserDocumentService = async (data: CreateUserDocumentInput) => {
  return prisma.userDocument.create({ data });
};

export const getUserDocumentsByUserIdService = async (userId: number) => {
  return prisma.userDocument.findMany({
    where: { user_id: userId },
  });
};

export const deleteUserDocumentService = async (id: number) => {
  return prisma.userDocument.delete({
    where: { id },
  });
};
