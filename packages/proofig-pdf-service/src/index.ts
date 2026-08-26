import { createService } from './service.js';

const service = createService();

const port = process.env.PORT || 8080;
service.listen(port, () => {
  console.info(`proofig-pdf-service: listening on port ${port}`);
});
