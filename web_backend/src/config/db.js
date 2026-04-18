const mongoose = require('mongoose');

async function connectDb() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/livetrack_web';
  await mongoose.connect(uri, {
    maxPoolSize: 100,
    minPoolSize: 10,
  });
  console.log('MongoDB connected');
}

module.exports = connectDb;
