// input: zod, resource type key
// output: getProfileSchema, hasProfileFields, ProfileSchema, mapControlledFieldPath
// pos: Console typed-profile field contract for core CI identity plus Domain Name/Virtual IP; backend remains the identity authority
// note: if this file changes, update this header and lib/README.md

import { z } from "zod";

export type ProfileFieldDef = {
  key: string;
  labelKey: string;
  inputType: "text" | "number" | "select";
  required: boolean;
  placeholder?: string;
  options?: { value: string; labelKey: string }[];
};

export type ProfileSchema = {
  fields: ProfileFieldDef[];
  zodSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
};

const HOST_FIELDS: ProfileFieldDef[] = [
  { key: "hostname", labelKey: "profileFields.hostname", inputType: "text", required: true, placeholder: "db-prod-01" },
  { key: "ipAddress", labelKey: "profileFields.ipAddress", inputType: "text", required: true, placeholder: "10.0.0.1" },
  { key: "osName", labelKey: "profileFields.osName", inputType: "text", required: false, placeholder: "Ubuntu 22.04" },
];

const DB_INSTANCE_FIELDS: ProfileFieldDef[] = [
  { key: "engine", labelKey: "profileFields.engine", inputType: "text", required: true, placeholder: "mysql" },
  { key: "version", labelKey: "profileFields.version", inputType: "text", required: false, placeholder: "8.0" },
  { key: "host", labelKey: "profileFields.host", inputType: "text", required: true, placeholder: "db-host-01" },
  { key: "port", labelKey: "profileFields.port", inputType: "number", required: true, placeholder: "3306" },
  { key: "role", labelKey: "profileFields.role", inputType: "select", required: false, options: [
    { value: "primary", labelKey: "profileFields.rolePrimary" },
    { value: "replica", labelKey: "profileFields.roleReplica" },
  ]},
];

const DB_CLUSTER_FIELDS: ProfileFieldDef[] = [
  { key: "engine", labelKey: "profileFields.engine", inputType: "text", required: true, placeholder: "mysql" },
  { key: "topologyMode", labelKey: "profileFields.topologyMode", inputType: "select", required: false, options: [
    { value: "single-primary", labelKey: "profileFields.topologySinglePrimary" },
    { value: "multi-primary", labelKey: "profileFields.topologyMultiPrimary" },
  ]},
  { key: "primaryEndpoint", labelKey: "profileFields.primaryEndpoint", inputType: "text", required: true, placeholder: "cluster-host:3306" },
];

const SERVICE_FIELDS: ProfileFieldDef[] = [
  { key: "systemName", labelKey: "profileFields.systemName", inputType: "text", required: true, placeholder: "payment-service" },
  { key: "repositoryUrl", labelKey: "profileFields.repositoryUrl", inputType: "text", required: false, placeholder: "https://github.com/..." },
  { key: "runtimeEnv", labelKey: "profileFields.runtimeEnv", inputType: "text", required: false, placeholder: "node, python, go..." },
];

const DOMAIN_NAME_FIELDS: ProfileFieldDef[] = [
  { key: "fqdn", labelKey: "profileFields.fqdn", inputType: "text", required: true, placeholder: "orders.example.com" },
];

const VIRTUAL_IP_FIELDS: ProfileFieldDef[] = [
  { key: "ipAddress", labelKey: "profileFields.ipAddress", inputType: "text", required: true, placeholder: "10.0.0.10" },
];

function buildZodSchema(fields: ProfileFieldDef[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let schema: z.ZodTypeAny;
    if (field.inputType === "number") {
      schema = field.required
        ? z.number().min(1).max(65535)
        : z.union([z.number().min(1).max(65535), z.string(), z.undefined()]).optional();
    } else {
      schema = field.required ? z.string().min(1) : z.string().optional();
    }
    shape[field.key] = schema;
  }
  return z.object(shape);
}

const REGISTRY: Record<string, ProfileSchema> = {
  host: { fields: HOST_FIELDS, zodSchema: buildZodSchema(HOST_FIELDS) },
  database_instance: { fields: DB_INSTANCE_FIELDS, zodSchema: buildZodSchema(DB_INSTANCE_FIELDS) },
  database_cluster: { fields: DB_CLUSTER_FIELDS, zodSchema: buildZodSchema(DB_CLUSTER_FIELDS) },
  service: { fields: SERVICE_FIELDS, zodSchema: buildZodSchema(SERVICE_FIELDS) },
  domain_name: { fields: DOMAIN_NAME_FIELDS, zodSchema: buildZodSchema(DOMAIN_NAME_FIELDS) },
  virtual_ip: { fields: VIRTUAL_IP_FIELDS, zodSchema: buildZodSchema(VIRTUAL_IP_FIELDS) },
};

export function getProfileSchema(resourceType: string): ProfileSchema | undefined {
  return REGISTRY[resourceType];
}

export function hasProfileFields(resourceType: string): boolean {
  return resourceType in REGISTRY;
}

export function mapControlledFieldPath(resourceType: string, field: string): string {
  if (field.startsWith("profile.")) {
    return field;
  }
  const schema = getProfileSchema(resourceType);
  if (schema?.fields.some((item) => item.key === field)) {
    return `profile.${field}`;
  }
  return field;
}
