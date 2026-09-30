const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../../IOTEL-WEBSITE-frontend/scripts/serveFrontend');
const { isFutureSlot } = require('../utils/schedule');
const { rateLimit } = require('../middleware/security');

test('static server rejects private files and malformed paths without crashing', async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const request = (path, method = 'GET') => new Promise((resolve, reject) => {
        http.request({ host: '127.0.0.1', port: server.address().port, path, method }, res => {
            let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }).on('error', reject).end();
    });
    try {
        for (const url of ['/package.json', '/functions/index.js', '/.env', '/static/.env', '/scripts/serveFrontend.js']) assert.equal((await request(url)).status, 403, url);
        for (const url of ['/%ZZ', '/%E0%A4', '/static/%5c..%5c.env', '/%00']) assert.equal((await request(url)).status, 400, url);
        assert.equal((await request('/login.html', 'POST')).status, 405);
        const page = await request('/login.html');
        assert.equal(page.status, 200); assert.match(page.body, /<html/i);
        assert.equal(page.headers['x-content-type-options'], 'nosniff');
        assert.equal((await request('/login.html', 'HEAD')).body, '');
        assert.equal((await request('/static/js/api.js')).status, 200);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('schedules reject impossible dates, invalid times and past Philippine slots', () => {
    const now = Date.parse('2028-02-28T00:00:00Z');
    assert.equal(isFutureSlot('2028-02-29', '09:00', now), true);
    for (const [date, time] of [['2027-02-29','09:00'], ['2028-02-30','09:00'], ['2028-13-01','09:00'], ['2028-03-01','24:00'], ['2028-03-01','12:60'], ['2028-02-28','07:59']]) assert.equal(isFutureSlot(date, time, now), false);
});

test('rate limiting isolates clients and rejects excess requests', () => {
    const limiter = rateLimit({ limit: 2, windowMs: 60000 });
    let calls = 0;
    const response = { set() { return this; }, status(code) { this.code = code; return this; }, json() { return this; } };
    for (let i = 0; i < 3; i++) limiter({ ip: 'one' }, response, () => calls++);
    assert.equal(calls, 2); assert.equal(response.code, 429);
    limiter({ ip: 'two' }, response, () => calls++); assert.equal(calls, 3);
});
