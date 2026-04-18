require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Staff = require('../src/models/Staff');

async function run() {
  const email = 'test@gmail.com';
  const password = 'test123';
  const emailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

  await mongoose.connect(process.env.MONGODB_URI);

  let user = await User.findOne({ email: emailRegex }).select('+password');
  if (!user) {
    user = new User({
      name: 'Test User',
      email: email.toLowerCase(),
      password,
      role: 'Employee',
      isActive: true,
    });
  } else {
    user.name = user.name || 'Test User';
    user.email = email.toLowerCase();
    user.password = password;
    user.role = user.role || 'Employee';
    user.isActive = true;
  }

  await user.save();

  const staff = await Staff.findOne({ email: emailRegex }).select('_id userId status email');
  if (staff) {
    if (!staff.userId || String(staff.userId) !== String(user._id)) {
      staff.userId = user._id;
      await staff.save();
    }
    console.log(`Seeded user and linked staff: ${staff.email} (${staff._id})`);
  } else {
    console.log('Seeded user in users collection.');
    console.log('Warning: no staff found for test@gmail.com. Login API may fail until staff profile exists.');
  }

  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

run()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
