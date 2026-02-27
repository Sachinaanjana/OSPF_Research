import { NextResponse } from "next/server"
import { hashPassword, createToken, setSessionCookie } from "@/lib/auth"
import { findUserByEmail, createUser } from "@/lib/users"

export async function POST(request: Request) {
  try {
    const { email, name, password } = await request.json()

    // Validation
    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "Email, name, and password are required." },
        { status: 400 }
      )
    }

    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      )
    }

    if (typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      )
    }

    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name must be at least 2 characters." },
        { status: 400 }
      )
    }

    // Check existing
    const existing = findUserByEmail(email)
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      )
    }

    // Create user
    const passwordHash = await hashPassword(password)
    const user = createUser({ email, name: name.trim(), passwordHash })

    // Create session
    const token = await createToken({ id: user.id, email: user.email, name: user.name })
    await setSessionCookie(token)

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    })
  } catch {
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    )
  }
}
