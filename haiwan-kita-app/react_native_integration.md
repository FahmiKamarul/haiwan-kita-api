# Haiwan Kita — React Native Integration Guide

> **API Version**: 1.0.0  
> **Base URL (local dev)**: `http://<your-machine-ip>:3000`  
> **Real-time**: Socket.io v4

---

## Table of Contents

1. [Setup & Configuration](#1-setup--configuration)
2. [Response Envelope](#2-response-envelope)
3. [Authentication](#3-authentication)
4. [Missions](#4-missions)
5. [GPS Location Tracking](#5-gps-location-tracking)
6. [Attendance & Certificates](#6-attendance--certificates)
7. [Socket.io — Real-time GPS](#7-socketio--real-time-gps)
8. [Error Handling](#8-error-handling)
9. [Role-Based Access Control](#9-role-based-access-control)
10. [Recommended RN Libraries](#10-recommended-rn-libraries)

---

## 1. Setup & Configuration

### Base URL

For local development, use your machine's LAN IP (not `localhost` — the Android emulator can't reach it):

```
# Android emulator
http://10.0.2.2:3000

# Physical device (same Wi-Fi)
http://192.168.x.x:3000   ← replace with your machine's local IP

# iOS simulator
http://localhost:3000
```

### Environment Setup (`.env` in RN project)

```env
API_BASE_URL=http://192.168.x.x:3000
SOCKET_URL=http://192.168.x.x:3000
```

> [!IMPORTANT]
> Use [react-native-config](https://github.com/luggit/react-native-config) or Expo's `process.env` to manage environment variables in React Native.

### Recommended HTTP Client Setup

```ts
// lib/api.ts
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const api = axios.create({
  baseURL: process.env.API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request automatically
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

---

## 2. Response Envelope

Every API response — success or error — follows these consistent shapes.

### Success Response

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Missions retrieved successfully.",
  "data": { ... },
  "timestamp": "2026-05-12T05:13:00.000Z"
}
```

### Error Response

```json
{
  "success": false,
  "statusCode": 422,
  "error": "Validation Error",
  "message": "Input validation failed. Please check your request data.",
  "details": {
    "email": ["Invalid email address"],
    "password": ["Password must be at least 8 characters"]
  },
  "timestamp": "2026-05-12T05:13:00.000Z",
  "path": "/auth/register"
}
```

> [!TIP]
> Always check `response.data.success` first, then access `response.data.data` for the payload. On errors, read `response.data.message` for user-facing text and `response.data.details` for field-level validation errors.

---

## 3. Authentication

### Roles

| Role | Description |
|---|---|
| `VOLUNTEER` | Default role. Can join missions and share GPS. |
| `MEMBER` | Paid annual membership (RM50). Can verify attendance and request certificates. |
| `ADMIN` | Full access. Can see all GPS streams, verify attendance on behalf of others. |

> [!NOTE]
> Admins are created directly in the database and cannot self-register via the API.

---

### `POST /auth/register`

Registers a new `VOLUNTEER` or `MEMBER`. Public endpoint.

**Request Body**

```json
{
  "name": "Ahmad Zulkifli",
  "email": "ahmad@example.com",
  "password": "SecurePass123",
  "role": "VOLUNTEER",
  "phone": "+60123456789"
}
```

| Field | Type | Rules |
|---|---|---|
| `name` | string | Required. Min 2, max 100 chars. |
| `email` | string | Required. Valid email format. |
| `password` | string | Required. Min 8, max 72 chars. |
| `role` | enum | `"VOLUNTEER"` or `"MEMBER"`. Defaults to `"VOLUNTEER"`. |
| `phone` | string | Optional. Format: `+60123456789` (10–15 digits). |

**Success Response** `201`

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Registration successful.",
  "data": {
    "id": "clxyz123",
    "name": "Ahmad Zulkifli",
    "email": "ahmad@example.com",
    "role": "VOLUNTEER",
    "phone": "+60123456789",
    "token": "<JWT_TOKEN>"
  }
}
```

**If role is `MEMBER`** — additional fields are included:

```json
{
  "data": {
    ...
    "paymentRequired": true,
    "membershipFeeRM": 50,
    "paymentStatus": "PENDING",
    "message": "Account created. Please complete the RM50 annual membership payment..."
  }
}
```

> [!IMPORTANT]
> If registering as `MEMBER`, the account is created but privileges are locked until `POST /auth/pay-membership` is called.

---

### `POST /auth/login`

**Request Body**

```json
{
  "email": "ahmad@example.com",
  "password": "SecurePass123"
}
```

**Success Response** `200`

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful.",
  "data": {
    "id": "clxyz123",
    "name": "Ahmad Zulkifli",
    "email": "ahmad@example.com",
    "role": "VOLUNTEER",
    "phone": "+60123456789",
    "avatarUrl": null,
    "token": "<JWT_TOKEN>",
    "memberProfile": null,
    "volunteerProfile": {
      "totalMissions": 3
    }
  }
}
```

**Store the token:**

```ts
await AsyncStorage.setItem('token', data.data.token);
await AsyncStorage.setItem('user', JSON.stringify(data.data));
```

---

### `GET /auth/me`

Returns the currently authenticated user. Requires JWT.

**Headers**: `Authorization: Bearer <token>`

**Success Response** `200`

```json
{
  "data": {
    "id": "clxyz123",
    "email": "ahmad@example.com",
    "role": "VOLUNTEER"
  }
}
```

---

### `POST /auth/pay-membership`

Simulates the RM50 membership payment. Only callable by `MEMBER` role users.

**Headers**: `Authorization: Bearer <token>`  
**Body**: _(empty)_

**Success Response** `200`

```json
{
  "data": {
    "paymentStatus": "PAID",
    "amountPaid": 50,
    "paidAt": "2026-05-12T05:00:00.000Z",
    "membershipExpiry": "2027-05-12T05:00:00.000Z",
    "message": "RM50 membership fee paid successfully. Welcome to Haiwan Kita!"
  }
}
```

---

## 4. Missions

### `GET /api/v1/missions`

Fetch a paginated list of missions/projects. Requires JWT.

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `state` | enum | Filter by `UPCOMING`, `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `category` | enum | Filter by `RESCUE`, `ADOPTION`, `MEDICAL`, `AWARENESS`, `FEEDING`, `OTHER` |
| `search` | string | Full-text search on title, description, location |
| `page` | number | Page number. Default: `1` |
| `limit` | number | Items per page. Min `1`, max `100`. Default: `10` |

**Example**

```
GET /api/v1/missions?state=ACTIVE&category=RESCUE&page=1&limit=10
```

**Success Response** `200`

```json
{
  "data": {
    "missions": [
      {
        "id": "clxyz456",
        "title": "Operasi Selamat Kucing Liar",
        "description": "Misi menyelamat kucing liar di kawasan Chow Kit.",
        "category": "RESCUE",
        "state": "ACTIVE",
        "location": "Chow Kit, Kuala Lumpur",
        "latitude": 3.1685,
        "longitude": 101.7005,
        "startDate": "2026-05-15T08:00:00.000Z",
        "endDate": "2026-05-15T18:00:00.000Z",
        "requiredVolunteers": 10,
        "currentParticipants": 6,
        "isGpsRequired": true,
        "isFull": false,
        "spotsRemaining": 4,
        "createdBy": {
          "id": "clxyz001",
          "name": "Admin Haiwan Kita",
          "avatarUrl": null
        },
        "createdAt": "2026-05-10T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 24,
      "page": 1,
      "limit": 10,
      "totalPages": 3
    }
  }
}
```

> [!TIP]
> Use `isFull: true` to visually disable the "Join" button. Use `spotsRemaining` to show available slots.

---

### `GET /api/v1/missions/:id`

Fetch details for a single mission.

**Headers**: `Authorization: Bearer <token>`

**Success Response** `200` — same shape as a single mission object above, with additional:

```json
{
  "data": {
    ...
    "_count": {
      "participants": 6,
      "attendances": 2
    }
  }
}
```

---

### `POST /api/v1/missions/join`

Join a mission. Allowed for `VOLUNTEER` and `MEMBER` roles.

**Headers**: `Authorization: Bearer <token>`

**Request Body**

```json
{
  "projectId": "clxyz456"
}
```

| Field | Type | Rules |
|---|---|---|
| `projectId` | string | Required. Valid CUID. |

**Success Response** `201`

```json
{
  "data": {
    "message": "Successfully joined the mission!",
    "projectId": "clxyz456"
  }
}
```

**Possible Errors**

| Status | Scenario |
|---|---|
| `400` | Mission is `COMPLETED` or `CANCELLED` |
| `409` | Mission is full (capacity reached) |
| `409` | User already joined this mission |

---

### `POST /api/v1/missions/verify-attendance`

Verify mission attendance and trigger certificate generation. Allowed for `MEMBER` and `ADMIN`.

**Headers**: `Authorization: Bearer <token>`

**Request Body**

```json
{
  "projectId": "clxyz456",
  "userId": "clxyz123",
  "notes": "Hadir penuh sepanjang misi."
}
```

| Field | Type | Rules |
|---|---|---|
| `projectId` | string | Required. Valid CUID. |
| `userId` | string | Optional. If omitted, verifies the requesting user. Admins use this to verify on behalf of others. |
| `notes` | string | Optional. Max 500 chars. |

**Success Response** `200`

```json
{
  "data": {
    "attendanceId": "clxyz789",
    "status": "VERIFIED",
    "verifiedAt": "2026-05-15T18:30:00.000Z",
    "certificateStatus": "GENERATING",
    "message": "Attendance verified! Your participation certificate is being generated..."
  }
}
```

> [!NOTE]
> Certificate generation is asynchronous (fire-and-forget). Poll or check `certificateStatus` — it will update from `GENERATING` → `GENERATED` (or `FAILED`). The `certificateUrl` will be a path like `/certificates/cert_<attendanceId>.pdf` when ready.

---

## 5. GPS Location Tracking

### `POST /api/v1/location/update`

Send a GPS ping from the device. Allowed for `VOLUNTEER` and `MEMBER`.

Call this on a timer (e.g. every 10–30 seconds) while the user is active on a mission.

**Headers**: `Authorization: Bearer <token>`

**Request Body**

```json
{
  "latitude": 3.1685,
  "longitude": 101.7005,
  "accuracy": 5.2,
  "altitude": 45.0,
  "speed": 1.3,
  "projectId": "clxyz456",
  "isStreaming": true
}
```

| Field | Type | Rules |
|---|---|---|
| `latitude` | number | Required. Range: `-90` to `90`. |
| `longitude` | number | Required. Range: `-180` to `180`. |
| `accuracy` | number | Optional. Accuracy in metres (positive number). |
| `altitude` | number | Optional. Altitude in metres. |
| `speed` | number | Optional. Speed in m/s (≥ 0). |
| `projectId` | string | Optional. Associates the ping with an active mission. |
| `isStreaming` | boolean | Defaults to `true`. Set to `false` to signal the user has stopped sharing. |

**Success Response** `200`

```json
{
  "data": {
    "locationId": "clxyzabc",
    "status": "Lokasi Sedang Dikongsi",
    "latitude": 3.1685,
    "longitude": 101.7005,
    "timestamp": "2026-05-12T05:30:00.000Z"
  }
}
```

`status` values:
- `"Lokasi Sedang Dikongsi"` — `isStreaming: true`
- `"Lokasi Tidak Aktif"` — `isStreaming: false`

**React Native implementation example:**

```ts
import * as Location from 'expo-location';

let locationInterval: ReturnType<typeof setInterval> | null = null;

export function startGpsTracking(projectId: string) {
  locationInterval = setInterval(async () => {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    await api.post('/api/v1/location/update', {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      altitude: loc.coords.altitude,
      speed: loc.coords.speed,
      projectId,
      isStreaming: true,
    });
  }, 15000); // every 15 seconds
}

export async function stopGpsTracking(projectId: string) {
  if (locationInterval) clearInterval(locationInterval);
  // Send a final "stopped" ping
  const loc = await Location.getCurrentPositionAsync({});
  await api.post('/api/v1/location/update', {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    projectId,
    isStreaming: false,
  });
}
```

---

### `GET /api/v1/location/history`

Get own location history. Requires JWT.

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `projectId` | string | Optional. Filter by project. |
| `limit` | number | Optional. Number of records. Default: `50`. |

**Example**: `GET /api/v1/location/history?projectId=clxyz456&limit=20`

---

### `GET /api/v1/location/project/:projectId/streamers`

Get all users currently streaming GPS for a project (active within last 5 minutes). **Admin only**.

**Headers**: `Authorization: Bearer <token>` _(ADMIN role)_

**Success Response** `200`

```json
{
  "data": {
    "streamers": [
      {
        "id": "loc123",
        "userId": "clxyz123",
        "latitude": 3.1685,
        "longitude": 101.7005,
        "timestamp": "2026-05-12T05:29:50.000Z",
        "user": {
          "id": "clxyz123",
          "name": "Ahmad Zulkifli",
          "avatarUrl": null
        }
      }
    ],
    "count": 1
  }
}
```

---

## 6. Attendance & Certificates

Certificate PDF files are served as static files. When `certificateStatus` is `GENERATED`, the certificate URL will be:

```
GET http://<BASE_URL>/certificates/cert_<attendanceId>.pdf
```

To display it in RN, use `react-native-pdf` or open with `Linking.openURL(...)`.

```ts
import { Linking } from 'react-native';

const openCertificate = (certificateUrl: string) => {
  const fullUrl = `${process.env.API_BASE_URL}${certificateUrl}`;
  Linking.openURL(fullUrl);
};
```

---

## 7. Socket.io — Real-time GPS

The server exposes a Socket.io v4 server on the **same port** as the HTTP API (`3000`).

### Install

```bash
npm install socket.io-client
```

### Connect

```ts
import { io, Socket } from 'socket.io-client';

let socket: Socket;

export function connectSocket(token: string) {
  socket = io(process.env.SOCKET_URL!, {
    auth: { token },         // optional, for future auth on socket
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
}
```

### Joining Rooms

```ts
// For Admin Portal — receive ALL location updates
socket.emit('join-admin');

// For a specific project's GPS room — receive location updates for one mission
socket.emit('join-project', 'clxyz456');

// Leave a project room
socket.emit('leave-project', 'clxyz456');
```

### Listening for Location Updates

```ts
socket.on('locationUpdate', (payload) => {
  console.log(payload);
  /**
   * {
   *   locationId: "clxyzabc",
   *   userId: "clxyz123",
   *   projectId: "clxyz456",
   *   latitude: 3.1685,
   *   longitude: 101.7005,
   *   accuracy: 5.2,
   *   altitude: 45.0,
   *   speed: 1.3,
   *   isStreaming: true,
   *   timestamp: "2026-05-12T05:30:00.000Z"
   * }
   */
});

// Confirmation that you joined a room
socket.on('joined', (payload) => {
  console.log('[Socket] Joined room:', payload.room);
});
```

---

## 8. Error Handling

### HTTP Status Codes

| Code | Meaning | When it happens |
|---|---|---|
| `200` | OK | Successful GET/PATCH/POST |
| `201` | Created | Resource created (register, join mission) |
| `400` | Bad Request | Business logic failure (mission closed, etc.) |
| `401` | Unauthorized | Missing, invalid, or expired JWT |
| `403` | Forbidden | Valid token but insufficient role |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate (already joined, already paid) |
| `422` | Validation Error | Zod validation failed — check `details` |
| `429` | Too Many Requests | Rate limit hit (200 req/min) |
| `500` | Internal Server Error | Unexpected server error |

### Recommended Global Error Handler

```ts
// In your axios instance
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message ?? 'Something went wrong';
    const details = error.response?.data?.details;

    if (status === 401) {
      // Token expired → clear storage and redirect to login
      await AsyncStorage.removeItem('token');
      // navigate to Login screen
    }

    if (status === 422 && details) {
      // Field-level validation errors
      // details = { email: ['Invalid email'], password: ['Too short'] }
      console.error('Validation errors:', details);
    }

    return Promise.reject({ status, message, details });
  }
);
```

---

## 9. Role-Based Access Control

| Endpoint | Public | VOLUNTEER | MEMBER | ADMIN |
|---|---|---|---|---|
| `POST /auth/register` | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/login` | ✅ | ✅ | ✅ | ✅ |
| `GET /auth/me` | ❌ | ✅ | ✅ | ✅ |
| `POST /auth/pay-membership` | ❌ | ❌ | ✅ | ❌ |
| `GET /api/v1/missions` | ❌ | ✅ | ✅ | ✅ |
| `GET /api/v1/missions/:id` | ❌ | ✅ | ✅ | ✅ |
| `POST /api/v1/missions/join` | ❌ | ✅ | ✅ | ❌ |
| `POST /api/v1/missions/verify-attendance` | ❌ | ❌ | ✅ | ✅ |
| `POST /api/v1/location/update` | ❌ | ✅ | ✅ | ❌ |
| `GET /api/v1/location/history` | ❌ | ✅ | ✅ | ✅ |
| `GET /api/v1/location/project/:id/streamers` | ❌ | ❌ | ❌ | ✅ |
| Socket `join-admin` | — | — | — | ✅ |
| Socket `join-project` | — | ✅ | ✅ | ✅ |

---

## 10. Recommended RN Libraries

| Purpose | Library |
|---|---|
| HTTP Client | `axios` |
| Token Storage | `@react-native-async-storage/async-storage` |
| Socket.io | `socket.io-client` |
| GPS / Location | `expo-location` or `react-native-geolocation-service` |
| PDF Viewer | `react-native-pdf` |
| Maps (GPS display) | `react-native-maps` |
| Env Variables | `react-native-config` or Expo `process.env` |
| Navigation | `@react-navigation/native` |

---

## Health Check

```
GET /health
```

```json
{
  "status": "ok",
  "service": "haiwan-kita-api",
  "timestamp": "2026-05-12T05:00:00.000Z",
  "uptime": 3600.25
}
```

Use this to verify the server is reachable before showing the app's main screen.
