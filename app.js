
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* ==========================================
   NIGHT AUDIT MANAGER
   SUPABASE CONFIGURATION
========================================== */

const SUPABASE_URL =
  "https://bsrxfatlffybupsxoqxf.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Ldcy0B7_k8_zRpee5DUoA_3mbl4oUu";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

/* ==========================================
   GLOBAL STATE
========================================== */

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProperty = null;
let properties = [];
let loadingTransactions = false;

/* ==========================================
   GENERAL FUNCTIONS
========================================== */

function show(id, visible) {
  const element = $(id);
  if (element) element.hidden = !visible;
}

function message(id, text, error = false) {
  const element = $(id);

  if (!element) {
    console.warn(text);
    return;
  }

  element.textContent = text;
  element.style.color = error ? "#c0392b" : "#218c59";
}

function value(id) {
  return $(id)?.value?.trim() || "";
}

function errorMessage(error) {
  return error?.message || "Une erreur inconnue est survenue.";
}

function clearTransactions() {
  if ($("transactions")) {
    $("transactions").replaceChildren();
  }

  if ($("totals")) {
    $("totals").textContent =
      "المداخيل: 0.00 DH | المصاريف: 0.00 DH | الصافي: 0.00 DH";
  }
}

/* ==========================================
   AUTHENTICATION
========================================== */

async function initializeApp() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      await enterApp(data.session.user);
    } else {
      show("auth", true);
      show("workspace", false);
      show("logout", false);
    }
  } catch (error) {
    message(
      "authMsg",
      "Erreur de connexion: " + errorMessage(error),
      true
    );
  }
}

async function enterApp(user) {
  if (!user) return;

  if (currentUser?.id === user.id && currentProperty) return;

  currentUser = user;

  show("auth", false);
  show("workspace", true);
  show("logout", true);

  await loadProperties();
}

async function login(event) {
  event.preventDefault();

  const email = value("email");
  const password = $("password")?.value || "";

  if (!email || !password) {
    message("authMsg", "Veuillez saisir votre email et mot de passe.", true);
    return;
  }

  message("authMsg", "Connexion en cours...");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message("authMsg", errorMessage(error), true);
    return;
  }

  message("authMsg", "Connexion réussie.");
}

async function logout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    message("authMsg", errorMessage(error), true);
    return;
  }

  currentUser = null;
  currentProperty = null;
  properties = [];

  location.reload();
}

/* ==========================================
   HOTEL MANAGEMENT
========================================== */

async function loadProperties() {
  if (!currentUser) return;

  const { data, error } = await supabase
    .from("hotel_members")
    .select("hotel_id, role, hotels(id, name)")
    .eq("user_id", currentUser.id);

  if (error) {
    message("propertyMsg", errorMessage(error), true);
    console.error(error);
    return;
  }

  properties = (data || [])
    .map((item) => {
      const hotel = Array.isArray(item.hotels)
        ? item.hotels[0]
        : item.hotels;

      return hotel ? { ...hotel, role: item.role } : null;
    })
    .filter(Boolean);

  const select = $("propertySelect");

  if (!select) {
    message("propertyMsg", "propertySelect introuvable dans index.html.", true);
    return;
  }

  select.replaceChildren();

  properties.forEach((hotel) => {
    const option = document.createElement("option");

    option.value = hotel.id;
    option.textContent = `${hotel.name} — ${hotel.role || ""}`;

    select.appendChild(option);
  });

  if (properties.length > 0) {
    currentProperty = properties[0].id;
    select.value = String(currentProperty);

    await loadTransactions();
  } else {
    currentProperty = null;
    clearTransactions();

    message(
      "propertyMsg",
      "Aucun établissement associé à ce compte. Ajoutez un établissement."
    );
  }
}

async function addProperty() {
  const name = prompt("Nom de l'hôtel ou du Riad:");

  if (!name?.trim()) return;

  message("propertyMsg", "Création en cours...");

  const { data, error } = await supabase.rpc("create_hotel", {
    p_name: name.trim()
  });

  if (error) {
    message("propertyMsg", errorMessage(error), true);
    console.error(error);
    return;
  }

  await loadProperties();

  const newId =
    typeof data === "string"
      ? data
      : data?.id || data?.hotel_id;

  if (newId && properties.some((hotel) =>
    String(hotel.id) === String(newId)
  )) {
    currentProperty = newId;
    $("propertySelect").value = String(newId);
    await loadTransactions();
  }

  message("propertyMsg", "Demande de création exécutée.");
}

async function renameProperty() {
  if (!currentProperty) {
    message("propertyMsg", "Choisissez un établissement.", true);
    return;
  }

  const name = value("renameInput");

  if (!name) {
    message("propertyMsg", "Saisissez le nouveau nom.", true);
    return;
  }

  const { error } = await supabase
    .from("hotels")
    .update({ name })
    .eq("id", currentProperty);

  if (error) {
    message("propertyMsg", errorMessage(error), true);
    return;
  }

  await loadProperties();

  if ($("propertySelect")) {
    $("propertySelect").value = String(currentProperty);
  }

  message("propertyMsg", "Nom modifié avec succès.");
}

/* ==========================================
   TRANSACTION MANAGEMENT
========================================== */

async function addTransaction(event) {
  event.preventDefault();

  if (!currentUser || !currentProperty) {
    message("txMsg", "Connectez-vous et choisissez un établissement.", true);
    return;
  }

  const amount = Number(value("amount"));
  const category = value("category");
  const type = value("type");

  if (!Number.isFinite(amount) || amount <= 0) {
    message("txMsg", "Montant invalide.", true);
    return;
  }

  if (!category) {
    message("txMsg", "Veuillez saisir une catégorie.", true);
    return;
  }

  if (!["income", "expense"].includes(type)) {
    message("txMsg", "Type de transaction invalide.", true);
    return;
  }

  const transaction = {
    hotel_id: currentProperty,
    created_by: currentUser.id,
    transaction_type: type,
    category: category,
    amount: amount,
    payment_method: value("payment"),
    description: value("description")
  };

  message("txMsg", "Enregistrement en cours...");

  const { error } = await supabase
    .from("transactions")
    .insert(transaction);

  if (error) {
    message("txMsg", errorMessage(error), true);
    console.error(error);
    return;
  }

  message("txMsg", "Transaction enregistrée avec succès.");

  $("transactionForm")?.reset();

  await loadTransactions();
}

/* ==========================================
   LOAD TRANSACTIONS
========================================== */

async function loadTransactions() {
  if (!currentProperty || loadingTransactions) {
    if (!currentProperty) clearTransactions();
    return;
  }

  loadingTransactions = true;

  try {
    const { data, error } = await supabase
      .from("transactions")
      .select(`
        created_at,
        transaction_type,
        category,
        amount,
        payment_method,
        description
      `)
      .eq("hotel_id", currentProperty)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const table = $("transactions");

    if (!table) {
      message("txMsg", "Table des transactions introuvable.", true);
      return;
    }

    table.replaceChildren();

    let income = 0;
    let expense = 0;

    (data || []).forEach((item) => {
      const amount = Number(item.amount) || 0;

      if (item.transaction_type === "income") {
        income += amount;
      } else if (item.transaction_type === "expense") {
        expense += amount;
      }

      const row = document.createElement("tr");

      const fields = [
        item.created_at
          ? new Date(item.created_at).toLocaleString("fr-FR")
          : "",
        item.transaction_type === "income" ? "مدخول" : "مصروف",
        item.category || "",
        amount.toFixed(2) + " DH",
        item.payment_method || "",
        item.description || ""
      ];

      fields.forEach((field) => {
        const cell = document.createElement("td");
        cell.textContent = String(field);
        row.appendChild(cell);
      });

      table.appendChild(row);
    });

    const net = income - expense;

    if ($("totals")) {
      $("totals").textContent =
        `المداخيل: ${income.toFixed(2)} DH | ` +
        `المصاريف: ${expense.toFixed(2)} DH | ` +
        `الصافي: ${net.toFixed(2)} DH`;
    }

  } catch (error) {
    message(
      "txMsg",
      "Erreur de chargement: " + errorMessage(error),
      true
    );

    console.error(error);

  } finally {
    loadingTransactions = false;
  }
}

/* ==========================================
   EVENT LISTENERS
========================================== */

$("loginForm")?.addEventListener("submit", login);

$("logout")?.addEventListener("click", logout);

$("addProperty")?.addEventListener("click", addProperty);

$("renameProperty")?.addEventListener("click", renameProperty);

$("transactionForm")?.addEventListener("submit", addTransaction);

$("refresh")?.addEventListener("click", loadTransactions);

$("propertySelect")?.addEventListener("change", async (event) => {
  currentProperty = event.target.value || null;
  await loadTransactions();
});

/* ==========================================
   AUTH STATE CHANGES
========================================== */

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session?.user) {
    if (currentUser?.id !== session.user.id) {
      void enterApp(session.user);
    }
  }

  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProperty = null;
    properties = [];

    show("auth", true);
    show("workspace", false);
    show("logout", false);

    clearTransactions();
  }
});

/* ==========================================
   START APPLICATION
========================================== */

void initializeApp();
