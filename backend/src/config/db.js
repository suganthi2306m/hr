const mongoose = require('mongoose');

/** Empty string on ObjectId paths breaks Mongoose hydration (CastError on find). */
async function sanitizeUsersInvalidRefStrings() {
    const coll = mongoose.connection.collection('users');
    const oidFields = ['branchId', 'companyId', 'roleId'];
    for (const field of oidFields) {
        const res = await coll.updateMany({ [field]: '' }, { $unset: { [field]: '' } });
        if (res.modifiedCount > 0) {
            console.log(
                `[DB sanitize] Removed empty-string ${field} from ${res.modifiedCount} user document(s)`,
            );
        }
    }
}

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        await sanitizeUsersInvalidRefStrings();
    } catch (error) {
        console.error(`Database Connection Error: ${error.message}`);
        throw error;
    }
};

module.exports = connectDB;