import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ZodError, ZodType, ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** Flattens a ZodError into the `details` map returned by the API. */
function toDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/**
 * Validates a request payload against a Zod schema. Replaces class-validator:
 * the schema is both the runtime guard and the source of the DTO type.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new BadRequestException({
      message: 'Validation failed',
      details: toDetails(result.error),
    });
  }
}

// zod-to-json-schema's return type is deeply recursive; TypeScript gives up on
// it (TS2589). The output shape we need is a plain OpenAPI schema object.
const toJsonSchema = zodToJsonSchema as unknown as (
  schema: ZodTypeAny,
  options: { target: 'openApi3' },
) => Record<string, unknown>;

function openApiSchema(schema: ZodTypeAny): SchemaObject {
  const json = toJsonSchema(schema, { target: 'openApi3' });
  delete json.$schema;
  return json;
}

/** Documents a request body in Swagger straight from its Zod schema. */
export function ApiZodBody(schema: ZodTypeAny): MethodDecorator {
  return ApiBody({ schema: openApiSchema(schema) });
}

/** Documents a response in Swagger straight from its Zod schema. */
export function ApiZodResponse(
  status: number,
  schema: ZodTypeAny,
  description?: string,
): MethodDecorator {
  return ApiResponse({ status, description, schema: openApiSchema(schema) });
}
