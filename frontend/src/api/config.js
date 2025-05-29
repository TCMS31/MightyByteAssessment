/**
 * Single source of truth for where the backend lives.
 *
 * Every component used to hardcode `http://localhost:3001`, which meant the
 * `proxy` entry in package.json was dead config and the build could not be
 * pointed at a deployed API.
 */
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const DASHBOARD_NAMESPACE_URL = `${API_BASE_URL}/dashboard`;
export const DRIVER_NAMESPACE_URL = `${API_BASE_URL}/driver/update`;

/** How often the driver simulator reports a new position, in milliseconds. */
export const LOCATION_REPORT_INTERVAL_MS = 5000;

/** Service area used by the driver simulator. Mirrors the server's config. */
export const SERVICE_AREA = {
  north: 40.9176,
  south: 40.4774,
  east: -73.7004,
  west: -74.2591,
};

/**
 * Picks a random point inside the service area.
 * @returns {{lat: number, lng: number}}
 */
export function randomServiceAreaLocation() {
  const lat = Math.random() * (SERVICE_AREA.north - SERVICE_AREA.south) + SERVICE_AREA.south;
  const lng = Math.random() * (SERVICE_AREA.east - SERVICE_AREA.west) + SERVICE_AREA.west;

  return {
    lat: Number.parseFloat(lat.toFixed(6)),
    lng: Number.parseFloat(lng.toFixed(6)),
  };
}
