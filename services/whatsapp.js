const axios = require("axios");

function url() {
  return `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}
const headers = () => ({
  Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  "Content-Type": "application/json"
});

async function sendText(to, body) {
  const { data } = await axios.post(url(), {
    messaging_product: "whatsapp", to, type: "text", text: { body }
  }, { headers: headers() });
  return data;
}

async function sendTemplate(to, name, language, values = []) {
  const { data } = await axios.post(url(), {
    messaging_product: "whatsapp", to, type: "template",
    template: {
      name,
      language: { code: language },
      components: [{
        type: "body",
        parameters: values.map(v => ({ type: "text", text: String(v) }))
      }]
    }
  }, { headers: headers() });
  return data;
}

module.exports = { sendText, sendTemplate };
