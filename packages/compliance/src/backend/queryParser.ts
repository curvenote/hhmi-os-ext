import { z } from 'zod';

// Base query schema that can be extended
export const BaseQuerySchema = z.object({
  search: z.string().optional(),
});

// Compliance-specific query schema
export const ComplianceQuerySchema = BaseQuerySchema.extend({
  compliance: z.enum(['non-compliant', 'compliant', 'zero']).optional(),
  orcid: z.boolean().optional(),
});

/**
 * Parses a URL-encoded query string from a single 'q' parameter using a Zod schema.
 * @param qValue - URL-encoded query string
 * @param schema - Zod schema to validate and parse the query
 * @returns Parsed and validated query object matching the schema
 */
export function parseQueryFromQ<T extends z.ZodType>(qValue: string, schema: T): z.infer<T> {
  try {
    // Decode the URL-encoded query string
    const decodedQuery = decodeURIComponent(qValue);

    // Parse the query string into URLSearchParams
    const searchParams = new URLSearchParams(decodedQuery);

    // Extract parameters and convert based on schema
    const params: Record<string, any> = {};

    for (const [key, value] of searchParams.entries()) {
      // Get the schema shape to determine the expected type
      const shape = (schema as any).shape as Record<string, z.ZodTypeAny>;
      const fieldSchema = shape[key];

      if (fieldSchema) {
        // Convert value based on schema type
        // Handle ZodOptional by checking the inner type
        const innerType = (fieldSchema as any).unwrap?.() || fieldSchema;

        if (innerType instanceof z.ZodBoolean) {
          // Handle boolean values more robustly
          params[key] = value === 'true' || value === '1';
        } else if (innerType instanceof z.ZodNumber) {
          params[key] = Number(value);
        } else if (innerType instanceof z.ZodEnum) {
          params[key] = value;
        } else {
          // Default to string for other types
          params[key] = value;
        }
      } else {
        // Unknown field, keep as string
        params[key] = value;
      }
    }

    // Parse and validate with Zod
    return schema.parse(params);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // If parsing fails, return empty object
    return schema.parse({});
  }
}

/**
 * Builds a URL-encoded query string from a query object.
 * @param query - Object with query parameters
 * @returns URL-encoded query string
 */
export function buildQueryString(query: Record<string, any>): string {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value === 'boolean') {
        params.append(key, value.toString());
      } else {
        params.append(key, value.toString());
      }
    }
  });

  // Return the query string without additional encoding (URL will handle it)
  return params.toString();
}

// Type exports
export type ComplianceQuery = z.infer<typeof ComplianceQuerySchema>;
