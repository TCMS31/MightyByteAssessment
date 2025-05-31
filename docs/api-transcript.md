# Captured API transcript

Recorded against a locally running server on 2026-09-24 with:

```
PORT=8510 node src/server.js
```

The token is truncated in the login response; every other line is verbatim.

```console

$ curl -s http://localhost:8510/health | jq .
{
  "status": "healthy",
  "timestamp": "2026-09-24T14:24:20.825Z",
  "uptime": 154.678186958,
  "environment": "development",
  "version": "1.0.0"
}

$ curl -s -X POST http://localhost:8510/api/login -H 'Content-Type: application/json' -d '{"username":"driver1","password":"wrong"}' -w '\nHTTP %{http_code}\n'
{"error":"Invalid credentials"}
HTTP 401

$ curl -s -X POST http://localhost:8510/api/login -H 'Content-Type: application/json' -d '{"username":"driver1","password":"password1"}' | jq .
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5...<truncated>",
  "profile": {
    "id": "driver1",
    "name": "John Smith",
    "vehicle": "Toyota Camry 2020",
    "license": "ABC123",
    "rating": 4.8
  },
  "expiresIn": "300s",
  "expiresInSeconds": 300,
  "expiresAt": "2026-09-24T14:29:20.848Z"
}

$ curl -s -X POST http://localhost:8510/api/driver/update -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"lat":40.7128,"lng":-74.0060}' | jq .
{
  "success": true,
  "message": "Location updated successfully",
  "location": {
    "lat": 40.7128,
    "lng": -74.006,
    "timestamp": "2026-09-24T14:24:20.866Z"
  },
  "withinServiceArea": true,
  "timestamp": "2026-09-24T14:24:20.866Z"
}

$ curl -s -X POST http://localhost:8510/api/driver/update -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"lat":"north","lng":-74.0060}' -w '\nHTTP %{http_code}\n'
{"error":"Invalid location data: lat and lng must be finite numbers"}
HTTP 400

$ curl -s http://localhost:8510/api/driver/online | jq .
{
  "success": true,
  "drivers": [
    {
      "driverId": "driver2",
      "profile": {
        "id": "driver2",
        "name": "Sarah Johnson",
        "vehicle": "Honda Civic 2021",
        "license": "XYZ789",
        "rating": 4.9
      },
      "lastSeen": "2026-09-24T14:23:47.506Z",
      "isOnline": true
    },
    {
      "driverId": "driver3",
      "profile": {
        "id": "driver3",
        "name": "Mike Davis",
        "vehicle": "Ford Focus 2019",
        "license": "DEF456",
        "rating": 4.7
      },
      "lastSeen": "2026-09-24T14:23:47.509Z",
      "isOnline": true
    },
    {
      "driverId": "driver1",
      "profile": {
        "id": "driver1",
        "name": "John Smith",
        "vehicle": "Toyota Camry 2020",
        "license": "ABC123",
        "rating": 4.8
      },
      "lastSeen": "2026-09-24T14:24:20.866Z",
      "isOnline": true
    }
  ],
  "count": 3,
  "timestamp": "2026-09-24T14:24:20.886Z"
}

$ curl -s http://localhost:8510/api/driver/driver1/location | jq .
{
  "success": true,
  "driverId": "driver1",
  "profile": {
    "id": "driver1",
    "name": "John Smith",
    "vehicle": "Toyota Camry 2020",
    "license": "ABC123",
    "rating": 4.8
  },
  "location": {
    "lat": 40.7128,
    "lng": -74.006,
    "timestamp": "2026-09-24T14:24:20.866Z"
  },
  "isOnline": true,
  "timestamp": "2026-09-24T14:24:20.897Z"
}

$ curl -s http://localhost:8510/api/driver/stats | jq .
{
  "success": true,
  "stats": {
    "activeTokens": 10,
    "driverLocations": 3,
    "connectedSockets": 0,
    "onlineDrivers": 3
  },
  "timestamp": "2026-09-24T14:24:20.906Z"
}

$ curl -s -X POST http://localhost:8510/api/logout -H "Authorization: Bearer $TOKEN" | jq .
{
  "success": true,
  "message": "Logged out successfully"
}

$ # the same token is replayed after logout -- it is now refused

$ curl -s -X POST http://localhost:8510/api/driver/update -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"lat":40.7128,"lng":-74.0060}' -w '\nHTTP %{http_code}\n'
{"error":"Invalid, expired or revoked token"}
HTTP 401

$ curl -s http://localhost:8510/api/driver/online | jq .
{
  "success": true,
  "drivers": [
    {
      "driverId": "driver2",
      "profile": {
        "id": "driver2",
        "name": "Sarah Johnson",
        "vehicle": "Honda Civic 2021",
        "license": "XYZ789",
        "rating": 4.9
      },
      "lastSeen": "2026-09-24T14:23:47.506Z",
      "isOnline": true
    },
    {
      "driverId": "driver3",
      "profile": {
        "id": "driver3",
        "name": "Mike Davis",
        "vehicle": "Ford Focus 2019",
        "license": "DEF456",
        "rating": 4.7
      },
      "lastSeen": "2026-09-24T14:23:47.509Z",
      "isOnline": true
    }
  ],
  "count": 2,
  "timestamp": "2026-09-24T14:24:20.934Z"
}
```
