import { existsSync, readFileSync } from "fs";
import { parse } from "jju";
// eslint-disable-next-line unicorn/import-style
import * as path from "path";
import { config } from "yargs";
import Allowlist from "./allowlist";
import {
  mapVulnerabilityLevelInput,
  VulnerabilityLevels,
} from "./map-vulnerability";

function mapReportTypeInput(
  config: Pick<AuditCiPreprocessedConfig, "report-type">
) {
  const { "report-type": reportType } = config;
  switch (reportType) {
    case "full":
    case "important":
    case "summary":
      return reportType;
    default:
      throw new Error(
        `Invalid report type: ${reportType}. Should be \`['important', 'full', 'summary']\`.`
      );
  }
}

export type AuditCiPreprocessedConfig = {
  /** Exit for low or above vulnerabilities */
  l: boolean;
  /** Exit for moderate or above vulnerabilities */
  m: boolean;
  /** Exit for high or above vulnerabilities */
  h: boolean;
  /** Exit for critical or above vulnerabilities */
  c: boolean;
  /** Exit for low or above vulnerabilities */
  low: boolean;
  /** Exit for moderate or above vulnerabilities */
  moderate: boolean;
  /** Exit for high or above vulnerabilities */
  high: boolean;
  /** Exit for critical vulnerabilities */
  critical: boolean;
  /** Package manager */
  p: "auto" | "npm" | "yarn" | "pnpm";
  /** Show a full audit report */
  r: boolean;
  /** Show a full audit report */
  report: boolean;
  /** Show a summary audit report */
  s: boolean;
  /** Show a summary audit report */
  summary: boolean;
  /** Package manager */
  "package-manager": "auto" | "npm" | "yarn" | "pnpm";
  a: string[];
  allowlist: string[];
  /** The directory containing the package.json to audit */
  d: string;
  /** The directory containing the package.json to audit */
  directory: string;
  /** show allowlisted advisories that are not found. */
  "show-not-found": boolean;
  /** Show allowlisted advisories that are found */
  "show-found": boolean;
  /** the registry to resolve packages by name and version */
  registry?: string;
  /** The format of the output of audit-ci */
  o: "text" | "json";
  /** The format of the output of audit-ci */
  "output-format": "text" | "json";
  /** how the audit report is displayed. */
  "report-type": "full" | "important" | "summary";
  /** The number of attempts audit-ci calls an unavailable registry before failing */
  "retry-count": number;
  /** Pass if no audit is performed due to the registry returning ENOAUDIT */
  "pass-enoaudit": boolean;
  /** skip devDependencies */
  "skip-dev": boolean;
};

// Rather than exporting a weird union type, we resolve the type to a simple object.
type ComplexConfig = Omit<
  AuditCiPreprocessedConfig,
  // Remove single-letter options from the base config to avoid confusion.
  "allowlist" | "a" | "p" | "o" | "d" | "s" | "r" | "l" | "m" | "h" | "c"
> & {
  /** Package manager */
  "package-manager": "npm" | "yarn" | "pnpm";
  /** An object containing a list of modules, advisories, and module paths that should not break the build if their vulnerability is found. */
  allowlist: Allowlist;
  /** The vulnerability levels to fail on, if `moderate` is set `true`, `high` and `critical` should be as well. */
  levels: { [K in keyof VulnerabilityLevels]: VulnerabilityLevels[K] };
  /** A path to npm, uses npm from PATH if not specified (internal use only) */
  _npm?: string;
  /** A path to pnpm, uses pnpm from PATH if not specified (internal use only) */
  _pnpm?: string;
  /** A path to yarn, uses yarn from PATH if not specified (internal use only) */
  _yarn?: string;
};

export type AuditCiConfig = { [K in keyof ComplexConfig]: ComplexConfig[K] };

/**
 * @param pmArgument the package manager (including the `auto` option)
 * @param directory the directory where the package manager files exist
 * @returns the non-`auto` package manager
 */
function resolvePackageManagerType(
  pmArgument: "auto" | "npm" | "yarn" | "pnpm",
  directory: string
): "npm" | "yarn" | "pnpm" {
  switch (pmArgument) {
    case "npm":
    case "pnpm":
    case "yarn":
      return pmArgument;
    case "auto": {
      const getPath = (file: string) => path.resolve(directory, file);
      const packageLockExists = existsSync(getPath("package-lock.json"));
      if (packageLockExists) return "npm";
      const shrinkwrapExists = existsSync(getPath("npm-shrinkwrap.json"));
      if (shrinkwrapExists) return "npm";
      const yarnLockExists = existsSync(getPath("yarn.lock"));
      if (yarnLockExists) return "yarn";
      const pnpmLockExists = existsSync(getPath("pnpm-lock.yaml"));
      if (pnpmLockExists) return "pnpm";
      throw new Error(
        "Cannot establish package-manager type, missing package-lock.json, yarn.lock, and pnpm-lock.yaml."
      );
    }
    default:
      throw new Error(`Unexpected package manager argument: ${pmArgument}`);
  }
}

function mapArgvToAuditCiConfig(argv: AuditCiPreprocessedConfig) {
  const allowlist = Allowlist.mapConfigToAllowlist(argv);

  const {
    low,
    moderate,
    high,
    critical,
    "package-manager": packageManager,
    directory,
  } = argv;

  const resolvedPackageManager = resolvePackageManagerType(
    packageManager,
    directory
  );

  const result: AuditCiConfig = {
    ...argv,
    "package-manager": resolvedPackageManager,
    levels: mapVulnerabilityLevelInput({
      low,
      moderate,
      high,
      critical,
    }),
    "report-type": mapReportTypeInput(argv),
    allowlist: allowlist,
  };
  return result;
}

export async function runYargs(): Promise<AuditCiConfig> {
  const { argv } = config("config", (configPath) =>
    // Supports JSON, JSONC, & JSON5
    parse(readFileSync(configPath, "utf8"))
  )
    .options({
      l: {
        alias: "low",
        default: false,
        describe: "Exit for low vulnerabilities or higher",
        type: "boolean",
      },
      m: {
        alias: "moderate",
        default: false,
        describe: "Exit for moderate vulnerabilities or higher",
        type: "boolean",
      },
      h: {
        alias: "high",
        default: false,
        describe: "Exit for high vulnerabilities or higher",
        type: "boolean",
      },
      c: {
        alias: "critical",
        default: false,
        describe: "Exit for critical vulnerabilities",
        type: "boolean",
      },
      p: {
        alias: "package-manager",
        default: "auto",
        describe: "Choose a package manager",
        choices: ["auto", "npm", "yarn", "pnpm"],
      },
      r: {
        alias: "report",
        default: false,
        describe: "Show a full audit report",
        type: "boolean",
      },
      s: {
        alias: "summary",
        default: false,
        describe: "Show a summary audit report",
        type: "boolean",
      },
      a: {
        alias: "allowlist",
        default: [],
        describe:
          "Allowlist module names (example), advisories (123), and module paths (123|example1>example2)",
        type: "array",
      },
      d: {
        alias: "directory",
        default: "./",
        describe: "The directory containing the package.json to audit",
        type: "string",
      },
      o: {
        alias: "output-format",
        default: "text",
        describe: "The format of the output of audit-ci",
        choices: ["text", "json"],
      },
      "show-found": {
        default: true,
        describe: "Show allowlisted advisories that are found",
        type: "boolean",
      },
      "show-not-found": {
        default: true,
        describe: "Show allowlisted advisories that are not found",
        type: "boolean",
      },
      registry: {
        default: undefined,
        describe: "The registry to resolve packages by name and version",
        type: "string",
      },
      "report-type": {
        default: "important",
        describe: "Format for the audit report results",
        type: "string",
        choices: ["important", "summary", "full"],
      },
      "retry-count": {
        default: 5,
        describe:
          "The number of attempts audit-ci calls an unavailable registry before failing",
        type: "number",
      },
      "pass-enoaudit": {
        default: false,
        describe:
          "Pass if no audit is performed due to the registry returning ENOAUDIT",
        type: "boolean",
      },
      "skip-dev": {
        default: false,
        describe: "Skip devDependencies",
        type: "boolean",
      },
    })
    .help("help");

  // yargs doesn't support aliases + TypeScript
  const awaitedArgv = (await argv) as unknown as AuditCiPreprocessedConfig;
  const auditCiConfig = mapArgvToAuditCiConfig(awaitedArgv);
  return auditCiConfig;
}
