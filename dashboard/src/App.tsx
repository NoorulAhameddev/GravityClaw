import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { StateProvider } from './hooks/StateContext';
import { useWebSocket } from './hooks/useWebSocket';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner } from './components/LoadingSpinner';

import { getWsUrl } from './lib/utils';

const Overview = lazy(() => import('./views/Overview').then(m => ({ default: m.Overview })));
const Chat = lazy(() => import('./views/Chat').then(m => ({ default: m.Chat })));
const Canvas = lazy(() => import('./views/Canvas'));
const Analytics = lazy(() => import('./views/Analytics'));
const Scheduler = lazy(() => import('./views/Scheduler'));
const Webhooks = lazy(() => import('./views/Webhooks'));
const Heartbeats = lazy(() => import('./views/Heartbeats'));
const Sessions = lazy(() => import('./views/Sessions'));
const Memory = lazy(() => import('./views/Memory'));
const Swarms = lazy(() => import('./views/Swarms'));
const Workflows = lazy(() => import('./views/Workflows'));
const Tools = lazy(() => import('./views/Tools'));
const Usage = lazy(() => import('./views/Usage'));
const Admin = lazy(() => import('./views/Admin'));
const WhatsApp = lazy(() => import('./views/WhatsApp'));

const pageRoutes = [
  { path: '/', element: <Overview /> },
  { path: '/chat', element: <Chat /> },
  { path: '/canvas', element: <Canvas /> },
  { path: '/analytics', element: <Analytics /> },
  { path: '/scheduler', element: <Scheduler /> },
  { path: '/webhooks', element: <Webhooks /> },
  { path: '/heartbeats', element: <Heartbeats /> },
  { path: '/whatsapp', element: <WhatsApp /> },
  { path: '/sessions', element: <Sessions /> },
  { path: '/memory', element: <Memory /> },
  { path: '/swarms', element: <Swarms /> },
  { path: '/workflows', element: <Workflows /> },
  { path: '/tools', element: <Tools /> },
  { path: '/usage', element: <Usage /> },
  { path: '/admin', element: <Admin /> },
];

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = location.pathname.slice(1) || 'overview';
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('apiKey');
    if (stored) setApiKey(stored);
  }, []);

  const { status } = useWebSocket(getWsUrl(apiKey));

  const handleApiKeySave = () => {
    if (apiKey.trim()) {
      localStorage.setItem('apiKey', apiKey.trim());
      setShowApiKeyInput(false);
    }
  };

  const handleNavigate = (page: string) => {
    navigate(page === 'overview' ? '/' : `/${page}`);
  };

  return (
    <div className="flex h-screen overflow-hidden text-text">
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        status={status === 'connected' ? 'ok' : status === 'connecting' ? 'connecting' : 'err'}
      />
      <main role="main" className="flex-1 flex flex-col h-screen overflow-hidden">
        <header role="banner" className="px-8 py-4 flex items-center justify-between border-b border-border/40 bg-surface backdrop-blur-xl flex-shrink-0 relative">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" aria-hidden="true" />
          <h1 className="text-xl font-bold capitalize text-text-bright">{currentPage}</h1>
          <div className="flex items-center gap-4">
            {showApiKeyInput ? (
              <div className="flex items-center gap-2" role="dialog" aria-label="API Key input">
                <label htmlFor="api-key-input" className="sr-only">API Key</label>
                <input
                  id="api-key-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API Key"
                  aria-label="API Key"
                  className="px-4 py-2 text-sm bg-bg border border-border rounded-xl focus:outline-none focus:border-accent focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] w-52 transition-all"
                />
                <button onClick={handleApiKeySave} aria-label="Save API Key" className="px-4 py-2 text-sm bg-accent text-white rounded-xl hover:bg-accent-hover hover:shadow-[0_0_16px_rgba(99,102,241,0.4)] transition-all">Save</button>
                <button onClick={() => setShowApiKeyInput(false)} aria-label="Cancel API Key input" className="px-4 py-2 text-sm text-muted hover:text-text transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowApiKeyInput(true)} aria-label={apiKey ? "API Key is set, click to change" : "Set API Key"} className="text-xs text-muted hover:text-accent transition-colors">
                {apiKey ? '🔐 API Key Set' : '⚠️ Set API Key'}
              </button>
            )}
            <div role="status" aria-label={`Connection status: ${status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}`} className={`flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-full border backdrop-blur-sm
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
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                {pageRoutes.map(({ path, element }) => (
                  <Route key={path} path={path} element={element} />
                ))}
                <Route path="*" element={
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
                    <div className="text-lg font-semibold">Page not found</div>
                    <div className="text-sm">Coming soon</div>
                  </div>
                } />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <StateProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </StateProvider>
  );
}

export default App;
