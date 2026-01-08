// backend/src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // hashed password
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

/**
 * Document save hook
 * Use an async function WITHOUT calling next().
 * Throw on error so Mongoose catches the rejection.
 */
userSchema.pre('save', async function () {
  // only hash when password is new or modified
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

/**
 * Query hooks: findOneAndUpdate, updateOne, updateMany
 * 'this' is the query. Use getUpdate/setUpdate to mutate the update payload.
 * Use async function and throw on error.
 */
async function hashPasswordInUpdate() {
  const update = this.getUpdate();
  if (!update) return;

  // handle both { password: '...' } and { $set: { password: '...' } }
  if (update.password) {
    update.password = await bcrypt.hash(update.password, SALT_ROUNDS);
    this.setUpdate(update);
    return;
  }

  if (update.$set && update.$set.password) {
    update.$set.password = await bcrypt.hash(update.$set.password, SALT_ROUNDS);
    this.setUpdate(update);
    return;
  }
}

userSchema.pre('findOneAndUpdate', hashPasswordInUpdate);
userSchema.pre('updateOne', hashPasswordInUpdate);
userSchema.pre('updateMany', hashPasswordInUpdate);

// Instance method to compare password
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
