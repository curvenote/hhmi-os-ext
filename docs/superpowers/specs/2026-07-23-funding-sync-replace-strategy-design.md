# Funding Sync Replace Strategy

## Goal

Allow a PMC administrator to choose whether a funding-identifier sync merges Airtable scientists into stored data or replaces all stored scientists with the current Airtable result.

## User Interface

The stats action area will contain an unchecked checkbox labelled **Replace all existing data** above the **Sync Funding Identifiers** button. The button may move down to accommodate the control. Checking the option will not show a confirmation dialog.

## Data Flow

The form submits an explicit `syncStrategy` value of `merge` or `replace`. The route action validates that value and includes it in the `HHMI_GRANTS_SYNC` job payload. The job handler defaults an absent strategy to `merge` so already-queued or older payloads remain compatible.

The handler passes the resolved strategy to `updateHHMIScientists()` and writes the same value to job results. Existing UI job cards therefore continue to report the strategy actually used.

## Behavior

- `merge` remains the default and preserves stored scientists absent from the latest Airtable response.
- `replace` stores exactly the valid scientists returned by the current Airtable sync, removing previously stored scientists that are no longer returned by the configured view.
- Existing validation and skipped-record behavior is unchanged.

## Error Handling

Unknown strategy values are rejected by the route action and never queued. If the checkbox is absent, the route submits `merge`.

## Testing

Tests will cover route/form strategy resolution, backward-compatible job payload defaults, and forwarding both `merge` and `replace` to persistence and job results.
