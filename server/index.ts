import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const app = createApp(isProduction);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Mode: ${isProduction ? 'production' : 'development'}`);
  if (!isProduction) {
    console.log('Frontend dev server should be running on http://localhost:5173');
  }
});
