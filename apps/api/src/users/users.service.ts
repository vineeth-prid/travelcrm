import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Role, User as UserRecord } from '@prisma/client';
import type {
  ChangePasswordRequest,
  CreateUserRequest,
  UpdateProfileRequest,
  UpdateUserRequest,
  User,
  UserSummary,
} from '@travel-crm/sdk';
import * as bcrypt from 'bcryptjs';

import { UsersRepository } from './users.repository';

const BCRYPT_ROUNDS = 12;

/** Strips the password hash — never let a `UserRecord` reach a response. */
export function toPublicUser(user: UserRecord): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    canViewOwnProfitability: user.canViewOwnProfitability,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * The columns any other module may load about a user.
 *
 * Every `include: { createdBy: true }` elsewhere would otherwise pull the
 * bcrypt hash of a colleague's password into memory on every row of every
 * list — needless width on the wire from the database, and one careless
 * spread away from putting staff password hashes in a response. Relations are
 * selected through this instead, so the hash is never fetched at all.
 */
export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
} as const;

export type UserSummaryRecord = Pick<UserRecord, 'id' | 'name' | 'email' | 'role' | 'active'>;

/** Just enough to render an "assigned to" cell or picker. */
export function toUserSummary(user: UserSummaryRecord): UserSummary {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
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

  /**
   * Colleagues an actor may see in an assignment picker. An employee can only
   * assign work to themselves, so the list they get back is exactly one person.
   */
  async listStaff(actor: { id: string; role: Role }): Promise<UserSummary[]> {
    if (actor.role !== 'ADMIN') {
      return [toUserSummary(await this.findByIdOrFail(actor.id))];
    }
    return (await this.users.findActive()).map(toUserSummary);
  }

  /** Every account, active or not. Administrators only — see the controller. */
  async listAll(): Promise<User[]> {
    return (await this.users.findAllOrdered()).map(toPublicUser);
  }

  async createUser(input: CreateUserRequest): Promise<User> {
    if (await this.users.findByEmail(input.email)) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: { email: ['That email address is already in use'] },
      });
    }

    return toPublicUser(
      await this.users.create({
        name: input.name,
        email: input.email.toLowerCase(),
        password: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
        role: input.role,
        canViewOwnProfitability: input.canViewOwnProfitability ?? false,
      }),
    );
  }

  async updateUser(id: string, input: UpdateUserRequest): Promise<User> {
    await this.findByIdOrFail(id);

    const clash = await this.users.findByEmail(input.email);
    if (clash && clash.id !== id) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: { email: ['That email address is already in use'] },
      });
    }

    return toPublicUser(
      await this.users.updateAccount(id, {
        name: input.name,
        email: input.email.toLowerCase(),
        role: input.role,
        active: input.active,
        canViewOwnProfitability: input.canViewOwnProfitability,
      }),
    );
  }

  /**
   * Sets a password without knowing the old one — an administrator resetting
   * a colleague's, not somebody changing their own. `changePassword` is the
   * self-service path and still demands the current password.
   */
  async setPassword(id: string, password: string): Promise<void> {
    await this.findByIdOrFail(id);
    await this.users.updatePassword(id, await bcrypt.hash(password, BCRYPT_ROUNDS));
  }

  /** True when `actor` is allowed to hand a lead to `assigneeId`. */
  canAssignTo(actor: { id: string; role: Role }, assigneeId: string | null): boolean {
    if (actor.role === 'ADMIN') return true;
    return assigneeId === null || assigneeId === actor.id;
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
