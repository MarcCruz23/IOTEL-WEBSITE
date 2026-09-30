// Read-only local smoke checks. Start both servers first.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const frontend = process.env.TEST_FRONTEND_URL || 'http://localhost:9010';
const backend = process.env.TEST_API_URL || 'http://localhost:5000/api';
const root = path.resolve(__dirname, '../../IOTEL-WEBSITE-frontend');
async function main() {
    let count = 0;
    const pages = [];
    for (const directory of ['', 'admin', 'staff']) {
        for (const file of fs.readdirSync(path.join(root, directory))) if (file.endsWith('.html')) pages.push('/' + [directory, file].filter(Boolean).join('/'));
    }
    const assets = new Set();
    for (const page of pages) {
        const response = await fetch(frontend + page, { signal: AbortSignal.timeout(15000) });
        assert.equal(response.status, 200, page); count++;
        const html = await response.text();
        for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
            const value = match[1];
            if (/^(https?:|data:|mailto:|tel:|#|javascript:)/i.test(value)) continue;
            const url = new URL(value, frontend + page);
            if (url.origin === new URL(frontend).origin && /\.(css|js|png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname)) assets.add(url.href);
        }
    }
    const missing = [];
    for (const url of assets) {
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) }); count++;
        if (response.status !== 200) missing.push(`${new URL(url).pathname}: ${response.status}`);
    }
    assert.deepEqual(missing, [], 'Missing local page assets');
    for (const route of ['/health', '/products', '/services', '/services/schedules']) {
        const response = await fetch(backend + route, { signal: AbortSignal.timeout(30000) });
        assert.equal(response.status, 200, route); assert.equal((await response.json()).success, true); count++;
    }
    console.log(`PASS: ${count} smoke checks (${pages.length} HTML pages, ${assets.size} local assets, 4 public APIs).`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
