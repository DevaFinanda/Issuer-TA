"use client"

export default function IssuerHeader() {
  return (
    <div className="mb-12 text-center">
      <div className="mb-4">
        <div className="inline-block mb-4 px-4 py-2 bg-gradient-to-r from-primary/10 to-accent/10 rounded-full border border-primary/20 hover:border-primary/40 transition-smooth">
          <span className="text-sm font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
            BPJS INDONESIA
          </span>
        </div>
      </div>

      <h1 className="text-5xl sm:text-6xl font-bold mb-3 text-foreground tracking-tight">
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-accent">
          Credential Issuer
        </span>
      </h1>

      <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        Platform Penerbitkan
        <span className="font-semibold text-foreground"> Verifiable Credential Digital </span>
      </p>

      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      </div>
    </div>
  )
}
