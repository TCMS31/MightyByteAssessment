import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import io from 'socket.io-client';
import { DASHBOARD_NAMESPACE_URL } from '../api/config';
import './Dashboard.css';

const MAX_NOTIFICATIONS = 5;
const NOTIFICATION_TTL_MS = 5000;

/**
 * Monitoring view.
 *
 * Opens one socket to the `/dashboard` namespace, keeps the online roster in
 * sync from server-pushed events, and subscribes to exactly one driver at a
 * time. The server scopes per-driver traffic to a room, so nothing arrives here
 * for drivers we are not watching.
 */
function Dashboard({ user, onLogout }) {
  const [onlineDrivers, setOnlineDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedDriverData, setSelectedDriverData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState([]);

  const socketRef = useRef(null);
  const notificationTimersRef = useRef(new Map());

  // The socket handlers are registered once, so they must not close over
  // `selectedDriverId` directly: the original code compared against the value
  // captured on first render and therefore never cleared a disconnected driver.
  const selectedDriverIdRef = useRef('');
  useEffect(() => {
    selectedDriverIdRef.current = selectedDriverId;
  }, [selectedDriverId]);

  const addNotification = useCallback((message, type = 'info') => {
    const notification = { id: `${Date.now()}-${Math.random()}`, message, type };

    setNotifications((previous) => [notification, ...previous].slice(0, MAX_NOTIFICATIONS));

    const timer = setTimeout(() => {
      setNotifications((previous) => previous.filter((item) => item.id !== notification.id));
      notificationTimersRef.current.delete(notification.id);
    }, NOTIFICATION_TTL_MS);

    notificationTimersRef.current.set(notification.id, timer);
  }, []);

  useEffect(() => {
    const socket = io(DASHBOARD_NAMESPACE_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      setError('');
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
      setError('Connection lost. Attempting to reconnect...');
    });

    socket.on('connect_error', () => {
      setConnectionStatus('error');
      setError('Cannot reach the tracking service.');
    });

    socket.on('connected', () => addNotification('Connected to the dashboard service', 'success'));

    socket.on('online_drivers', (data) => {
      setOnlineDrivers(data.drivers || []);
      setLastUpdate(new Date().toISOString());
    });

    socket.on('driver_data', (data) => {
      setSelectedDriverData(data);
      setLastUpdate(new Date().toISOString());
      setError('');
    });

    socket.on('driver_offline', (data) => {
      setSelectedDriverData(null);
      addNotification(`Driver ${data.driverId} is offline`, 'warning');
    });

    socket.on('OFFLINE_DRIVER', (data) => {
      addNotification(`Driver ${data.driverId} has stopped reporting`, 'error');
    });

    socket.on('subscribed', (data) => addNotification(`Tracking ${data.driverId}`, 'success'));
    socket.on('unsubscribed', (data) =>
      addNotification(`Stopped tracking ${data.driverId}`, 'info')
    );

    socket.on('driver_connected', (data) => {
      addNotification(`${data.profile?.name || data.driverId} came online`, 'success');
    });

    socket.on('driver_disconnected', (data) => {
      addNotification(`${data.profile?.name || data.driverId} went offline`, 'warning');

      if (selectedDriverIdRef.current === data.driverId) {
        setSelectedDriverData(null);
      }
    });

    socket.on('error', (data) => {
      const message = data?.message || 'An error occurred';
      setError(message);
      addNotification(message, 'error');
    });

    const timers = notificationTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addNotification]);

  const handleDriverSelection = (driverId) => {
    const socket = socketRef.current;
    if (!socket) return;

    if (selectedDriverId) socket.emit('unsubscribe');

    setSelectedDriverId(driverId);
    setSelectedDriverData(null);
    setError('');

    if (driverId) socket.emit('subscribe', { driverId });
  };

  const refreshDriversList = () => socketRef.current?.emit('get_online_drivers');

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1 className="dashboard-title">Ride Share Dashboard</h1>
          <div className="header-info">
            <span className="user-info">Signed in as {user.username}</span>
            <div className={`connection-status status-${connectionStatus}`}>
              <span className="status-dot" aria-hidden="true" />
              {connectionStatus}
            </div>
            <button type="button" className="btn btn-danger" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-grid">
          <section className="card drivers-card">
            <div className="card-header">
              <h2 className="card-title">Online drivers</h2>
              <button
                type="button"
                className="btn btn-secondary refresh-btn"
                onClick={refreshDriversList}
                disabled={!isConnected}
              >
                Refresh
              </button>
            </div>

            <div className="drivers-list">
              {onlineDrivers.length === 0 ? (
                <div className="no-drivers">
                  <p>No drivers online</p>
                  <small>Drivers appear here once they report a position.</small>
                </div>
              ) : (
                onlineDrivers.map((driver) => (
                  <button
                    type="button"
                    key={driver.driverId}
                    className={`driver-item ${selectedDriverId === driver.driverId ? 'selected' : ''}`}
                    onClick={() => handleDriverSelection(driver.driverId)}
                  >
                    <span className="driver-info">
                      <span className="status-dot online" aria-hidden="true" />
                      <span>
                        <span className="driver-name">
                          {driver.profile?.name || driver.driverId}
                        </span>
                        <span className="driver-vehicle">
                          {driver.profile?.vehicle || 'Unknown vehicle'}
                        </span>
                      </span>
                    </span>
                    <span className="driver-status">
                      <span className="status-online">Online</span>
                      <small>Last seen {formatTime(driver.lastSeen)}</small>
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="card selection-card">
            <div className="card-header">
              <h2 className="card-title">Select a driver</h2>
            </div>

            <div className="form-group">
              <label htmlFor="driverSelect" className="form-label">
                Driver to track
              </label>
              <select
                id="driverSelect"
                className="form-select"
                value={selectedDriverId}
                onChange={(event) => handleDriverSelection(event.target.value)}
                disabled={!isConnected}
              >
                <option value="">-- none --</option>
                {onlineDrivers.map((driver) => (
                  <option key={driver.driverId} value={driver.driverId}>
                    {driver.profile?.name || driver.driverId} (
                    {driver.profile?.vehicle || 'Unknown'})
                  </option>
                ))}
              </select>
            </div>

            {selectedDriverId && (
              <div className="selected-driver-info">
                <h3>Tracking {selectedDriverData?.profile?.name || selectedDriverId}</h3>
                <p>Positions are pushed as the driver reports them.</p>
              </div>
            )}
          </section>

          <section className="card location-card">
            <div className="card-header">
              <h2 className="card-title">Driver location</h2>
              {lastUpdate && <small>Updated {formatTime(lastUpdate)}</small>}
            </div>

            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}

            {!selectedDriverId ? (
              <div className="no-selection">
                <p>Select a driver to view their position.</p>
              </div>
            ) : selectedDriverData ? (
              <dl className="location-grid">
                <LocationRow label="Driver" value={selectedDriverData.profile?.name || 'Unknown'} />
                <LocationRow
                  label="Vehicle"
                  value={selectedDriverData.profile?.vehicle || 'Unknown'}
                />
                <LocationRow
                  label="Latitude"
                  value={formatCoordinate(selectedDriverData.location?.lat)}
                  mono
                />
                <LocationRow
                  label="Longitude"
                  value={formatCoordinate(selectedDriverData.location?.lng)}
                  mono
                />
                <LocationRow
                  label="Status"
                  value={selectedDriverData.isOnline ? 'Online' : 'Offline'}
                />
                <LocationRow
                  label="Reported"
                  value={formatTime(selectedDriverData.location?.timestamp)}
                />
              </dl>
            ) : (
              <div className="loading-location">
                <span className="loading-spinner" aria-hidden="true" />
                <p>Waiting for the first position...</p>
              </div>
            )}
          </section>
        </div>

        {notifications.length > 0 && (
          <div className="notifications" role="status" aria-live="polite">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification notification-${notification.type}`}
              >
                {notification.message}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function LocationRow({ label, value, mono = false }) {
  return (
    <div className="location-item">
      <dt>{label}</dt>
      <dd className={mono ? 'coordinate' : undefined}>{value}</dd>
    </div>
  );
}

LocationRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  mono: PropTypes.bool,
};

/** @param {string|undefined} timestamp */
function formatTime(timestamp) {
  if (!timestamp) return 'never';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'never' : date.toLocaleTimeString();
}

/** @param {number|undefined} value */
function formatCoordinate(value) {
  return typeof value === 'number' ? value.toFixed(6) : 'n/a';
}

Dashboard.propTypes = {
  user: PropTypes.shape({ username: PropTypes.string }).isRequired,
  onLogout: PropTypes.func.isRequired,
};

export default Dashboard;
