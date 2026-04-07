import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { StateProvider } from './hooks/StateContext';
import { useWebSocket } from './hooks/useWebSocket';

import { Overview } from './views/Overview';
import { Chat } from './views/Chat';
import Canvas from './views/Canvas';
import Analytics from './views/Analytics';
import Scheduler from './views/Scheduler';
import Webhooks from './views/Webhooks';
import Heartbeats from './views/Heartbeats';
import Sessions from './views/Sessions';
import Memory from './views/Memory';
import Swarms from './views/Swarms';
import Workflows from './views/Workflows';
import Tools from './views/Tools';
import Usage from './views/Usage';
import Admin from './views/Admin';
import WhatsApp from './views/WhatsApp';

function AppContent() {
  const [currentPage, setCurrentPage] = useState('overview');
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  const { status } = useWebSocket(wsUrl);

  useEffect(() => {
    const stored = localStorage.getItem('apiKey');
    if (stored) setApiKey(stored);
  }, []);

  const handleApiKeySave = () => {
    if (apiKey.trim()) {
      localStorage.setItem('apiKey', apiKey.trim());
      setShowApiKeyInput(false);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'overview': return <Overview />;
      case 'chat': return <Chat />;
      case 'canvas': return <Canvas />;
      case 'analytics': return <Analytics />;
      case 'scheduler': return <Scheduler />;
      case 'webhooks': return <Webhooks />;
      case 'heartbeats': return <Heartbeats />;
      case 'whatsapp': return <WhatsApp />;
      case 'sessions': return <Sessions />;
      case 'memory': return <Memory />;
      case 'swarms': return <Swarms />;
      case 'workflows': return <Workflows />;
      case 'tools': return <Tools />;
      case 'usage': return <Usage />;
      case 'admin': return <Admin />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <span className="text-4xl">🚧</span>
            <div className="text-lg font-semibold capitalize">{currentPage}</div>
            <div className="text-sm">Coming soon</div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen overflow-hidden text-text">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        status={status === 'connected' ? 'ok' : status === 'connecting' ? 'connecting' : 'err'}
      />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="px-8 py-4 flex items-center justify-between border-b border-border/40 bg-surface backdrop-blur-xl flex-shrink-0 relative">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
          <h1 className="text-xl font-bold capitalize text-text-bright">{currentPage}</h1>
          <div className="flex items-center gap-4">
            {showApiKeyInput ? (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API Key"
                  className="px-4 py-2 text-sm bg-bg border border-border rounded-xl focus:outline-none focus:border-accent focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] w-52 transition-all"
                />
                <button onClick={handleApiKeySave} className="px-4 py-2 text-sm bg-accent text-white rounded-xl hover:bg-accent-hover hover:shadow-[0_0_16px_rgba(99,102,241,0.4)] transition-all">Save</button>
                <button onClick={() => setShowApiKeyInput(false)} className="px-4 py-2 text-sm text-muted hover:text-text transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowApiKeyInput(true)} className="text-xs text-muted hover:text-accent transition-colors">
                {apiKey ? '🔐 API Key Set' : '⚠️ Set API Key'}
              </button>
            )}
            <div className={`flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-full border backdrop-blur-sm
              ${status === 'connected' ? 'bg-success/10 text-success border-success/20 shadow-[0_0_12px_rgba(16,185,129,0.2)]' :
                status === 'connecting' ? 'bg-warning/10 text-warning border-warning/20' :
                  'bg-danger/10 text-danger border-danger/20'}`}>
              <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${status === 'connected' ? 'bg-success' :
                  status === 'connecting' ? 'bg-warning animate-pulse' : 'bg-danger'}`} />
              {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline'}
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <StateProvider>
      <AppContent />
    </StateProvider>
  );
}

export default App;
