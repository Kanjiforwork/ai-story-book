import fs from "node:fs";
import path from "node:path";

import { EnvironmentValidationError, REQUIRED_ENV_NAMES } from "@/server/env";

const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const PLACEHOLDER_PATTERN =
  /^(your[_ -]?|replace[_ -]?|change[_ -]?|example|test|dummy|<)/i;
const SECRET_PREFIX_PATTERN = /^(AIza|sk-|gh[pousr]_|github_pat_|xox[baprs]-)/;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnvExample(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) {
      throw new EnvironmentValidationError([
        `.env.example line ${index + 1} must use NAME=value syntax.`,
      ]);
    }

    const name = line.slice(0, separator).trim();
    if (!ENV_NAME_PATTERN.test(name)) {
      throw new EnvironmentValidationError([
        `.env.example contains an invalid variable name: ${name}.`,
      ]);
    }
    values[name] = unquote(line.slice(separator + 1));
  }

  return values;
}

export function isSuspiciousSecret(
  value: string,
  variableName?: string,
): boolean {
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER_PATTERN.test(trimmed)) return false;
  if (variableName === "GEMINI_API_KEY") return true;
  if (SECRET_PREFIX_PATTERN.test(trimmed)) return true;
  return trimmed.length >= 32 && /^[A-Za-z0-9_+/=-]+$/.test(trimmed);
}

export function validateEnvExample(content: string): void {
  const values = parseEnvExample(content);
  const missing = REQUIRED_ENV_NAMES.filter((name) => !(name in values));
  const issues: string[] = [];

  if (missing.length > 0) {
    issues.push(`.env.example is missing: ${missing.join(", ")}.`);
  }

  for (const [name, value] of Object.entries(values)) {
    if (isSuspiciousSecret(value, name)) {
      issues.push(
        `.env.example contains a suspicious secret value for ${name}.`,
      );
    }
  }

  if (issues.length > 0) throw new EnvironmentValidationError(issues);
}

export function validateEnvExampleFile(
  envExamplePath = path.resolve(process.cwd(), ".env.example"),
): void {
  validateEnvExample(fs.readFileSync(envExamplePath, "utf8"));
}
