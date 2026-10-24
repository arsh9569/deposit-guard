# Permissions

Authorization is deny-by-default and scoped to institution membership. The backend must derive the actor's roles and permitted institutions from trusted server-side identity/membership records. A supplied institution ID is a target selector, never proof of access. The proposed capability matrix and unresolved role decisions are in the [architecture blueprint](../../outputs/depositguard-architecture.md#7-role-permission-matrix).

Critical review and release/refund actions require explicit capability checks, state-transition guards and audit events. Self-approval policy and official delegation rules require stakeholder approval before production implementation.
