import Navbar from "@/components/navbar"
import Hero from "@/components/hero"
import ProductCatalog from "@/components/product-catalog"
import Promotions from "@/components/promotions"
import Services from "@/components/services"
import Location from "@/components/location"
import Footer from "@/components/footer"
import WhatsAppButton from "@/components/whatsapp-button"

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Promotions />
        <ProductCatalog featuredOnly />
        <Services />
        <Location />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}
