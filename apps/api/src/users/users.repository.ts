import { Injectable } from '@nestjs/common';
import type { User as UserRecord } from '@prisma/client';

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
