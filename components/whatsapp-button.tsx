"use client"

import { useState } from "react"
import { MessageCircle, X } from "lucide-react"

export default function WhatsAppButton() {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Tooltip */}
      {showTooltip && (
        <div className="relative rounded-xl bg-card shadow-2xl border border-border p-4 max-w-[260px] animate-in fade-in slide-in-from-bottom-2">
          <button
            onClick={() => setShowTooltip(false)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-sm font-bold text-foreground pr-4">Hola! Necesitas ayuda?</p>
          <p className="text-xs text-muted-foreground mt-1">
            Escribenos por WhatsApp y te asesoramos con tu compra
          </p>
          <a
            href="https://wa.me/573006775284?text=Hola%2C%20me%20interesa%20conocer%20sus%20productos%20de%20billar"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#25d366] px-4 py-2 text-xs font-semibold text-white hover:bg-[#25d366]/90 transition-colors w-full justify-center"
          >
            Iniciar Chat
          </a>
        </div>
      )}

      {/* WhatsApp FAB */}
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        className="group flex h-16 w-16 items-center justify-center rounded-full bg-[#25d366] text-white shadow-xl hover:bg-[#25d366]/90 transition-all hover:scale-110 animate-bounce"
        style={{ animationDuration: "3s" }}
        aria-label="Contactar por WhatsApp"
      >
        <MessageCircle className="h-8 w-8" />
      </button>
    </div>
  )
}
