import { type NextRequest, NextResponse } from "next/server"
import { registerUser } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const { fullName, username, email, password } = await request.json()

    // Validation
    if (!fullName || !username || !email || !password) {
      return NextResponse.json(
        { message: "Semua field harus diisi" },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: "Format email tidak valid" },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { message: "Password minimal 6 karakter" },
        { status: 400 }
      )
    }

    // Validate username
    if (username.length < 3) {
      return NextResponse.json(
        { message: "Username minimal 3 karakter" },
        { status: 400 }
      )
    }

    const user = await registerUser({ fullName, username, email, password })

    return NextResponse.json({
      message: "Registrasi berhasil",
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan server"
    const status = message.includes("sudah") ? 409 : 500
    
    return NextResponse.json({ message }, { status })
  }
}
