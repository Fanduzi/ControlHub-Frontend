// input: vitest, lib/profile-field-registry
// output: Test getProfileSchema identity flags and mapControlledFieldPath
// pos: Locks the console catalog to the four core CI minimum-identity fields
// note: if this file changes, update this header and tests/lib/README.md
import { describe, expect, it } from "vitest";

import {
  getProfileSchema,
  mapControlledFieldPath,
} from "@/lib/profile-field-registry";

describe("profile field registry", () => {
  it("marks the four core CI minimum identity fields required", () => {
    const required = (type: string) =>
      (getProfileSchema(type)?.fields ?? [])
        .filter((field) => field.required)
        .map((field) => field.key);

    expect(required("host")).toEqual(["hostname", "ipAddress"]);
    expect(required("database_instance")).toEqual(["engine", "host", "port"]);
    expect(required("database_cluster")).toEqual(["engine", "primaryEndpoint"]);
    expect(required("service")).toEqual(["systemName"]);
  });

  it("maps backend identity field names onto profile form paths", () => {
    expect(mapControlledFieldPath("host", "hostname")).toBe("profile.hostname");
    expect(mapControlledFieldPath("service", "profile.systemName")).toBe(
      "profile.systemName",
    );
    expect(mapControlledFieldPath("host", "name")).toBe("name");
  });

  it("does not treat labels as identity storage", () => {
    expect(mapControlledFieldPath("host", "labels")).toBe("labels");
    expect(getProfileSchema("host")?.fields.some((field) => field.key === "labels")).toBe(
      false,
    );
  });
});
