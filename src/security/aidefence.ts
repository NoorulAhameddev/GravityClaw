/**
 * Adversarial Tool Defenses & URL Exfiltration Sentinel
 *
 * Implements RuFlo aidefence attack signature detection:
 * - Exfiltration URL blocker (OAST reflection servers, credential leakage in basic auth, high-entropy query data).
 * - Indirect prompt injection scanner (instruction overrides, delimiter breakouts, zero-width steganography).
 * - Tool invocation sanitization.
 */

import { URL } from 'url';

export interface SecurityScanResult {
  safe: boolean;
  violations: string[];
  sanitizedText?: string;
}

export interface UrlExfilScanResult {
  allowed: boolean;
  reason?: string;
  threatType?: 'oast_exfil' | 'credential_leak' | 'data_exfil_query' | 'private_ip';
}

const KNOWN_EXFIL_DOMAINS = [
  /webhook\.site$/i,
  /requestbin\.(?:com|net)$/i,
  /pipedream\.(?:net|com)$/i,
  /interact\.sh$/i,
  /oastify\.com$/i,
  /burpcollaborator\.net$/i,
  /ngrok-free\.app$/i,
  /beeceptor\.com$/i,
  /hookbin\.com$/i,
  /mockbin\.org$/i,
  /postb\.in$/i,
  /canarytokens\.org$/i,
];

const PROMPT_INJECTION_SIGNATURES = [
  /\bignore\s+(?:all\s+)?previous\s+instructions\b/i,
  /\bdisregard\s+(?:all\s+)?prior\s+instructions\b/i,
  /\byou\s+are\s+now\s+(?:in\s+developer\s+mode|dan|an\s+unfiltered\s+ai)\b/i,
  /\bsystem\s+override\s*:/i,
  /\[SYSTEM\s+COMMAND\]/i,
  /---\s*END\s+OF\s+SYSTEM\s+(?:PROMPT|INSTRUCTIONS)\s*---/i,
  /<\/context>\s*<instruction>/i,
  /\bnew\s+system\s+directive\s*:/i,
];

// Zero-width characters used to smuggle hidden payloads across safety checks
const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\uFEFF\u202A-\u202E]/g;

/**
 * Validates a target URL against data exfiltration patterns.
 */
export function checkUrlExfiltration(urlString: string): UrlExfilScanResult {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { allowed: false, reason: 'Malformed URL structure' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 1. Check known OAST / Exfil service reflection domains
  if (KNOWN_EXFIL_DOMAINS.some((pattern) => pattern.test(hostname))) {
    return {
      allowed: false,
      reason: `Blocked communication to known data exfiltration / webhook destination: ${hostname}`,
      threatType: 'oast_exfil',
    };
  }

  // 2. Check credential leakage via basic auth in URL
  if (parsed.username || parsed.password) {
    return {
      allowed: false,
      reason: 'URL contains sensitive credentials embedded in authority userinfo',
      threatType: 'credential_leak',
    };
  }

  // 3. Check query parameters for high-entropy exfiltration blobs or sensitive tokens
  const queryStr = parsed.search;
  if (queryStr) {
    // Check for explicit API key / token leaks in query params
    const tokenRegex = /(?:api_?key|token|auth|bearer|secret|password|session_?id)=([a-zA-Z0-9_-]{16,})/i;
    if (tokenRegex.test(queryStr)) {
      return {
        allowed: false,
        reason: 'URL query string appears to exfiltrate secret tokens or API credentials',
        threatType: 'data_exfil_query',
      };
    }

    // Check for high-entropy base64 or JWT data blobs in query parameters
    for (const [key, value] of parsed.searchParams.entries()) {
      if (value.startsWith('eyJ') && value.length > 25) {
        return {
          allowed: false,
          reason: `URL query parameter "${key}" contains serialized JWT token indicative of data exfiltration`,
          threatType: 'data_exfil_query',
        };
      }
      if (value.length >= 40 && /^[a-zA-Z0-9+/_-]+={0,2}$/.test(value)) {
        const uniqueChars = new Set(value).size;
        if (uniqueChars >= 12) {
          return {
            allowed: false,
            reason: `URL query parameter "${key}" contains high-entropy base64 payload characteristic of data exfiltration`,
            threatType: 'data_exfil_query',
          };
        }
      }
    }
  }

  return { allowed: true };
}

/**
 * Scans untrusted input (web scrape, tool output, webhook) for indirect prompt injections.
 */
export function scanPromptInjection(text: string): SecurityScanResult {
  const violations: string[] = [];

  // Check for zero-width steganographic payloads
  if (ZERO_WIDTH_REGEX.test(text)) {
    violations.push('Detected hidden zero-width unicode characters in text');
  }

  // Normalize text by removing zero-width characters before regex scanning
  const normalized = text.replace(ZERO_WIDTH_REGEX, '');

  for (const sig of PROMPT_INJECTION_SIGNATURES) {
    if (sig.test(normalized)) {
      violations.push(`Detected prompt injection signature: ${sig.source}`);
    }
  }

  const safe = violations.length === 0;
  return {
    safe,
    violations,
    sanitizedText: safe ? text : normalized.replace(/<\/?(?:context|instruction|system)>/gi, ''),
  };
}

