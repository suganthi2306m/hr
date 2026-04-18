# LiveTrack Web Admin

React + Vite + Tailwind admin dashboard for LiveTrack.

## Setup

1. Copy `.env.example` to `.env`.
2. Add your `VITE_GOOGLE_MAPS_API_KEY`.
3. Run:

```bash
npm install
npm run dev
```

## Modules

- Authentication with JWT token storage
- Company setup and editable settings
- Profile page
- Customers CRUD
- FieldTasks CRUD and assignment
- LiveTrack map (Google Maps + Socket.io realtime)

## Main Routes

- `/login`
- `/company-setup`
- `/dashboard/profile`
- `/dashboard/settings`
- `/dashboard/track/customers`
- `/dashboard/track/fieldtasks`
- `/dashboard/track/livetrack`
