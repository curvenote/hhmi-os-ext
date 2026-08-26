# Expected Workflow and Notification sequencing

Once a **Deleted** notify has been stored on the check run (`serviceData.deleted` / summary state), the notify webhook returns **200** and does not apply further payloads for that run id (no message row, no state changes).

The following represents the expected state transitions and notification sequencing that we should receive from Proofig.

:::{mermaid}
flowchart TD
Submit([submit])
Submit --> ProcessingSI([Processing - subimage])
ProcessingSI --> AwaitSub([Awaiting: SubImage Approval])
AwaitSub --> ProcessingAI([Processing - detection])
ProcessingAI --> AwaitReview([Awaiting: Review])
ProcessingAI --> ReportClean
ReportClean --> ReportFlagged
ReportClean --> Deleted([Deleted])
ReportFlagged --> ReportClean
AwaitReview --> ReportClean
AwaitReview --> ReportFlagged
ReportFlagged --> Deleted
:::
