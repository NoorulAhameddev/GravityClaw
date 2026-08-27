import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { StateProvider } from './hooks/StateContext';
import { useWebSocket } from './hooks/useWebSocket';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner } from './components/LoadingSpinner';

import { getWsUrl } from './lib/utils';

const Overview = lazy(() => import('./views/Overview').then((m) => ({ default: m.Overview })));
const Chat = lazy(() => import('./views/Chat').then((m) => ({ default: m.Chat })));
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

const pageRoutes = [
  { path: '/', element: <Overview /> },
  { path: '/chat', element: <Chat /> },
  { path: '/canvas', element: <Canvas /> },
  { path: '/analytics', element: <Analytics /> },
  { path: '/scheduler', element: <Scheduler /> },
  { path: '/webhooks', element: <Webhooks /> },
  { path: '/heartbeats', element: <Heartbeats /> },
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

  const { status } = useWebSocket(getWsUrl());

  const handleNavigate = (page: string) => {
    navigate(page === 'overview' ? '/' : `/${page}`);
  };

  return (
    <div className="flex h-screen overflow-hidden text-text bg-bg">
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        status={status === 'connected' ? 'ok' : status === 'connecting' ? 'connecting' : 'err'}
      />
      <main role="main" className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Tactical HUD Header */}
        <header
          role="banner"
          className="h-14 px-6 flex items-center justify-between border-b border-border bg-surface shrink-0"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-dark uppercase tracking-wider">
              WORKSPACE //
            </span>
            <h1 className="font-mono text-sm font-bold uppercase tracking-wider text-text-bright">
              {currentPage}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-muted border border-border bg-surface2 px-2.5 py-1">
              <span className="text-muted-dark">MODE:</span>
              <span className="text-accent font-semibold">SWARM_ORCHESTRATOR</span>
            </div>

            <div
              role="status"
              aria-label={`Connection status: ${status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}`}
              className="flex items-center gap-2 font-mono text-[11px] px-2.5 py-1 border border-border bg-surface2"
            >
              <div
                className={`w-1.5 h-1.5 ${
                  status === 'connected'
                    ? 'bg-success'
                    : status === 'connecting'
                      ? 'bg-warning animate-pulse'
                      : 'bg-danger'
                }`}
              />
              <span className="uppercase text-text-bright font-medium">
                {status === 'connected'
                  ? 'LIVE'
                  : status === 'connecting'
                    ? 'SYNCING...'
                    : 'OFFLINE'}
              </span>
            </div>
          </div>
        </header>

        {/* View Content Port */}
        <div className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                {pageRoutes.map(({ path, element }) => (
                  <Route key={path} path={path} element={element} />
                ))}
                <Route
                  path="*"
                  element={
                    <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border text-muted font-mono text-xs gap-2">
                      <div className="text-text-bright uppercase font-bold">[404] ROUTE NOT FOUND</div>
                      <div className="text-muted-dark">MODULE NOT MOUNTED ON ORCHESTRATOR</div>
                    </div>
                  }
                />
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
