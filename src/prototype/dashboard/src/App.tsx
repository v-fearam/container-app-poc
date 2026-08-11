import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ToastProvider } from './components/Toast'
import { SidebarProvider } from './context/SidebarContext'
import { HomePage } from './pages/HomePage'
import { ColasPage } from './pages/ColasPage'
import { DlqPage } from './pages/DlqPage'
import { HealthPage } from './pages/HealthPage'
import { SchedulerPage } from './pages/SchedulerPage'
import { EventosPage } from './pages/EventosPage'
import { GenericosPage } from './pages/GenericosPage'
import { NegocioPage } from './pages/NegocioPage'
import { CampanasPage } from './pages/CampanasPage'

function App() {
  return (
    <BrowserRouter>
      <SidebarProvider>
        <ToastProvider>
          <Routes>
            <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/colas" element={<ColasPage />} />
            <Route path="/dlq" element={<DlqPage />} />
            <Route path="/eventos" element={<EventosPage />} />
            <Route path="/health" element={<HealthPage />} />
            <Route path="/scheduler" element={<SchedulerPage />} />
            <Route path="/genericos" element={<GenericosPage />} />
            <Route path="/negocio" element={<NegocioPage />} />
            <Route path="/campanas" element={<CampanasPage />} />
            </Route>
          </Routes>
        </ToastProvider>
      </SidebarProvider>
    </BrowserRouter>
  )
}

export default App
