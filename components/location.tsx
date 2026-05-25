import { MapPin, Clock, Phone, Navigation } from "lucide-react"

export default function Location() {
  return (
    <section id="ubicacion" className="bg-[linear-gradient(180deg,#f8fafc_0%,#eef5ff_100%)] py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold tracking-widest uppercase text-[#d4a017] mb-2">
            Ubicacion
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono text-foreground tracking-tight text-balance">
            Como Llegar
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Visitanos en nuestra tienda en Santa Marta
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          <div className="h-[400px] overflow-hidden rounded-3xl border border-[#c8d3e6] shadow-[0_22px_50px_rgba(10,36,114,0.12)] lg:col-span-3 lg:h-[500px]">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3916.485!2d-74.199!3d11.241!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sBillar+Pool+Santa+Marta!5e0!3m2!1ses!2sco!4v1709416800000!5m2!1ses!2sco"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Ubicacion de Billar Pool Santa Marta en Google Maps"
            />
          </div>

          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="rounded-3xl bg-[linear-gradient(135deg,#08162f_0%,#0a2472_58%,#12389b_100%)] p-8 text-white shadow-[0_22px_50px_rgba(10,36,114,0.18)]">
              <h3 className="text-xl font-bold font-mono mb-6">Informacion de Contacto</h3>
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 flex-shrink-0">
                    <MapPin className="h-5 w-5 text-[#d4a017]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Direccion</p>
                    <p className="text-sm text-white/60 mt-0.5">Santa Marta, Magdalena, Colombia</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 flex-shrink-0">
                    <Phone className="h-5 w-5 text-[#d4a017]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Telefono / WhatsApp</p>
                    <a href="tel:+573006775284" className="text-sm text-white/60 hover:text-[#d4a017] mt-0.5 block transition-colors">
                      +57 300 677 5284
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 flex-shrink-0">
                    <Clock className="h-5 w-5 text-[#d4a017]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Horario</p>
                    <p className="text-sm text-white/60 mt-0.5">Lunes a Sabado: 8:00 AM - 7:00 PM</p>
                    <p className="text-sm text-white/60">Domingos: 9:00 AM - 2:00 PM</p>
                  </div>
                </div>
              </div>
            </div>

            <a
              href="https://www.google.com/maps/search/Billar+Pool+Santa+Marta"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-3 rounded-3xl border border-[#c8d3e6] bg-white p-6 shadow-sm transition-all hover:border-[#0a2472]/35 hover:shadow-[0_18px_42px_rgba(10,36,114,0.14)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0a2472] group-hover:bg-[#d4a017] transition-colors">
                <Navigation className="h-6 w-6 text-white group-hover:text-[#0a1628] transition-colors" />
              </div>
              <div className="text-left">
                <p className="text-base font-bold text-foreground font-mono">Abrir en Google Maps</p>
                <p className="text-sm text-muted-foreground">Obtener indicaciones de como llegar</p>
              </div>
            </a>

            <a
              href="https://wa.me/573006775284?text=Hola%2C%20me%20gustaria%20saber%20como%20llegar%20a%20la%20tienda"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-3 rounded-3xl bg-[#1a5632] p-6 shadow-[0_18px_42px_rgba(26,86,50,0.18)] transition-colors hover:bg-[#166534]"
            >
              <Phone className="h-6 w-6 text-white" />
              <div className="text-left">
                <p className="text-base font-bold text-white font-mono">Contactar por WhatsApp</p>
                <p className="text-sm text-white/60">Te indicamos como llegar</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
