import { afterEach, describe, expect, it } from "vitest";
import { getAppUrl } from "../src/server/app-url";

const originalAppUrl = process.env.APP_URL;
const originalAppHost = process.env.APP_HOST;
const originalPort = process.env.PORT;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;

  if (originalAppHost === undefined) delete process.env.APP_HOST;
  else process.env.APP_HOST = originalAppHost;

  if (originalPort === undefined) delete process.env.PORT;
  else process.env.PORT = originalPort;
});

describe("application URL", () => {
  it("prefers a configured APP_URL", () => {
    process.env.APP_URL = " https://money.example ";
    process.env.APP_HOST = "192.168.1.25";
    process.env.PORT = "3101";

    expect(getAppUrl()).toBe("https://money.example");
  });

  it("uses the configured host and selected port when APP_URL is blank", () => {
    process.env.APP_URL = "   ";
    process.env.APP_HOST = "192.168.1.25";
    process.env.PORT = "3101";

    expect(getAppUrl()).toBe("http://192.168.1.25:3101");
  });

  it("uses localhost with the selected port when APP_URL and APP_HOST are unset", () => {
    delete process.env.APP_URL;
    delete process.env.APP_HOST;
    process.env.PORT = "3101";

    expect(getAppUrl()).toBe("http://localhost:3101");
  });

  it("defaults to localhost and port 3000 when no values are set", () => {
    delete process.env.APP_URL;
    delete process.env.APP_HOST;
    delete process.env.PORT;

    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});
