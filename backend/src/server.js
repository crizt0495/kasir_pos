import app from './app.js';
import { env } from './config/env.js';

app.listen(env.PORT, () => {
  console.log(`✅ POS API berjalan di http://localhost:${env.PORT}`);
  console.log(`   Mode: ${env.NODE_ENV}`);
});
