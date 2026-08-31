import Stripe from 'stripe';
import {
  E2E_STRIPE_BASE_URL,
  E2E_STRIPE_PORT,
  E2E_STRIPE_WEBHOOK_SECRET,
  E2E_APP_ORIGIN,
  E2E_UA_APP_ORIGIN,
  E2E_UA_ORGANIZATION_ID,
} from './constants';

type FakeSession = {
  id: string;
  mode: 'payment';
  status: 'open' | 'complete';
  paymentStatus: 'unpaid' | 'paid' | 'no_payment_required';
  amountSubtotal: number;
  amountTotal: number;
  amountDiscount: number;
  currency: string;
  customer: string;
  paymentIntent: string | null;
  promotionCodeId: string | null;
  metadata: Record<string, string>;
  priceId: string;
  quantity: number;
  customerEmail: string;
  clientReferenceId: string;
  paymentIntentMetadata: Record<string, string>;
  idempotencyKey: string;
  allowPromotionCodes: boolean;
  requestFingerprint: string;
  successUrl: string;
  cancelUrl: string;
  url: string | null;
  amountRefunded: number;
  disputed: boolean;
  disputeStatuses: string[];
  lastCheckoutEventId: string | null;
};

const sessions = new Map<string, FakeSession>();
const sessionsByIdempotencyKey = new Map<string, FakeSession>();
let sessionSequence = 0;
let eventSequence = 0;
let activePaymentIntentRequests = 0;
let maxConcurrentPaymentIntentRequests = 0;

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

function sessionResponse(session: FakeSession) {
  return {
    id: session.id,
    object: 'checkout.session',
    mode: session.mode,
    status: session.status,
    payment_status: session.paymentStatus,
    amount_subtotal: session.amountSubtotal,
    amount_total: session.amountTotal,
    total_details: {
      amount_discount: session.amountDiscount,
      amount_shipping: 0,
      amount_tax: 0,
    },
    currency: session.currency,
    customer: session.customer,
    payment_intent: session.paymentIntent,
    discounts: session.promotionCodeId
      ? [{ coupon: null, promotion_code: session.promotionCodeId }]
      : [],
    metadata: session.metadata,
    url: session.url,
    success_url: session.successUrl,
    cancel_url: session.cancelUrl,
    line_items: {
      object: 'list',
      data: [
        {
          object: 'item',
          quantity: session.quantity,
          price: {
            id: session.priceId,
            object: 'price',
            currency: session.currency,
            unit_amount: session.amountSubtotal / session.quantity,
          },
        },
      ],
      has_more: false,
      url: `/v1/checkout/sessions/${session.id}/line_items`,
    },
  };
}

function paymentIntentResponse(session: FakeSession) {
  if (!session.paymentIntent) return null;
  return {
    id: session.paymentIntent,
    object: 'payment_intent',
    amount: session.amountTotal,
    currency: session.currency,
    status:
      session.paymentStatus === 'paid'
        ? 'succeeded'
        : 'requires_payment_method',
    latest_charge: {
      id: `ch_${session.id}`,
      object: 'charge',
      paid: session.paymentStatus === 'paid',
      amount: session.amountTotal,
      amount_refunded: session.amountRefunded,
      currency: session.currency,
      disputed: session.disputed,
      payment_intent: session.paymentIntent,
    },
  };
}

function disputeList(session: FakeSession) {
  return {
    object: 'list',
    data: session.disputeStatuses.map((status, index) => ({
      id: `dp_${session.id}_${index + 1}`,
      object: 'dispute',
      payment_intent: session.paymentIntent,
      status,
    })),
    has_more: false,
    url: '/v1/disputes',
  };
}

async function deliverWebhook(args: {
  type: string;
  object: Record<string, unknown>;
  eventId?: string;
  repeat?: number;
}) {
  const eventId = args.eventId ?? `evt_e2e_${++eventSequence}`;
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    api_version: '2025-12-15.clover',
    created: Math.floor(Date.now() / 1000),
    data: { object: args.object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: args.type,
  });
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: E2E_STRIPE_WEBHOOK_SECRET,
  });

  const responses = await Promise.all(
    Array.from({ length: args.repeat ?? 1 }, async () => {
      const response = await fetch(`${E2E_APP_ORIGIN}/api/stripe/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signature,
        },
        body: payload,
      });
      return { status: response.status, body: await response.text() };
    })
  );

  if (responses.some((response) => response.status !== 200)) {
    throw new Error(`Webhook delivery failed: ${JSON.stringify(responses)}`);
  }
  return { eventId, responses };
}

function checkoutHtml(session: FakeSession, error?: string) {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Fake Stripe Checkout</title></head>
  <body>
    <main>
      <h1>Test Stripe Checkout</h1>
      <p>One-time $50.00 payment</p>
      <form method="post" action="/checkout/${session.id}/pay">
        <label for="promotion-code">Promotion code</label>
        <input id="promotion-code" name="promotionCode" autocomplete="off">
        ${error ? `<p role="alert">${error}</p>` : ''}
        <button name="delivery" value="webhook" type="submit">Complete test payment</button>
        <button name="delivery" value="delayed" type="submit">Complete payment without webhook</button>
      </form>
      <a href="${session.cancelUrl}">Cancel payment</a>
    </main>
  </body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

function requiredSession(id: string) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Unknown fake Checkout Session: ${id}`);
  return session;
}

async function handler(request: Request) {
  const url = new URL(request.url);

  if (url.pathname === '/health') return new Response('ok');

  if (request.method === 'POST' && url.pathname === '/test/reset') {
    sessions.clear();
    sessionsByIdempotencyKey.clear();
    sessionSequence = 0;
    activePaymentIntentRequests = 0;
    maxConcurrentPaymentIntentRequests = 0;
    return json({ reset: true });
  }

  if (request.method === 'POST' && url.pathname === '/test/metrics/reset') {
    activePaymentIntentRequests = 0;
    maxConcurrentPaymentIntentRequests = 0;
    return json({ reset: true });
  }

  if (request.method === 'GET' && url.pathname === '/test/metrics') {
    return json({
      activePaymentIntentRequests,
      maxConcurrentPaymentIntentRequests,
    });
  }

  if (request.method === 'GET' && url.pathname === '/test/sessions') {
    return json({
      data: [...sessions.values()].map((session) => ({
        ...sessionResponse(session),
        test_request: {
          customer_email: session.customerEmail,
          client_reference_id: session.clientReferenceId,
          payment_intent_metadata: session.paymentIntentMetadata,
          idempotency_key: session.idempotencyKey,
          allow_promotion_codes: session.allowPromotionCodes,
        },
      })),
    });
  }

  const checkoutPage = url.pathname.match(/^\/checkout\/(cs_e2e_\d+)$/);
  if (request.method === 'GET' && checkoutPage) {
    return checkoutHtml(requiredSession(checkoutPage[1]!));
  }

  const checkoutPay = url.pathname.match(/^\/checkout\/(cs_e2e_\d+)\/pay$/);
  if (request.method === 'POST' && checkoutPay) {
    const session = requiredSession(checkoutPay[1]!);
    const form = await request.formData();
    const delivery = form.get('delivery');
    const promotionCode = String(form.get('promotionCode') ?? '').trim();
    if (promotionCode && promotionCode !== 'YAWP-E2E-100-OFF') {
      return checkoutHtml(session, 'Invalid promotion code');
    }
    const isNoCost = promotionCode === 'YAWP-E2E-100-OFF';
    session.status = 'complete';
    session.paymentStatus = isNoCost ? 'no_payment_required' : 'paid';
    session.amountTotal = isNoCost ? 0 : session.amountSubtotal;
    session.amountDiscount = isNoCost ? session.amountSubtotal : 0;
    session.paymentIntent = isNoCost ? null : `pi_${session.id}`;
    session.promotionCodeId = isNoCost ? 'promo_ua_e2e_production_test' : null;
    session.url = null;

    if (delivery !== 'delayed') {
      const delivered = await deliverWebhook({
        type: 'checkout.session.completed',
        object: sessionResponse(session),
      });
      session.lastCheckoutEventId = delivered.eventId;
    }

    return Response.redirect(
      session.successUrl.replace('{CHECKOUT_SESSION_ID}', session.id),
      303
    );
  }

  const controlWebhook = url.pathname.match(
    /^\/test\/sessions\/(cs_e2e_\d+)\/webhook$/
  );
  if (request.method === 'POST' && controlWebhook) {
    const session = requiredSession(controlWebhook[1]!);
    const eventId =
      url.searchParams.get('eventId') ??
      session.lastCheckoutEventId ??
      `evt_checkout_${session.id}`;
    const delivered = await deliverWebhook({
      type: url.searchParams.get('type') ?? 'checkout.session.completed',
      object: sessionResponse(session),
      eventId,
      repeat: Number(url.searchParams.get('repeat') ?? 1),
    });
    session.lastCheckoutEventId = eventId;
    return json(delivered);
  }

  const controlRefund = url.pathname.match(
    /^\/test\/sessions\/(cs_e2e_\d+)\/refund$/
  );
  if (request.method === 'POST' && controlRefund) {
    const session = requiredSession(controlRefund[1]!);
    session.amountRefunded = Number(
      url.searchParams.get('amount') ?? session.amountTotal
    );
    const delivered = await deliverWebhook({
      type: 'charge.refunded',
      object: {
        id: `ch_${session.id}`,
        object: 'charge',
        payment_intent: session.paymentIntent,
      },
      eventId: url.searchParams.get('eventId') ?? undefined,
      repeat: Number(url.searchParams.get('repeat') ?? 1),
    });
    return json(delivered);
  }

  const controlDispute = url.pathname.match(
    /^\/test\/sessions\/(cs_e2e_\d+)\/dispute$/
  );
  if (request.method === 'POST' && controlDispute) {
    const session = requiredSession(controlDispute[1]!);
    const status = url.searchParams.get('status') ?? 'under_review';
    session.disputeStatuses = [status];
    session.disputed = !['won', 'warning_closed', 'prevented', 'lost'].includes(
      status
    );
    const terminal = ['won', 'warning_closed', 'prevented', 'lost'].includes(
      status
    );
    const delivered = await deliverWebhook({
      type: terminal ? 'charge.dispute.closed' : 'charge.dispute.created',
      object: {
        id: `dp_${session.id}`,
        object: 'dispute',
        payment_intent: session.paymentIntent,
        status,
      },
      eventId: url.searchParams.get('eventId') ?? undefined,
      repeat: Number(url.searchParams.get('repeat') ?? 1),
    });
    return json(delivered);
  }

  if (request.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    const body = new URLSearchParams(await request.text());
    const idempotencyKey = request.headers.get('idempotency-key') ?? '';
    const metadata = {
      membershipId: body.get('metadata[membershipId]') ?? '',
      organizationId: body.get('metadata[organizationId]') ?? '',
      cohort: body.get('metadata[cohort]') ?? '',
    };
    const paymentIntentMetadata = {
      membershipId:
        body.get('payment_intent_data[metadata][membershipId]') ?? '',
      organizationId:
        body.get('payment_intent_data[metadata][organizationId]') ?? '',
      cohort: body.get('payment_intent_data[metadata][cohort]') ?? '',
    };
    const quantity = Number(body.get('line_items[0][quantity]'));
    const priceId = body.get('line_items[0][price]') ?? '';
    const customerEmail = body.get('customer_email') ?? '';
    const clientReferenceId = body.get('client_reference_id') ?? '';
    const successUrl = body.get('success_url') ?? '';
    const cancelUrl = body.get('cancel_url') ?? '';
    const allowPromotionCodes = body.get('allow_promotion_codes') === 'true';
    const requestFingerprint = JSON.stringify(
      [...body.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        `${leftKey}\0${leftValue}`.localeCompare(`${rightKey}\0${rightValue}`)
      )
    );
    const hasAdditionalLineItems = [...body.keys()].some((key) => {
      const match = key.match(/^line_items\[(\d+)\]/);
      return match ? Number(match[1]) > 0 : false;
    });
    const errors = [
      body.get('mode') === 'payment' ? null : 'mode must be payment',
      priceId === 'price_ua_e2e_2026' ? null : 'unexpected Price',
      quantity === 1 ? null : 'quantity must be one',
      hasAdditionalLineItems ? 'exactly one line item is required' : null,
      customerEmail ? null : 'customer_email is required',
      clientReferenceId ? null : 'client_reference_id is required',
      metadata.membershipId === clientReferenceId
        ? null
        : 'membership metadata must match client_reference_id',
      metadata.organizationId === E2E_UA_ORGANIZATION_ID
        ? null
        : 'unexpected organization metadata',
      metadata.cohort === 'ua-2026' ? null : 'unexpected cohort metadata',
      JSON.stringify(paymentIntentMetadata) === JSON.stringify(metadata)
        ? null
        : 'PaymentIntent metadata must match Session metadata',
      successUrl ===
      `${E2E_UA_APP_ORIGIN}/billing/ua/success?session_id={CHECKOUT_SESSION_ID}`
        ? null
        : 'unexpected success URL',
      cancelUrl === `${E2E_UA_APP_ORIGIN}/billing/ua?canceled=1`
        ? null
        : 'unexpected cancel URL',
      idempotencyKey ? null : 'Idempotency-Key is required',
      allowPromotionCodes ? null : 'promotion codes must be enabled',
    ].filter((error): error is string => Boolean(error));
    if (errors.length > 0) {
      return json(
        {
          error: { type: 'invalid_request_error', message: errors.join('; ') },
        },
        400
      );
    }

    const existing = sessionsByIdempotencyKey.get(idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        return json(
          {
            error: {
              type: 'idempotency_error',
              message:
                'Keys for idempotent requests may only be used with the same parameters',
            },
          },
          400
        );
      }
      return json(sessionResponse(existing));
    }

    const id = `cs_e2e_${++sessionSequence}`;
    const session: FakeSession = {
      id,
      mode: 'payment',
      status: 'open',
      paymentStatus: 'unpaid',
      amountSubtotal: 5_000 * quantity,
      amountTotal: 5_000 * quantity,
      amountDiscount: 0,
      currency: 'usd',
      customer: `cus_${id}`,
      paymentIntent: null,
      promotionCodeId: null,
      metadata,
      priceId,
      quantity,
      customerEmail,
      clientReferenceId,
      paymentIntentMetadata,
      idempotencyKey,
      allowPromotionCodes,
      requestFingerprint,
      successUrl,
      cancelUrl,
      url: `${E2E_STRIPE_BASE_URL}/checkout/${id}`,
      amountRefunded: 0,
      disputed: false,
      disputeStatuses: [],
      lastCheckoutEventId: null,
    };
    sessions.set(id, session);
    sessionsByIdempotencyKey.set(idempotencyKey, session);
    return json(sessionResponse(session));
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/v1/prices/price_ua_e2e_2026'
  ) {
    return json({
      id: 'price_ua_e2e_2026',
      object: 'price',
      active: true,
      currency: 'usd',
      livemode: false,
      type: 'one_time',
      unit_amount: 5000,
    });
  }

  const retrieveSession = url.pathname.match(
    /^\/v1\/checkout\/sessions\/(cs_e2e_\d+)$/
  );
  if (request.method === 'GET' && retrieveSession) {
    return json(sessionResponse(requiredSession(retrieveSession[1]!)));
  }

  const retrievePaymentIntent = url.pathname.match(
    /^\/v1\/payment_intents\/(pi_cs_e2e_\d+)$/
  );
  if (request.method === 'GET' && retrievePaymentIntent) {
    const session = [...sessions.values()].find(
      (candidate) => candidate.paymentIntent === retrievePaymentIntent[1]
    );
    if (!session) return json({ error: { message: 'Not found' } }, 404);
    activePaymentIntentRequests += 1;
    maxConcurrentPaymentIntentRequests = Math.max(
      maxConcurrentPaymentIntentRequests,
      activePaymentIntentRequests
    );
    try {
      // A small overlap window makes the production PostgreSQL advisory lock
      // observable: concurrent webhook handlers for one PaymentIntent must
      // serialize before they refresh Stripe's current state.
      await Bun.sleep(75);
      return json(paymentIntentResponse(session));
    } finally {
      activePaymentIntentRequests -= 1;
    }
  }

  if (request.method === 'GET' && url.pathname === '/v1/disputes') {
    const paymentIntentId = url.searchParams.get('payment_intent');
    const session = [...sessions.values()].find(
      (candidate) => candidate.paymentIntent === paymentIntentId
    );
    return json(
      session
        ? disputeList(session)
        : { object: 'list', data: [], has_more: false, url: '/v1/disputes' }
    );
  }

  return json(
    {
      error: {
        message: `Unhandled fake Stripe request: ${request.method} ${url.pathname}`,
      },
    },
    404
  );
}

Bun.serve({
  hostname: '127.0.0.1',
  port: E2E_STRIPE_PORT,
  fetch(request) {
    return handler(request).catch((error) =>
      json(
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
        500
      )
    );
  },
});

// eslint-disable-next-line no-console
console.log(`Fake Stripe listening on ${E2E_STRIPE_BASE_URL}`);
