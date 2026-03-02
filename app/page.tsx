import Navbar from "@/components/navbar"
import Hero from "@/components/hero"
import ProductCatalog from "@/components/product-catalog"
import Services from "@/components/services"
import About from "@/components/about"
import Reviews from "@/components/reviews"
import Location from "@/components/location"
import Footer from "@/components/footer"
import WhatsAppButton from "@/components/whatsapp-button"

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ProductCatalog />
        <Services />
        <About />
        <Reviews />
        <Location />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}
