import { type NextRequest, NextResponse } from "next/server"
import { loginUser } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { message: "Username dan password harus diisi" },
        { status: 400 }
      )
    }

    // Get client info for audit
    const ipAddress = request.headers.get("x-forwarded-for") || 
                      request.headers.get("x-real-ip") || 
                      "unknown"
    const userAgent = request.headers.get("user-agent") || undefined

    const result = await loginUser(username, password, ipAddress, userAgent)

    return NextResponse.json({
      token: result.token,
      adminName: result.user.fullName,
      email: result.user.email,
      role: result.user.role,
      userId: result.user.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan server"
    const status = message.includes("salah") || message.includes("terkunci") || message.includes("tidak aktif") ? 401 : 500
    
    return NextResponse.json({ message }, { status })
  }
}
