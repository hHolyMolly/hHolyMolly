import { maskValue, probeApiEndpoints, type LicenseLookupInput } from "./api_probe";
import { runPlaywrightFallback } from "./playwright_fallback";

type CliArgs = {
  firstName?: string;
  lastName?: string;
  pesel?: string;
  documentNumber?: string;
  applicationNumber?: string;
  timeoutMs?: number;
};

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key.startsWith("--")) {
      continue;
    }

    switch (key) {
      case "--firstName":
        args.firstName = value;
        index += 1;
        break;
      case "--lastName":
        args.lastName = value;
        index += 1;
        break;
      case "--pesel":
        args.pesel = value;
        index += 1;
        break;
      case "--documentNumber":
        args.documentNumber = value;
        index += 1;
        break;
      case "--applicationNumber":
        args.applicationNumber = value;
        index += 1;
        break;
      case "--timeoutMs":
        args.timeoutMs = Number(value);
        index += 1;
        break;
      default:
        break;
    }
  }

  return args;
};

const printUsage = (): void => {
  console.error(
    "Usage: npm run dev -- --firstName Jan --lastName Kowalski --pesel 12345678901 [--documentNumber ABC123456] [--applicationNumber 00001234] [--timeoutMs 15000]",
  );
};

const getInputFromArgs = (args: CliArgs): LicenseLookupInput | undefined => {
  if (!args.firstName || !args.lastName) {
    return undefined;
  }

  if (!args.pesel && !args.documentNumber && !args.applicationNumber) {
    return undefined;
  }

  return {
    firstName: args.firstName,
    lastName: args.lastName,
    pesel: args.pesel,
    documentNumber: args.documentNumber,
    applicationNumber: args.applicationNumber,
  };
};

const toMaskedInput = (input: LicenseLookupInput): Record<string, string | undefined> => ({
  firstName: `${input.firstName.slice(0, 1)}***`,
  lastName: `${input.lastName.slice(0, 1)}***`,
  pesel: maskValue(input.pesel),
  documentNumber: maskValue(input.documentNumber),
  applicationNumber: maskValue(input.applicationNumber),
});

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const input = getInputFromArgs(args);

  if (!input) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs ? args.timeoutMs : 15000;

  const apiResult = await probeApiEndpoints(input, timeoutMs);

  if (apiResult.ok && apiResult.workingAttempt) {
    console.log(
      JSON.stringify(
        {
          success: true,
          strategy: "api",
          inputMasked: toMaskedInput(input),
          result: {
            endpoint: apiResult.workingAttempt.url,
            method: apiResult.workingAttempt.method,
            httpStatus: apiResult.workingAttempt.httpStatus,
            statuses: apiResult.workingAttempt.detectedStatuses,
          },
          attempts: apiResult.attempts,
        },
        null,
        2,
      ),
    );
    return;
  }

  const fallbackResult = await runPlaywrightFallback(input, timeoutMs * 2);

  console.log(
    JSON.stringify(
      {
        success: fallbackResult.ok,
        strategy: fallbackResult.ok ? "playwright" : "none",
        inputMasked: toMaskedInput(input),
        result: fallbackResult,
        attempts: apiResult.attempts,
      },
      null,
      2,
    ),
  );

  if (!fallbackResult.ok) {
    process.exitCode = 2;
  }
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        strategy: "none",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
