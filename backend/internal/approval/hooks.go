package approval

import "context"

// DocumentFinalizer is called after an approval instance is fully decided
// (approved or rejected). docStatus is "approved" or "rejected".
// Implementations update the related document's status accordingly.
// Returning an error is logged but does NOT roll back the decision.
type DocumentFinalizer func(ctx context.Context, tenantID, docType, docID, docStatus, actorID string) error

// NoopFinalizer is a safe default when no hook is registered.
func NoopFinalizer(ctx context.Context, tenantID, docType, docID, docStatus, actorID string) error {
	return nil
}
