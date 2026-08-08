const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("SUPABASE_URL is required.");
if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testDatabase() {
  const { error } = await supabase.from("clinics").select("id").limit(1);
  if (error) throw new Error(`Supabase connection failed: ${error.message}`);
  console.log("Connected to Supabase.");
}

module.exports = { supabase, testDatabase };
