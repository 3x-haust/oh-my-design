import Hero from './components/Hero'
import Ledger from './components/Ledger'
import DiffBand from './components/DiffBand'
import BlindReview from './components/BlindReview'
import Lego from './components/Lego'
import CliProof from './components/CliProof'
import Install from './components/Install'
import Footer from './components/Footer'

function App() {
  return (
    <>
      <a className="skip-link" href="#ledger">
        Skip to the stage record
      </a>
      <main>
        <Hero />
        <Ledger />
        <DiffBand />
        <BlindReview />
        <Lego />
        <CliProof />
        <Install />
      </main>
      <footer>
        <Footer />
      </footer>
    </>
  )
}

export default App
