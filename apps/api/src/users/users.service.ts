import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { User as UserRecord } from '@prisma/client';
import type { ChangePasswordRequest, UpdateProfileRequest, User } from '@travel-crm/sdk';
import * as bcrypt from 'bcryptjs';

import { UsersRepository } from './users.repository';

const BCRYPT_ROUNDS = 12;

/** Strips the password hash — never let a `UserRecord` reach a response. */
export function toPublicUser(user: UserRecord): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  findById(id: string): Promise<UserRecord | null> {
    return this.users.findById(id);
  }

  async findByIdOrFail(id: string): Promise<UserRecord> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.users.findByEmail(email);
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async updateProfile(id: string, dto: UpdateProfileRequest): Promise<User> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing && existing.id !== id) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: { email: ['That email address is already in use'] },
      });
    }

    return toPublicUser(await this.users.updateProfile(id, dto));
  }

  async changePassword(id: string, dto: ChangePasswordRequest): Promise<void> {
    const user = await this.findByIdOrFail(id);

    if (!(await this.verifyPassword(dto.currentPassword, user.password))) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: { currentPassword: ['That password is incorrect'] },
      });
    }

    await this.users.updatePassword(id, await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS));
  }
}
