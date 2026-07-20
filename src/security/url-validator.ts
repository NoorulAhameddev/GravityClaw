import { URL } from "url";
import { createLogger } from "../logger.ts";

const log = createLogger("url-validator");

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^[fF][cCdD][0-9a-fA-F]{2}:/,
  /^[fF][eE][89aAbB][0-9a-fA-F]:/,
  /^localhost$/i,
];

function isPrivateHost(hostname: string): boolean {
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(hostname)) return true;
  }
  return false;
}

const BLOCKED_HOSTNAMES = [
  /metadata\.google\.internal$/i,
  /metadata\.compute\.google\.internal$/i,
  /169\.254\.169\.254$/,
];

const ALLOWED_PROTOCOLS = ["http:", "https:"];

const BLOCKED_PORTS = [22, 23, 25, 53, 110, 135, 139, 143, 445, 1433, 1521, 2049, 3306, 3389, 5432, 6379, 8080, 8443, 9200, 9300, 11211, 27017];

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  url?: URL;
}

export function validateUrl(
  urlStr: string,
  options?: {
    allowPrivate?: boolean;
    allowLocalhost?: boolean;
    extraBlockedHostnames?: RegExp[];
    allowedPorts?: number[];
  },
): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { valid: false, error: `Protocol "${parsed.protocol}" is not allowed. Only http: and https: are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.some(p => p.test(hostname))) {
    return { valid: false, error: "URL points to a blocked internal service" };
  }

  if (!options?.allowPrivate && isPrivateHost(hostname)) {
    if (!options?.allowLocalhost || !(hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")) {
      return { valid: false, error: "URL points to a private or internal network address" };
    }
  }

  if (options?.extraBlockedHostnames?.some(p => p.test(hostname))) {
    return { valid: false, error: "URL points to a blocked hostname" };
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "https:" ? 443 : 80);
  if (options?.allowedPorts && !options.allowedPorts.includes(port)) {
    return { valid: false, error: `Port ${port} is not in the allowed list` };
  } else if (!options?.allowedPorts && BLOCKED_PORTS.includes(port)) {
    return { valid: false, error: `Port ${port} is blocked for security reasons` };
  }

  return { valid: true, url: parsed };
}
