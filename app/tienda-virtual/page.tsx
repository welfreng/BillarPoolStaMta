import Navbar from "@/components/navbar"
import ProductCatalog from "@/components/product-catalog"
import Footer from "@/components/footer"
import WhatsAppButton from "@/components/whatsapp-button"

export default function TiendaVirtualPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        <ProductCatalog sectionId="tienda-virtual" />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}
