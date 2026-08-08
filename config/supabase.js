require("dotenv").config({
  path: require("path").join(__dirname, "../.env"),
});

const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Supabase URL loaded:", !!url);
console.log("Supabase secret loaded:", !!key);

if (!url) {
  throw new Error("SUPABASE_URL is required");
}

if (!key) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function testDatabase() {
  const { data, error } = await supabase.from("clinics").select("id").limit(1);

  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }

  console.log("Supabase test successful:", data);

  return true;
}

module.exports = {
  supabase,
  testDatabase,
};
