export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  role: string;
};

const DEMO_USERS = {
  admin: {
    email: "admin@example.com",
    password: "secret123",
    role: "admin",
    token: "demo-admin-token",
  },
  editor: {
    email: "editor@example.com",
    password: "secret123",
    role: "editor",
    token: "demo-editor-token",
  },
} as const;

export async function login({
  email,
  password,
}: LoginRequest): Promise<LoginResponse> {
  const user = Object.values(DEMO_USERS).find(
    (candidate) =>
      candidate.email.toLowerCase() === email.toLowerCase() &&
      candidate.password === password,
  );

  if (!user) {
    throw new Error("Invalid demo credentials");
  }

  return {
    token: user.token,
    role: user.role,
  };
}

export const demoCredentials = DEMO_USERS;
