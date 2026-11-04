import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// إعدادات المشروع العامة فقط. لا تضع sb_secret أو service_role هنا.
const SUPABASE_URL = "https://bsrxfatlffybupsxoqxf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ldcy0B7K_z8_ZrPee5DUoA_3mbl4oUu";
const supabase = createClient(sb_publishable_Ldcy0B7K_z8_ZrPee5DUoA_3mbl4oUu);

const $ = id => document.getElementById(id);
let properties = [], currentProperty = null, currentUs";

// إعدادات المشروع العامة فقط. لا تضع sb_secret أو service_role هنا.
const SUPABASE_URL = "https://bsrxfatlffybupsxoqxf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ldcy0B7K_z8_ZrPee5DUoA_3mbl4oUu";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEer = null;
const show = (id, yes) => $(id).hidden = !yes;
const msg = (id, text, error=false) => { $(id).textContent=text; $(id).style.color=error?"#b42318":"#23734d"; };

async function boot(){
  const {data:{session}} = await supabase.auth.getSession();
  if(session) await enter(session.user); else { show("auth",true); show("workspace",false); }
}
async function enter(user){
  currentUser=user; show("auth",false); show("workspace",true); show("logout",true);
  await loadProperties();
}
async function loadProperties(){
  const {data,error}=await supabase.from("hotel_members").select("hotel_id,role,hotels(id,name)").eq("user_id",currentUser.id);
  if(error){msg("propertyMsg","تعذر تحميل المؤسسات: "+error.message,true);return;}
  properties=(data||[]).map(x=>({...x.hotels,role:x.role})).filter(Boolean);
  const sel=$("propertySelect"); sel.innerHTML="";
  properties.forEach(p=>{const o=document.createElement("option");o.value=p.id;o.textContent=p.name+" — "+p.role;sel.append(o);});
  if(properties.length){currentProperty=properties[0].id;sel.value=currentProperty;await loadTransactions();}
  else {currentProperty=null;msg("propertyMsg","لا توجد مؤسسة مرتبطة بهذا الحساب بعد. استخدم إضافة مؤسسة.");}
}
$("loginForm").addEventListener("submit",async e=>{
 e.preventDefault();msg("authMsg","جارٍ تسجيل الدخول...");
 const {data,error}=await supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
 if(error){msg("authMsg",error.message,true);return;} await enter(data.user);
});
$("logout").onclick=async()=>{await supabase.auth.signOut();location.reload();};
$("addProperty").onclick=async()=>{
 const name=prompt("اكتب اسم الفندق أو الرياض الجديد:"); if(!name?.trim())return;
 const {data,error}=await supabase.rpc("create_hotel",{p_name:name.trim()});
 if(error){msg("propertyMsg","تعذر إنشاء المؤسسة: "+error.message,true);return;}
 await loadProperties();$("propertySelect").value=data;currentProperty=data;msg("propertyMsg","تم إنشاء المؤسسة بنجاح.");
};
$("propertySelect").onchange=async()=>{currentProperty=$("propertySelect").value;await loadTransactions();};
$("renameProperty").onclick=async()=>{
 if(!currentProperty)return;
 const name=$("renameInput").value.trim();if(!name)return msg("propertyMsg","اكتب الاسم الجديد.",true);
 const {error}=await supabase.from("hotels").update({name}).eq("id",currentProperty);
 if(error){msg("propertyMsg","تعذر تغيير الاسم: "+error.message,true);return;}
 msg("propertyMsg","تم تغيير اسم المؤسسة.");await loadProperties();$("propertySelect").value=currentProperty;
};
$("transactionForm").onsubmit=async e=>{
 e.preventDefault();if(!currentProperty)return msg("txMsg","اختر مؤسسة أولاً.",true);
 const row={hotel_id:currentProperty,created_by:currentUser.id,transaction_type:$("type").value,category:$("category").value.trim(),amount:Number($("amount").value),payment_method:$("payment").value,description:$("description").value.trim()};
 const {error}=await supabase.from("transactions").insert(row);
 if(error){msg("txMsg","تعذر حفظ العملية: "+error.message,true);return;}
 msg("txMsg","تم حفظ العملية ومزامنتها.");$("transactionForm").reset();await loadTransactions();
};
$("refresh").onclick=loadTransactions;
async function loadTransactions(){
 if(!currentProperty)return;
 const {data,error}=await supabase.from("transactions").select("created_at,transaction_type,category,amount,payment_method,description").eq("hotel_id",currentProperty).order("created_at",{ascending:false}).limit(100);
 if(error){msg("txMsg","تعذر تحميل السجل: "+error.message,true);return;}
 const body=$("transactions");body.innerHTML="";let income=0,expense=0;
 (data||[]).forEach(r=>{if(r.transaction_type==="income")income+=Number(r.amount);else expense+=Number(r.amount);
 const tr=document.createElement("tr");[new Date(r.created_at).toLocaleString("fr-FR"),r.transaction_type==="income"?"مدخول":"مصروف",r.category,Number(r.amount).toFixed(2)+" DH",r.payment_method,r.description||""].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td);});body.append(tr);});
 $("totals").textContent=`المداخيل: ${income.toFixed(2)} DH | المصاريف: ${expense.toFixed(2)} DH | الصافي: ${(income-expense).toFixed(2)} DH`;
}
supabase.auth.onAuthStateChange((_event,session)=>{if(session&&!currentUser)enter(session.user);});
boot();
