import { useState } from 'react';
import { RecepcionForm } from './features/recepcion/RecepcionForm';
import { RemitoClienteForm } from './features/remito-cliente/RemitoClienteForm';

type Section = 'recepcion' | 'remito-cliente';

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'recepcion',       label: 'Informe de Recepción', icon: '📦' },
  { id: 'remito-cliente',  label: 'Remito a Clientes',    icon: '🚚' },
];

export default function App() {
  const [section, setSection] = useState<Section>('recepcion');

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-gray-900 text-white flex flex-col">
        <div className="px-4 py-5 border-b border-gray-700">
          <h1 className="text-lg font-bold leading-tight">Oxígeno App</h1>
          <p className="text-xs text-gray-400 mt-0.5">Sistema de trazabilidad</p>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={[
                'w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                section === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white',
              ].join(' ')}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {section === 'recepcion'      && <RecepcionForm />}
        {section === 'remito-cliente' && <RemitoClienteForm />}
      </main>
    </div>
  );
}
