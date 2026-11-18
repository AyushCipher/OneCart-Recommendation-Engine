import app from './app.js';
import connectDb from './config/db.js';

const port = process.env.PORT || 8000;

// Start server and connect database
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  connectDb();
});
