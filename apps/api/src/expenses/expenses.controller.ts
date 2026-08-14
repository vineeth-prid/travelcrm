import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  expenseCategorySchema,
  expenseQuerySchema,
  expenseSchema,
  expenseSummaryQuerySchema,
  RECEIPT_MAX_BYTES,
  type Expense,
  type ExpenseCategory,
  type ExpenseCategoryRequest,
  type ExpenseQuery,
  type ExpenseRequest,
  type ExpenseSummary,
  type ExpenseSummaryQuery,
  type MessageResponse,
} from '@travel-crm/sdk';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AdminOnly } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { messageSchema } from '../users/users.schemas';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { ExpensesService } from './expenses.service';
import {
  expenseCategoryListSchema,
  expenseCategoryResponseSchema,
  expenseListSchema,
  expenseResponseSchema,
  expenseSummarySchema,
  receiptLinkSchema,
} from './expenses.schemas';

/**
 * Company spending. Administrators only, on every route.
 *
 * §12 is explicit that employees do not get company-wide expenses, so the
 * class-level guard *is* the access model — there is no per-row scoping here
 * as there is on leads.
 */
@ApiTags('expenses')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
@Controller({ path: 'expenses', version: '1' })
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  /** Declared before `:id` so "categories" is not read as an expense id. */
  @Get('categories')
  @ApiOperation({ summary: 'Expense categories' })
  @ApiZodResponse(HttpStatus.OK, expenseCategoryListSchema, 'Categories')
  listCategories(): Promise<ExpenseCategory[]> {
    return this.expenses.listCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Add a category' })
  @ApiZodBody(expenseCategorySchema)
  @ApiZodResponse(HttpStatus.CREATED, expenseCategoryResponseSchema, 'The new category')
  createCategory(
    @Body(new ZodValidationPipe(expenseCategorySchema)) dto: ExpenseCategoryRequest,
  ): Promise<ExpenseCategory> {
    return this.expenses.createCategory(dto);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Rename or deactivate a category' })
  @ApiZodBody(expenseCategorySchema)
  @ApiZodResponse(HttpStatus.OK, expenseCategoryResponseSchema, 'The updated category')
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(expenseCategorySchema)) dto: ExpenseCategoryRequest,
  ): Promise<ExpenseCategory> {
    return this.expenses.updateCategory(id, dto);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totals, categories and the monthly trend' })
  @ApiZodResponse(HttpStatus.OK, expenseSummarySchema, 'The expense dashboard')
  summary(
    @Query(new ZodValidationPipe(expenseSummaryQuerySchema)) query: ExpenseSummaryQuery,
  ): Promise<ExpenseSummary> {
    return this.expenses.summary(query);
  }

  @Get()
  @ApiOperation({ summary: 'Expenses, newest first' })
  @ApiZodResponse(HttpStatus.OK, expenseListSchema, 'Expenses')
  list(@Query(new ZodValidationPipe(expenseQuerySchema)) query: ExpenseQuery): Promise<Expense[]> {
    return this.expenses.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Record an expense' })
  @ApiZodBody(expenseSchema)
  @ApiZodResponse(HttpStatus.CREATED, expenseResponseSchema, 'The new expense')
  create(
    @Body(new ZodValidationPipe(expenseSchema)) dto: ExpenseRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Expense> {
    return this.expenses.create(dto, current);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an expense' })
  @ApiZodBody(expenseSchema)
  @ApiZodResponse(HttpStatus.OK, expenseResponseSchema, 'The updated expense')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(expenseSchema)) dto: ExpenseRequest,
  ): Promise<Expense> {
    return this.expenses.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an expense' })
  @ApiZodResponse(HttpStatus.OK, messageSchema, 'Deleted')
  async remove(@Param('id') id: string): Promise<MessageResponse> {
    await this.expenses.remove(id);
    return { message: 'Expense deleted' };
  }

  @Post(':id/receipt')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach a receipt (PDF or image, 5MB maximum)' })
  @ApiZodResponse(HttpStatus.OK, expenseResponseSchema, 'The expense, with its receipt')
  // Multer holds the file in memory rather than writing it to disk: it goes
  // straight to object storage, and a temp file would only be one more place
  // a receipt could be left lying around.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: RECEIPT_MAX_BYTES } }))
  attachReceipt(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<Expense> {
    if (!file) {
      throw new BadRequestException('Choose a file to upload.');
    }
    return this.expenses.attachReceipt(id, file);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'A time-limited link to the stored receipt' })
  @ApiZodResponse(HttpStatus.OK, receiptLinkSchema, 'The link')
  receipt(@Param('id') id: string): Promise<{ url: string; name: string | null }> {
    return this.expenses.receiptUrl(id);
  }
}
