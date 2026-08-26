/**
 * Shown when a Proofig report has been deleted (e.g. via notify webhook with state "Deleted").
 * Single source of truth for the copy so it can be updated in one place.
 */
export function ReportNoLongerAvailable() {
  return (
    <p className="text-sm text-muted-foreground">The report is no longer available on Proofig</p>
  );
}
