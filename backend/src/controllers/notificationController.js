const User = require('../models/User');
const fcmService = require('../services/fcmService');

/**
 * POST /api/notifications/send-push (internal: called by web backend to send FCM to mobile app)
 * Body: { fcmToken?: string, userId?: string, staffId?: string, title: string, body: string, data?: object }
 * If fcmToken provided, send to that token. If userId/staffId provided (and no fcmToken), look up User.fcmToken and send.
 * On invalid token, clears that token from User so the app can re-register on next open.
 */
const sendPush = async (req, res) => {
    try {
        const body = req.body || {};
        const title = body.title;
        const userId = body.userId || body.staffId;
        const hasFcmToken = !!(body.fcmToken && String(body.fcmToken).trim());
        console.log('[NOTIFICATION] RECEIVED send-push request: title=', title, 'userId=', userId || 'n/a', 'hasFcmToken=', hasFcmToken, 'dataKeys=', body.data ? Object.keys(body.data) : []);

        let fcmToken = body.fcmToken;
        const data = body.data || {};
        const bodyText = body.body;
        console.log('[notificationController] send-push received: title=', title, 'body=', (bodyText || '').substring(0, 60), 'data.type=', data?.type, 'userId=', userId || 'n/a', 'hasFcmToken=', !!fcmToken);

        if (!title || typeof title !== 'string') {
            console.log('[notificationController] send-push rejected: title required');
            return res.status(400).json({
                success: false,
                error: { message: 'title is required' },
            });
        }
        if (!fcmToken && userId) {
            const user = await User.findById(userId).select('fcmToken').lean();
            fcmToken = user?.fcmToken;
            console.log('[notificationController] send-push looked up token by userId:', userId, 'found=', !!fcmToken);
        }
        if (!fcmToken || typeof fcmToken !== 'string' || !fcmToken.trim()) {
            console.log('[NOTIFICATION] send-push skip: no FCM token (user may not have app open or token not registered)');
            return res.json({ success: true, message: 'No FCM token, skip' });
        }

        const tokenPreview = fcmToken.length > 20 ? fcmToken.substring(0, 10) + '...' + fcmToken.slice(-8) : fcmToken;
        console.log('[NOTIFICATION] send-push calling FCM: token=', tokenPreview, 'title=', title);
        const result = await fcmService.sendToToken(fcmToken.trim(), {
            title,
            body: bodyText || '',
            data: typeof data === 'object' ? data : {},
        });
        if (!result.success) {
            console.error('[NOTIFICATION] send-push FCM failed:', result.error);
            if (result.invalidToken) {
                if (userId) {
                    await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
                    console.log('[NOTIFICATION] send-push: cleared invalid fcmToken for userId=', userId);
                } else {
                    const r = await User.updateMany(
                        { fcmToken: fcmToken.trim() },
                        { $unset: { fcmToken: 1 } }
                    );
                    if (r.modifiedCount > 0) {
                        console.log('[NOTIFICATION] send-push: cleared invalid fcmToken from', r.modifiedCount, 'User doc(s)');
                    }
                }
            }
            return res.status(500).json({ success: false, error: { message: result.error || 'FCM send failed' } });
        }
        console.log('[NOTIFICATION] send-push success: FCM accepted message, title=', title);
        return res.json({ success: true, message: 'Push sent' });
    } catch (error) {
        console.error('[notificationController] sendPush:', error);
        return res.status(500).json({
            success: false,
            error: { message: error.message },
        });
    }
};

/**
 * POST /api/notifications/fcm-token (protected: requires Bearer token)
 * Body: { fcmToken: string } to register, or { fcmToken: "" } / {} to clear on logout
 * Uses the logged-in user id from auth (req.user._id). Register: store token for push. Clear: remove token so we stop sending to that device until they log in again.
 */
const registerFcmToken = async (req, res) => {
    try {
        const userId = req.user?._id;
        const fcmTokenRaw = req.body?.fcmToken;
        const hasToken = fcmTokenRaw !== undefined && fcmTokenRaw !== null && typeof fcmTokenRaw === 'string' && fcmTokenRaw.trim().length > 0;
        // Log as soon as request is received (for debugging "notification not receiving")
        console.log('[NOTIFICATION] RECEIVED fcm-token request: userId=', userId ? String(userId) : 'null', 'hasFcmToken=', hasToken, 'tokenLength=', typeof fcmTokenRaw === 'string' ? fcmTokenRaw.length : 0);

        console.log('[FCM] fcm-token POST: userId=', userId ? String(userId) : 'null', 'req.user=', !!req.user);
        if (!userId) {
            console.log('[FCM] fcm-token: 401 – no userId');
            return res.status(401).json({ success: false, error: { message: 'Not authorized' } });
        }
        const fcmToken = req.body?.fcmToken;
        const userIdStr = userId.toString();

        if (fcmToken === undefined || fcmToken === null || (typeof fcmToken === 'string' && fcmToken.trim() === '')) {
            const before = await User.findById(userId).select('fcmToken').lean();
            const hadToken = before && before.fcmToken && String(before.fcmToken).trim().length > 0;
            await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
            console.log('[FCM] Logout: cleared fcmToken for userId=', userIdStr, 'hadToken=', hadToken, '– device will not receive push until they log in again');
            return res.json({ success: true, message: 'FCM token cleared' });
        }

        if (typeof fcmToken !== 'string') {
            return res.status(400).json({
                success: false,
                error: { message: 'fcmToken must be a string' },
            });
        }

        const tokenTrimmed = fcmToken.trim();
        if (!tokenTrimmed) {
            await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
            console.log('[FCM] Logout: cleared fcmToken for userId=', userIdStr, '(empty string)');
            return res.json({ success: true, message: 'FCM token cleared' });
        }

        // Ensure this token is only stored for THIS user: remove it from any other user document
        await User.updateMany(
            { fcmToken: tokenTrimmed, _id: { $ne: userId } },
            { $unset: { fcmToken: 1 } }
        );
        await User.findByIdAndUpdate(userId, { $set: { fcmToken: tokenTrimmed } });
        const tokenPreview = tokenTrimmed.length > 20 ? tokenTrimmed.substring(0, 10) + '...' + tokenTrimmed.slice(-6) : tokenTrimmed;
        console.log('[FCM] fcm-token: Registered OK userId=', userIdStr, 'tokenLength=', tokenTrimmed.length, 'tokenPreview=', tokenPreview);
        return res.json({ success: true, message: 'FCM token registered' });
    } catch (error) {
        console.error('[notificationController] registerFcmToken:', error);
        return res.status(500).json({
            success: false,
            error: { message: error.message },
        });
    }
};

module.exports = {
    registerFcmToken,
    sendPush,
};
