import { describe, expect, it } from "vitest";
import { embeddedDatabaseAllowed, isServerlessHost } from "@/server/db/hosting";

/**
 * The embedded database writes to a directory that a serverless host replaces on
 * every invocation. These checks exist so a deployment without a hosted project
 * refuses to take orders rather than losing them.
 */
describe("host detection", () => {
  it("recognises the hosts whose filesystem does not survive a request", () => {
    expect(isServerlessHost({ NETLIFY: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isServerlessHost({ VERCEL: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isServerlessHost({ AWS_LAMBDA_FUNCTION_NAME: "platepilot" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("allows the embedded database on an ordinary host", () => {
    expect(isServerlessHost({} as NodeJS.ProcessEnv)).toBe(false);
    expect(embeddedDatabaseAllowed({} as NodeJS.ProcessEnv)).toBe(true);
    // A plain shell that happens to have NETLIFY unset but other variables set.
    expect(embeddedDatabaseAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("refuses the embedded database where it would silently lose data", () => {
    expect(embeddedDatabaseAllowed({ NETLIFY: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(embeddedDatabaseAllowed({ VERCEL: "1" } as NodeJS.ProcessEnv)).toBe(false);
  });
});