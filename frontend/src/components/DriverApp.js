import React, { useCallback, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import {
  API_BASE_URL,
  DRIVER_NAMESPACE_URL,
  LOCATION_REPORT_INTERVAL_MS,
  randomServiceAreaLocation,
} from '../api/config';
import './DriverApp.css';

/**
 * Driver simulator.
 *
 * Signs in as a seeded driver and reports a synthetic position on a fixed
 * cadence. Reports go over the WebSocket while it is connected and fall back to
 * `POST /api/driver/update` otherwise; the original code always sent both, so
 * every tick wrote the same fix twice.
 */
function DriverApp() {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [session, setSession] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('offline');

  const socketRef = useRef(null);
  const intervalRef = useRef(null);

  const stopSharing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (socketRef.current) {
      // Disconnecting is what takes the driver offline server-side. The original
      // code also called POST /api/logout here, which revoked the access token
      // and made it impossible to start sharing again without signing back in.
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsSharing(false);
    setCurrentLocation(null);
    setStatus('signed in - not sharing');
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/login`, credentials);
      if (response.data.success) {
        setSession({ token: response.data.token, profile: response.data.profile });
        setStatus('signed in - not sharing');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Login failed');
    }
  };

  const startSharing = () => {
    if (!session?.token || socketRef.current) return;

    setError('');
    setIsSharing(true);
    setStatus('connecting...');

    const socket = io(DRIVER_NAMESPACE_URL, {
      auth: { token: session.token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('sharing location'));
    socket.on('connect_error', (connectError) => {
      setError(connectError.message);
      setStatus('connection refused');
    });
    socket.on('location_updated', (data) => setCurrentLocation(data.location));
    socket.on('error', (socketError) => setError(socketError.message));

    const report = () => {
      const location = randomServiceAreaLocation();

      if (socketRef.current?.connected) {
        socketRef.current.emit('location_update', location);
        return;
      }

      axios
        .post(`${API_BASE_URL}/api/driver/update`, location, {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        .then((response) => setCurrentLocation(response.data.location))
        .catch(() => setError('Could not report location over REST either.'));
    };

    report();
    intervalRef.current = setInterval(report, LOCATION_REPORT_INTERVAL_MS);
  };

  const handleSignOut = async () => {
    stopSharing();

    if (session?.token) {
      try {
        await axios.post(
          `${API_BASE_URL}/api/logout`,
          {},
          { headers: { Authorization: `Bearer ${session.token}` } }
        );
      } catch {
        // The token expires on its own; a failed logout is not worth blocking on.
      }
    }

    setSession(null);
    setCredentials({ username: '', password: '' });
    setCurrentLocation(null);
    setError('');
    setStatus('offline');
  };

  useEffect(() => stopSharing, [stopSharing]);

  if (!session) {
    return (
      <div className="driver-app">
        <div className="driver-login">
          <h1>Driver sign-in</h1>
          <p>Sign in to start reporting your position.</p>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="driver-username">Username</label>
              <input
                id="driver-username"
                type="text"
                autoComplete="username"
                value={credentials.username}
                onChange={(event) =>
                  setCredentials({ ...credentials, username: event.target.value })
                }
                placeholder="driver1"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="driver-password">Password</label>
              <input
                id="driver-password"
                type="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={(event) =>
                  setCredentials({ ...credentials, password: event.target.value })
                }
                placeholder="password1"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary">
              Sign in
            </button>
          </form>

          <div className="demo-credentials">
            <h3>Seeded accounts</h3>
            <ul>
              <li>driver1 / password1</li>
              <li>driver2 / password2</li>
              <li>driver3 / password3</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="driver-app">
      <div className="driver-dashboard">
        <header className="driver-header">
          <h1>{session.profile.name}</h1>
          <div className="driver-meta">
            <p>
              <strong>Vehicle</strong> {session.profile.vehicle}
            </p>
            <p>
              <strong>License</strong> {session.profile.license}
            </p>
            <p>
              <strong>Status</strong>{' '}
              <span className={`status ${isSharing ? 'active' : 'inactive'}`}>{status}</span>
            </p>
          </div>
          <button type="button" onClick={handleSignOut} className="btn btn-danger">
            Sign out
          </button>
        </header>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        <div className="location-controls">
          {isSharing ? (
            <button type="button" onClick={stopSharing} className="btn btn-secondary btn-large">
              Stop sharing location
            </button>
          ) : (
            <button type="button" onClick={startSharing} className="btn btn-primary btn-large">
              Start sharing location
            </button>
          )}
        </div>

        {currentLocation && (
          <div className="current-location">
            <h3>Last reported position</h3>
            <div className="location-display">
              <p>
                <strong>Latitude</strong> {currentLocation.lat}
              </p>
              <p>
                <strong>Longitude</strong> {currentLocation.lng}
              </p>
              <p>
                <strong>Reported</strong> {formatTime(currentLocation.timestamp)}
              </p>
            </div>
          </div>
        )}

        <div className="instructions">
          <h3>How this works</h3>
          <ol>
            <li>Start sharing to open an authenticated socket to the tracking service.</li>
            <li>A synthetic position inside the service area is reported every 5 seconds.</li>
            <li>The dashboard lists you as online and streams those positions to subscribers.</li>
            <li>Stopping, signing out or closing the tab takes you offline immediately.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

/** @param {string|undefined} timestamp */
function formatTime(timestamp) {
  if (!timestamp) return 'pending';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'pending' : date.toLocaleTimeString();
}

export default DriverApp;
