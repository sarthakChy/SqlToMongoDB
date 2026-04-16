import "dotenv/config";

import { createApp } from "./app";

const app = createApp();
const port = Number(process.env.PORT ?? 5000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
