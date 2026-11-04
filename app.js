
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Supabase public configuration
const SUPABASE_URL = "https://bsrxfatlffybupsxoqxf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Ldcy0B7K_z8_ZrPee5DUoA_3mbl4oUu";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Supabase configuration is missing.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY
      }
    }
  }
);

const $ = id => document.getElementById(id);

let properties = [];
let currentProperty = null;
let currentUser = null;

const show = (id, yes) => {
  $(id).hidden = !yes;
};

const msg = (id, text, error = false) => {
  $(id).textContent = text;
  $(id).style.color = error ? "#b42318" : "#23734d";
};

// Initialize application
async function boot() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    if (data.session) {
      await enter(data.session.user);
    } else {
      show("auth", true);
      show("workspace", false);
    }
  } catch (error) {
    console.error("Boot error:", error);
    show("auth", true);
    show("workspace", false);
    msg("authMsg", "تعذر الاتصال: " + error.message, true);
  }
}

// Enter workspace
async function enter(user) {
  currentUser = user;
  show("auth", false);
  show("workspace", true);
  show("logout", true);

  await loadProperties();
}

// Load hotels
async function loadProperties() {
  const { data, error } = await supabase
    .from("hotel_members")
    .select("hotel_id,role,hotels(id,name)")
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("Hotel loading error:", error);
    msg("propertyMsg", "تعذر تحميل المؤسسات: " + error.message, true);
    return;
  }

  properties = (data || [])
    .map(x => ({ ...x.hotels, role: x.role }))
    .filter(Boolean);

  const sel = $("propertySelect");
  sel.innerHTML = "";

  properties.forEach(p => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.name + " — " + p.role;
    sel.append(option);
  });

  if (properties.length) {
    currentProperty = properties[0].id;
    sel.value = currentProperty;
    await loadTransactions();
  } else {
    currentProperty = null;
    msg(
      "propertyMsg",
      "لا توجد مؤسسة مرتبطة بهذا الحساب بعد. استخدم إضافة مؤسسة."
    );
  }
}

// Login
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  msg("authMsg", "جارٍ تسجيل الدخول...");

  const { data, error } = await supabase.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });

  if (error) {
    console.error("Login error:", error);
    msg("authMsg", error.message, true);
    return;
  }

  await enter(data.user);
});

// Logout
$("logout").onclick = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout error:", error);
    return;
  }

  location.reload();
};

// Add hotel
$("addProperty").onclick = async () => {
  const name = prompt("اكتب اسم الفندق أو الرياض الجديد:");

  if (!name?.trim()) return;

  const { data, error } = await supabase.rpc("create_hotel", {
    p_name: name.trim()
  });

  if (error) {
    console.error("Create hotel error:", error);
    msg("propertyMsg", "تعذر إنشاء المؤسسة: " + error.message, true);
    return;
  }

  await loadProperties();

  $("propertySelect").value = data;
  currentProperty = data;

  msg("propertyMsg", "تم إنشاء المؤسسة بنجاح.");
};

// Change hotel
$("propertySelect").onchange = async () => {
  currentProperty = $("propertySelect").value;
  await loadTransactions();
};

// Rename hotel
$("renameProperty").onclick = async () => {
  if (!currentProperty) return;

  const name = $("renameInput").value.trim();

  if (!name) {
    return msg("propertyMsg", "اكتب الاسم الجديد.", true);
  }

  const { error } = await supabase
    .from("hotels")
    .update({ name })
    .eq("id", currentProperty);

  if (error) {
    console.error("Rename error:", error);
    msg("propertyMsg", "تعذر تغيير الاسم: " + error.message, true);
    return;
  }

  msg("propertyMsg", "تم تغيير اسم المؤسسة.");

  await loadProperties();
  $("propertySelect").value = currentProperty;
};

// Add transaction
$("transactionForm").onsubmit = async e => {
  e.preventDefault();

  if (!currentProperty) {
    return msg("txMsg", "اختر مؤسسة أولاً.", true);
  }

  const row = {
    hotel_id: currentProperty,
    created_by: currentUser.id,
    transaction_type: $("type").value,
    category: $("category").value.trim(),
    amount: Number($("amount").value),
    payment_method: $("payment").value,
    description: $("description").value.trim()
  };

  const { error } = await supabase
    .from("transactions")
    .insert(row);

  if (error) {
    console.error("Insert transaction error:", error);
    msg("txMsg", "تعذر حفظ العملية: " + error.message, true);
    return;
  }

  msg("txMsg", "تم حفظ العملية ومزامنتها.");

  $("transactionForm").reset();
  await loadTransactions();
};

// Refresh
$("refresh").onclick = loadTransactions;

// Load transactions
async function loadTransactions() {
  if (!currentProperty) return;

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "created_at,transaction_type,category,amount,payment_method,description"
    )
    .eq("hotel_id", currentProperty)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Transaction loading error:", error);
    msg("txMsg", "تعذر تحميل السجل: " + error.message, true);
    return;
  }

  const body = $("transactions");
  body.innerHTML = "";

  let income = 0;
  let expense = 0;

  (data || []).forEach(r => {
    if (r.transaction_type === "income") {
      income += Number(r.amount);
    } else {
      expense += Number(r.amount);
    }

    const tr = document.createElement("tr");

    [
      new Date(r.created_at).toLocaleString("fr-FR"),
      r.transaction_type === "income" ? "مدخول" : "مصروف",
      r.category,
      Number(r.amount).toFixed(2) + " DH",
      r.payment_method,
      r.description || ""
    ].forEach(value => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    });

    body.append(tr);
  });

  $("totals").textContent =
    `المداخيل: ${income.toFixed(2)} DH | ` +
    `المصاريف: ${expense.toFixed(2)} DH | ` +
    `الصافي: ${(income - expense).toFixed(2)} DH`;
}

// Authentication state
supabase.auth.onAuthStateChange((_event, session) => {
  if (session && !currentUser) {
    enter(session.user);
  }

  if (!session && currentUser) {
    currentUser = null;
    location.reload();
  }
});

// Start
boot();
