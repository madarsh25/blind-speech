import "dotenv/config";
import { app } from "./app.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

app.listen(PORT, () => {
  console.log(`[blind-speech-server] API running on http://localhost:${PORT}`);
  console.log(`[blind-speech-server] Environment: ${process.env.NODE_ENV || "development"}`);
});
