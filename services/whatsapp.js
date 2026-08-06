const axios = require("axios");
const crypto = require("crypto");

function getMessagesUrl() {
  const version = process.env.WHATSAPP_API_VERSION || "v26.0";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is required.");
  }

  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}

function getHeaders() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!token) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is required.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function sendTextMessage(to, body) {
  const response = await axios.post(
    getMessagesUrl(),
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body,
      },
    },
    { headers: getHeaders() }
  );

  return response.data;
}

async function sendTemplateMessage({
  to,
  templateName,
  languageCode,
  parameters = [],
}) {
  const components = [];

  if (parameters.length > 0) {
    components.push({
      type: "body",
      parameters: parameters.map((value) => ({
        type: "text",
        text: String(value),
      })),
    });
  }

  const response = await axios.post(
    getMessagesUrl(),
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode || "en_US",
        },
        components,
      },
    },
    { headers: getHeaders() }
  );

  return response.data;
}

function verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!rawBody || !signatureHeader || !appSecret) {
    return false;
  }

  const expectedSignature =
    "sha256=" +
    crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");

  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(String(signatureHeader));

  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  verifyWebhookSignature,
};
