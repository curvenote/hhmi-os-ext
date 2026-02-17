import { createService } from './service.js';

const service = createService();

const port = process.env.PORT || 8080;
service.listen(port, () => {
  console.info(`pmc-ftp-server: listening on port ${port}`);
});
