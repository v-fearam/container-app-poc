import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useSidebar } from '../../context/SidebarContext'

export function AppLayout() {
  const { collapsed } = useSidebar()

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className={`transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-60'}`}>
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
