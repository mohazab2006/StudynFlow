import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import CommandCenter from '../command/CommandCenter';

export default function Layout() {
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        <TopBar onOpenCommand={() => setCommandOpen(true)} />
        <main className="flex-1 overflow-y-auto p-8 pt-12">
          <Outlet />
        </main>
      </div>
      <CommandCenter isOpen={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}

