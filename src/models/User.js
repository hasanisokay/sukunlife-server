import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  cart: [
    {
      itemId: { type: mongoose.Schema.Types.ObjectId, refPath: 'cart.type' },
      type: { type: String, enum: ['Course', 'Product'], required: true },
      quantity: { type: Number, default: 1 },
    },
  ],
});

const User = mongoose.model('User', userSchema);

export default User;
