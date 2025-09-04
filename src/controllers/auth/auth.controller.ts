import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../../prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export const login = async (req: Request, res: Response) => {
  const { identifier, password } = req.body;

  try {
    // ✅ Add validation for required fields
    if (!identifier || !password) {
      return res.status(400).json({ 
        message: 'Identifier (email or phone) and password are required' 
      });
    }

    // ✅ Add type check for identifier
    if (typeof identifier !== 'string') {
      return res.status(400).json({ 
        message: 'Identifier must be a string' 
      });
    }

    // ✅ Check if identifier is email or phone
    const isEmail = identifier.includes('@');
    
    // ✅ Query user by either email or phone
    const user = await prisma.userMaster.findFirst({
      where: isEmail 
        ? { user_email: identifier }
        : { user_contact: identifier },
      include: {
        vendor: true,
        user_type: true,
        documents: true,
        createdProjects: true,
      },
    });

    if (!user) {
      return res.status(404).json({ 
        message: `User not found with ${isEmail ? 'email' : 'phone number'}: ${identifier}` 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      {
        id: user.id,
        vendor_id: user.vendor_id,
        user_type: user.user_type.user_type,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      user,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};