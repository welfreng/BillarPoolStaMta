"use client"

import { useState } from "react"
import Image from "next/image"
import { Menu, X, Phone, LogOut } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/components/auth-context"
import { Button } from "@/components/ui/button"
import { SITE_LOGO } from "@/lib/branding"

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const isHomePage = pathname === "/"

  const navLinks = [
    { label: "Inicio", href: isHomePage ? "#inicio" : "/" },
    { label: "Destacados", href: isHomePage ? "#productos" : "/#productos" },
    { label: "Tienda virtual", href: "/tienda-virtual" },
    { label: "Servicios", href: isHomePage ? "#servicios" : "/#servicios" },
    { label: "Ubicacion", href: isHomePage ? "#ubicacion" : "/#ubicacion" },
    { label: "Contacto", href: isHomePage ? "#contacto" : "/#contacto" },
  ]

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-[linear-gradient(135deg,#08162f_0%,#0a2472_58%,#12389b_100%)] shadow-[0_18px_50px_rgba(10,36,114,0.24)] backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
        <Link href={isHomePage ? "#inicio" : "/"} className="flex items-center gap-3">
          <Image
            src={SITE_LOGO}
            alt="Billar Pool Santa Marta"
            width={46}
            height={46}
            className="rounded-full drop-shadow-sm"
          />
          <div className="hidden xl:block">
            <p className="font-mono text-lg font-bold tracking-wide text-white">Billar Pool</p>
            <p className="text-xs uppercase tracking-widest text-[#d4a017]">Santa Marta</p>
          </div>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/82 transition-colors hover:bg-white/10 hover:text-[#f5c451]"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href="https://wa.me/573006775284"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-white/12 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/18 transition-colors hover:bg-[#d4a017] hover:text-[#08162f]"
          >
            <Phone className="h-4 w-4" />
            WhatsApp
          </a>

          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/80">{user.displayName || user.email}</span>
              <Button
                onClick={logout}
                variant="outline"
                size="sm"
                className="flex items-center gap-2 border-white/30 text-white hover:border-red-600 hover:bg-red-600"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesion
              </Button>
            </div>
          ) : (
            <Link href="/login">
              <Button size="sm" className="bg-[#d4a017] text-[#08162f] hover:bg-[#f5c451]">
                Iniciar sesion
              </Button>
            </Link>
          )}
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-white lg:hidden"
          aria-label={isOpen ? "Cerrar menu" : "Abrir menu"}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {isOpen ? (
        <div className="border-t border-white/10 bg-[linear-gradient(135deg,#08162f_0%,#0a2472_70%,#12389b_100%)] backdrop-blur-md lg:hidden">
          <ul className="flex flex-col gap-1 px-4 py-4">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="block rounded-lg px-4 py-3 text-sm font-medium text-white/82 transition-colors hover:bg-white/10 hover:text-[#f5c451]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <a
                href="https://wa.me/573006775284"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-[#d4a017] px-4 py-3 text-sm font-semibold text-[#08162f] transition-colors hover:bg-[#f5c451]"
              >
                <Phone className="h-4 w-4" />
                WhatsApp
              </a>
            </li>
            <li className="border-t border-[#1e3a8a]/30 pt-4">
              {user ? (
                <div className="flex flex-col gap-2">
                  <p className="px-4 py-2 text-sm text-white/80">
                    {user.displayName || user.email}
                  </p>
                  <button
                    onClick={logout}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesion
                  </button>
                </div>
              ) : (
                <Link href="/login" onClick={() => setIsOpen(false)}>
                  <Button className="w-full bg-[#d4a017] text-[#08162f] hover:bg-[#f5c451]">
                    Iniciar sesion
                  </Button>
                </Link>
              )}
            </li>
          </ul>
        </div>
      ) : null}
    </header>
  )
}
