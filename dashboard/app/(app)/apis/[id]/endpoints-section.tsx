import { ChevronRight, FileJson, ListTree, Play, SlidersHorizontal, Upload } from "lucide-react";
import { CopyButton } from "@/app/copy-button";
import type { ApiOperation } from "@/lib/types";

type Parameter = ApiOperation["parameters"][number];

const METHOD_TONES: Record<string, string> = {
  GET: "tone-sky",
  POST: "tone-emerald",
  PUT: "tone-amber",
  PATCH: "tone-violet",
  DELETE: "tone-rose",
};

function SubHeading({ icon: Icon, children }: { icon: typeof Play; children: React.ReactNode }) {
  return (
    <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
      <Icon aria-hidden className="size-3.5" />
      {children}
    </h4>
  );
}

function show(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function json(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/** What to put in the sample call for a parameter: its example, its default, or a placeholder. */
function sampleValue(param: Parameter): string {
  const value = param.example ?? param.default ?? param.enum?.[0];
  return value === undefined ? `<${param.name}>` : show(value);
}

/** A ready-to-run curl for the operation, filled in with example values. */
function sampleCurl(baseUrl: string, op: ApiOperation): string {
  let path = op.path;
  const query: string[] = [];
  for (const param of op.parameters) {
    const value = sampleValue(param);
    const placeholder = value.startsWith("<");
    if (param.in === "path") {
      path = path.replace(`{${param.name}}`, placeholder ? value : encodeURIComponent(value));
    } else if (param.in === "query" && (param.required || param.example !== undefined)) {
      query.push(`${param.name}=${placeholder ? value : encodeURIComponent(value)}`);
    }
  }
  const url = baseUrl.replace(/\/$/, "") + path + (query.length ? `?${query.join("&")}` : "");
  // Local WSO2 uses a self-signed certificate.
  const insecure = /^https:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) ? " -k" : "";
  const lines = [`curl${insecure}${op.method === "GET" ? "" : ` -X ${op.method}`} '${url}'`];
  lines.push(`  -H 'Authorization: Bearer <access token>'`);
  if (op.requestBody) {
    const body = op.requestBody.example === undefined ? "{}" : JSON.stringify(op.requestBody.example);
    lines.push(`  -H 'Content-Type: ${op.requestBody.contentType}'`);
    lines.push(`  -d '${body.replace(/'/g, `'\\''`)}'`);
  }
  return lines.join(" \\\n");
}

function ParametersTable({ parameters }: { parameters: Parameter[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 pr-4 font-medium">Name</th>
            <th className="py-1 pr-4 font-medium">In</th>
            <th className="py-1 pr-4 font-medium">Type</th>
            <th className="py-1 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {parameters.map((p) => (
            <tr key={`${p.in}:${p.name}`} className="align-top">
              <td className="py-2 pr-4">
                <code className="font-mono">{p.name}</code>
                {p.required && <span className="ml-1 text-xs text-danger">required</span>}
              </td>
              <td className="py-2 pr-4 text-muted">{p.in}</td>
              <td className="py-2 pr-4 text-muted">{p.type ?? "—"}</td>
              <td className="flex flex-col gap-1 py-2">
                {p.description && <span>{p.description}</span>}
                {p.enum && (
                  <span className="text-xs text-muted">
                    One of: {p.enum.map((v) => <code key={v} className="mr-1 font-mono">{v}</code>)}
                  </span>
                )}
                {p.default !== undefined && (
                  <span className="text-xs text-muted">
                    Default: <code className="font-mono">{show(p.default)}</code>
                  </span>
                )}
                {p.example !== undefined && (
                  <span className="text-xs text-muted">
                    Example: <code className="font-mono">{show(p.example)}</code>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed">
      {code}
    </pre>
  );
}

function Operation({ op, baseUrl }: { op: ApiOperation; baseUrl?: string }) {
  const curl = baseUrl ? sampleCurl(baseUrl, op) : undefined;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-surface [&::-webkit-details-marker]:hidden">
        <span
          className={`icon-tile ${METHOD_TONES[op.method] ?? "tone-slate"} w-16 rounded-md py-1 font-mono text-xs font-bold`}
        >
          {op.method}
        </span>
        <code className="break-all font-mono text-sm font-medium">{op.path}</code>
        {op.summary && <span className="text-sm text-muted">{op.summary}</span>}
        <ChevronRight
          aria-hidden
          className="ml-auto size-4 text-muted transition-transform group-open:rotate-90"
        />
      </summary>

      <div className="flex flex-col gap-5 border-t border-border bg-background/40 px-4 py-4">
        {op.description && op.description !== op.summary && (
          <p className="text-sm">{op.description}</p>
        )}

        {op.parameters.length > 0 && (
          <div className="flex flex-col gap-1">
            <SubHeading icon={SlidersHorizontal}>Parameters</SubHeading>
            <ParametersTable parameters={op.parameters} />
          </div>
        )}

        {op.requestBody && (
          <div className="flex flex-col gap-2">
            <SubHeading icon={Upload}>
              Request body{" "}
              <span className="font-normal normal-case tracking-normal">
                ({op.requestBody.contentType}
                {op.requestBody.required ? ", required" : ""})
              </span>
            </SubHeading>
            {op.requestBody.description && <p className="text-sm">{op.requestBody.description}</p>}
            {op.requestBody.fields.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {op.requestBody.fields.map((f) => (
                  <li key={f.name}>
                    <code className="font-mono">{f.name}</code>
                    {f.type && <span className="text-muted"> · {f.type}</span>}
                    {f.required && <span className="ml-1 text-xs text-danger">required</span>}
                    {f.description && <span> — {f.description}</span>}
                  </li>
                ))}
              </ul>
            )}
            {op.requestBody.example !== undefined && (
              <CodeBlock code={json(op.requestBody.example)} />
            )}
          </div>
        )}

        {op.responses.length > 0 && (
          <div className="flex flex-col gap-2">
            <SubHeading icon={FileJson}>Responses</SubHeading>
            <ul className="flex flex-col gap-2 text-sm">
              {op.responses.map((r) => (
                <li key={r.status} className="flex flex-col gap-1">
                  <span>
                    <code
                      className={`font-mono font-semibold ${r.status.startsWith("2") ? "text-success" : r.status.startsWith("4") || r.status.startsWith("5") ? "text-danger" : ""}`}
                    >
                      {r.status}
                    </code>
                    {r.description && <span className="text-muted"> {r.description}</span>}
                  </span>
                  {r.example !== undefined && <CodeBlock code={json(r.example)} />}
                </li>
              ))}
            </ul>
          </div>
        )}

        {curl && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <SubHeading icon={Play}>Try it</SubHeading>
              <CopyButton value={curl} />
            </div>
            <CodeBlock code={curl} />
            <p className="text-xs text-muted">
              Get an access token from one of your subscribed applications&apos; keys.
            </p>
          </div>
        )}
      </div>
    </details>
  );
}

export function EndpointsSection({
  operations,
  baseUrl,
  error,
}: {
  operations: ApiOperation[];
  /** The gateway URL calls go to, for the sample curl. */
  baseUrl?: string;
  error?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
            <ListTree aria-hidden className="size-5 text-accent" /> Endpoints
          </h2>
          <p className="text-sm text-muted">From the API&apos;s definition in WSO2. Open one for details.</p>
        </div>
        {operations.length > 0 && <span className="badge">{operations.length}</span>}
      </div>
      {error ? (
        <p className="notice-error">Couldn&apos;t load the endpoints: {error}</p>
      ) : operations.length === 0 ? (
        <p className="card text-sm text-muted">This API&apos;s definition doesn&apos;t list any endpoints.</p>
      ) : (
        <div className="card divide-y divide-border overflow-hidden p-0">
          {operations.map((op) => (
            <Operation key={`${op.method} ${op.path}`} op={op} baseUrl={baseUrl} />
          ))}
        </div>
      )}
    </section>
  );
}
