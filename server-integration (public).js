// ClinicFlow dashboard integration
// Add these lines after app.use(express.json()) in server.js.
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));
app.get("/dashboard", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

// The routes below expect the Supabase client exported by ./config/supabase.
// They use the service-role client on the server, so browser users never receive
// Supabase secrets. Keep SUPABASE_SERVICE_ROLE_KEY in .env and never expose it.

const { supabase } = require("./config/supabase");

app.get("/api/patients", async (req,res)=>{
  const {data,error}=await supabase.from("patients").select("*").order("created_at",{ascending:false});
  if(error)return res.status(500).json({error:error.message}); res.json(data||[]);
});

app.get("/api/support-tickets", async (req,res)=>{
  const {data,error}=await supabase.from("support_tickets").select("*").order("created_at",{ascending:false});
  if(error)return res.status(500).json({error:error.message}); res.json(data||[]);
});
app.patch("/api/support-tickets/:id", async(req,res)=>{
  const {data,error}=await supabase.from("support_tickets").update({status:req.body.status}).eq("id",req.params.id).select().single();
  if(error)return res.status(500).json({error:error.message}); res.json(data);
});

app.patch("/api/appointments/:id", async(req,res)=>{
  const {data,error}=await supabase.from("appointments").update(req.body).eq("id",req.params.id).select().single();
  if(error)return res.status(500).json({error:error.message}); res.json(data);
});
app.delete("/api/doctors/:id", async(req,res)=>{
  const {data,error}=await supabase.from("doctors").delete().eq("id",req.params.id).select();
  if(error)return res.status(500).json({error:error.message}); res.json(data);
});

// Optional conversation endpoints. These require a conversations table and messages table.
// If your project uses different names, change them here only.
app.get("/api/conversations", async(req,res)=>{
  const {data,error}=await supabase.from("conversations").select("*").order("updated_at",{ascending:false});
  if(error)return res.status(500).json({error:error.message}); res.json(data||[]);
});
app.get("/api/conversations/:id/messages", async(req,res)=>{
  const {data,error}=await supabase.from("messages").select("*").eq("conversation_id",req.params.id).order("created_at");
  if(error)return res.status(500).json({error:error.message}); res.json(data||[]);
});
app.post("/api/conversations/:id/messages", async(req,res)=>{
  if(!req.body?.body)return res.status(400).json({error:"body is required"});
  const {data:c,error:ce}=await supabase.from("conversations").select("phone").eq("id",req.params.id).single();
  if(ce)return res.status(404).json({error:ce.message});
  const {sendText}=require("./services/whatsapp");
  await sendText(c.phone,req.body.body);
  const {data,error}=await supabase.from("messages").insert({conversation_id:req.params.id,direction:"outbound",body:req.body.body}).select().single();
  if(error)return res.status(500).json({error:error.message}); res.json(data);
});
