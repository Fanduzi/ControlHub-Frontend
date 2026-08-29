import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual("@/services/api-client");
  return {
    ...actual,
    apiClient: vi.fn(),
  };
});

import { apiClient } from "@/services/api-client";
import {
  getSchemaDatabases,
  getSchemaObjects,
  getObjectDetails,
  normalizeObjectDetail,
  getTableDefinition,
  getRelationshipMap,
} from "@/services/query-schema";

const mockApiClient = vi.mocked(apiClient);

describe("getSchemaDatabases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /query-targets/{id}/schema/databases with targetId", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      defaultDatabase: null,
      items: [],
      pageInfo: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    await getSchemaDatabases(1);

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/databases",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("appends page and pageSize params when provided", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      defaultDatabase: null,
      items: [],
      pageInfo: { page: 2, pageSize: 100, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    await getSchemaDatabases(1, { page: 2, pageSize: 100 });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/databases?page=2&pageSize=100",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("forwards database search, includeSystem, and refresh only when requested", async () => {
    mockApiClient.mockResolvedValue({
      targetResourceId: 1,
      defaultDatabase: null,
      items: [],
      pageInfo: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    await getSchemaDatabases(1, { q: "app", includeSystem: true, refresh: true });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/databases?q=app&includeSystem=true&refresh=true",
      expect.objectContaining({ signal: undefined }),
    );

    await getSchemaDatabases(1, { q: "app" });
    expect(mockApiClient).toHaveBeenLastCalledWith(
      "/query-targets/1/schema/databases?q=app",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("forwards AbortSignal to apiClient", async () => {
    const controller = new AbortController();
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      defaultDatabase: null,
      items: [],
      pageInfo: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    await getSchemaDatabases(1, { signal: controller.signal });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/databases",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

describe("getSchemaObjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /query-targets/{id}/schema/objects with targetId and database", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "mydb",
      items: [],
      pageInfo: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    await getSchemaObjects(1, { database: "mydb" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/objects?database=mydb",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("appends kind filter when provided", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "mydb",
      items: [],
      pageInfo: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    await getSchemaObjects(1, { database: "mydb", kind: "table" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/objects?database=mydb&kind=table",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("safely encodes unusual database and object identifiers", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "my db/special",
      items: [],
      pageInfo: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    await getSchemaObjects(1, { database: "my db/special", q: "user@table" });

    const callPath = mockApiClient.mock.calls[0]?.[0] as string;
    expect(callPath).toContain("database=my+db%2Fspecial");
    expect(callPath).toContain("q=user%40table");
  });

  it("appends refresh=true only for an explicit object refresh", async () => {
    mockApiClient.mockResolvedValue({
      targetResourceId: 1,
      database: "mydb",
      items: [],
      pageInfo: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    await getSchemaObjects(1, { database: "mydb", refresh: true });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/objects?database=mydb&refresh=true",
      expect.objectContaining({ signal: undefined }),
    );

    await getSchemaObjects(1, { database: "mydb" });
    expect(mockApiClient).toHaveBeenLastCalledWith(
      "/query-targets/1/schema/objects?database=mydb",
      expect.objectContaining({ signal: undefined }),
    );
  });
});

describe("getObjectDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /query-targets/{id}/schema/object-details with all required params", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "mydb",
      name: "users",
      kind: "table",
      columns: [],
      indexes: [],
      foreignKeys: [],
      truncated: { columns: false, indexes: false, foreignKeys: false },
    });

    await getObjectDetails(1, { database: "mydb", name: "users" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/object-details?database=mydb&name=users",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("includes kind param when provided", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "mydb",
      name: "users",
      kind: "view",
      columns: [],
      indexes: [],
      foreignKeys: [],
      truncated: { columns: false, indexes: false, foreignKeys: false },
    });

    await getObjectDetails(1, { database: "mydb", name: "users", kind: "view" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/object-details?database=mydb&name=users&kind=view",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("appends refresh=true only for an explicit detail refresh", async () => {
    mockApiClient.mockResolvedValue({
      targetResourceId: 1,
      database: "mydb",
      name: "users",
      kind: "table",
      columns: [],
      indexes: [],
      foreignKeys: [],
      truncated: { columns: false, indexes: false, foreignKeys: false },
    });

    await getObjectDetails(1, { database: "mydb", name: "users", kind: "table", refresh: true });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/object-details?database=mydb&name=users&kind=table&refresh=true",
      expect.objectContaining({ signal: undefined }),
    );

    await getObjectDetails(1, { database: "mydb", name: "users", kind: "table" });
    expect(mockApiClient).toHaveBeenLastCalledWith(
      "/query-targets/1/schema/object-details?database=mydb&name=users&kind=table",
      expect.objectContaining({ signal: undefined }),
    );
  });
});

describe("request field safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never sends DSN, password, username, credential, or actorUserId fields", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      defaultDatabase: null,
      items: [],
      pageInfo: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    await getSchemaDatabases(1);

    const callArgs = mockApiClient.mock.calls[0];
    expect(callArgs).toBeDefined();

    // Verify the path doesn't contain forbidden fields
    const path = callArgs?.[0] as string;
    expect(path).not.toContain("dsn");
    expect(path).not.toContain("password");
    expect(path).not.toContain("username");
    expect(path).not.toContain("credential");
    expect(path).not.toContain("actorUserId");

    // Verify the options don't contain forbidden fields
    const options = callArgs?.[1] as Record<string, unknown> | undefined;
    if (options) {
      expect(options).not.toHaveProperty("dsn");
      expect(options).not.toHaveProperty("password");
      expect(options).not.toHaveProperty("username");
      expect(options).not.toHaveProperty("credential");
      expect(options).not.toHaveProperty("actorUserId");
    }
  });
});

describe("normalizeObjectDetail", () => {
  it("coerces null top-level and nested collections to empty arrays", () => {
    const raw = {
      targetResourceId: 1,
      database: "mydb",
      name: "users",
      kind: "table" as const,
      columns: null,
      indexes: [{ name: "idx", columns: null, unique: false, primary: false }],
      foreignKeys: [
        {
          name: "fk",
          columns: null,
          referencedDatabase: "mydb",
          referencedObject: "parent",
          referencedColumns: null,
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
      ],
      truncated: { columns: false, indexes: false, foreignKeys: false },
    } as unknown as Parameters<typeof normalizeObjectDetail>[0];

    const result = normalizeObjectDetail(raw);
    expect(result.columns).toEqual([]);
    expect(result.indexes[0]?.columns).toEqual([]);
    expect(result.foreignKeys[0]?.columns).toEqual([]);
    expect(result.foreignKeys[0]?.referencedColumns).toEqual([]);
  });

  it("preserves valid column arrays", () => {
    const columns = [
      {
        name: "id",
        databaseType: "INT",
        ordinalPosition: 1,
        nullable: false,
        primaryKey: true,
        autoIncrement: true,
      },
    ];
    const raw = {
      targetResourceId: 1,
      database: "mydb",
      name: "users",
      kind: "table" as const,
      columns,
      indexes: [],
      foreignKeys: [],
      truncated: { columns: false, indexes: false, foreignKeys: false },
    };

    const result = normalizeObjectDetail(raw);
    expect(result.columns).toEqual(columns);
  });
});

describe("getTableDefinition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /query-targets/{id}/schema/table-definition with exact URL", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "mydb",
      name: "users",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE users (id INT PRIMARY KEY);",
      truncated: false,
    });

    await getTableDefinition(1, { database: "mydb", name: "users" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/table-definition?database=mydb&name=users",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("encodes special characters in database and name params", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "my db",
      name: "user@table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE `user@table` (id INT);",
      truncated: false,
    });

    await getTableDefinition(1, { database: "my db", name: "user@table" });

    const callPath = mockApiClient.mock.calls[0]?.[0] as string;
    expect(callPath).toContain("database=my+db");
    expect(callPath).toContain("name=user%40table");
  });

  it("forwards AbortSignal to apiClient", async () => {
    const controller = new AbortController();
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "mydb",
      name: "users",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE users (id INT);",
      truncated: false,
    });

    await getTableDefinition(1, { database: "mydb", name: "users", signal: controller.signal });

    expect(mockApiClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("passes through response unchanged", async () => {
    const response = {
      targetResourceId: 1,
      database: "mydb",
      name: "users",
      kind: "table" as const,
      dialect: "mysql" as const,
      definition: "CREATE TABLE users (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  name VARCHAR(255)\n);",
      truncated: true,
    };
    mockApiClient.mockResolvedValueOnce(response);

    const result = await getTableDefinition(1, { database: "mydb", name: "users" });

    expect(result).toEqual(response);
  });

  it("never sends SQL, DSN, password, username, credential, or actorUserId fields", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "mydb",
      name: "users",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE users (id INT);",
      truncated: false,
    });

    await getTableDefinition(1, { database: "mydb", name: "users" });

    const callArgs = mockApiClient.mock.calls[0];
    expect(callArgs).toBeDefined();

    const path = callArgs?.[0] as string;
    expect(path).not.toContain("sql");
    expect(path).not.toContain("dsn");
    expect(path).not.toContain("password");
    expect(path).not.toContain("username");
    expect(path).not.toContain("credential");
    expect(path).not.toContain("actorUserId");

    const options = callArgs?.[1] as Record<string, unknown> | undefined;
    if (options) {
      expect(options).not.toHaveProperty("sql");
      expect(options).not.toHaveProperty("dsn");
      expect(options).not.toHaveProperty("password");
      expect(options).not.toHaveProperty("username");
      expect(options).not.toHaveProperty("credential");
      expect(options).not.toHaveProperty("actorUserId");
    }
  });
});

describe("getRelationshipMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /query-targets/{id}/schema/relationship-map with database and name", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      root: { id: "r1", database: "mydb", name: "users", kind: "table", role: "root" },
      nodes: [],
      edges: [],
      truncated: false,
    });

    await getRelationshipMap(1, { database: "mydb", name: "users" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/relationship-map?database=mydb&name=users",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("appends refresh=true when refresh param is set", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      root: { id: "r1", database: "mydb", name: "users", kind: "table", role: "root" },
      nodes: [],
      edges: [],
      truncated: false,
    });

    await getRelationshipMap(1, { database: "mydb", name: "users", refresh: true });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/1/schema/relationship-map?database=mydb&name=users&refresh=true",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("forwards AbortSignal to apiClient", async () => {
    const controller = new AbortController();
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      root: { id: "r1", database: "mydb", name: "users", kind: "table", role: "root" },
      nodes: [],
      edges: [],
      truncated: false,
    });

    await getRelationshipMap(1, { database: "mydb", name: "users", signal: controller.signal });

    expect(mockApiClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("never sends SQL, DSN, password, username, credential, or actorUserId fields", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 1,
      root: { id: "r1", database: "mydb", name: "users", kind: "table", role: "root" },
      nodes: [],
      edges: [],
      truncated: false,
    });

    await getRelationshipMap(1, { database: "mydb", name: "users" });

    const callArgs = mockApiClient.mock.calls[0];
    expect(callArgs).toBeDefined();

    const path = callArgs?.[0] as string;
    expect(path).not.toContain("sql");
    expect(path).not.toContain("dsn");
    expect(path).not.toContain("password");
    expect(path).not.toContain("username");
    expect(path).not.toContain("credential");
    expect(path).not.toContain("actorUserId");

    const options = callArgs?.[1] as Record<string, unknown> | undefined;
    if (options) {
      expect(options).not.toHaveProperty("sql");
      expect(options).not.toHaveProperty("dsn");
      expect(options).not.toHaveProperty("password");
      expect(options).not.toHaveProperty("username");
      expect(options).not.toHaveProperty("credential");
      expect(options).not.toHaveProperty("actorUserId");
    }
  });
});
