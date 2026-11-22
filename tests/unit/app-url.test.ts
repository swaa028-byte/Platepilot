import { afterEach, describe, expect, it } from "vitest";

import { appBaseUrl } from "@/domain/app-url";

const original = process.env.APP_URL;

afterEach(() => {
  if (original === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = original;
});

describe("appBaseUrl", () => {
  it("keeps a complete URL, minus a trailing slash", () => {
    process.env.APP_URL = "https://platepilot.example.com/";
    expect(appBaseUrl()).toBe("https://platepilot.example.com");
  });

  it("adds https to a bare host", () => {
    // This is what a hosting dashboard's variable field invites, and what
    // new URL() rejects with ERR_INVALID_URL while pages prerender.
    process.env.APP_URL = "platepilot.signal-studio.workers.dev";
    expect(appBaseUrl()).toBe("https://platepilot.signal-studio.workers.dev");
    expect(() => new URL(appBaseUrl())).not.toThrow();
  });

  it("trims whitespace from a pasted value", () => {
    process.env.APP_URL = "  platepilot.example.com \n";
    expect(appBaseUrl()).toBe("https://platepilot.example.com");
  });

  it("treats empty and unset values as local development", () => {
    // Local mode deliberately runs with empty env strings.
    process.env.APP_URL = "";
    expect(appBaseUrl()).toBe("http://localhost:3000");
    delete process.env.APP_URL;
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });

  it("leaves http alone, for local previews behind a proxy", () => {
    process.env.APP_URL = "http://localhost:3000";
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });
});
