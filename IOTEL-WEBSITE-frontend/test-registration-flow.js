#!/usr/bin/env node

/**
 * Test Registration Flow - Verify complete user flow
 * Tests: Register → Success Message → Redirect to Login → Manual Login
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:9010';
let testResults = [];

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, fn) {
  try {
    console.log(`\n✓ Testing: ${name}`);
    await fn();
    testResults.push({ name, status: '✅ PASS' });
  } catch (err) {
    console.error(`✗ Failed: ${name}`, err.message);
    testResults.push({ name, status: '❌ FAIL', error: err.message });
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  REGISTRATION FLOW TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: Verify register.html loads
  await test('Register page loads', async () => {
    const res = await makeRequest('GET', '/register.html');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.includes('registerForm')) throw new Error('registerForm not found');
    if (!res.body.includes('Account created successfully! Redirecting to login...'.split('!')[0])) {
      // Check for form fields
      if (!res.body.includes('regName')) throw new Error('regName field not found');
    }
  });

  // Test 2: Verify register.js loads
  await test('Register JS loads correctly', async () => {
    const res = await makeRequest('GET', '/static/js/register.js');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.includes("location.href='/'")) {
      throw new Error('Redirect to login not found in register.js');
    }
    if (res.body.includes('admin/dashboard.html')) {
      throw new Error('Old role-based redirect still present!');
    }
  });

  // Test 3: Verify login page loads
  await test('Login page loads', async () => {
    const res = await makeRequest('GET', '/');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.includes('Don\'t have an account?') && !res.body.includes("Don't have an account?")) {
      throw new Error('Register CTA not found on login page');
    }
  });

  // Test 4: Verify register link in login page
  await test('Login page has register link', async () => {
    const res = await makeRequest('GET', '/');
    if (!res.body.includes('register.html')) {
      throw new Error('register.html link not found in login page');
    }
  });

  // Test 5: Verify site.js loads
  await test('Site JS loads', async () => {
    const res = await makeRequest('GET', '/static/js/site.js');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.includes('login')) throw new Error('Login logic not found');
  });

  // Test 6: Verify mock-data loads (for demo accounts)
  await test('Mock data loads', async () => {
    const res = await makeRequest('GET', '/static/js/mock-data.js');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.includes('customer') && !res.body.includes('MOCK')) {
      throw new Error('Demo accounts not found');
    }
  });

  // Test 7: Verify CSS files load
  await test('Login CSS loads', async () => {
    const res = await makeRequest('GET', '/static/css/login.css');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  await test('Register CSS loads', async () => {
    const res = await makeRequest('GET', '/static/css/register.css');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  // Test 8: Verify catalog, staff, and admin dashboards load (destination pages)
  await test('Customer portal (catalog) loads', async () => {
    const res = await makeRequest('GET', '/catalog.html');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  await test('Staff dashboard loads', async () => {
    const res = await makeRequest('GET', '/staff/dashboard.html');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  await test('Admin dashboard loads', async () => {
    const res = await makeRequest('GET', '/admin/dashboard.html');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  testResults.forEach(({ name, status, error }) => {
    console.log(`${status} ${name}`);
    if (error) console.log(`   Error: ${error}`);
  });

  const passed = testResults.filter(r => r.status.includes('✅')).length;
  const failed = testResults.filter(r => r.status.includes('❌')).length;

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY: ${passed} passed, ${failed} failed out of ${testResults.length} tests`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (failed === 0) {
    console.log('🎉 All static tests passed! Registration flow is ready.');
    console.log('\nNEXT STEPS - Manual browser testing:');
    console.log('1. Go to http://localhost:9010/');
    console.log('2. Click "Don\'t have an account? Create an Account"');
    console.log('3. Fill in registration form with test user data');
    console.log('4. Click "Register Account"');
    console.log('5. Verify success message: "Account created successfully! Redirecting to login..."');
    console.log('6. Verify redirect to login page (/) after 1.5 seconds');
    console.log('7. Manually log in with your new credentials');
    console.log('8. Verify redirect to correct role portal\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
