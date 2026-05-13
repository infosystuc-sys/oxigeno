import { useState } from 'react';
import { RecepcionForm } from './features/recepcion/RecepcionForm';
import { RemitoClienteForm } from './features/remito-cliente/RemitoClienteForm';

type Section = 'recepcion' | 'remito-cliente';

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'recepcion',      label: 'Informe de Recepción', icon: '📦' },
  { id: 'remito-cliente', label: 'Remito a Clientes',    icon: '🚚' },
];

export default function App() {
  const [section, setSection] = useState<Section>('recepcion');

  return (
    <div className="flex min-h-screen bg-surface-subtle">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-primary-600 text-white flex flex-col">

        <div className="px-5 py-5 border-b border-white/10">
          <h1 className="text-base font-semibold tracking-tight">Oxígeno App</h1>
          <p className="text-xs text-white/60 mt-0.5">Sistema de trazabilidad</p>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={[
                'w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded text-sm transition-colors',
                section === item.id
                  ? 'bg-white text-primary-600 font-semibold'
                  : 'text-white/80 hover:bg-white/10 hover:text-white',
              ].join(' ')}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {section === 'recepcion'      && <RecepcionForm />}
        {section === 'remito-cliente' && <RemitoClienteForm />}
      </main>

    </div>
  );
}
