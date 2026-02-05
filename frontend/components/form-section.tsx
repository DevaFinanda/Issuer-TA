"use client"

import type React from "react"

interface FormSectionProps {
  title: string
  description: string
  icon?: React.ReactNode
  children: React.ReactNode
}

export default function FormSection({ title, description, icon, children }: FormSectionProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 pb-4 border-b-2 border-gradient-to-r from-primary/30 to-transparent">
        {icon && <div className="text-primary mt-1">{icon}</div>}
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground mb-1">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5">{children}</div>
    </div>
  )
}
