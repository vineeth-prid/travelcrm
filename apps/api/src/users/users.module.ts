import { Module } from '@nestjs/common';

import { AdminUsersController } from './admin-users.controller';
import { StaffController } from './staff.controller';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, StaffController, AdminUsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
