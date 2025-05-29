import React, { useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { API_BASE_URL } from '../api/config';
import './LoginPage.css';

/**
 * Dashboard sign-in.
 *
 * The dashboard has no separate operator directory: it authenticates against
 * the same `POST /api/login` endpoint as the driver app. The original copy
 * invited "any username and password", which the server has never accepted.
 */
function LoginPage({ onLogin }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setCredentials((previous) => ({ ...previous, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/login`, credentials);
      if (response.data.success) {
        onLogin({
          username: credentials.username,
          profile: response.data.profile,
          token: response.data.token,
        });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <header className="login-header">
          <h1>Ride Share Dashboard</h1>
          <p>Monitor drivers and follow their positions in real time</p>
        </header>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>Sign in</h2>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              autoComplete="username"
              value={credentials.username}
              onChange={handleInputChange}
              placeholder="driver1"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              autoComplete="current-password"
              value={credentials.password}
              onChange={handleInputChange}
              placeholder="password1"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Open dashboard'}
          </button>
        </form>

        <div className="features-grid">
          <div className="feature-card">
            <h3>Live tracking</h3>
            <p>Positions are pushed the moment a driver reports one — no polling.</p>
          </div>

          <div className="feature-card">
            <h3>Online roster</h3>
            <p>See which drivers have reported a position inside the freshness window.</p>
          </div>

          <div className="feature-card">
            <h3>Offline alerts</h3>
            <p>A driver you are watching who goes quiet raises an offline notice.</p>
          </div>

          <div className="feature-card">
            <h3>Per-driver streams</h3>
            <p>Subscribing joins one room, so you only receive the traffic you asked for.</p>
          </div>
        </div>

        <div className="demo-note">
          <p>
            <strong>Seeded accounts:</strong> driver1 / password1, driver2 / password2, driver3 /
            password3. The dashboard authenticates against the same endpoint as the driver app.
          </p>
        </div>
      </div>
    </div>
  );
}

LoginPage.propTypes = {
  onLogin: PropTypes.func.isRequired,
};

export default LoginPage;
