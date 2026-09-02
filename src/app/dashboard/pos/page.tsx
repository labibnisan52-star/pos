"use client";

import React, { useState, useEffect } from "react";
import { 
  Search, 
  Filter, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Tag, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  ArrowRight,
  Trash2,
  Check,
  ArrowLeft,
  Printer,
  Wifi,
  WifiOff
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

// --- MOCK DATA ---
const CATEGORIES = ["All", "Electronics", "Home Goods", "Personal Care", "Stationery"];

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  image_color: string;
  image_url?: string;
  barcode?: string;
};

const MOCK_PRODUCTS: Product[] = [
  { id: "1", name: "Steel Water Bottle", price: 35.0, stock: 24, category: "Home Goods", image_color: "bg-indigo-100", barcode: "1001" },
  { id: "2", name: "Potted Plant", price: 28.0, stock: 3, category: "Home Goods", image_color: "bg-green-100", barcode: "1002" },
  { id: "3", name: "Classic Leather Wallet", price: 65.0, stock: 50, category: "Personal Care", image_color: "bg-amber-100", barcode: "1003" },
  { id: "4", name: "Hand Soap Dispenser", price: 18.0, stock: 12, category: "Personal Care", image_color: "bg-orange-50", barcode: "1004" },
  { id: "5", name: "Linen Notebook", price: 22.0, stock: 85, category: "Stationery", image_color: "bg-gray-200", barcode: "1005" },
  { id: "6", name: "Noise Cancelling Headphones", price: 299.0, stock: 1, category: "Electronics", image_color: "bg-gray-300", barcode: "1006" },
];

type CartItem = Product & { quantity: number };

// Audio feedback for POS scanner
const playBeep = (type: 'success' | 'error') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'success') {
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else {
      osc.frequency.value = 250;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // Ignore audio permission error
  }
};

export default function POSPage() {
  const [view, setView] = useState<"pos" | "checkout" | "receipt">("pos");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Toast notification for scanner feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    playBeep(type);
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
    }, 3000);
  };
  
  // Supabase Data
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Card" | "Mobile">("Card");

  // Customer state for checkout
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");

  // Online status and syncing state
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineOrders();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check for offline queue
    const queue = JSON.parse(localStorage.getItem('offline_orders') || '[]');
    setOfflineQueueCount(queue.length);
    if (navigator.onLine && queue.length > 0) {
      syncOfflineOrders();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncOfflineOrders = async () => {
    setSyncing(true);
    try {
      const queue = JSON.parse(localStorage.getItem('offline_orders') || '[]');
      if (queue.length === 0) return;

      const newSupabase = createClient();
      
      for (const offlineOrder of queue) {
        const { error: orderError } = await newSupabase.rpc('create_order', {
          _total_amount: offlineOrder.finalTotal,
          _discount: 0,
          _tax: 0,
          _payment_method: offlineOrder.paymentMethod,
          _customer_name: offlineOrder.customerName || "Guest",
          _customer_mobile: offlineOrder.customerMobile || "",
          _items: offlineOrder.cart.map((item: any) => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price
          }))
        });

        if (orderError) throw orderError;
      }
      
      // If success, clear queue
      localStorage.setItem('offline_orders', '[]');
      setOfflineQueueCount(0);
      showToast("Offline orders synced successfully!", "success");
    } catch (err) {
      console.error("Failed to sync offline orders", err);
      showToast("Sync failed, will retry later.", "error");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const fetchProducts = async () => {
      if (navigator.onLine) {
        try {
          const { data, error } = await supabase.from('pos_products').select('*');
          if (!error && data) {
            setProducts(data);
            localStorage.setItem('pos_products', JSON.stringify(data));
          }
        } catch (e) {
          console.warn("Failed fetching online, falling back to cache", e);
          loadFromCache();
        }
      } else {
        loadFromCache();
      }
      setLoading(false);
    };

    const loadFromCache = () => {
      const cached = localStorage.getItem('pos_products');
      if (cached) {
        setProducts(JSON.parse(cached));
      }
    };

    fetchProducts();
  }, [supabase]);

  const displayProducts = products.length > 0 ? products : MOCK_PRODUCTS;

  const filteredProducts = displayProducts.filter(p => {
    const matchCategory = activeCategory === "All" || p.category === activeCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = !q || 
      p.name.toLowerCase().includes(q) || 
      String(p.barcode || "").toLowerCase().includes(q) ||
      String(p.id || "").toLowerCase().includes(q);
    return matchCategory && matchSearch;
  });

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal - (subtotal * (discount / 100)); // assuming discount is percentage for now
  const tax = total * 0.08; // 8% mock tax
  const finalTotal = total + tax;

  // --- Flexible Product Lookup Helper ---
  const findProduct = (query: string, allProducts: Product[]) => {
    const raw = query.trim();
    if (!raw) return null;
    const clean = raw.toLowerCase();

    // 1. Exact barcode match (string, case-insensitive)
    let found = allProducts.find(p => String(p.barcode || "").trim().toLowerCase() === clean);
    if (found) return found;

    // 2. Exact ID match
    found = allProducts.find(p => String(p.id || "").trim().toLowerCase() === clean);
    if (found) return found;

    // 3. Match without leading zeros
    const numericClean = clean.replace(/^0+/, '');
    if (numericClean.length > 0) {
      found = allProducts.find(p => {
        const b = String(p.barcode || "").trim().toLowerCase().replace(/^0+/, '');
        return b === numericClean;
      });
      if (found) return found;
    }

    // 4. Exact Name match
    found = allProducts.find(p => p.name.trim().toLowerCase() === clean);
    if (found) return found;

    return null;
  };

  // --- Barcode Scanner Logic ---
  const addToCartRef = React.useRef(addToCart);
  const productsRef = React.useRef(displayProducts);
  const setSearchQueryRef = React.useRef(setSearchQuery);

  useEffect(() => {
    addToCartRef.current = addToCart;
    productsRef.current = displayProducts;
    setSearchQueryRef.current = setSearchQuery;
  }, [addToCart, displayProducts]);

  const processScannedCode = (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    const targetList = productsRef.current;
    const foundProduct = findProduct(cleanCode, targetList);

    if (foundProduct) {
      addToCartRef.current(foundProduct);
      showToast(`Added "${foundProduct.name}" to cart (TK ${foundProduct.price.toFixed(2)})`, "success");
      setSearchQueryRef.current("");
    } else {
      showToast(`No product found for barcode: "${cleanCode}"`, "error");
    }
  };

  useEffect(() => {
    let barcodeBuffer = "";
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Hardware barcode scanners send characters within <100ms of each other.
      // If gap is larger than 150ms, clear buffer (human typing vs hardware scanner).
      if (timeDiff > 150) {
        barcodeBuffer = "";
      }

      if (e.key === 'Enter') {
        if (barcodeBuffer.trim().length >= 2) {
          const scannedCode = barcodeBuffer.trim();
          barcodeBuffer = "";
          e.preventDefault();
          e.stopPropagation();
          processScannedCode(scannedCode);
        }
      } else if (e.key.length === 1) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);
  // ------------------------------

  const handleCompleteSale = async () => {
    if (!isOnline) {
      // 1. Queue to localStorage
      const queue = JSON.parse(localStorage.getItem('offline_orders') || '[]');
      const offlineOrder = {
        id: "offline-" + Date.now(),
        customerName: customerName || "Guest",
        customerMobile: customerMobile || "",
        finalTotal,
        paymentMethod,
        cart: [...cart]
      };
      queue.push(offlineOrder);
      localStorage.setItem('offline_orders', JSON.stringify(queue));
      setOfflineQueueCount(queue.length);
      
      // 2. Decrement local stock
      const updatedProducts = products.map(p => {
        const cartItem = cart.find(c => c.id === p.id);
        if (cartItem) {
          return { ...p, stock: Math.max(0, p.stock - cartItem.quantity) };
        }
        return p;
      });
      setProducts(updatedProducts);
      localStorage.setItem('pos_products', JSON.stringify(updatedProducts));

      showToast("Order saved offline. Will sync when internet returns.", "success");
      setView("receipt");
      return;
    }

    // 1. Create order atomically via RPC
    const { error: orderError } = await supabase.rpc('create_order', {
      _total_amount: finalTotal,
      _discount: 0,
      _tax: 0,
      _payment_method: paymentMethod,
      _customer_name: customerName || "Guest",
      _customer_mobile: customerMobile || "",
      _items: cart.map(item => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price
      }))
    });

    if (orderError) {
      console.error("Error creating order via RPC:", orderError);
      showToast("Failed to create order on server.", "error");
      return;
    }
    
    // 3. Show receipt
    setView("receipt");

    // 4. Refresh products list silently in background so POS is updated when returning
    const { data } = await supabase.from('pos_products').select('*');
    if (data) {
      setProducts(data);
      localStorage.setItem('pos_products', JSON.stringify(data));
    }
  };

  // --- VIEWS ---

  if (view === "receipt") {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 h-full w-full overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 flex flex-col relative">
          <button 
            onClick={() => { setView("pos"); clearCart(); }}
            className="absolute top-6 left-6 flex items-center text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to POS
          </button>
          
          <div className="mt-12 flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-[#f3f0ea] rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-gray-900" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Sale Completed</h2>
            <p className="text-sm text-gray-500 mt-1">Customer Name: {customerName || "—"}</p>
          </div>

          <div className="border-t border-b border-dashed border-gray-200 py-4 mb-4 space-y-3">
            {cart.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <div>
                  <p className="font-medium text-gray-800">{item.name}</p>
                  <p className="text-gray-500">{item.quantity} x TK {item.price.toFixed(2)}</p>
                </div>
                <p className="font-medium text-gray-900">TK {(item.price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-sm mb-6">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>TK {subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Discount ({discount}%)</span>
                <span>-TK {(subtotal * (discount / 100)).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Tax (8%)</span>
              <span>TK {tax.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between items-end mb-8">
            <span className="font-bold text-gray-900">Total</span>
            <div className="text-right">
              <span className="text-2xl font-bold text-gray-900">TK {finalTotal.toFixed(2)}</span>
              <p className="text-xs text-gray-500 mt-1">Paid via {paymentMethod}</p>
            </div>
          </div>

          <div className="flex space-x-3">
            <button className="flex-1 py-3 bg-[#f3f0ea] text-gray-900 font-semibold rounded-xl flex justify-center items-center hover:bg-gray-200 transition-colors">
              <Printer className="w-5 h-5 mr-2" /> Print Receipt
            </button>
            <button 
              onClick={() => { setView("pos"); clearCart(); setCustomerName(""); setCustomerMobile(""); }}
              className="flex-1 py-3 bg-black text-white font-semibold rounded-xl flex justify-center items-center hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" /> New Sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "checkout") {
    return (
      <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-gray-50">
        {/* Left Side: Cart Review */}
        <div className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Current Sale</h1>
              <p className="text-sm text-gray-400">#TRX-{Math.floor(Math.random() * 10000)}</p>
            </div>
            <button onClick={clearCart} className="text-sm font-medium text-gray-500 hover:text-gray-800 flex items-center">
              <Trash2 className="w-4 h-4 mr-1" /> Clear Cart
            </button>
          </div>

          <div className="space-y-3 mb-8">
            {cart.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-lg flex-shrink-0 ${item.image_color || 'bg-gray-100'} overflow-hidden`}>
                    {item.image_url && <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{item.name}</h3>
                    <p className="text-xs text-gray-400">Barcode: {item.id.padStart(8, '0')}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-6">
                  <div className="flex items-center bg-[#f3f0ea] rounded-full px-2 py-1">
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-1 text-gray-500 hover:text-gray-900">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-6 text-center font-semibold text-sm">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-1 text-gray-500 hover:text-gray-900">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="text-right w-20">
                    <p className="text-xs text-gray-400 line-through">{(item.price * item.quantity).toFixed(2)} TK</p>
                    <p className="font-bold text-gray-900 text-sm">{(item.price * item.quantity).toFixed(2)} TK</p>
                  </div>
                  
                  <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="text-center py-10 text-gray-400">Cart is empty</div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between text-gray-500 mb-4 text-sm font-medium">
              <span>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} items)</span>
              <span>{subtotal.toFixed(2)} TK</span>
            </div>
            
            <div className="flex items-center space-x-4 mb-6">
              <span className="text-sm font-medium text-gray-500 w-20">Discount</span>
              <div className="flex-1 relative">
                <input 
                  type="number" 
                  value={discount || ""}
                  onChange={e => setDiscount(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  placeholder="0"
                />
              </div>
              <div className="flex items-center space-x-1">
                <button className="px-3 py-2 bg-[#f3f0ea] rounded-lg text-sm font-medium">%</button>
                <button className="px-3 py-2 text-gray-400 rounded-lg text-sm font-medium">TK</button>
              </div>
            </div>

            <div className="flex justify-between items-end pt-4 border-t border-gray-100">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Amount</span>
              <span className="text-4xl font-bold text-gray-900">{total.toFixed(2)} TK</span>
            </div>
          </div>
        </div>

        {/* Right Side: Customer & Checkout */}
        <div className="w-full lg:w-96 bg-white border-l border-gray-200 p-6 flex flex-col">
          <div className="flex items-center mb-6">
            <button onClick={() => setView("pos")} className="mr-3 p-2 rounded-full hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-bold text-gray-900">Checkout</h2>
          </div>

          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-500 mb-4">Customer Details</h3>
            <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 ml-1">Customer Name</label>
                <input 
                  type="text" 
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Enter name"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 ml-1">Mobile Number</label>
                <input 
                  type="text" 
                  value={customerMobile}
                  onChange={e => setCustomerMobile(e.target.value)}
                  placeholder="Enter mobile number"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
            </div>
            
            <h3 className="text-sm font-semibold text-gray-500 mt-6 mb-4">Payment Method</h3>
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => setPaymentMethod("Cash")}
                className={`py-3 rounded-xl flex flex-col items-center justify-center border-2 transition-all ${
                  paymentMethod === "Cash" ? "border-gray-900 bg-white" : "border-transparent bg-[#f3f0ea] text-gray-500 hover:bg-gray-200"
                }`}
              >
                <Banknote className="w-5 h-5 mb-1" />
                <span className="text-xs font-semibold">Cash</span>
              </button>
              <button 
                onClick={() => setPaymentMethod("Card")}
                className={`py-3 rounded-xl flex flex-col items-center justify-center border-2 transition-all ${
                  paymentMethod === "Card" ? "border-gray-900 bg-white" : "border-transparent bg-[#f3f0ea] text-gray-500 hover:bg-gray-200"
                }`}
              >
                <CreditCard className="w-5 h-5 mb-1" />
                <span className="text-xs font-semibold">Card</span>
              </button>
              <button 
                onClick={() => setPaymentMethod("Mobile")}
                className={`py-3 rounded-xl flex flex-col items-center justify-center border-2 transition-all ${
                  paymentMethod === "Mobile" ? "border-gray-900 bg-white" : "border-transparent bg-[#f3f0ea] text-gray-500 hover:bg-gray-200"
                }`}
              >
                <Smartphone className="w-5 h-5 mb-1" />
                <span className="text-xs font-semibold">Mobile</span>
              </button>
            </div>
          </div>

          <div className="mt-6 flex space-x-3">
            <button className="flex-1 py-4 bg-white border border-gray-200 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors flex justify-center items-center">
              <span className="mr-2">⏸</span> Hold Sale
            </button>
            <button 
              onClick={handleCompleteSale}
              disabled={cart.length === 0}
              className="flex-1 py-4 bg-black rounded-xl text-white font-semibold text-sm hover:bg-gray-800 transition-colors flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4 mr-2" /> Complete Sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  // DEFAULT VIEW: "pos"
  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Toast Alert Banner for Barcode Scanner */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-xl flex items-center space-x-2 font-semibold text-sm transition-all duration-300 ${
          toast.type === 'success' 
            ? 'bg-black text-white border border-gray-800' 
            : 'bg-red-600 text-white shadow-red-200'
        }`}>
          <span>{toast.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Products Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#faf9f6]">
        {/* Top Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex-1 flex items-center space-x-3 max-w-xl">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-[#f3f0ea] border-none rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-400"
                placeholder="Scan barcode or search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const query = searchQuery.trim();
                    if (query.length > 0) {
                      const targetList = displayProducts;
                      const found = findProduct(query, targetList);
                      if (found) {
                        addToCart(found);
                        showToast(`Added "${found.name}" to cart (TK ${found.price.toFixed(2)})`, "success");
                        setSearchQuery("");
                      } else if (filteredProducts.length === 1) {
                        addToCart(filteredProducts[0]);
                        showToast(`Added "${filteredProducts[0].name}" to cart (TK ${filteredProducts[0].price.toFixed(2)})`, "success");
                        setSearchQuery("");
                      } else {
                        showToast(`No product found for barcode / search: "${query}"`, "error");
                      }
                    }
                  }
                }}
              />
            </div>
          </div>
          
          <div className="flex items-center">
            {/* Sync Status Badge */}
            <div className={`flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isOnline 
                ? 'bg-green-50 text-green-700 border-green-200' 
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {isOnline ? <Wifi className="w-3.5 h-3.5 mr-1.5" /> : <WifiOff className="w-3.5 h-3.5 mr-1.5" />}
              {isOnline ? (syncing ? 'Syncing...' : 'Online') : `Offline (${offlineQueueCount})`}
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="px-4 pb-4 overflow-x-auto no-scrollbar">
          <div className="flex space-x-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat 
                    ? "bg-black text-white" 
                    : "bg-[#f3f0ea] text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map(product => (
              <div 
                key={product.id} 
                onClick={() => addToCart(product)}
                className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow transform hover:-translate-y-1 duration-200"
              >
                <div className={`w-full h-32 rounded-xl mb-3 relative ${product.image_color || 'bg-gray-100'} overflow-hidden`}>
                  {product.image_url && <img src={product.image_url} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />}
                  {/* Mock Image Content */}
                  <div className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-full border border-gray-200 text-[10px] font-bold text-gray-700 z-10">
                    {product.stock <= 5 ? `Low Stock (${product.stock})` : `${product.stock} in stock`}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-1">{product.price.toFixed(2)} TK</p>
                <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{product.name}</h3>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Sidebar: Mini Cart */}
      <div className="w-80 lg:w-96 bg-white border-l border-gray-200 flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Current Sale</h2>
          <div className="relative">
            <div className="w-10 h-10 bg-[#f3f0ea] rounded-full flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-gray-700" />
            </div>
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-black text-white text-xs font-bold flex items-center justify-center rounded-full border-2 border-white">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
          {cart.map(item => (
            <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-lg flex-shrink-0 ${item.image_color || 'bg-gray-100'} overflow-hidden`}>
                  {item.image_url && <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 pr-2">
                  <h4 className="font-semibold text-sm text-gray-900 truncate">{item.name}</h4>
                  <p className="text-xs text-gray-500">{item.price.toFixed(2)} TK</p>
                </div>
              </div>
              <div className="flex items-center bg-[#f3f0ea] rounded-full p-1 shadow-inner">
                <button 
                  onClick={() => updateQuantity(item.id, -1)}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-white text-gray-600 shadow-sm hover:text-gray-900"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-6 text-center text-xs font-bold text-gray-900">{item.quantity}</span>
                <button 
                  onClick={() => updateQuantity(item.id, 1)}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-white text-gray-600 shadow-sm hover:text-gray-900"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
              <ShoppingCart className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">Cart is empty</p>
            </div>
          )}
        </div>

        {/* Cart Totals & Checkout */}
        <div className="p-5 bg-white border-t border-gray-100">
          <div className="flex justify-between items-center mb-3 text-sm font-medium">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-900">{subtotal.toFixed(2)} TK</span>
          </div>
          
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Tag className="w-4 h-4 text-gray-400" />
            </div>
            <input 
              type="text" 
              placeholder="Add discount code" 
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          <div className="flex justify-between items-center mb-6">
            <span className="font-bold text-gray-900">Total</span>
            <span className="font-bold text-gray-900 text-lg">{subtotal.toFixed(2)} TK</span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <button 
              onClick={() => setPaymentMethod("Cash")}
              className={`py-2 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                paymentMethod === "Cash" ? "border-gray-900 bg-white" : "border-transparent bg-[#f3f0ea] hover:bg-gray-200"
              }`}
            >
              <Banknote className={`w-4 h-4 mb-1 ${paymentMethod === "Cash" ? "text-gray-900" : "text-gray-500"}`} />
              <span className={`text-[10px] font-bold ${paymentMethod === "Cash" ? "text-gray-900" : "text-gray-500"}`}>Cash</span>
            </button>
            <button 
              onClick={() => setPaymentMethod("Card")}
              className={`py-2 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                paymentMethod === "Card" ? "border-gray-900 bg-white" : "border-transparent bg-[#f3f0ea] hover:bg-gray-200"
              }`}
            >
              <CreditCard className={`w-4 h-4 mb-1 ${paymentMethod === "Card" ? "text-gray-900" : "text-gray-500"}`} />
              <span className={`text-[10px] font-bold ${paymentMethod === "Card" ? "text-gray-900" : "text-gray-500"}`}>Card</span>
            </button>
            <button 
              onClick={() => setPaymentMethod("Mobile")}
              className={`py-2 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                paymentMethod === "Mobile" ? "border-gray-900 bg-white" : "border-transparent bg-[#f3f0ea] hover:bg-gray-200"
              }`}
            >
              <Smartphone className={`w-4 h-4 mb-1 ${paymentMethod === "Mobile" ? "text-gray-900" : "text-gray-500"}`} />
              <span className={`text-[10px] font-bold ${paymentMethod === "Mobile" ? "text-gray-900" : "text-gray-500"}`}>Mobile</span>
            </button>
          </div>

          <button 
            onClick={() => setView("checkout")}
            disabled={cart.length === 0}
            className="w-full py-3.5 bg-black text-white font-bold rounded-xl flex items-center justify-center hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group shadow-md"
          >
            Checkout
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
