// Optional telemetry: the real implementation lives in src/ui/telemetry.ts,
// which is gitignored (local playtest only, never in the public repo). This
// committed loader imports it at runtime and shims it when the file is absent,
// so a clean clone builds and runs with telemetry simply disabled.
//
// The specifier is held in a variable so TypeScript does NOT statically resolve
// it (and thus does not require the gitignored file to exist at type-check
// time). The dynamic import is wrapped in try/catch for the absent case.

type TData = Record<string, string | number>
type TCtx = () => Record<string, string | number>

type TelemetryApi = {
  tlog: (ev: string, data?: TData) => void
  installErrorCapture: (ctx: TCtx) => void
}

const NOOP_API: TelemetryApi = {
  tlog: () => {},
  installErrorCapture: () => {},
}

const TELEMETRY_SPEC = './telemetry.ts'

async function loadTelemetry(): Promise<TelemetryApi> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(TELEMETRY_SPEC)
    if (mod && typeof mod.tlog === 'function' && typeof mod.installErrorCapture === 'function') {
      return mod as TelemetryApi
    }
  } catch {
    // gitignored module absent — telemetry simply off
  }
  return NOOP_API
}

// Resolved lazily once on first use; until then calls are no-ops.
let api: TelemetryApi | null = null
let pending: Promise<TelemetryApi> | null = null

function ensure(): TelemetryApi {
  if (api) return api
  if (!pending) pending = loadTelemetry().then((a) => (api = a))
  return NOOP_API
}

export function tlog(ev: string, data?: TData): void {
  ensure().tlog(ev, data)
}

export function installErrorCapture(ctx: TCtx): void {
  ensure().installErrorCapture(ctx)
}
