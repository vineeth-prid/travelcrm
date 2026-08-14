import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  smtpSchema,
  smtpTestSchema,
  type MessageResponse,
  type NotificationRecord,
  type SmtpRequest,
  type SmtpStatus,
  type SmtpTestRequest,
} from '@travel-crm/sdk';
import { z } from 'zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnly } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../shared/prisma.service';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { SmtpService } from './smtp.service';

const smtpStatusSchema = z.object({
  configured: z.boolean(),
  host: z.string().nullable(),
  port: z.number().int().nullable(),
  username: z.string().nullable(),
  security: z.enum(['NONE', 'STARTTLS', 'SSL']).nullable(),
  fromEmail: z.string().nullable(),
  fromName: z.string().nullable(),
  active: z.boolean(),
  passwordReadable: z.boolean(),
});

const notificationListSchema = z.array(
  z.object({
    id: z.string().uuid(),
    type: z.string(),
    status: z.string(),
    recipientEmail: z.string(),
    subject: z.string(),
    sentAt: z.string().datetime().nullable(),
    error: z.string().nullable(),
    createdAt: z.string().datetime(),
  }),
);

const messageSchema = z.object({ message: z.string() });

/**
 * Mail configuration. Administrators only, at every level — the guard, not the
 * navigation, is what enforces it.
 *
 * No response from this controller contains the SMTP password: `SmtpStatus`
 * has no field for it.
 */
@ApiTags('settings')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
@Controller({ path: 'settings', version: '1' })
export class SmtpController {
  constructor(
    private readonly smtp: SmtpService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('smtp')
  @ApiOperation({ summary: 'The mail configuration, without the password' })
  @ApiZodResponse(HttpStatus.OK, smtpStatusSchema, 'SMTP status')
  status(): Promise<SmtpStatus> {
    return this.smtp.getStatus();
  }

  @Put('smtp')
  @ApiOperation({ summary: 'Save the mail configuration. Omit the password to keep it.' })
  @ApiZodBody(smtpSchema)
  @ApiZodResponse(HttpStatus.OK, smtpStatusSchema, 'The saved configuration')
  save(@Body(new ZodValidationPipe(smtpSchema)) dto: SmtpRequest): Promise<SmtpStatus> {
    return this.smtp.save(dto);
  }

  @Post('smtp/test')
  @HttpCode(HttpStatus.OK)
  // Sending mail on demand is exactly the kind of endpoint that gets abused
  // into a spam relay if it is not held down.
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({ summary: 'Send a test email to prove the settings work' })
  @ApiZodBody(smtpTestSchema)
  @ApiZodResponse(HttpStatus.OK, messageSchema, 'Sent')
  async sendTest(
    @Body(new ZodValidationPipe(smtpTestSchema)) dto: SmtpTestRequest,
  ): Promise<MessageResponse> {
    await this.smtp.sendTest(dto.to);
    return { message: `Test email sent to ${dto.to}` };
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Recently raised notifications, and whether they went out' })
  @ApiZodResponse(HttpStatus.OK, notificationListSchema, 'Notifications, newest first')
  async notifications(): Promise<NotificationRecord[]> {
    const rows = await this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // The body is deliberately not returned: it is large, and it can hold
    // customer details that have no business in a settings screen.
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      recipientEmail: row.recipientEmail,
      subject: row.subject,
      sentAt: row.sentAt?.toISOString() ?? null,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
