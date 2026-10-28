# Housework Scheduler front end

Angular 22 app (standalone components, zoneless, SCSS, Vitest). See the [root README](../README.md) for prerequisites, running it locally, tests, and deployment.

- `src/app/home/`: home page, showing the backend's status
- `src/app/health/`: `HealthService`, which calls the backend's `/actuator/health`
- `src/environments/`: the backend URL for development (`environment.development.ts`) and production (`environment.ts`)
