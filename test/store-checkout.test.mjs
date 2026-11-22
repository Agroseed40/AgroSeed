import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  closeCustomerTestOrder,
  createCustomerTestOrder,
  verifyCustomerTestPayment
} from "../backend/store.mjs";

const keyId = "rzp_test_unit_key";
const keySecret = "unit-test-secret-do-not-use-for-payments";
const customer = { id: "customer-1", email: "buyer@example.test", name: "Buyer" };
const address = {
  id: "address-1", name: "Buyer", phone: "9876543210", line1: "1 Test Road",
  city: "Bhopal", state: "Madhya Pradesh", pincode: "462001"
};

function storeState(pricePaise = 1000) {
  return {
    products: [{
      id: 1, status: "published", name: "Tomato Seeds", nameEn: "Tomato Seeds",
      brand: "AgroSeed", brandEn: "AgroSeed", category: "Seeds", categoryEn: "Seeds",
      variants: [{ sku: "TOM-10G", pack: "10 g", pricePaise, mrpPaise: pricePaise, stock: 5, reserved: 0, active: true }]
    }],
    coupons: [], serviceAreas: [], audit: [], inventoryTransactions: [], supportRequests: [],
    paymentAttempts: [], orders: [], settings: { storeName: "AgroSeed", currency: "INR" }
  };
}

class MemoryD1 {
  constructor(data) { this.revision = 0; this.payload = JSON.stringify(data); }
  snapshot() { return JSON.parse(this.payload); }
  prepare(sql) {
    if (sql.startsWith("SELECT revision, payload")) {
      return { first: async () => ({ revision: this.revision, payload: this.payload }) };
    }
    return { bind: (...values) => ({
      run: async () => {
        if (this.revision !== values[1]) return { meta: { changes: 0 } };
        this.payload = values[0];
        this.revision += 1;
        return { meta: { changes: 1 } };
      }
    }) };
  }
}

function setup(pricePaise = 1000) {
  const DB = new MemoryD1(storeState(pricePaise));
  return { DB, env: { DB, RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret }, input: { items: [{ sku: "TOM-10G", quantity: 2 }], address, idempotencyKey: "123e4567-e89b-12d3-a456-426614174000" } };
}

async function withMockGateway(mock, callback) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await callback(); } finally { globalThis.fetch = previous; }
}

function gatewayOrder(amount = 2000) {
  return Response.json({ id: "order_test123", amount, currency: "INR" });
}

function signedPayment(orderId = "order_test123", paymentId = "pay_test123") {
  const signature = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature };
}

test("test checkout reserves stock and verification is idempotent", async () => {
  const { DB, env, input } = setup();
  const result = await withMockGateway(async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.amount, 2000);
    assert.equal(request.currency, "INR");
    assert.match(request.receipt, /^test_[a-f0-9]{24}$/);
    return gatewayOrder(request.amount);
  }, () => createCustomerTestOrder(env, customer, input));

  assert.equal(result.order_id, "order_test123");
  assert.equal(result.key_id, keyId);
  assert.equal("key_secret" in result, false);
  assert.equal(DB.snapshot().products[0].variants[0].stock, 3);
  assert.equal(DB.snapshot().products[0].variants[0].reserved, 2);

  const payment = signedPayment();
  const verified = await verifyCustomerTestPayment(env, customer.id, payment);
  const replay = await verifyCustomerTestPayment(env, customer.id, payment);
  assert.equal(verified.success, true);
  assert.equal(replay.order_status, "paid");
  assert.equal(DB.snapshot().orders[0].status, "paid");
  assert.equal(DB.snapshot().audit.filter(row => row.action === "test_payment_verified").length, 1);
});

test("repeated checkout submissions reuse one pending test order", async () => {
  const { DB, env, input } = setup();
  let gatewayCalls = 0;
  const first = await withMockGateway(async () => { gatewayCalls += 1; return gatewayOrder(); }, () => createCustomerTestOrder(env, customer, input));
  const retry = await withMockGateway(async () => { gatewayCalls += 1; return gatewayOrder(); }, () => createCustomerTestOrder(env, customer, input));
  assert.equal(retry.order_id, first.order_id);
  assert.equal(retry.order_number, first.order_number);
  assert.equal(gatewayCalls, 1);
  assert.equal(DB.snapshot().orders.length, 1);
  assert.equal(DB.snapshot().products[0].variants[0].stock, 3);

  const changedIntent = { ...input, address: { ...address, id: "address-2" } };
  await assert.rejects(createCustomerTestOrder(env, customer, changedIntent), error => error.statusCode === 409);
  const editedAddress = { ...input, address: { ...address, line1: "2 New Test Road" } };
  await assert.rejects(createCustomerTestOrder(env, customer, editedAddress), error => error.statusCode === 409);
  assert.equal(DB.snapshot().orders.length, 1);
});

test("production key IDs and sub-₹1 totals are rejected before contacting Razorpay", async () => {
  const live = setup();
  live.env.RAZORPAY_KEY_ID = "rzp_live_not_allowed";
  let calls = 0;
  await withMockGateway(async () => { calls += 1; return gatewayOrder(); }, async () => {
    await assert.rejects(createCustomerTestOrder(live.env, customer, live.input), error => error.statusCode === 503);
    const small = setup(49);
    await assert.rejects(createCustomerTestOrder(small.env, customer, small.input), error => error.statusCode === 400);
  });
  assert.equal(calls, 0);
});

test("bad signatures and another customer's payment cannot mark an order paid", async () => {
  const { DB, env, input } = setup();
  await withMockGateway(async () => gatewayOrder(), () => createCustomerTestOrder(env, customer, input));
  const payment = signedPayment();
  await assert.rejects(
    verifyCustomerTestPayment(env, customer.id, { ...payment, razorpay_signature: "0".repeat(64) }),
    error => error.statusCode === 400
  );
  await assert.rejects(verifyCustomerTestPayment(env, "customer-2", payment), error => error.statusCode === 404);
  assert.equal(DB.snapshot().orders[0].status, "pending_payment");
});

test("cancelling checkout releases inventory and closes its payment attempt", async () => {
  const { DB, env, input } = setup();
  await withMockGateway(async () => gatewayOrder(), () => createCustomerTestOrder(env, customer, input));
  const closed = await closeCustomerTestOrder(env, customer.id, "order_test123", "cancelled");
  assert.equal(closed.order_status, "cancelled");
  assert.equal(DB.snapshot().products[0].variants[0].stock, 5);
  assert.equal(DB.snapshot().products[0].variants[0].reserved, 0);
  assert.equal(DB.snapshot().paymentAttempts[0].status, "cancelled");
  await assert.rejects(verifyCustomerTestPayment(env, customer.id, signedPayment()), error => error.statusCode === 409);
});

test("stock or price changes between quote and reservation do not create a local order", async () => {
  const { DB, env, input } = setup();
  await withMockGateway(async () => {
    const changed = DB.snapshot();
    changed.products[0].variants[0].pricePaise = 1500;
    DB.payload = JSON.stringify(changed);
    DB.revision += 1;
    return gatewayOrder(2000);
  }, async () => {
    await assert.rejects(createCustomerTestOrder(env, customer, input), error => error.statusCode === 409);
  });
  assert.equal(DB.snapshot().orders.length, 0);
  assert.equal(DB.snapshot().products[0].variants[0].stock, 5);
});
