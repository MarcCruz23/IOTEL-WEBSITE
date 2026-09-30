// Limits are per process. Use a shared store when deploying multiple backend instances.
function rateLimit({ limit, windowMs }) {
    const clients = new Map();
    return (req, res, next) => {
        const now = Date.now();
        for (const [key, value] of clients) if (value.reset <= now) clients.delete(key);
        const key = req.ip || req.socket?.remoteAddress || 'unknown';
        const value = clients.get(key) || { count: 0, reset: now + windowMs };
        value.count++;
        clients.set(key, value);
        if (value.count > limit) {
            res.set('Retry-After', String(Math.ceil((value.reset - now) / 1000)));
            return res.status(429).json({ success: false, message: 'Too many requests. Please try again shortly.' });
        }
        next();
    };
}
function securityHeaders(req, res, next) {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    next();
}
module.exports = { rateLimit, securityHeaders };
