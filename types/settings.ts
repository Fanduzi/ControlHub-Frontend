export type EnvironmentRecord = {
  id: string;
  name: string;
  code: string;
  ownership_model: string;
};

export type OwnerRecord = {
  id: string;
  name: string;
  team: string;
  slack_channel: string;
};

export type RoleRecord = {
  id: string;
  name: string;
  scope: string;
};

export type DictionaryRecord = {
  key: string;
  description: string;
  values: string[];
};
