import User from '../models/User.js';

export const getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('wishlist');
    res.status(200).json(user.wishlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addToWishlist = async (req, res) => {
  try {
    const { itemId } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.wishlist.includes(itemId)) {
      user.wishlist.push(itemId);
      await user.save();
    }
    res.status(200).json({ message: 'Item added to wishlist' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const removeFromWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(req.user.id);
    user.wishlist = user.wishlist.filter((item) => item.toString() !== id);
    await user.save();
    res.status(200).json({ message: 'Item removed from wishlist' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
