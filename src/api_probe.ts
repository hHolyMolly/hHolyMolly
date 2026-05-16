const DEFAULT_TIMEOUT_MS = 15000;

const KNOWN_STATUS_PATTERNS = [
  /wniosek\s+przyj[ęe]ty/i,
  /dokument\s+zam[oó]wiony/i,
  /dokument\s+gotowy\s+do\s+odbioru/i,
  /dokument\s+wydany/i,
  /status/i,
];

export type LicenseLookupInput = {
  firstName: string;
  lastName: string;
  pesel?: string;
  documentNumber?: string;
  applicationNumber?: string;
};

export type ProbeAttempt = {
  name: string;
  method: "GET" | "POST";
  url: string;
  requestBody?: Record<string, string>;
  ok: boolean;
  httpStatus?: number;
  detectedStatuses: string[];
  responseSnippet?: string;
  error?: string;
  durationMs: number;
};

export type ApiProbeResult = {
  ok: boolean;
  workingAttempt?: ProbeAttempt;
  attempts: ProbeAttempt[];
};

type EndpointCandidate = {
  name: string;
  method: "GET" | "POST";
  build: (input: LicenseLookupInput) => {
    url: string;
    body?: Record<string, string>;
  };
};

const resolveIdentifier = (input: LicenseLookupInput): string => {
  return input.pesel || input.documentNumber || input.applicationNumber || "";
};

const createCandidates = (input: LicenseLookupInput): EndpointCandidate[] => {
  const identifier = resolveIdentifier(input);

  return [
    {
      name: "GET /api/prawojazdy/status",
      method: "GET",
      build: () => ({
        url: `https://info-car.pl/api/prawojazdy/status?firstName=${encodeURIComponent(input.firstName)}&lastName=${encodeURIComponent(input.lastName)}&pesel=${encodeURIComponent(identifier)}`,
      }),
    },
    {
      name: "POST /api/prawojazdy/check",
      method: "POST",
      build: () => ({
        url: "https://info-car.pl/api/prawojazdy/check",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          pesel: identifier,
        },
      }),
    },
    {
      name: "POST /api/driving-license/status",
      method: "POST",
      build: () => ({
        url: "https://info-car.pl/api/driving-license/status",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          identifier,
        },
      }),
    },
    {
      name: "GET /services/driving-licence/{pesel}",
      method: "GET",
      build: () => ({
        url: `https://info-car.pl/services/driving-licence/${encodeURIComponent(identifier)}`,
      }),
    },
    {
      name: "POST /ibdkSearchPrawoJazdy/search",
      method: "POST",
      build: () => ({
        url: "https://info-car.pl/ibdkSearchPrawoJazdy/search",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          pesel: identifier,
          documentNumber: input.documentNumber || "",
          applicationNumber: input.applicationNumber || "",
        },
      }),
    },
    {
      name: "POST /dl-status/api/v1/status",
      method: "POST",
      build: () => ({
        url: "https://info-car.pl/dl-status/api/v1/status",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          identifier,
        },
      }),
    },
    {
      name: "GET /api/dl/status",
      method: "GET",
      build: () => ({
        url: `https://info-car.pl/api/dl/status?firstName=${encodeURIComponent(input.firstName)}&lastName=${encodeURIComponent(input.lastName)}&identifier=${encodeURIComponent(identifier)}`,
      }),
    },
    {
      name: "POST /new/api/prawo-jazdy/status",
      method: "POST",
      build: () => ({
        url: "https://info-car.pl/new/api/prawo-jazdy/status",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          identifier,
        },
      }),
    },
    {
      name: "POST /sprawdz-status-prawa-jazdy",
      method: "POST",
      build: () => ({
        url: "https://info-car.pl/sprawdz-status-prawa-jazdy",
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          identifier,
        },
      }),
    },
  ];
};

const safeJsonParse = (text: string): unknown | undefined => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const compactText = (value: string): string => value.replace(/\s+/g, " ").trim();

const collectFromUnknown = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectFromUnknown(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectFromUnknown(item));
  }

  return [];
};

const detectStatuses = (payload: string): string[] => {
  const base = compactText(payload);
  const json = safeJsonParse(payload);
  const candidateStrings = [base, ...collectFromUnknown(json)];

  const statuses = new Set<string>();

  for (const candidate of candidateStrings) {
    const value = compactText(candidate);
    if (!value) {
      continue;
    }

    if (/wniosek\s+przyj[ęe]ty/i.test(value)) {
      statuses.add("Wniosek przyjęty");
    }

    if (/dokument\s+zam[oó]wiony/i.test(value)) {
      statuses.add("Dokument zamówiony");
    }

    if (/dokument\s+gotowy\s+do\s+odbioru/i.test(value)) {
      statuses.add("Dokument gotowy do odbioru");
    }

    if (/dokument\s+wydany/i.test(value)) {
      statuses.add("Dokument wydany");
    }

    if (/status\s*[:=-]?\s*([\w\s-]{3,60})/i.test(value) && statuses.size === 0) {
      const match = value.match(/status\s*[:=-]?\s*([\w\s-]{3,60})/i);
      if (match?.[1]) {
        statuses.add(`Status: ${compactText(match[1])}`);
      }
    }
  }

  return Array.from(statuses);
};

const isPromisingResponse = (httpStatus: number, text: string, detectedStatuses: string[]): boolean => {
  if (httpStatus < 200 || httpStatus >= 300) {
    return false;
  }

  if (detectedStatuses.length > 0) {
    return true;
  }

  return KNOWN_STATUS_PATTERNS.some((pattern) => pattern.test(text));
};

const requestWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: abortController.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const maskValue = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`;
};

export const probeApiEndpoints = async (
  input: LicenseLookupInput,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ApiProbeResult> => {
  const attempts: ProbeAttempt[] = [];

  for (const candidate of createCandidates(input)) {
    const startedAt = Date.now();
    const { url, body } = candidate.build(input);

    try {
      const response = await requestWithTimeout(
        url,
        {
          method: candidate.method,
          headers: {
            Accept: "application/json, text/plain, */*",
            ...(candidate.method === "POST" ? { "Content-Type": "application/json" } : {}),
            "User-Agent": "Mozilla/5.0 (compatible; DriverLicenseStatusProbe/1.0)",
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        timeoutMs,
      );

      const text = await response.text();
      const detectedStatuses = detectStatuses(text);

      const attempt: ProbeAttempt = {
        name: candidate.name,
        method: candidate.method,
        url,
        requestBody: body,
        ok: isPromisingResponse(response.status, text, detectedStatuses),
        httpStatus: response.status,
        detectedStatuses,
        responseSnippet: compactText(text).slice(0, 500),
        durationMs: Date.now() - startedAt,
      };

      attempts.push(attempt);

      if (attempt.ok) {
        return {
          ok: true,
          workingAttempt: attempt,
          attempts,
        };
      }
    } catch (error) {
      attempts.push({
        name: candidate.name,
        method: candidate.method,
        url,
        requestBody: body,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        detectedStatuses: [],
        durationMs: Date.now() - startedAt,
      });
    }
  }

  return {
    ok: false,
    attempts,
  };
};
