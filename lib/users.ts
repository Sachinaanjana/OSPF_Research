// In-memory user store for demo. In production, replace with a real database.
// Users persist during a single server process lifecycle.

export interface StoredUser {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: string
}

const users: Map<string, StoredUser> = new Map()

export function findUserByEmail(email: string): StoredUser | undefined {
  for (const user of users.values()) {
    if (user.email.toLowerCase() === email.toLowerCase()) {
      return user
    }
  }
  return undefined
}

export function findUserById(id: string): StoredUser | undefined {
  return users.get(id)
}

export function createUser(data: {
  email: string
  name: string
  passwordHash: string
}): StoredUser {
  const id = crypto.randomUUID()
  const user: StoredUser = {
    id,
    email: data.email.toLowerCase(),
    name: data.name,
    passwordHash: data.passwordHash,
    createdAt: new Date().toISOString(),
  }
  users.set(id, user)
  return user
}

export function getUserCount(): number {
  return users.size
}
