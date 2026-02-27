import { NextResponse } from "next/server"
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth"
import { findUserByEmail } from "@/lib/users"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      )
    }

    const user = findUserByEmail(email)
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      )
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      )
    }

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
