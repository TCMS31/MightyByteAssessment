# Captured test output

Recorded on 2026-09-24 with:

```
npm test
```

```console

> ride-share-backend@1.0.0 test
> NODE_ENV=test node --test --test-reporter=spec "tests/*.test.js"

✔ GET /health reports the service as healthy (16.252083ms)
✔ GET / lists the API surface (2.742084ms)
✔ an unknown path returns a JSON 404, not an HTML stack page (2.34425ms)
✔ POST /api/login issues a token for valid credentials (9.249209ms)
✔ POST /api/login rejects a missing field with 400 and a wrong password with 401 (7.469292ms)
✔ POST /api/login does not leak which half of the pair was wrong (7.788208ms)
✔ POST /api/driver/update requires a bearer token (8.700875ms)
✔ POST /api/driver/update stores a valid fix (3.855208ms)
✔ POST /api/driver/update rejects bad coordinates with 400 (8.110417ms)
✔ GET /api/driver/location returns the caller's own fix, 404 before one exists (7.809ms)
✔ GET /api/driver/online lists only drivers that have reported in (7.586584ms)
✔ GET /api/driver/:driverId/location resolves a driver, or 404s (8.759166ms)
✔ the literal /online and /stats paths are not captured as driver ids (3.142667ms)
✔ GET /api/driver/stats reports store occupancy (6.995917ms)
✔ GET /api/profile returns claims plus the current fix (5.983834ms)
✔ POST /api/logout revokes the token so it can no longer be replayed (7.987166ms)
✔ POST /api/logout also takes the driver offline (5.066375ms)
✔ logging out one driver leaves another session untouched (4.983875ms)
✔ an oversized body is rejected rather than buffered (2.976833ms)
✔ generateToken embeds the driver claims and a matching expiry record (2.767125ms)
✔ verifyToken rejects a token signed with another secret (0.439917ms)
✔ verifyToken rejects an already expired token (0.245208ms)
✔ verifyToken rejects malformed input without throwing (0.074458ms)
✔ extractBearerToken accepts only a well-formed Bearer header (0.181083ms)
✔ authoriseToken reports a missing token distinctly (0.383334ms)
✔ authoriseToken accepts a signed token that the store still holds (0.285541ms)
✔ authoriseToken rejects a signed token the store has revoked (0.405375ms)
✔ authoriseToken rejects a forged token before consulting the store (0.419584ms)
✔ the server refuses to start in production without an explicit JWT_SECRET (56.971875ms)
✔ production starts once JWT_SECRET is supplied (41.506208ms)
✔ development falls back to the throwaway secret so the repo runs out of the box (44.671667ms)
✔ numeric settings come from the environment and reject junk (81.268708ms)
✔ CORS_ORIGINS accepts a comma-separated list (46.852042ms)
✔ validateDriverCredentials returns the profile for a correct pair (6.778375ms)
✔ validateDriverCredentials rejects a wrong password (0.163916ms)
✔ validateDriverCredentials rejects a password of a different length (0.065209ms)
✔ validateDriverCredentials rejects an unknown username (0.056625ms)
✔ validateDriverCredentials rejects non-string input instead of throwing (0.126958ms)
✔ the driver directory does not expose Object.prototype members (0.068625ms)
✔ findProfileById resolves seeded drivers only (0.112416ms)
✔ listProfiles returns every seeded driver with a stable shape (0.424208ms)
✔ a fresh fix marks the driver online (0.668167ms)
✔ a driver with no fix at all is offline (0.127875ms)
✔ the online window is inclusive at its boundary and closes after it (0.105666ms)
✔ a stale driver keeps their record until cleanup evicts it (2.307917ms)
✔ isTokenActive honours the recorded expiry and evicts on read (0.132959ms)
✔ isTokenActive is false for an unknown token (0.063791ms)
✔ removeActiveToken reports whether anything was revoked (0.12375ms)
✔ cleanup evicts expired tokens (0.062667ms)
✔ updateDriverLocation carries the profile forward when none is supplied (1.098791ms)
✔ removeDriver clears both the fix and the socket registration (0.558333ms)
✔ setDriverSocket is last-write-wins (0.117291ms)
✔ getStats counts tokens, fixes, sockets and live drivers separately (0.459ms)
✔ the cleanup timer is unref'd and idempotent so it cannot hold the process open (0.132833ms)
✔ reset empties every map (0.065917ms)
✔ generateRandomNYCLocation always lands inside the service area (1.754542ms)
✔ generated coordinates are rounded to six decimal places (0.163458ms)
✔ generateNearbyLocation stays within roughly the requested radius (0.424375ms)
✔ generateNearbyLocation clamps a base point outside the service area back inside it (0.0565ms)
✔ isWithinServiceArea is inclusive on the boundary and false outside (0.06375ms)
✔ validateCoordinates rejects non-numeric input (0.65775ms)
✔ validateCoordinates rejects out-of-range degrees (0.687416ms)
✔ validateCoordinates accepts the extremes of the valid range (1.598583ms)
✔ recordLocation stores the fix and returns a serialisable update (2.23225ms)
✔ recordLocation flags a fix outside the service area without rejecting it (0.120958ms)
✔ recordLocation refuses an unknown driver (0.746208ms)
✔ recordLocation publishes nothing when the coordinates are invalid (0.452833ms)
✔ the first fix publishes came_online then location_updated, in that order (0.322458ms)
✔ a subsequent fix publishes only location_updated (0.484959ms)
✔ a driver who went stale is announced as online again on their next fix (0.430792ms)
✔ markOffline removes the driver and reports their last known position (0.248291ms)
✔ markOffline still publishes for a driver who never sent a fix (0.065667ms)
✔ one driver going offline does not disturb another (0.070959ms)
✔ the driver namespace rejects a connection with no token (18.718417ms)
✔ the driver namespace rejects a forged token (8.113625ms)
✔ the driver namespace rejects a token that was revoked by logout (5.95675ms)
✔ an authenticated driver is greeted and registered (5.156583ms)
✔ a location_update is acknowledged with a timestamped location (6.8325ms)
✔ an invalid location_update is answered with an error and stores nothing (4.120625ms)
✔ a dashboard client receives the roster on connect (3.260583ms)
✔ subscribing to an offline driver yields driver_offline, not driver_data (3.357125ms)
✔ subscribing without a driver id is an error (4.457541ms)
✔ a subscribed dashboard receives the driver's live positions (5.489083ms)
✔ a dashboard subscribed to another driver is not sent that traffic (4.325083ms)
✔ a driver coming online updates every dashboard roster (4.294ms)
✔ a driver disconnecting takes them offline and notifies dashboards (4.889917ms)
✔ unsubscribing stops the per-driver stream (4.133166ms)
✔ get_online_drivers and get_driver_info answer on demand (4.681833ms)
✔ ping is answered with pong on both namespaces (3.686583ms)
✔ a reconnecting driver is not taken offline by their stale socket (257.715416ms)
ℹ tests 90
ℹ suites 0
ℹ pass 90
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 643.527583
```
