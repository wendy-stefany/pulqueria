// 1. CONFIGURACIÓN DIRECTA DE SUPABASE (Evita el error de re-declaración)
var SUPABASE_URL = "https://bcwewjxhiecizvhajmxp.supabase.co"; // Reemplaza con tu URL
var SUPABASE_KEY = "sb_publishable_gAQu4V4xHOkEvztWCnxlLg_zgrUjzeU";     // Reemplaza con tu anon key

// Asignar al objeto global de window si no se ha creado aún
if (!window.supabaseClient) {
  window.supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
}
var supabase = window.supabaseClient;

// ESTADO GLOBAL
let currentUser = null;
let currentProfile = null;
let cart = [];
let productsCache = [];

// 2. FUNCIÓN PRINCIPAL DE LOGIN (EXPUESTA A WINDOW)
window.handleLogin = async function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");

  if (!emailInput || !passwordInput) {
    alert("Error: No se encontraron los campos en el HTML");
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    alert("Por favor ingresa tu correo y contraseña");
    return;
  }

  if (!supabase) {
    alert("Error: La librería de Supabase no ha cargado. Revisa tu index.html.");
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert("Error al iniciar sesión: " + error.message);
      return;
    }

    if (data && data.user) {
      alert("¡Inicio de sesión exitoso!");
      await loadUserProfile(data.user);
    }
  } catch (err) {
    alert("Error de conexión: " + err.message);
  }
};

// 3. PERFIL Y ROLES
async function loadUserProfile(user) {
  currentUser = user;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    alert("No se encontró el perfil del usuario en la tabla profiles.");
    return;
  }

  currentProfile = profile;

  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  document.getElementById("user-display").textContent = `${profile.full_name || profile.email} (${profile.role})`;

  if (profile.role !== "admin") {
    document.querySelectorAll(".admin-only").forEach(el => el.classList.add("hidden"));
  } else {
    document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
  }

  showTab("pos");
}

window.logout = async function() {
  if (supabase) await supabase.auth.signOut();
  location.reload();
};

// 4. NAVEGACIÓN Y COMPONENTES
window.showTab = function(tabName) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach(el => el.classList.remove("active"));

  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) targetTab.classList.remove("hidden");

  if (tabName === "pos") loadPOS();
  if (tabName === "inventory") loadInventory();
  if (tabName === "sales") loadSalesHistory();
  if (tabName === "dashboard") loadDashboardMetrics();
};

// 2. CARGAR HISTÓRICO DE VENTAS
window.loadSalesHistory = async function() {
    const tbody = document.getElementById("sales-table-body");
    if (!tbody) return;
  
    // Consultar ventas e incluir los datos del perfil del vendedor
    const { data: sales, error } = await supabase
      .from("sales")
      .select(`
        id,
        total_amount,
        payment_method,
        created_at,
        profiles ( full_name, email )
      `)
      .order("created_at", { ascending: false });
  
    if (error) {
      console.error("Error al cargar ventas:", error);
      return;
    }
  
    if (!sales || sales.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No hay ventas registradas aún.</td></tr>`;
      return;
    }
  
    tbody.innerHTML = sales.map(s => {
      const date = new Date(s.created_at).toLocaleString('es-MX');
      const seller = s.profiles ? (s.profiles.full_name || s.profiles.email) : 'Desconocido';
      
      return `
        <tr>
          <td>#${s.id}</td>
          <td>${date} <br><small style="color:#9ca3af;">Atendió: ${seller}</small></td>
          <td><span style="text-transform:capitalize;">${s.payment_method}</span></td>
          <td><strong>$${parseFloat(s.total_amount).toFixed(2)}</strong></td>
          <td class="admin-only ${currentProfile && currentProfile.role !== 'admin' ? 'hidden' : ''}">
            <button onclick="deleteSale(${s.id})" class="btn btn-danger btn-sm">Eliminar</button>
          </td>
        </tr>
      `;
    }).join("");
  };
  
  // 3. ELIMINAR VENTA (SOLO ADMIN)
  window.deleteSale = async function(saleId) {
    if (currentProfile.role !== "admin") {
      alert("Solo un administrador puede eliminar ventas.");
      return;
    }
  
    if (!confirm(`¿Estás seguro de eliminar la venta #${saleId}? Esto no devolverá el stock automáticamente.`)) return;
  
    const { error } = await supabase
      .from("sales")
      .delete()
      .eq("id", saleId);
  
    if (error) {
      alert("Error al eliminar venta: " + error.message);
      return;
    }
  
    alert("Venta eliminada.");
    loadSalesHistory();
    loadDashboardMetrics();
  };
  
  // 4. CARGAR MÉTRICAS EN EL DASHBOARD (ADMIN)
  window.loadDashboardMetrics = async function() {
    if (currentProfile && currentProfile.role !== "admin") return;
  
    const { data: sales, error } = await supabase
      .from("sales")
      .select("total_amount");
  
    if (error) {
      console.error("Error cargando métricas:", error);
      return;
    }
  
    const totalIncome = (sales || []).reduce((sum, s) => sum + parseFloat(s.total_amount), 0);
    const totalCount = (sales || []).length;
  
    const incomeEl = document.getElementById("kpi-income");
    const countEl = document.getElementById("kpi-count");
  
    if (incomeEl) incomeEl.textContent = `$${totalIncome.toFixed(2)}`;
    if (countEl) countEl.textContent = totalCount;
  };
  
async function loadPOS() {
  const { data: products } = await supabase.from("products").select("*");
  productsCache = products || [];

  const grid = document.getElementById("product-grid");
  if (!grid) return;

  grid.innerHTML = productsCache.map(p => `
    <div class="product-card" onclick="addToCart(${p.id})">
      <h4>${p.name}</h4>
      <p>$${p.price} / ${p.unit_type}</p>
      <small>Stock: ${p.stock_liters_or_units}</small>
    </div>
  `).join("");
}

window.addToCart = function(productId) {
  const product = productsCache.find(p => p.id === productId);
  if (!product || product.stock_liters_or_units <= 0) return alert("Sin stock disponible");

  const item = cart.find(i => i.product.id === productId);
  if (item) {
    item.quantity += 1;
  } else {
    cart.push({ product, quantity: 1 });
  }
  renderCart();
};

function renderCart() {
  const container = document.getElementById("cart-items");
  if (!container) return;

  let total = 0;
  container.innerHTML = cart.map(item => {
    const subtotal = item.quantity * item.product.price;
    total += subtotal;
    return `<div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
      <span>${item.product.name} x${item.quantity}</span>
      <span>$${subtotal.toFixed(2)}</span>
    </div>`;
  }).join("");

  document.getElementById("cart-total").textContent = `$${total.toFixed(2)}`;
}

window.checkout = async function() {
  if (cart.length === 0) return alert("El carrito está vacío");

  const total = cart.reduce((sum, item) => sum + (item.quantity * item.product.price), 0);
  const paymentMethod = document.getElementById("payment-method").value;

  const { data: sale, error } = await supabase
    .from("sales")
    .insert([{ user_id: currentUser.id, total_amount: total, payment_method: paymentMethod }])
    .select().single();

  if (error) return alert("Error al registrar venta: " + error.message);

  for (let item of cart) {
    await supabase.from("sale_items").insert([{
      sale_id: sale.id,
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price: item.product.price,
      subtotal: item.quantity * item.product.price
    }]);

    await supabase.from("products")
      .update({ stock_liters_or_units: item.product.stock_liters_or_units - item.quantity })
      .eq("id", item.product.id);
  }

  alert("¡Venta completada!");
  cart = [];
  renderCart();
  loadPOS();
};

async function loadInventory() {
  const { data: products } = await supabase.from("products").select("*");
  const tbody = document.getElementById("inventory-table-body");
  if (!tbody) return;

  tbody.innerHTML = (products || []).map(p => `
    <tr>
      <td>${p.name}</td>
      <td>$${p.price}</td>
      <td>${p.stock_liters_or_units}</td>
      <td>${p.unit_type}</td>
      <td>${p.stock_liters_or_units <= p.min_stock ? '⚠️ Stock Bajo' : 'OK'}</td>
      <td>${currentProfile.role === 'admin' ? `<button onclick="deleteProduct(${p.id})">Eliminar</button>` : 'N/A'}</td>
    </tr>
  `).join("");
}

window.deleteProduct = async function(id) {
  if (!confirm("¿Eliminar producto?")) return;
  await supabase.from("products").delete().eq("id", id);
  loadInventory();
};

// AUTO-INICIALIZADOR AL CARGAR LA PÁGINA
document.addEventListener("DOMContentLoaded", async () => {
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user) {
      await loadUserProfile(session.user);
    }
  }
});

// ABRIR Y CERRAR MODAL DE PRODUCTOS
window.openProductModal = function() {
    document.getElementById("product-modal").classList.remove("hidden");
  };
  
  window.closeProductModal = function() {
    document.getElementById("product-modal").classList.add("hidden");
    document.getElementById("create-product-form").reset();
  };
  
  // GUARDAR NUEVO PRODUCTO EN SUPABASE
  window.handleCreateProduct = async function(e) {
    if (e) e.preventDefault();
  
    if (currentProfile.role !== "admin") {
      alert("Solo los administradores pueden registrar nuevos productos");
      return;
    }
  
    const name = document.getElementById("prod-name").value.trim();
    const price = parseFloat(document.getElementById("prod-price").value);
    const stock = parseFloat(document.getElementById("prod-stock").value);
    const unit_type = document.getElementById("prod-unit").value;
    const min_stock = parseFloat(document.getElementById("prod-min-stock").value);
  
    if (!name || isNaN(price) || isNaN(stock)) {
      alert("Por favor completa los campos correctamente");
      return;
    }
  
    // Insertar en la tabla products de Supabase
    const { data, error } = await supabase
      .from("products")
      .insert([{
        name: name,
        price: price,
        stock_liters_or_units: stock,
        unit_type: unit_type,
        min_stock: min_stock
      }]);
  
    if (error) {
      alert("Error al guardar producto: " + error.message);
      return;
    }
  
    alert("¡Producto registrado con éxito!");
    closeProductModal();
    
    // Recargar la tabla de inventario si se encuentra activa
    if (typeof loadInventory === "function") {
      loadInventory();
    }
  };