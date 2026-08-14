import { Controller, Get, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  customerQuerySchema,
  type CustomerDetail,
  type CustomerQuery,
  type CustomerSummary,
} from '@travel-crm/sdk';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { CustomersService } from './customers.service';
import { customerDetailSchema, customerListSchema } from './customers.schemas';

/**
 * The customer book. Read-only: customers are created by the lead they came in
 * on, and edited there, so there is no way to create an orphan record here.
 */
@ApiTags('customers')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Customers, with what the agency has done with them' })
  @ApiZodResponse(HttpStatus.OK, customerListSchema, 'Customers')
  list(
    @Query(new ZodValidationPipe(customerQuerySchema)) query: CustomerQuery,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<CustomerSummary[]> {
    return this.customers.list(query, current);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One customer, with their leads and invoices' })
  @ApiZodResponse(HttpStatus.OK, customerDetailSchema, 'The customer')
  get(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<CustomerDetail> {
    return this.customers.get(id, current);
  }
}
