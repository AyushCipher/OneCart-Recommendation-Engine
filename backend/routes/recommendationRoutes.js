import express from 'express';
import {
  getRecommendations,
  getRecommendationsByStrategy,
  trackProductView,
  trackProductPurchase,
  getUserPreferences
} from '../controller/recommendationController.js';
import isAuth from '../middleware/isAuth.js';
import { bindUserId } from '../middleware/bindUser.js';

const recommendationRoutes = express.Router();

/**
 * GET /recommendations?strategy=hybrid&limit=8
 * Get recommendations for the authenticated user
 * Strategies: hybrid (default), content, collaborative, popularity, category
 */
recommendationRoutes.post('/recommendations', isAuth, bindUserId, getRecommendations);

/**
 * GET /recommendations/:strategy?limit=8
 * Get recommendations by specific strategy
 */
recommendationRoutes.post('/recommendations/:strategy', isAuth, bindUserId, getRecommendationsByStrategy);

/**
 * POST /track-view
 * Track when a user views a product
 * Body: { userId, productId }
 */
recommendationRoutes.post('/track-view', isAuth, bindUserId, trackProductView);

/**
 * POST /track-purchase
 * Track when a user purchases products
 * Body: { userId, productIds: [...] }
 */
recommendationRoutes.post('/track-purchase', isAuth, bindUserId, trackProductPurchase);

/**
 * POST /user-preferences
 * Get user's preferences and viewing/purchasing history
 * Body: { userId }
 */
recommendationRoutes.post('/user-preferences', isAuth, bindUserId, getUserPreferences);

export default recommendationRoutes;
