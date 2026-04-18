# LiveTrack Web Backend

Node.js + Express + MongoDB backend with JWT auth and Socket.io realtime tracking.

## Setup

1. Copy `.env.example` to `.env`.
2. Start MongoDB.
3. Run:

```bash
npm install
npm run dev
```

## Folder Structure

- `src/models` - Mongoose models
- `src/controllers` - request handlers
- `src/routes` - API route mapping
- `src/services` - JWT/bootstrap/location business logic
- `src/sockets` - Socket.io server setup
- `src/middleware` - auth + role protection

## API Endpoints

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/auth/change-password`

### Company
- `GET /api/company`
- `POST /api/company`
- `PUT /api/company`

### Users
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`

### Customers
- `GET /api/customers`
- `POST /api/customers`
- `PUT /api/customers/:id`
- `DELETE /api/customers/:id`

### FieldTasks
- `GET /api/fieldtasks`
- `POST /api/fieldtasks`
- `PUT /api/fieldtasks/:id`
- `DELETE /api/fieldtasks/:id`

### Tracking
- `POST /api/tracking/ingest` (mobile app)
- `GET /api/tracking/latest`
- `GET /api/tracking/history/:userId`

## Socket Events

- Server emits `location:update` whenever mobile ingestion occurs.

## Scale Notes (10k users)

- Mongo indexes added for hot queries (`FieldTask`, `Customer`).
- Connection pooling enabled in Mongoose.
- Stateless JWT auth for horizontal scaling.
- Socket layer is compatible with external adapters (Redis) for multi-instance deployment.
- Rate limiting and payload caps enabled to reduce abuse spikes.
