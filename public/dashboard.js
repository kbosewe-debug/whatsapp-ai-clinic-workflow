const API="/api";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const arr=x=>Array.isArray(x)?x:(x?.data||x?.appointments||x?.doctors||x?.patients||x?.tickets||x?.conversations||[]);
const date=x=>x?new Date(x).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"}):"—";
let state={appointments:[],doctors:[],patients:[],support:[],conversations:[],selectedConversation:null};

async function api(path,opt={}) {
  const r=await fetch(path,{headers:{"Content-Type":"application/json"},...opt});
  const t=await r.text(); let d; try{d=JSON.parse(t)}catch{d=t}
  if(!r.ok) throw Error(d?.error||d?.message||`HTTP ${r.status}`);
  return d;
}
function toast(x){$("toast").textContent=x;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",2500)}

function appointmentTable(list){
 if(!list.length)return '<div class="empty">No appointments found.</div>';
 return `<table class="data"><tr><th>Patient</th><th>Doctor</th><th>Date</th><th>Status</th><th>Action</th></tr>${
 list.map(x=>`<tr><td>${esc(x.patients?.name||x.patient_name||x.phone||"Patient")}</td>
 <td>${esc(x.doctors?.name||x.doctor_name||"—")}</td><td>${date(x.starts_at||x.start_time)}</td>
 <td><span class="badge">${esc(x.status||"pending")}</span></td>
 <td><button class="danger" onclick="cancelAppointment('${esc(x.id)}')">Cancel</button></td></tr>`).join("")}</table>`;
}
function simpleTable(list){
 if(!list.length)return '<div class="empty">No records found.</div>';
 return `<table class="data"><tr><th>Name</th><th>Phone</th><th>Email</th></tr>${list.map(x=>`<tr><td>${esc(x.name||x.full_name||"—")}</td><td>${esc(x.phone||"—")}</td><td>${esc(x.email||"—")}</td></tr>`).join("")}</table>`;
}
async function load(){
 try{
  const [a,d]=await Promise.all([api(API+"/appointments"),api(API+"/doctors")]);
  state.appointments=arr(a);state.doctors=arr(d);
  try{state.patients=arr(await api(API+"/patients"))}catch{}
  try{state.support=arr(await api(API+"/support-tickets"))}catch{}
  try{state.conversations=arr(await api(API+"/conversations"))}catch{}
  render();
 }catch(e){toast("API error: "+e.message)}
}
function render(){
 const now=new Date();
 $("today").textContent=state.appointments.filter(x=>new Date(x.starts_at||x.start_time).toDateString()===now.toDateString()).length;
 $("upcoming").textContent=state.appointments.filter(x=>new Date(x.starts_at||x.start_time)>=now && x.status!=="cancelled").length;
 $("doctorCount").textContent=state.doctors.length;
 $("supportCount").textContent=state.support.filter(x=>x.status!=="closed").length;
 $("appointmentsTable").innerHTML=appointmentTable(state.appointments);
 $("overviewAppointments").innerHTML=appointmentTable(state.appointments.slice(0,5));
 $("patientsTable").innerHTML=simpleTable(state.patients);
 $("doctorsGrid").innerHTML=state.doctors.length?state.doctors.map(d=>`<div class="item"><b>${esc(d.name||d.full_name||"Doctor")}</b><small>${esc(d.specialty||d.specialisation||"Medical practitioner")}</small><button class="danger" onclick="deleteDoctor('${esc(d.id)}')">Remove</button></div>`).join(""):'<div class="empty">No doctors found.</div>';
 $("overviewSupport").innerHTML=state.support.length?state.support.slice(0,5).map(x=>`<div class="item"><b>${esc(x.phone||"Patient")}</b><small>${esc(x.message||"Support request")} · ${esc(x.status||"open")}</small></div>`).join(""):'<div class="empty">No support requests.</div>';
 $("supportTable").innerHTML=state.support.length?state.support.map(x=>`<div class="item"><b>${esc(x.phone||"Patient")}</b><small>${esc(x.message||"")} · ${esc(x.status||"open")}</small><button onclick="closeTicket('${esc(x.id)}')">Close</button></div>`).join(""):'<div class="empty">No support tickets.</div>';
 renderConversations();
}
function renderConversations(){
 const box=$("conversations");
 box.innerHTML=state.conversations.length?state.conversations.map(c=>`<div class="item convo" onclick="openConversation('${esc(c.id)}')"><b>${esc(c.patient_name||c.phone||"Patient")}</b><small>${esc(c.last_message||"No messages")}</small></div>`).join(""):'<div class="empty">No conversations endpoint/data yet.</div>';
}
window.openConversation=async id=>{
 try{
  state.selectedConversation=id;
  const c=state.conversations.find(x=>String(x.id)===String(id));
  $("chatTitle").textContent=c?.patient_name||c?.phone||"Conversation";
  const d=await api(API+"/conversations/"+id+"/messages");
  const msgs=arr(d);
  $("messages").innerHTML=msgs.length?msgs.map(m=>`<div class="item"><b>${m.direction==="outbound"?"Clinic":"Patient"}</b><div>${esc(m.body||m.message||"")}</div><small>${date(m.created_at)}</small></div>`).join(""):'<div class="empty">No messages.</div>';
 }catch(e){toast("Conversation error: "+e.message)}
};
window.sendManualReply=async()=>{
 if(!state.selectedConversation)return toast("Select a conversation first");
 const body=$("reply").value.trim();if(!body)return;
 try{await api(`/api/conversations/${state.selectedConversation}/messages`,{method:"POST",body:JSON.stringify({body})});$("reply").value="";await openConversation(state.selectedConversation);toast("Reply sent")}
 catch(e){toast("Send failed: "+e.message)}
};
window.cancelAppointment=async id=>{if(!confirm("Cancel this appointment?"))return;try{await api("/api/appointments/"+id,{method:"PATCH",body:JSON.stringify({status:"cancelled"})});toast("Appointment cancelled");load()}catch(e){toast(e.message)}};
window.deleteDoctor=async id=>{if(!confirm("Remove this doctor?"))return;try{await api("/api/doctors/"+id,{method:"DELETE"});toast("Doctor removed");load()}catch(e){toast(e.message)}};
window.closeTicket=async id=>{try{await api("/api/support-tickets/"+id,{method:"PATCH",body:JSON.stringify({status:"closed"})});toast("Ticket closed");load()}catch(e){toast(e.message)}};

document.querySelectorAll(".sidebar button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$(b.dataset.view).classList.add("active");
 document.querySelectorAll(".sidebar button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
 $("title").textContent=b.textContent.trim();if(innerWidth<900)$(".sidebar").classList.remove("open");
});
$("mobile").onclick=()=>$(".sidebar").classList.toggle("open");
$("refresh").onclick=load;
$("appointmentSearch").oninput=e=>$("appointmentsTable").innerHTML=appointmentTable(state.appointments.filter(x=>JSON.stringify(x).toLowerCase().includes(e.target.value.toLowerCase())));
$("doctorSearch").oninput=e=>$("doctorsGrid").innerHTML=state.doctors.filter(x=>JSON.stringify(x).toLowerCase().includes(e.target.value.toLowerCase())).map(d=>`<div class="item"><b>${esc(d.name||d.full_name||"Doctor")}</b><small>${esc(d.specialty||"")}</small></div>`).join("");
$("patientSearch").oninput=e=>$("patientsTable").innerHTML=simpleTable(state.patients.filter(x=>JSON.stringify(x).toLowerCase().includes(e.target.value.toLowerCase())));
$("send").onclick=sendManualReply;
$("clinicForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/clinics",{method:"PUT",body:JSON.stringify({name:$("name").value,phone:$("phone").value,address:$("address").value,website:$("website").value,opening_hours:$("hours").value,services:$("services").value.split("\n").filter(Boolean)})});toast("Clinic settings saved")}catch(err){toast("Save failed: "+err.message)}};
load();
