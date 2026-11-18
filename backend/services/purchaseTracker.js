import User from "../model/userModel.js";
import Product from "../model/productModel.js";

// Records purchased products (and category preferences) for a user. Called
// directly from the order flow once an order is confirmed, so no internal HTTP
// round trip is needed. Batched: one product query, one user write.
export const recordPurchase = async (userId, productIds) => {
  const ids = [...new Set((productIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return;

  const [user, products] = await Promise.all([
    User.findById(userId),
    Product.find({ _id: { $in: ids } }).select("category subCategory").lean(),
  ]);
  if (!user) return;

  const already = new Set(user.purchasedProducts.map((p) => p.productId.toString()));
  if (!user.preferences) user.preferences = { favoriteCategories: [], favoriteSubCategories: [] };

  for (const product of products) {
    if (!already.has(product._id.toString())) {
      user.purchasedProducts.push({ productId: product._id, purchasedAt: Date.now() });
    }
    if (!user.preferences.favoriteCategories.includes(product.category)) {
      user.preferences.favoriteCategories.push(product.category);
    }
    if (!user.preferences.favoriteSubCategories.includes(product.subCategory)) {
      user.preferences.favoriteSubCategories.push(product.subCategory);
    }
  }

  await user.save();
};
