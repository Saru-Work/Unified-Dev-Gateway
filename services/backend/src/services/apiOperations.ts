/**
 * Turns an API's OpenAPI 3 (or Swagger 2) definition, as WSO2 stores it, into a
 * flat list of operations the dashboard can render without knowing OpenAPI.
 */

export interface OperationParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  /** e.g. "integer", "string (date)", "array of string". */
  type?: string;
  enum?: string[];
  example?: unknown;
  default?: unknown;
}

export interface BodyField {
  name: string;
  required: boolean;
  type?: string;
  description?: string;
}

export interface ApiOperation {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  parameters: OperationParameter[];
  requestBody?: {
    contentType: string;
    required: boolean;
    description?: string;
    fields: BodyField[];
    example?: unknown;
  };
  responses: { status: string; description?: string; example?: unknown }[];
}

type Json = Record<string, unknown>;

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
const PARAM_LOCATIONS = ["path", "query", "header", "cookie"] as const;
/** Guards against $ref cycles and absurdly deep schemas. */
const MAX_REF_DEPTH = 10;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Follows local "#/…" references; anything else (or a broken ref) yields undefined. */
function resolve(root: Json, value: unknown, depth = 0): Json | undefined {
  if (!isObject(value)) return undefined;
  const ref = value.$ref;
  if (typeof ref !== "string") return value;
  if (depth >= MAX_REF_DEPTH || !ref.startsWith("#/")) return undefined;
  let target: unknown = root;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    target = isObject(target) ? target[key] : undefined;
  }
  return resolve(root, target, depth + 1);
}

function describeType(root: Json, schemaValue: unknown, depth = 0): string | undefined {
  const schema = resolve(root, schemaValue);
  if (!schema || depth > 2) return undefined;
  if (schema.type === "array") {
    const items = describeType(root, schema.items, depth + 1);
    return items ? `array of ${items}` : "array";
  }
  const type = text(schema.type) ?? (isObject(schema.properties) ? "object" : undefined);
  const format = text(schema.format);
  // Some definitions repeat the type as the format ("string (string)").
  return type && format && format !== type ? `${type} (${format})` : type;
}

function enumOf(schema: Json | undefined): string[] | undefined {
  if (!schema || !Array.isArray(schema.enum)) return undefined;
  const values = schema.enum.filter((v) => v !== null && v !== undefined).map(String);
  return values.length ? values : undefined;
}

function toParameter(root: Json, value: unknown): OperationParameter | null {
  const param = resolve(root, value);
  if (!param) return null;
  const name = text(param.name);
  const location = PARAM_LOCATIONS.find((l) => l === param.in);
  if (!name || !location) return null;
  // OpenAPI 3 nests the type in `schema`; Swagger 2 puts it on the parameter.
  const schema = resolve(root, param.schema) ?? param;
  const example = param.example ?? schema.example;
  const description = text(param.description);
  const type = describeType(root, schema);
  const values = enumOf(schema);
  return {
    name,
    in: location,
    required: location === "path" || param.required === true,
    ...(description && { description }),
    ...(type && { type }),
    ...(values && { enum: values }),
    ...(example !== undefined && { example }),
    ...(schema.default !== undefined && { default: schema.default }),
  };
}

function bodyFields(root: Json, schemaValue: unknown): BodyField[] {
  const schema = resolve(root, schemaValue);
  if (!schema || !isObject(schema.properties)) return [];
  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(schema.properties).map(([name, prop]) => {
    const type = describeType(root, prop);
    const description = text(resolve(root, prop)?.description);
    return {
      name,
      required: required.includes(name),
      ...(type && { type }),
      ...(description && { description }),
    };
  });
}

/** The first media type's schema and example from an OpenAPI 3 `content` map. */
function firstContent(
  root: Json,
  content: unknown,
): { contentType: string; schema?: unknown; example?: unknown } | undefined {
  if (!isObject(content)) return undefined;
  const [contentType, media] = Object.entries(content)[0] ?? [];
  if (!contentType) return undefined;
  const m = resolve(root, media) ?? {};
  const named = isObject(m.examples) ? resolve(root, Object.values(m.examples)[0]) : undefined;
  const example = m.example ?? named?.value ?? resolve(root, m.schema)?.example;
  return { contentType, schema: m.schema, ...(example !== undefined && { example }) };
}

function toRequestBody(
  root: Json,
  operation: Json,
  swagger2BodyParam: Json | undefined,
): ApiOperation["requestBody"] {
  const body = resolve(root, operation.requestBody);
  if (body) {
    const content = firstContent(root, body.content);
    if (!content) return undefined;
    return {
      contentType: content.contentType,
      required: body.required === true,
      ...(text(body.description) && { description: text(body.description) }),
      fields: bodyFields(root, content.schema),
      ...(content.example !== undefined && { example: content.example }),
    };
  }
  if (swagger2BodyParam) {
    const example = resolve(root, swagger2BodyParam.schema)?.example;
    return {
      contentType: "application/json",
      required: swagger2BodyParam.required === true,
      ...(text(swagger2BodyParam.description) && {
        description: text(swagger2BodyParam.description),
      }),
      fields: bodyFields(root, swagger2BodyParam.schema),
      ...(example !== undefined && { example }),
    };
  }
  return undefined;
}

function toResponses(root: Json, responses: unknown): ApiOperation["responses"] {
  if (!isObject(responses)) return [];
  return Object.entries(responses).map(([status, value]) => {
    const response = resolve(root, value) ?? {};
    const content = firstContent(root, response.content);
    // Swagger 2: `examples` keyed by media type, or an example on the schema.
    const swagger2 = isObject(response.examples)
      ? Object.values(response.examples)[0]
      : resolve(root, response.schema)?.example;
    const example = content?.example ?? swagger2;
    return {
      status,
      ...(text(response.description) && { description: text(response.description) }),
      ...(example !== undefined && { example }),
    };
  });
}

export function toOperations(definition: unknown): ApiOperation[] {
  if (!isObject(definition) || !isObject(definition.paths)) return [];
  const root = definition;
  const operations: ApiOperation[] = [];

  for (const [path, itemValue] of Object.entries(definition.paths)) {
    const item = resolve(root, itemValue);
    if (!item) continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];

    for (const method of METHODS) {
      const operation = resolve(root, item[method]);
      if (!operation) continue;
      const own = Array.isArray(operation.parameters) ? operation.parameters : [];

      // Operation-level parameters override path-level ones with the same name and location.
      const byKey = new Map<string, Json>();
      for (const raw of [...shared, ...own]) {
        const param = resolve(root, raw);
        if (param) byKey.set(`${String(param.in)}:${String(param.name)}`, param);
      }
      const all = [...byKey.values()];
      const requestBody = toRequestBody(root, operation, all.find((p) => p.in === "body"));
      const summary = text(operation.summary);
      const description = text(operation.description);

      operations.push({
        method: method.toUpperCase(),
        path,
        ...(summary && { summary }),
        ...(description && { description }),
        parameters: all.map((p) => toParameter(root, p)).filter((p) => p !== null),
        ...(requestBody && { requestBody }),
        responses: toResponses(root, operation.responses),
      });
    }
  }
  return operations;
}
