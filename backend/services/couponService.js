import Coupon from "../model/couponModel.js";
import AppError from "../utils/AppError.js";

// Recomputes the discount from the stored coupon rules rather than trusting
// a client-sent discount value, so checkout can't be tampered with client-side.
export const validateAndComputeDiscount = async ({ code, userId, amount }) => {
  const coupon = await Coupon.findOne({ code: code?.trim().toUpperCase() });

  if (!coupon) throw new AppError("Invalid coupon code", 400);
  if (!coupon.isActive) throw new AppError("This coupon is no longer active", 400);
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new AppError("This coupon has expired", 400);
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError("This coupon has reached its usage limit", 400);
  }
  if (userId && coupon.usedBy.some((id) => id.toString() === userId.toString())) {
    throw new AppError("You have already used this coupon", 400);
  }
  if (amount < coupon.minOrderAmount) {
    throw new AppError(`Minimum order amount for this coupon is ${coupon.minOrderAmount}`, 400);
  }

  let discount = coupon.discountType === "percentage"
    ? (amount * coupon.discountValue) / 100
    : coupon.discountValue;

  if (coupon.maxDiscountAmount != null) discount = Math.min(discount, coupon.maxDiscountAmount);
  discount = Math.min(discount, amount);
  discount = Math.round(discount * 100) / 100;

  return { coupon, discount };
};

// Atomic redeem: the validity checks live in the filter of a single
// findOneAndUpdate, so two concurrent requests can't both consume the last
// use or let the same user redeem twice. Returns the coupon, or null if it
// could not be redeemed.
export const redeemCoupon = async (couponId, userId) => {
  const now = new Date();
  return Coupon.findOneAndUpdate(
    {
      _id: couponId,
      isActive: true,
      usedBy: { $ne: userId },
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        {
          $expr: {
            $or: [
              { $eq: [{ $ifNull: ["$usageLimit", null] }, null] },
              { $lt: ["$usedCount", "$usageLimit"] }
            ]
          }
        }
      ]
    },
    { $inc: { usedCount: 1 }, $addToSet: { usedBy: userId } },
    { new: true }
  );
};
