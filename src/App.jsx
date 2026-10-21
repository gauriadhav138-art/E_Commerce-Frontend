// =====================================================================
//  ELITE E-COMMERCE  -  the whole React front end in ONE file (src/App.jsx)
//
//  Needs one extra package:   npm install react-router-dom
//  Backend address:           http://localhost:8000   (see BASE_URL below)
//
//  Order of this file (use the dividers to jump around):
//    Styles are in the separate file  src/App.css
//
//    1. API HELPER          5. ProductCard          9. Cart
//    2. SMALL HELPERS       6. Home                10. Orders
//    3. STORE (user, cart)  7. Product detail      11. Admin
//    4. Navbar              8. Login / Register    12. App (routes)
// =====================================================================
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";


// =====================================================================
//  API HELPER  -  the only place that talks to the FastAPI backend
// =====================================================================
// api.js  -  ONE place that talks to the FastAPI backend.
// Base URL is only the server address; every call adds its own path.
const BASE_URL = "http://localhost:8000";

async function api(path, options = {}) {
  // 1. Saved login token (empty if not logged in)
  const token = localStorage.getItem("token");

  // 2. JSON by default. For a file upload (FormData) the browser sets the header itself.
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };

  // 3. Attach the token = the "Bearer Token" you used in Postman
  if (token) headers["Authorization"] = "Bearer " + token;

  // 4. Send the request
  let response;
  try {
    response = await fetch(BASE_URL + path, { ...options, headers });
  } catch {
    // fetch itself failed = the backend is off, wrong address, or blocked by CORS
    throw new Error("Cannot reach the backend at " + BASE_URL + ". Is uvicorn running? (Check CORS too)");
  }
  const data = await response.json().catch(() => ({}));

  // 5. Backend said "error"? Turn it into a JavaScript error with its message
  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event("session-expired")); // token too old
    }
    let message = "Something went wrong";
    if (typeof data.detail === "string") message = data.detail;
    else if (Array.isArray(data.detail)) message = data.detail[0].msg;
    throw new Error(message);
  }
  return data;
}

// Short helpers so pages stay easy to read
const post = (path, body) =>
  api(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const put = (path, body) =>
  api(path, { method: "PUT", body: JSON.stringify(body) });
const del = (path) => api(path, { method: "DELETE" });
// Upload a file (and other fields) as a form
const postForm = (path, formData) => api(path, { method: "POST", body: formData });

// =====================================================================
//  SMALL HELPERS  -  money, dates, icons
// =====================================================================
// utils.js  -  small helpers used by many pages.
const ICONS = {
  Electronics: "🎧", Clothing: "👕", "Home & Kitchen": "🍳", Books: "📚", Sports: "⚽",
};
const icon = (categoryName) => ICONS[categoryName] || "📦";

// Turn the path saved in the database (/uploads/abc.png) into a full address for <img>
const imgUrl = (path) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return BASE_URL + (path.startsWith("/") ? path : "/" + path);
};

// Check a chosen picture BEFORE uploading it
const checkImage = (file) => {
  if (!file.type.startsWith("image/")) return "Please choose a picture (JPG, PNG, WebP or GIF)";
  if (file.size > 2 * 1024 * 1024) return "The picture must be smaller than 2 MB";
  return "";
};

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

// =====================================================================
//  useFetch  -  hook to load data from a GET address
// =====================================================================
// useFetch.js  -  a small hook: "load this GET address and tell me data / loading / error".

function useFetch(path) {
  // "result" remembers WHICH address it belongs to, so we know when it is out of date
  const [result, setResult] = useState({ path: null, data: null, error: "" });
  const [version, setVersion] = useState(0);   // adding 1 loads the same address again

  useEffect(() => {
    let ignore = false;                          // true if the page changed before the answer came
    api(path)
      .then((data) => { if (!ignore) setResult({ path, data, error: "" }); })
      .catch((e) => { if (!ignore) setResult({ path, data: null, error: e.message }); });
    return () => { ignore = true; };
  }, [path, version]);

  const isCurrent = result.path === path;
  return {
    data: result.data,                           // keeps the old data while a new address loads (no flicker)
    error: isCurrent ? result.error : "",
    loading: !isCurrent,
    reload: () => setVersion((v) => v + 1),      // call reload() to fetch again
  };
}

// =====================================================================
//  STORE  -  logged-in user, cart and pop-up messages shared by all pages
// =====================================================================
// Store.jsx  -  data that EVERY page needs: who is logged in, the cart, and pop-up messages.
// Any component can read it with:  const { user, cart } = useStore();

const StoreContext = createContext();
const useStore = () => useContext(StoreContext);

const EMPTY_CART = { items: [], total: 0 };

function StoreProvider({ children }) {
  // Start with the user saved in the browser (so refresh keeps you logged in)
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const [cart, setCart] = useState(EMPTY_CART);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load the cart from  GET /api/cart
  const refreshCart = useCallback(async () => {
    if (!localStorage.getItem("token")) { setCart(EMPTY_CART); return; }
    try { setCart(await api("/api/cart")); } catch { /* ignore */ }
  }, []);

  // Called after  POST /api/login  succeeds
  const login = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setCart(EMPTY_CART);
  }, []);

  // Add to cart  ->  POST /api/cart  (runs the sp_add_to_cart procedure)
  const addToCart = async (productId, quantity = 1, name = "Item") => {
    try {
      await post("/api/cart", { product_id: productId, quantity });
      await refreshCart();
      showToast(`${name} added to cart`);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // When a user is logged in, load their cart  (logout already empties it)
  useEffect(() => {
    if (!user) return;
    let ignore = false;
    api("/api/cart")
      .then((data) => { if (!ignore) setCart(data); })
      .catch(() => {});
    return () => { ignore = true; };
  }, [user]);

  // If the backend says "token expired", log the user out
  useEffect(() => {
    const onExpired = () => { logout(); showToast("Session expired. Please login again.", "error"); };
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, [logout, showToast]);

  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <StoreContext.Provider value={{ user, login, logout, cart, cartCount, refreshCart, addToCart, toast, showToast }}>
      {children}
    </StoreContext.Provider>
  );
}

// =====================================================================
//  COMPONENT: Navbar
// =====================================================================
function Navbar() {
  const { user, logout, cartCount } = useStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="logo"><span className="logo-mark">E</span>ELITE</Link>

        <nav className="nav-links">
          <NavLink to="/" end>Shop</NavLink>
          {user?.role === "customer" && <NavLink to="/orders">My Orders</NavLink>}
          {user?.role === "seller" && <NavLink to="/seller">Seller Dashboard</NavLink>}
          {user?.role === "admin" && <NavLink to="/admin">Admin Dashboard</NavLink>}
        </nav>

        <div className="nav-actions">
          {user ? (
            <>
              {user.role === "customer" && (
                <Link to="/cart" className="cart-link">🛒 Cart <span className="count">{cartCount}</span></Link>
              )}
              <span className="hello">Hi, {user.name.split(" ")[0]}</span>
              <span className={`role-badge role-${user.role}`}>{user.role}</span>
              <button className="btn btn-outline btn-small" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline btn-small">Login</Link>
              <Link to="/register" className="btn btn-small">Register</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// =====================================================================
//  COMPONENT: ProductCard + ProductImage
// =====================================================================
// Shows the product photo (image_url) or an emoji if there is no photo
function ProductImage({ p }) {
  const src = imgUrl(p.image_url);
  return (
    <div className="product-img">
      {src ? <img src={src} alt={p.product_name} /> : <span>{icon(p.category_name)}</span>}
    </div>
  );
}

function ProductCard({ p }) {
  const { user, addToCart, showToast } = useStore();
  const navigate = useNavigate();
  const stock = p.stock ?? 0;

  const handleAdd = () => {
    if (!user) { navigate("/login"); return; }   // must login before using the cart
    if (user.role !== "customer") { showToast("Please login with a customer account to buy", "error"); return; }
    addToCart(p.product_id, 1, p.product_name);
  };

  return (
    <article className="card product">
      {stock > 0 && stock <= 10 && <span className="tag tag-warn">Only {stock} left</span>}
      {stock <= 0 && <span className="tag tag-out">Out of stock</span>}

      <Link to={`/product/${p.product_id}`}>
        <ProductImage p={p} />
        <p className="muted small">{p.category_name}</p>
        <h4>{p.product_name}</h4>
      </Link>

      <div className="price-row">
        <strong className="price">{money(p.price)}</strong>
        <button className="icon-btn" disabled={stock <= 0} onClick={handleAdd}
                aria-label={`Add ${p.product_name} to cart`}>+</button>
      </div>
    </article>
  );
}

// =====================================================================
//  PAGE: Home
// =====================================================================
// Home page  ->  GET /api/categories  and  GET /api/products?category=..&search=..

const TILE_COLORS = ["#cfeedd", "#cfe3f7", "#f6c9d3", "#efe8b8", "#bfe8e1", "#f3d4cf"];

function Home() {
  const [category, setCategory] = useState("");   // "" means all categories
  const [search, setSearch] = useState("");

  const { data: categories } = useFetch("/api/categories");

  // Build the address, e.g.  /api/products?category=Books&search=sql
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  const { data: products, error } = useFetch("/api/products?" + params.toString());

  // Safety net: whatever the server sends, show ONLY the chosen category and search word
  const shown = (products || []).filter(
    (p) => (!category || p.category_name === category) && p.product_name.toLowerCase().includes(search.toLowerCase())
  );

  const chooseCategory = (name) => {
    setCategory(name);
    document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <section className="hero">
        <div>
          <span className="pill">New arrivals</span>
          <h1>Everything you love, one trusted store</h1>
          <p>Electronics, fashion, home essentials and books from verified sellers.</p>
          <input className="hero-search" placeholder="Search for products..." aria-label="Search products"
                 value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="hero-art" aria-hidden="true">🛍️</div>
      </section>

      <section className="section">
        <h2>Shop by category</h2>
        <div className="cat-grid">
          {(categories || []).map((c, i) => (
            <button key={c.category_id} className="cat-tile" style={{ background: TILE_COLORS[i % TILE_COLORS.length] }}
                    onClick={() => chooseCategory(c.category_name)}>
              <span>{icon(c.category_name)}</span>
              <small>{c.category_name}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="section" id="shop">
        <div className="section-head">
          <h2>
            {category || "All products"}{" "}
            <span className="muted small">({shown.length} {shown.length === 1 ? "product" : "products"})</span>
          </h2>
          {(category || search) && (
            <button className="link-btn plain" onClick={() => { setCategory(""); setSearch(""); }}>Clear filters</button>
          )}
        </div>

        <div className="chips">
          {["", ...(categories || []).map((c) => c.category_name)].map((name) => (
            <button key={name} className={category === name ? "chip active" : "chip"} onClick={() => setCategory(name)}>
              {name || "All"}
            </button>
          ))}
        </div>

        {error && <p className="state error-text">{error}. Is the backend running?</p>}
        {!products && !error && <p className="state">Loading products...</p>}
        {products && shown.length === 0 && <p className="state">No products found in this category.</p>}

        <div className="grid">
          {shown.map((p) => <ProductCard key={p.product_id} p={p} />)}
        </div>
      </section>
    </>
  );
}

// =====================================================================
//  PAGE: Product detail
// =====================================================================
// One product  ->  GET /api/products/{id}

function ProductDetail() {
  const { id } = useParams();                      // the number in /product/5
  const { data: p, error, loading } = useFetch(`/api/products/${id}`);
  const { user, addToCart, showToast } = useStore();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);

  if (loading) return <p className="state">Loading...</p>;
  if (error) return <p className="state error-text">{error}</p>;

  const stock = p.stock ?? 0;

  const handleAdd = () => {
    if (!user) { navigate("/login"); return; }
    if (user.role !== "customer") { showToast("Please login with a customer account to buy", "error"); return; }
    addToCart(p.product_id, quantity, p.product_name);
  };

  return (
    <div className="detail">
      <Link to="/" className="muted">← Back to shop</Link>
      <div className="detail-grid">
        <div className="card"><ProductImage p={p} /></div>
        <div>
          <span className="pill">{p.category_name}</span>
          <h1>{p.product_name}</h1>
          <p className="muted">Sold by {p.seller_name}</p>
          <p className="big-price">{money(p.price)}</p>
          <p>{p.description}</p>
          <p className={stock > 0 ? "ok-text" : "error-text"}>
            {stock > 0 ? `In stock (${stock} available)` : "Out of stock"}
          </p>

          {stock > 0 && (
            <div className="row">
              <div className="qty">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
                <span>{quantity}</span>
                <button onClick={() => setQuantity(Math.min(stock, quantity + 1))}>+</button>
              </div>
              <button className="btn" onClick={handleAdd}>Add to cart</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
//  PAGE: Login
// =====================================================================
// Login  ->  POST /api/login  (returns a token + user)

// The three kinds of account. The chosen one is sent to the backend,
// which checks it matches the real role saved in the users table.
const ROLE_TABS = [
  { key: "customer", label: "Customer", icon: "🛒" },
  { key: "seller", label: "Seller", icon: "🏪" },
  { key: "admin", label: "Admin", icon: "🛡️" },
];

// Where each kind of user lands after logging in
const homeFor = (role) => (role === "admin" ? "/admin" : role === "seller" ? "/seller" : "/");

function Login() {
  const { login, showToast } = useStore();
  const navigate = useNavigate();
  const [role, setRole] = useState("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();                 // stop the page from reloading
    setBusy(true);
    setError("");
    try {
      const data = await post("/api/login", { email, password, role });
      login(data);                      // save token + user
      showToast(`Welcome back, ${data.user.name}!`);
      navigate(homeFor(data.user.role));
    } catch (err) {
      setError(err.message);            // e.g. "Wrong email or password"
    } finally {
      setBusy(false);
    }
  };

  const current = ROLE_TABS.find((t) => t.key === role);

  return (
    <div className="auth-card card">
      <h2>{current.label} login</h2>

      <div className="role-tabs" role="tablist">
        {ROLE_TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={role === t.key}
                  className={role === t.key ? "role-tab active" : "role-tab"}
                  onClick={() => { setRole(t.key); setError(""); }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <label className="field">Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">Password
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-block" disabled={busy}>{busy ? "Please wait..." : `Login as ${current.label}`}</button>
      </form>

      {role === "admin"
        ? <p className="muted center small">Admin accounts are created by the store owner.</p>
        : <p className="muted center">New here? <Link to="/register">Create an account</Link></p>}
    </div>
  );
}

// =====================================================================
//  PAGE: Register
// =====================================================================
// Register  ->  POST /api/register, then log in automatically with POST /api/login

function Register() {
  const { login, showToast } = useStore();
  const navigate = useNavigate();
  const [role, setRole] = useState("customer");      // "customer" or "seller"
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // One function updates whichever field was typed in
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/register", { ...form, role });
      const data = await post("/api/login", { email: form.email, password: form.password, role });
      login(data);
      showToast("Account created. Welcome!");
      navigate(homeFor(data.user.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card card">
      <h2>Create account</h2>

      <div className="role-tabs" role="tablist">
        {ROLE_TABS.filter((t) => t.key !== "admin").map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={role === t.key}
                  className={role === t.key ? "role-tab active" : "role-tab"} onClick={() => setRole(t.key)}>
            <span>{t.icon}</span>{t.key === "customer" ? "I want to buy" : "I want to sell"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <label className="field">{role === "seller" ? "Shop / seller name" : "Full name"}
          <input name="name" required value={form.name} onChange={change} />
        </label>
        <label className="field">Email
          <input name="email" type="email" required value={form.email} onChange={change} />
        </label>
        <label className="field">Phone
          <input name="phone" value={form.phone} onChange={change} />
        </label>
        <label className="field">Password (min 6 characters)
          <input name="password" type="password" minLength={6} required value={form.password} onChange={change} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-block" disabled={busy}>
          {busy ? "Please wait..." : role === "seller" ? "Register as seller" : "Register"}
        </button>
      </form>
      <p className="muted center">Already have an account? <Link to="/login">Login</Link></p>
    </div>
  );
}

// =====================================================================
//  PAGE: Cart
// =====================================================================
// Cart  ->  GET /api/cart, POST /api/cart, DELETE /api/cart/{id}, POST /api/orders

function Cart() {
  const { cart, refreshCart, showToast } = useStore();
  const [busy, setBusy] = useState(false);

  // Runs an action, then reloads the cart, and shows an error if it fails
  const run = async (action, message) => {
    setBusy(true);
    try {
      await action();
      await refreshCart();
      if (message) showToast(message);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const increase = (item) => run(() => post("/api/cart", { product_id: item.product_id, quantity: 1 }));

  // The backend has no "decrease" route, so: remove the item, then add it back with one less
  const decrease = (item) =>
    run(async () => {
      await del(`/api/cart/${item.product_id}`);
      if (item.quantity > 1) {
        await post("/api/cart", { product_id: item.product_id, quantity: item.quantity - 1 });
      }
    });

  const remove = (item) => run(() => del(`/api/cart/${item.product_id}`), "Item removed");

  const items = [...cart.items].sort((a, b) => a.product_id - b.product_id);

  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🛒</div>
        <h2>Your cart is empty</h2>
        <Link to="/" className="btn">Start shopping</Link>
      </div>
    );
  }

  return (
    <>
      <h1>Your cart</h1>
      <div className="cart-layout">
        <div>
          {items.map((item) => (
            <div className="card cart-row" key={item.product_id}>
              <div className="cart-icon">
                {imgUrl(item.image_url) ? <img src={imgUrl(item.image_url)} alt={item.product_name} /> : "📦"}
              </div>
              <div className="grow">
                <h4>{item.product_name}</h4>
                <p className="muted small">{money(item.price)} each</p>
              </div>
              <div className="qty">
                <button disabled={busy} onClick={() => decrease(item)}>−</button>
                <span>{item.quantity}</span>
                <button disabled={busy} onClick={() => increase(item)}>+</button>
              </div>
              <strong className="line-total">{money(item.item_total)}</strong>
              <button className="link-btn" disabled={busy} onClick={() => remove(item)}>Remove</button>
            </div>
          ))}
        </div>

        <aside className="card summary">
          <h3>Order summary</h3>
          <div className="summary-row"><span>Items</span><span>{items.reduce((s, i) => s + i.quantity, 0)}</span></div>
          <div className="summary-row total"><span>Total</span><span>{money(cart.total)}</span></div>
          <Link to="/checkout" className="btn btn-block">Proceed to checkout</Link>
          <p className="muted small center">You choose how to pay in the next step</p>
        </aside>
      </div>
    </>
  );
}

// =====================================================================
//  PAGE: My orders
// =====================================================================
// My orders  ->  GET /api/orders, GET /api/orders/{id}, POST /api/orders/{id}/cancel

// =====================================================================
//  PAGE: Checkout  (choose how to pay  ->  POST /api/checkout)
//  The backend checks the form, then the procedure sp_checkout saves the
//  order AND the payment in one transaction.
// =====================================================================
const PAYMENT_METHODS = [
  { key: "UPI", label: "UPI", icon: "📱", note: "Google Pay, PhonePe, Paytm" },
  { key: "Card", label: "Credit / Debit card", icon: "💳", note: "Visa, Mastercard, RuPay" },
  { key: "NetBanking", label: "Net banking", icon: "🏦", note: "Pay from your bank account" },
  { key: "COD", label: "Cash on delivery", icon: "💵", note: "Pay when your order arrives" },
];
const BANKS = ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank"];
const payLabel = (key) => (PAYMENT_METHODS.find((m) => m.key === key) || { label: key }).label;

function Checkout() {
  const { cart, refreshCart, showToast } = useStore();
  const [method, setMethod] = useState("UPI");
  const [form, setForm] = useState({ upi_id: "", card_number: "", card_name: "", expiry: "", cvv: "", bank: BANKS[0] });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);          // filled after the order is placed

  // Update one field. Card number, expiry and CVV are tidied up while typing.
  const change = (e) => {
    const name = e.target.name;
    let value = e.target.value;
    if (name === "card_number") value = value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
    if (name === "expiry") {
      value = value.replace(/\D/g, "").slice(0, 4);
      if (value.length > 2) value = value.slice(0, 2) + "/" + value.slice(2);
    }
    if (name === "cvv") value = value.replace(/\D/g, "").slice(0, 4);
    setForm({ ...form, [name]: value });
  };

  const pay = async (e) => {
    e.preventDefault();

    // send ONLY the fields of the chosen method
    const body = { method };
    if (method === "UPI") body.upi_id = form.upi_id;
    if (method === "Card") Object.assign(body, { card_number: form.card_number, card_name: form.card_name, expiry: form.expiry, cvv: form.cvv });
    if (method === "NetBanking") body.bank = form.bank;

    setBusy(true);
    try {
      const result = await post("/api/checkout", body);
      await refreshCart();
      setDone(result);
    } catch (err) {
      showToast(err.message, "error");             // e.g. "This card has expired"
    } finally {
      setBusy(false);
    }
  };

  const items = [...cart.items].sort((a, b) => a.product_id - b.product_id);

  if (done) {
    const paid = done.payment.status === "Paid";
    return (
      <div className="success-card card">
        <div className="success-icon">✅</div>
        <h2>Order #{done.order_id} placed!</h2>
        <p>
          {paid
            ? `We received your payment of ${money(done.payment.amount)}.`
            : `Please keep ${money(done.payment.amount)} ready to pay in cash on delivery.`}
        </p>
        <p className="muted small">
          Payment: {payLabel(done.payment.method)} · {done.payment.status}
          {done.payment.transaction_id && <><br />Transaction ID: <strong>{done.payment.transaction_id}</strong></>}
        </p>
        <div className="row center-row">
          <Link to="/orders" className="btn">View my orders</Link>
          <Link to="/" className="btn btn-outline">Continue shopping</Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🛒</div>
        <h2>Your cart is empty</h2>
        <Link to="/" className="btn">Start shopping</Link>
      </div>
    );
  }

  return (
    <>
      <h1>Checkout</h1>
      <div className="cart-layout">
        <form className="card box" onSubmit={pay}>
          <h3>Choose a payment method</h3>

          <div className="pay-options">
            {PAYMENT_METHODS.map((m) => (
              <label key={m.key} className={method === m.key ? "pay-option active" : "pay-option"}>
                <input type="radio" name="method" value={m.key} checked={method === m.key} onChange={() => setMethod(m.key)} />
                <span className="pay-icon">{m.icon}</span>
                <span><strong>{m.label}</strong><small className="muted">{m.note}</small></span>
              </label>
            ))}
          </div>

          <div className="pay-fields">
            {method === "UPI" && (
              <label className="field">UPI ID
                <input name="upi_id" placeholder="name@upi" required value={form.upi_id} onChange={change} />
              </label>
            )}

            {method === "Card" && (
              <>
                <label className="field">Card number
                  <input name="card_number" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456"
                         required minLength={19} value={form.card_number} onChange={change} />
                </label>
                <label className="field">Name on card
                  <input name="card_name" autoComplete="cc-name" required value={form.card_name} onChange={change} />
                </label>
                <div className="two-cols">
                  <label className="field">Expiry (MM/YY)
                    <input name="expiry" inputMode="numeric" placeholder="12/30" required minLength={5} value={form.expiry} onChange={change} />
                  </label>
                  <label className="field">CVV
                    <input name="cvv" type="password" inputMode="numeric" autoComplete="cc-csc" required minLength={3} value={form.cvv} onChange={change} />
                  </label>
                </div>
              </>
            )}

            {method === "NetBanking" && (
              <label className="field">Choose your bank
                <select name="bank" value={form.bank} onChange={change}>
                  {BANKS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </label>
            )}

            {method === "COD" && (
              <p className="muted">You will pay {money(cart.total)} in cash when your order is delivered.</p>
            )}
          </div>

          <p className="muted small">🔒 Demo payment: no real money is charged, and card details are never saved.</p>
          <button className="btn btn-block" disabled={busy}>
            {busy ? "Processing..." : method === "COD" ? "Place order" : `Pay ${money(cart.total)}`}
          </button>
        </form>

        <aside className="card summary">
          <h3>Order summary</h3>
          {items.map((item) => (
            <div className="summary-row" key={item.product_id}>
              <span>{item.product_name} × {item.quantity}</span><span>{money(item.item_total)}</span>
            </div>
          ))}
          <div className="summary-row total"><span>Total</span><span>{money(cart.total)}</span></div>
          <Link to="/cart" className="link-btn plain">← Edit cart</Link>
        </aside>
      </div>
    </>
  );
}

function Orders() {
  const { showToast } = useStore();
  const { data: orders, error, loading, reload } = useFetch("/api/orders");
  const [openId, setOpenId] = useState(null);      // which order is expanded
  const [details, setDetails] = useState({});      // items + payment of each opened order

  const toggle = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!details[id]) {
      try {
        const data = await api(`/api/orders/${id}`);
        setDetails((prev) => ({ ...prev, [id]: data }));
      } catch (e) {
        showToast(e.message, "error");
      }
    }
  };

  const cancel = async (id) => {
    if (!window.confirm("Cancel this order?")) return;
    try {
      await post(`/api/orders/${id}/cancel`);     // runs sp_cancel_order (stock goes back, payment refunded)
      showToast("Order cancelled");
      setDetails({});
      reload();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  if (loading && !orders) return <p className="state">Loading orders...</p>;
  if (error) return <p className="state error-text">{error}</p>;

  if (orders.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">📦</div>
        <h2>No orders yet</h2>
        <Link to="/" className="btn">Shop now</Link>
      </div>
    );
  }

  return (
    <>
      <h1>My orders</h1>
      {orders.map((o) => (
        <div className="card order" key={o.order_id}>
          <div className="order-head">
            <div>
              <strong>Order #{o.order_id}</strong>
              <p className="muted small">{formatDate(o.order_date)}</p>
            </div>
            <span className={`pill status-${o.status}`}>{o.status}</span>
            <div className="small">
              {o.payment_method ? (
                <><span className={`pill pay-${o.payment_status}`}>{o.payment_status}</span> <span className="muted">{payLabel(o.payment_method)}</span></>
              ) : (
                <span className="muted">No payment record</span>
              )}
            </div>
            <strong>{money(o.total_amount)}</strong>
            <div className="row">
              <button className="btn btn-outline btn-small" onClick={() => toggle(o.order_id)}>
                {openId === o.order_id ? "Hide" : "Details"}
              </button>
              {(o.status === "Pending" || o.status === "Confirmed") && (
                <button className="btn btn-danger btn-small" onClick={() => cancel(o.order_id)}>Cancel</button>
              )}
            </div>
          </div>

          {openId === o.order_id && (
            <div className="order-items">
              {!details[o.order_id] ? <p className="muted">Loading...</p> : (
                <>
                  <table>
                    <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                    <tbody>
                      {details[o.order_id].items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.product_name}</td><td>{it.quantity}</td>
                          <td>{money(it.price)}</td><td>{money(it.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {details[o.order_id].payment && (
                    <div className="pay-info">
                      <strong>Payment:</strong> {payLabel(details[o.order_id].payment.method)} · {details[o.order_id].payment.status} · {money(details[o.order_id].payment.amount)}
                      {details[o.order_id].payment.payment_details && <span className="muted"> ({details[o.order_id].payment.payment_details})</span>}
                      {details[o.order_id].payment.transaction_id && <div className="muted small">Transaction ID: {details[o.order_id].payment.transaction_id}</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

// =====================================================================
//  PAGE: Admin dashboard
// =====================================================================
// Admin dashboard. Every tab uses one or more /api/admin/... routes.

// ----- small reusable table. columns = [ [key, heading, type?], ... ]
const show = (value, type) =>
  type === "money" ? money(value) : type === "date" ? formatDate(value) : type === "datetime" ? formatDateTime(value) : value;

function Table({ rows, columns }) {
  if (!rows || rows.length === 0) return <p className="state">No data.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((c) => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c[0]}>{show(r[c[0]], c[2])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A titled box that loads a GET route and shows it as a table
function Box({ title, note, path, columns }) {
  const { data, loading, error } = useFetch(path);
  return (
    <section className="card box">
      <h3>{title}</h3>
      {note && <p className="muted small">{note}</p>}
      {loading && !data ? <p className="state">Loading...</p> : error ? <p className="error-text">{error}</p> : <Table rows={data} columns={columns} />}
    </section>
  );
}

// ================= TAB 1: ORDERS  ->  GET /api/admin/orders, PUT .../status
function OrdersTab() {
  const { showToast } = useStore();
  const { data, loading, error, reload } = useFetch("/api/admin/orders");
  const STATUSES = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"];

  const changeStatus = async (id, status) => {
    try {
      await put(`/api/admin/orders/${id}/status`, { status });
      showToast(`Order #${id} is now ${status}`);
      reload();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  if (loading && !data) return <p className="state">Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="table-wrap card">
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.order_id}>
              <td>#{o.order_id}</td><td>{o.customer}</td><td>{formatDate(o.order_date)}</td>
              <td>{o.total_items}</td><td>{money(o.total_amount)}</td>
              <td>
                {o.payment_method
                  ? <><span className={`pill pay-${o.payment_status}`}>{o.payment_status}</span> <span className="muted small">{payLabel(o.payment_method)}</span></>
                  : <span className="muted small">—</span>}
              </td>
              <td>
                <select value={o.status} onChange={(e) => changeStatus(o.order_id, e.target.value)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ================= TAB 2: PRODUCTS & STOCK  ->  PUT .../price, PUT .../restock
function ProductRow({ p, onDone, base }) {
  const { showToast } = useStore();
  const [price, setPrice] = useState(Number(p.price));
  const [qty, setQty] = useState(10);

  const save = async (action, message) => {
    try {
      await action();
      showToast(message);
      onDone();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // Upload a new photo for this product  ->  POST /api/{admin|seller}/products/{id}/image
  const changePhoto = (e) => {
    const file = e.target.files[0];
    e.target.value = "";                      // lets you pick the same file again later
    if (!file) return;
    const problem = checkImage(file);
    if (problem) { showToast(problem, "error"); return; }
    const body = new FormData();
    body.append("image", file);
    save(() => postForm(`/api/${base}/products/${p.product_id}/image`, body), "Photo updated");
  };

  const src = imgUrl(p.image_url);

  return (
    <tr>
      <td>
        <div className="row">
          {src ? <img className="thumb" src={src} alt="" /> : <span className="thumb">{icon(p.category_name)}</span>}
          <span>{p.product_name}</span>
        </div>
      </td>
      <td>{p.category_name}</td>
      <td className={p.stock <= 10 ? "error-text" : ""}>{p.stock}</td>
      <td>
        <div className="row">
          <input className="mini" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          <button className="btn btn-small" onClick={() => save(() => put(`/api/${base}/products/${p.product_id}/price`, { price: Number(price) }), "Price updated")}>Save</button>
        </div>
      </td>
      <td>
        <div className="row">
          <input className="mini" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button className="btn btn-small" onClick={() => save(() => put(`/api/${base}/inventory/${p.product_id}/restock`, { quantity: Number(qty) }), `Added ${qty} to stock`)}>Restock</button>
        </div>
      </td>
      <td>
        <label className="btn btn-outline btn-small file-btn">
          {src ? "Change" : "Upload"}
          <input type="file" accept="image/*" hidden onChange={changePhoto} />
        </label>
      </td>
    </tr>
  );
}

function ProductsTab() {
  const { data, loading, error, reload } = useFetch("/api/products");
  if (loading && !data) return <p className="state">Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  return (
    <div className="table-wrap card">
      <table>
        <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Price (₹)</th><th>Add stock</th><th>Photo</th></tr></thead>
        <tbody>{data.map((p) => <ProductRow key={p.product_id} p={p} onDone={reload} base="admin" />)}</tbody>
      </table>
    </div>
  );
}

// ================= TAB 3: ADD PRODUCT  ->  POST /api/admin/products
function AddProductTab({ base }) {
  const { showToast } = useStore();
  const { data: categories } = useFetch("/api/categories");
  const empty = { category_id: "", product_name: "", description: "", price: "", quantity: 0, reorder_level: 10 };
  const [form, setForm] = useState(empty);
  const [image, setImage] = useState(null);        // the chosen picture file
  const [preview, setPreview] = useState("");      // what we show before uploading
  const [fileKey, setFileKey] = useState(0);       // changing this clears the file box
  const [busy, setBusy] = useState(false);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const pickImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const problem = checkImage(file);
    if (problem) { showToast(problem, "error"); e.target.value = ""; return; }
    setImage(file);
    const reader = new FileReader();               // reads the file so we can preview it
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = async (e) => {
    e.preventDefault();
    // A form that can carry a FILE: FormData
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.append(key, value));
    if (image) body.append("image", image);

    setBusy(true);
    try {
      await postForm(`/api/${base}/products`, body);
      showToast(image ? "Product added with photo" : "Product added");
      setForm(empty);
      setImage(null);
      setPreview("");
      setFileKey(fileKey + 1);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card box form-grid" onSubmit={submit}>
      <label className="field">Category
        <select name="category_id" required value={form.category_id} onChange={change}>
          <option value="">Choose...</option>
          {(categories || []).map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
        </select>
      </label>
      <label className="field">Product name
        <input name="product_name" required value={form.product_name} onChange={change} />
      </label>
      <label className="field">Price (₹)
        <input name="price" type="number" min="1" step="0.01" required value={form.price} onChange={change} />
      </label>
      <label className="field">Starting stock
        <input name="quantity" type="number" min="0" value={form.quantity} onChange={change} />
      </label>
      <label className="field">Reorder level
        <input name="reorder_level" type="number" min="0" value={form.reorder_level} onChange={change} />
      </label>
      <label className="field full">Description
        <textarea name="description" rows="3" value={form.description} onChange={change} />
      </label>

      <div className="field full">
        Product photo (optional)
        <label className="upload-box">
          <span className="upload-preview">
            {preview ? <img src={preview} alt="Preview" /> : "📷"}
          </span>
          <span>
            <strong>{image ? image.name : "Click to choose a photo"}</strong>
            <small className="muted"> JPG, PNG, WebP or GIF, up to 2 MB</small>
          </span>
          <input key={fileKey} type="file" accept="image/*" hidden onChange={pickImage} />
        </label>
      </div>

      <button className="btn full" disabled={busy}>{busy ? "Saving..." : "Add product"}</button>
    </form>
  );
}

// ================= TAB 4: REPORTS & TOOLS  (views, procedure, triggers, cursor)
function ReportsTab() {
  const { showToast } = useStore();
  const [from, setFrom] = useState("2025-03-01");
  const [to, setTo] = useState("2025-03-31");
  const [range, setRange] = useState({ from: "2025-03-01", to: "2025-03-31" });
  const [days, setDays] = useState(30);

  const cleanup = async () => {
    if (!window.confirm(`Cancel all orders that are still Pending after ${days} days?`)) return;
    try {
      const r = await post(`/api/admin/cancel-old-pending?days=${days}`);   // runs the CURSOR procedure
      showToast(`${r.orders_cancelled} order(s) cancelled`);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  return (
    <div className="admin-grid">
      <Box title="Sales by category" note="From view vw_sales_by_category" path="/api/admin/sales-by-category"
           columns={[["category_name", "Category"], ["units_sold", "Units"], ["revenue", "Revenue", "money"]]} />

      <Box title="Low stock products" note="From view vw_low_stock" path="/api/admin/low-stock"
           columns={[["product_name", "Product"], ["quantity", "In stock"], ["reorder_level", "Reorder level"]]} />

      <section className="card box">
        <h3>Sales report by date</h3>
        <p className="muted small">Runs stored procedure sp_sales_report</p>
        <div className="row">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn btn-small" onClick={() => setRange({ from, to })}>Run</button>
        </div>
        <ReportTable range={range} />
      </section>

      <Box title="Stock alerts" note="Written automatically by a trigger" path="/api/admin/stock-alerts"
           columns={[["product_id", "Product ID"], ["quantity_left", "Left"], ["alert_time", "When", "datetime"]]} />

      <Box title="Payments" note="Online payments are Paid at once. Cash on delivery stays Pending until the order is Delivered."
           path="/api/admin/payments"
           columns={[["payment_id", "ID"], ["order_id", "Order"], ["customer", "Customer"], ["method", "Method"],
                     ["amount", "Amount", "money"], ["status", "Status"], ["transaction_id", "Transaction"], ["created_at", "When", "datetime"]]} />

      <Box title="Price history" note="Written automatically by a trigger" path="/api/admin/price-history"
           columns={[["product_name", "Product"], ["old_price", "Old", "money"], ["new_price", "New", "money"], ["changed_at", "Changed", "datetime"]]} />

      <section className="card box">
        <h3>Cancel old pending orders</h3>
        <p className="muted small">Runs the cursor procedure. Stock of those orders is returned.</p>
        <div className="row">
          <input className="mini" type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} />
          <span>days old</span>
          <button className="btn btn-danger btn-small" onClick={cleanup}>Run cleanup</button>
        </div>
      </section>
    </div>
  );
}

function ReportTable({ range }) {
  const { data, error } = useFetch(`/api/admin/sales-report?from=${range.from}&to=${range.to}`);
  if (error) return <p className="error-text">{error}</p>;
  return <Table rows={data} columns={[["category_name", "Category"], ["units_sold", "Units"], ["revenue", "Revenue", "money"]]} />;
}

// ================= THE PAGE
function Admin() {
  const { user } = useStore();
  const [tab, setTab] = useState("orders");

  if (user?.role !== "admin") {
    return (
      <div className="empty">
        <div className="empty-icon">🔒</div>
        <h2>Admin access only</h2>
        <Link to="/" className="btn">Go home</Link>
      </div>
    );
  }

  const TABS = [["orders", "Orders"], ["products", "Products & stock"], ["add", "Add product"], ["reports", "Reports & tools"]];

  return (
    <>
      <h1>Admin dashboard</h1>
      <div className="chips">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? "chip active" : "chip"} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === "orders" && <OrdersTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "add" && <AddProductTab base="admin" />}
      {tab === "reports" && <ReportsTab />}
    </>
  );
}

// =====================================================================
//  PAGE: Seller dashboard  (a seller sees and edits only HIS OWN products)
// =====================================================================
function SellerProductsTab() {
  const { data, loading, error, reload } = useFetch("/api/seller/products");
  if (loading && !data) return <p className="state">Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (data.length === 0) return <p className="state">You have no products yet. Use the "Add product" tab.</p>;
  return (
    <div className="table-wrap card">
      <table>
        <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Price (₹)</th><th>Add stock</th><th>Photo</th></tr></thead>
        <tbody>{data.map((p) => <ProductRow key={p.product_id} p={p} onDone={reload} base="seller" />)}</tbody>
      </table>
    </div>
  );
}

function SellerSalesTab() {
  const { data, loading, error } = useFetch("/api/seller/sales");
  if (loading && !data) return <p className="state">Loading...</p>;
  if (error) return <p className="error-text">{error}</p>;

  // cancelled orders do not count as sales
  const real = data.filter((r) => r.status !== "Cancelled");
  const revenue = real.reduce((sum, r) => sum + Number(r.line_total), 0);
  const units = real.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <>
      <div className="stats">
        <div className="card stat"><span className="muted small">Revenue</span><strong>{money(revenue)}</strong></div>
        <div className="card stat"><span className="muted small">Units sold</span><strong>{units}</strong></div>
        <div className="card stat"><span className="muted small">Orders</span><strong>{new Set(real.map((r) => r.order_id)).size}</strong></div>
      </div>
      <section className="card box">
        <h3>Orders containing your products</h3>
        <Table rows={data} columns={[["order_id", "Order"], ["order_date", "Date", "date"], ["customer", "Customer"],
          ["product_name", "Product"], ["quantity", "Qty"], ["line_total", "Total", "money"], ["status", "Status"]]} />
      </section>
    </>
  );
}

function Seller() {
  const { user } = useStore();
  const [tab, setTab] = useState("products");

  if (user?.role !== "seller") {
    return (
      <div className="empty">
        <div className="empty-icon">🔒</div>
        <h2>Seller access only</h2>
        <p className="muted">Please login with a seller account.</p>
        <Link to="/login" className="btn">Go to login</Link>
      </div>
    );
  }

  const TABS = [["products", "My products"], ["add", "Add product"], ["sales", "My sales"]];

  return (
    <>
      <h1>Seller dashboard</h1>
      <div className="chips">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? "chip active" : "chip"} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === "products" && <SellerProductsTab />}
      {tab === "add" && <AddProductTab base="seller" />}
      {tab === "sales" && <SellerSalesTab />}
    </>
  );
}

// =====================================================================
//  LAYOUT + ROUTES (which URL shows which page)
// =====================================================================
// App.jsx  -  the layout (navbar + page + footer) and the list of pages (routes).

// Pages that need a login: if not logged in, go to the login page
function RequireLogin({ children }) {
  const { user } = useStore();
  return user ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  const { toast } = useStore();

  return (
    <>
      <div className="topbar">Free delivery on orders above ₹999</div>
      <Navbar />

      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/cart" element={<RequireLogin><Cart /></RequireLogin>} />
          <Route path="/checkout" element={<RequireLogin><Checkout /></RequireLogin>} />
          <Route path="/orders" element={<RequireLogin><Orders /></RequireLogin>} />
          <Route path="/admin" element={<RequireLogin><Admin /></RequireLogin>} />
          <Route path="/seller" element={<RequireLogin><Seller /></RequireLogin>} />
          <Route path="*" element={<p className="state">Page not found.</p>} />
        </Routes>
      </main>

      <footer className="footer">
        <strong>ELITE</strong> &middot; Quality products, delivered to your door.
      </footer>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}

// =====================================================================
//  THE APP  -  wraps everything with the router, the store and the styles
// =====================================================================
export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <AppRoutes />
      </StoreProvider>
    </BrowserRouter>
  );
}