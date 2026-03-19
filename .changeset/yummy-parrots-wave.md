---
'@hhmi/pmc': patch
---

Updated email processor to not ignore emails if there are problems parsing messages from the body, a fallback will be used instead. Made the body parsing more general to allow for more variation in the expected greeting line.
