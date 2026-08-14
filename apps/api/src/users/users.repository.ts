import { Injectable } from '@nestjs/common';
import type { Role, User as UserRecord } from '@prisma/client';

import { PrismaService } from '../shared/prisma.service';

/** The only place that talks to the `users` table. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  /** Everyone who can still be assigned work. */
  findActive(): Promise<UserRecord[]> {
    return this.prisma.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  /** Every account, deactivated ones included. Administrators only. */
  findAllOrdered(): Promise<UserRecord[]> {
    return this.prisma.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  }

  create(data: {
    name: string;
    email: string;
    password: string;
    role: Role;
    canViewOwnProfitability: boolean;
  }): Promise<UserRecord> {
    return this.prisma.user.create({ data });
  }

  updateAccount(
    id: string,
    data: {
      name: string;
      email: string;
      role: Role;
      active: boolean;
      canViewOwnProfitability: boolean;
    },
  ): Promise<UserRecord> {
    return this.prisma.user.update({ where: { id }, data });
  }

  updateProfile(id: string, data: { name: string; email: string }): Promise<UserRecord> {
    return this.prisma.user.update({
      where: { id },
      data: { name: data.name, email: data.email.toLowerCase() },
    });
  }

  updatePassword(id: string, passwordHash: string): Promise<UserRecord> {
    return this.prisma.user.update({ where: { id }, data: { password: passwordHash } });
  }
}
