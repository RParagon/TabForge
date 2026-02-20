import { TablatureEditor } from '@/components/tab/TablatureEditor';
import { Guitar } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
            <Guitar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">TabForge</h1>
            <p className="text-xs text-muted-foreground">Editor de Tablatura para Violão</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="px-4 py-6">
        <TablatureEditor />
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 mt-8">
        <p className="text-center text-xs text-muted-foreground">
          Clique nas células para adicionar números de casas · Notas e acordes são detectados automaticamente
        </p>
      </footer>
    </div>
  );
};

export default Index;
