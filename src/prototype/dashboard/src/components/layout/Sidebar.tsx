import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ListOrdered, AlertTriangle,
  Mail, Building2, Megaphone, Shield,
  HeartPulse, Clock, User, LogOut, ChevronLeft, ChevronRight, Download
} from 'lucide-react'
import { useSidebar } from '../../context/SidebarContext'
import { CamuzziLogo } from '../CamuzziLogo'

const navGroups = [
  {
    label: 'Operación',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Home' },
      { to: '/colas', icon: ListOrdered, label: 'Colas' },
      { to: '/dlq', icon: AlertTriangle, label: 'DLQ Manager' },
      { to: '/eventos', icon: Download, label: 'Eventos' },
    ]
  },
  {
    label: 'Verticales',
    items: [
      { to: '/genericos', icon: Mail, label: 'Genéricos' },
      { to: '/negocio', icon: Building2, label: 'Negocio' },
      { to: '/campanas', icon: Megaphone, label: 'Campañas' },
    ]
  },
  {
    label: 'Administración',
    items: [
      { to: '/health', icon: HeartPulse, label: 'Health' },
      { to: '/config', icon: Settings, label: 'Configuración' },
      { to: '/scheduler', icon: Clock, label: 'Scheduler' },
      { to: '/tratamiento-smtp', icon: Shield, label: 'Tratamiento SMTP' },
    ]
  }
]

export function Sidebar() {
  const { collapsed, setCollapsed } = useSidebar()
  const [profileOpen, setProfileOpen] = useState(false)

  const handleLogout = () => {
    alert('Logout — redirigir a /.auth/logout')
  }

  return (
    <aside className={`fixed left-0 top-0 h-screen flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}
      style={{ background: 'var(--color-brand-darker)' }}>
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <CamuzziLogo size={collapsed ? 28 : 32} />
          {!collapsed && <span className="text-white font-bold text-sm">Notificaciones Digitales</span>}
        </div>
        <button onClick={() => setCollapsed(!collapsed)}
          className="p-2 hover:bg-white/10 rounded-md cursor-pointer transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}>
          {collapsed ? <ChevronRight size={20} className="text-white" /> : <ChevronLeft size={20} className="text-white" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-5">
        {navGroups.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <span className="text-xs uppercase tracking-wider px-3 mb-2 block"
                style={{ color: 'var(--color-neutral-muted)' }}>
                {group.label}
              </span>
            )}
            <ul className="space-y-1">
              {group.items.map(item => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 min-h-[44px] rounded-md text-sm cursor-pointer transition-colors duration-200 ${
                        isActive
                          ? 'bg-white/10 border-l-[3px] border-[#50FFD4] text-white'
                          : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }`
                    }
                    title={collapsed ? item.label : undefined}>
                    <item.icon size={20} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-white/10">
        {/* User profile */}
        <div className="p-3 relative">
          <button onClick={() => setProfileOpen(!profileOpen)}
            className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} w-full cursor-pointer hover:bg-white/5 rounded-md p-1 transition-colors`}
            title={collapsed ? 'Usuario Demo' : undefined}>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-white" />
            </div>
            {!collapsed && (
              <div className="text-left">
                <p className="text-white text-sm font-medium">Usuario Demo</p>
                <p className="text-white/50 text-xs">Admin</p>
              </div>
            )
            )}
          </button>

          {profileOpen && !collapsed && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl shadow-lg p-4 text-sm">
              <p className="font-medium" style={{ color: 'var(--color-neutral-textStrong)' }}>Fernando Aramendi</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-neutral-muted)' }}>f.aramendi@camuzzi.com</p>
              <div className="mt-3">
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-neutral-muted)' }}>Roles</p>
                <div className="flex gap-1 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(0,102,179,0.1)', color: 'var(--color-brand-primary)' }}>Admin</span>
                  <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(0,102,179,0.1)', color: 'var(--color-brand-primary)' }}>Operador</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Logout button */}
        <div className="p-3 pt-0">
          <button onClick={handleLogout}
            className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} w-full px-3 py-2.5 min-h-[44px] rounded-md text-sm cursor-pointer hover:bg-white/5 transition-colors text-white/70 hover:text-white`}
            title={collapsed ? 'Cerrar sesión' : undefined}>
            <LogOut size={20} />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </div>
    </aside>
  )
}
