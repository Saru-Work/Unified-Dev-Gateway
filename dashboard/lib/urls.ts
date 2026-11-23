// Public addresses shown to developers in examples. Read on the server at
// runtime, so one image works locally and behind a domain; the defaults are
// the local compose stack.

const trim = (url: string) => url.replace(/\/+$/, "");

/** WSO2 gateway, where applications call APIs. */
export const GATEWAY_URL = trim(process.env.PUBLIC_GATEWAY_URL || "https://localhost:8243");
/** WSO2's own host: the Publisher, and /oauth2/token for client credentials. */
export const PORTAL_URL = trim(process.env.PUBLIC_PORTAL_URL || "https://localhost:9443");
/** The OpenGate REST API, for scripts and CI. */
export const API_URL = trim(process.env.PUBLIC_API_URL || "http://localhost:4000");

/** Local WSO2 has a self-signed certificate; a real domain shouldn't. */
export const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url + "/");
/** curl's " -k" when the URL needs it, else "". */
export const insecureFlag = (url: string) => (isLocal(url) ? " -k" : "");
