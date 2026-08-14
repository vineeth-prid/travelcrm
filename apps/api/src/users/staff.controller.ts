import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserSummary } from '@travel-crm/sdk';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApiZodResponse } from '../shared/zod';
import { userSummaryListSchema } from './users.schemas';
import { UsersService } from './users.service';

/** Colleagues, for assignment pickers and the employee filter on the lead list. */
@ApiTags('users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'staff', version: '1' })
export class StaffController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Assignable colleagues — an employee sees only themselves' })
  @ApiZodResponse(HttpStatus.OK, userSummaryListSchema, 'Staff')
  list(@CurrentUser() current: AuthenticatedUser): Promise<UserSummary[]> {
    return this.users.listStaff(current);
  }
}
