import { describe, expect, it } from "vitest";
import { embeddedDatabaseAllowed, isServerlessHost } from "@/server/db/hosting";

const hostEnv = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

/**
 * The embedded database writes to a directory that a serverless host replaces on
 * every invocation. These checks exist so a deployment without a hosted project
 * refuses to take orders rather than losing them.
 */
describe("host detection", () => {
  it("recognises the hosts whose filesystem does not survive a request", () => {
    expect(isServerlessHost(hostEnv({ NETLIFY: "true" }))).toBe(true);
    expect(isServerlessHost(hostEnv({ VERCEL: "1" }))).toBe(true);
    expect(isServerlessHost(hostEnv({ AWS_LAMBDA_FUNCTION_NAME: "platepilot" }))).toBe(true);
  });

  it("allows the embedded database on an ordinary host", () => {
    expect(isServerlessHost(hostEnv({}))).toBe(false);
    expect(embeddedDatabaseAllowed(hostEnv({}))).toBe(true);
    expect(embeddedDatabaseAllowed(hostEnv({ NODE_ENV: "production" }))).toBe(true);
  });

  it("refuses the embedded database where it would silently lose data", () => {
    expect(embeddedDatabaseAllowed(hostEnv({ NETLIFY: "true" }))).toBe(false);
    expect(embeddedDatabaseAllowed(hostEnv({ VERCEL: "1" }))).toBe(false);
  });
});