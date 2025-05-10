# 🔔 Webhook Actions

Respond to external webhook events (GitHub, Stripe, etc.).

## GitHub Integration

The system comes with a built-in GitHub webhook handler. Add this to your root `config.json`:

```json
{
  "github": {
    "repository": "username/repo-name",
    "branch": "main",
    "secret": "your-webhook-secret"
  }
}
```

## Custom Webhook

Create a custom webhook handler:

```typescript
// sites/mysite/.dialup/actions/stripe-webhook.ts
import { defineWebhookAction } from "@dialup-deploy/actions";

export default defineWebhookAction({
  id: "stripe-webhook",
  path: "/webhook/stripe",
  async handler(payload, context) {
    // Process the Stripe webhook event
    const event = payload.body;

    // Do something with the event
    console.log(`Received Stripe event: ${event.type}`);

    return {
      success: true,
      message: "Webhook processed successfully",
      data: { eventType: event.type }
    };
  }
});
```

## Webhook Security

When setting up webhooks, it's important to implement proper security measures:

1. **Verify Signatures**: For services that provide signature verification (like GitHub, Stripe), always verify the signature
2. **Use HTTPS**: Ensure your webhook endpoints are served over HTTPS
3. **Implement Rate Limiting**: Protect against abuse by implementing rate limiting
4. **Validate Payload**: Always validate the incoming payload before processing

## Example: GitHub Webhook Handler

```typescript
// sites/mysite/.dialup/actions/github-webhook.ts
import { defineWebhookAction } from "@dialup-deploy/actions";
import { createHmac } from "crypto";

export default defineWebhookAction({
  id: "github-webhook",
  path: "/webhook/github",
  async handler(payload, context) {
    // Get the GitHub secret from environment variables
    const secret = context.env?.GITHUB_WEBHOOK_SECRET;

    if (!secret) {
      return {
        success: false,
        message: "GitHub webhook secret not configured"
      };
    }

    // Verify the signature
    const signature = payload.headers["x-hub-signature-256"];
    const body = JSON.stringify(payload.body);

    const hmac = createHmac("sha256", secret);
    hmac.update(body);
    const calculatedSignature = `sha256=${hmac.digest("hex")}`;

    if (signature !== calculatedSignature) {
      return {
        success: false,
        message: "Invalid signature"
      };
    }

    // Process the GitHub event
    const event = payload.headers["x-github-event"];
    const data = payload.body;

    console.log(`Received GitHub event: ${event}`);

    // Handle different event types
    if (event === "push") {
      // Handle push event
      const branch = data.ref.replace("refs/heads/", "");
      const repository = data.repository.full_name;

      console.log(`Push to ${repository} on branch ${branch}`);

      // Trigger a build or deployment
      // ...
    }

    return {
      success: true,
      message: `Processed GitHub ${event} event`,
      data: { event }
    };
  }
});
```

## Example: Stripe Webhook Handler

```typescript
// sites/mysite/.dialup/actions/stripe-webhook.ts
import { defineWebhookAction } from "@dialup-deploy/actions";
import Stripe from "stripe";

export default defineWebhookAction({
  id: "stripe-webhook",
  path: "/webhook/stripe",
  async handler(payload, context) {
    // Get the Stripe secret from environment variables
    const stripeSecret = context.env?.STRIPE_SECRET_KEY;
    const endpointSecret = context.env?.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecret || !endpointSecret) {
      return {
        success: false,
        message: "Stripe configuration missing"
      };
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecret);

    // Verify the signature
    const signature = payload.headers["stripe-signature"];
    const body = JSON.stringify(payload.body);

    try {
      // Verify and construct the event
      const event = stripe.webhooks.constructEvent(
        body,
        signature,
        endpointSecret
      );

      // Handle different event types
      switch (event.type) {
        case "payment_intent.succeeded":
          const paymentIntent = event.data.object;
          console.log(`Payment succeeded: ${paymentIntent.id}`);
          // Process successful payment
          break;

        case "customer.subscription.created":
          const subscription = event.data.object;
          console.log(`Subscription created: ${subscription.id}`);
          // Process new subscription
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      return {
        success: true,
        message: `Processed Stripe ${event.type} event`,
        data: { eventType: event.type }
      };
    } catch (error) {
      console.error("Stripe webhook error:", error);
      return {
        success: false,
        message: `Stripe webhook error: ${error.message}`,
        data: { error: error.message }
      };
    }
  }
});
```

## Related Documentation

- [Environment Variables & Context](../index.md#🔑-environment-variables--context)
- [Action File Location](../index.md#📂-action-file-location)
