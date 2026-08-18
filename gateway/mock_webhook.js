// gateway/mock_webhook.js
// Custom mockup runner to simulate payment confirmations
const axios = require('axios');

const mockPayload = {
    type: 'checkout.session.completed',
    data: {
        object: {
            client_reference_id: 'usr_dev_1', // Our mock user in users.json
            customer: 'cus_MockStripeCustomer123',
            amount_total: 1000,
            currency: 'usd',
            payment_status: 'paid'
        }
    }
};

// Send mock webhook POST call directly to our Node.js endpoint
// We bypass Stripe-Signature checks for dev mode testing
async function triggerMockWebhook() {
    try {
        console.log("🚀 Simulating Stripe checkout session webhook callback...");
        const response = await axios.post('http://localhost:5000/api/webhook', mockPayload, {
            headers: {
                'Content-Type': 'application/json',
                // Adding a bypass/development header to skip verification checks in local testing
                'stripe-signature': 'dev-mode-mock-signature'
            }
        });
        console.log("✅ Webhook responded successfully!");
    } catch (err) {
        console.error("❌ Webhook simulation failed. Is server.js running on port 5000?");
    }
}

triggerMockWebhook();