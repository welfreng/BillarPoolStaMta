export interface PublicCatalogCategory {
  id: string
  label: string
}

export interface PublicCatalogProduct {
  id: string
  name: string
  description: string
  image: string
  category: string
  tag: string
  details: string[]
}

export const publicCatalogCategories: PublicCatalogCategory[] = [
  { id: "todos", label: "Todos" },
  { id: "tacos", label: "Tacos" },
  { id: "panos", label: "Panos" },
  { id: "accesorios", label: "Accesorios" },
  { id: "repuestos", label: "Repuestos" },
  { id: "bolas", label: "Bolas y Triangulos" },
]

export const publicCatalogProducts: PublicCatalogProduct[] = [
  {
    id: "tacos-madera-premium",
    name: "Tacos de Madera Premium",
    description: "Tacos profesionales de madera maple y palo de rosa. Disponibles en diferentes pesos y medidas.",
    image: "/images/tacos-madera.jpg",
    category: "tacos",
    tag: "Popular",
    details: ["Madera Maple importada", "Pesos de 18oz a 21oz", "Punta de cuero profesional", "Diferentes acabados"],
  },
  {
    id: "tacos-fibra-carbono",
    name: "Tacos de Fibra de Carbono",
    description: "Tacos de ultima tecnologia en fibra de carbono. Mayor precision y durabilidad para jugadores exigentes.",
    image: "/images/tacos-carbono.jpg",
    category: "tacos",
    tag: "Nuevo",
    details: ["Fibra de carbono de alta resistencia", "Menor deflexion", "Tecnologia Low Deflection", "Ideal para jugadores avanzados"],
  },
  {
    id: "panos-mesa-billar",
    name: "Panos para Mesa de Billar",
    description: "Panos de alta calidad para mesas de billar. Disponibles en verde, azul y rojo. Venta e instalacion.",
    image: "/images/panos-billar.jpg",
    category: "panos",
    tag: "Servicio",
    details: ["Lana premium importada", "Colores: verde, azul, rojo", "Servicio de instalacion incluido", "Para mesas de 7, 8 y 9 pies"],
  },
  {
    id: "tizas-docena",
    name: "Tizas por Docena",
    description: "Tizas de billar de primera calidad. Venta por docena ideal para negocios y salas de billar.",
    image: "/images/tizas-billar.jpg",
    category: "accesorios",
    tag: "Al por mayor",
    details: ["Marca reconocida", "Venta por docena", "Precio especial para negocios", "Agarre superior"],
  },
  {
    id: "guantes-docena",
    name: "Guantes por Docena",
    description: "Guantes profesionales de 3 dedos. Venta por docena con precios especiales para negocios.",
    image: "/images/guantes-billar.jpg",
    category: "accesorios",
    tag: "Al por mayor",
    details: ["Guantes de 3 dedos", "Licra elastica premium", "Venta por docena", "Tallas variadas"],
  },
  {
    id: "estuches-tacos",
    name: "Estuches para Tacos",
    description: "Estuches de cuero y sinteticos para proteger tu taco. Diferentes capacidades y estilos.",
    image: "/images/estuches-billar.jpg",
    category: "accesorios",
    tag: "Premium",
    details: ["Cuero genuino y sintetico", "Capacidad 1 a 4 tacos", "Proteccion acolchada", "Cierre de seguridad"],
  },
  {
    id: "juegos-bolas-triangulos",
    name: "Juegos de Bolas y Triangulos",
    description: "Sets completos de bolas de billar profesionales y triangulos de madera o plastico.",
    image: "/images/bolas-billar.jpg",
    category: "bolas",
    tag: "Completo",
    details: ["Bolas de resina premium", "Tamano reglamentario", "Triangulos de madera o plastico", "Diferentes marcas disponibles"],
  },
  {
    id: "virolas-casquillos",
    name: "Virolas y Casquillos",
    description: "Virolas de fibra y casquillos de bronce para tacos. Diferentes medidas disponibles. Servicio de instalacion en torno.",
    image: "/images/virolas-casquillos.jpg",
    category: "repuestos",
    tag: "Especializado",
    details: ["Virolas de fibra premium", "Casquillos de bronce", "Medidas de 11mm a 13mm", "Instalacion con torno incluida"],
  },
  {
    id: "accesorios-varios",
    name: "Accesorios Varios",
    description: "Todo lo que necesitas: portatacos, limpiadores, puentes, extensiones y mucho mas para tu negocio de billar.",
    image: "/images/accesorios-billar.jpg",
    category: "accesorios",
    tag: "Variado",
    details: ["Portatacos de pared", "Limpiadores y ceras", "Puentes y extensiones", "Marcadores de puntuacion"],
  },
]
