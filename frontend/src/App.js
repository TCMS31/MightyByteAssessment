import React, { useCallback, useState } from 'react';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import DriverApp from './components/DriverApp';
import './App.css';

const MODES = {
  DASHBOARD: 'dashboard',
  DRIVER: 'driver',
};

/**
 * Shell for the two demo surfaces: the monitoring dashboard and the driver
 * simulator. Switching modes clears any signed-in session.
 */
function App() {
  const [mode, setMode] = useState(MODES.DASHBOARD);
  const [user, setUser] = useState(null);

  const switchMode = useCallback((nextMode) => {
    setMode(nextMode);
    setUser(null);
  }, []);

  const modeSelector = (
    <nav className="mode-selector" aria-label="Demo surface">
      <div className="mode-buttons">
        <button
          type="button"
          className={`mode-btn ${mode === MODES.DASHBOARD ? 'active' : ''}`}
          aria-pressed={mode === MODES.DASHBOARD}
          onClick={() => switchMode(MODES.DASHBOARD)}
        >
          Dashboard (client view)
        </button>
        <button
          type="button"
          className={`mode-btn ${mode === MODES.DRIVER ? 'active' : ''}`}
          aria-pressed={mode === MODES.DRIVER}
          onClick={() => switchMode(MODES.DRIVER)}
        >
          Driver app
        </button>
      </div>
    </nav>
  );

  if (mode === MODES.DRIVER) {
    return (
      <div className="App">
        {modeSelector}
        <DriverApp />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="App">
        {modeSelector}
        <LoginPage onLogin={setUser} />
      </div>
    );
  }

  return (
    <div className="App">
      <Dashboard user={user} onLogout={() => setUser(null)} />
    </div>
  );
}

export default App;
