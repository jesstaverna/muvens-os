'use client';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), []);
  function toggle() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('muvens-theme', next); } catch { /* armazenamento indisponível */ }
    setDark(!dark);
  }
  return (
    <button onClick={toggle} className="btn btn-sm" aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'} title="Alternar tema">
      {dark ? <Sun className="h-4 w-4" strokeWidth={1.6} /> : <Moon className="h-4 w-4" strokeWidth={1.6} />}
    </button>
  );
}
