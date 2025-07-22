import { prisma } from '../../prisma/client';
import bcrypt from 'bcryptjs';

export const createUserService = async (data: {
    vendor_id: number;
    user_name: string;
    user_contact: string;
    user_email: string;
    user_timezone: string;
    password: string;
    user_type_id: number;
    status?: string;
  }) => {
    const hashedPassword = await bcrypt.hash(data.password, 10);
  
    return prisma.userMaster.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });
};