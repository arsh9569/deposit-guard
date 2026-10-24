# API

Base path: `/api`. The initial API exposes `GET /health`, returning `200` only when the API's MongoDB connection is ready and `503` otherwise. It discloses only service and connection state.

Planned versioned API and authorization conventions are documented in the [architecture blueprint](../../outputs/depositguard-architecture.md#6-api-endpoint-specifications). All request bodies will be validated with Zod. Authenticated identity, role, institution scope and workflow transitions must be derived or enforced server-side, never trusted from client-submitted fields.
