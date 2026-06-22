export interface PriceTier {
  label: string;      // Display: "250g", "500g", "1 kg+"
  qty: number;        // Quantity in inputUnit (250 for 250g; 1 for bulk "per kg")
  inputUnit: string;  // "g", "kg", "ml", "L", "piece"
  price: number;      // Fixed tier: total price for qty units. Bulk tier: price per qty units.
  isBulk: boolean;    // true = open-ended; customer enters any amount >= qty
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;           // Fallback / base price (used when no priceTiers)
  unit: string;            // Fallback / base unit (used when no priceTiers)
  category: string;
  stock: number;
  images: string[];
  minOrder: number;
  featured: boolean;
  isPackaging?: boolean;   // Internal item — hidden from customer shop, used for order cost tracking
  averageCost?: number;    // Weighted average purchase cost per base stock unit (WAC)
  lowStockThreshold?: number; // Alert threshold in display units (product.unit). Defaults to 0.5 for kg/L, 20 otherwise.
  priceTiers?: PriceTier[];
  allowDecimal?: boolean;  // Allow fractional quantities (wax, fragrances, etc.)
  weightGrams?: number;    // Weight per unit in grams (for simple products; tiered products use qty as weight)
}

export interface CartItem {
  productId: string;
  cartKey: string;       // Unique line-item key: productId for simple, productId+label for tiered
  name: string;
  price: number;         // Per-unit price (per pack for fixed tiers, per inputUnit for bulk)
  quantity: number;      // Can be decimal for bulk items
  unit: string;          // Label: "500g", "kg", "piece", etc.
  image?: string;
  decimalQty?: boolean;  // true = bulk item, use decimal input in cart
  minQty?: number;       // Minimum allowed quantity
  tierBase?: number;     // Base-unit size of one reference unit (g or ml). e.g. 500 for "500g" tier.
  maxCartQty?: number;   // Max quantity in this line's unit before hitting stock (stock / tierBase for tiered, stock for simple)
  weightGrams?: number;  // Total weight for this line item in grams (quantity × unit weight)
  category?: string;     // Product category — used for category-scoped promo eligibility
}

export interface CustomerInfo {
  name: string;
  email?: string;
  phone: string;
  secondaryPhone?: string;
  address: string;
  district: string;
  city: string;
  notes?: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'returned' | 'cancelled';
export type FulfillmentType = 'royal_express' | 'pickme' | 'pickup';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'courier_invoice';

export interface PaymentInfo {
  method: PaymentMethod;
  reference: string;
  amount: number;
  date: string;           // YYYY-MM-DD
  notes?: string;
  settlementId?: string;
}

export interface CourierAssignment {
  invoiceId: string;
  invoiceNumber: string;
  actualShippingFee: number;  // actual fee charged by courier (may differ from order.deliveryFee)
}

export interface Settlement {
  id: string;
  type: PaymentMethod;
  reference: string;        // invoice number for courier_invoice, ref # for cash/bank
  totalAmount: number;      // received amount for courier_invoice, paid amount for cash/bank
  date: string;             // YYYY-MM-DD
  orderIds?: string[];      // used for cash/bank settlements (linked at creation)
  orderNumbers?: string[];  // used for cash/bank settlements
  notes?: string;
  createdAt: string;
  // Courier invoice specific:
  courierName?: string;
  isCompleted?: boolean;
}

export interface Order {
  id?: string;
  orderNumber?: string;
  customer: CustomerInfo;
  items: CartItem[];
  subtotal: number;
  deliveryFee?: number;
  total: number;
  status: OrderStatus;
  createdAt?: unknown;
  userId?: string | null;
  zoneId?: number;
  pointsEarned?: number;
  pointsRedeemed?: number;
  promoCode?: string;
  promoDiscount?: number;
  waybillNumber?: string;
  courierTicketId?: string;
  packagingItems?: CartItem[];  // Internal packing materials — not shown to customer
  damagedItems?: { cartKey: string; damagedQty: number }[];
  paymentStatus?: 'unpaid' | 'paid';
  paymentInfo?: PaymentInfo;
  courierInvoice?: CourierAssignment;
  fulfillmentType?: FulfillmentType;
}

export type ProductCategory = 'wax' | 'fragrance' | 'wicks' | 'dye' | 'molds' | 'tools' | 'kits' | 'packaging' | 'all';

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  quantity: number;    // in base stock unit (g, ml, or piece)
  unit: string;        // display label for that unit
  costPerUnit: number; // purchase cost per base unit
  totalCost: number;   // quantity * costPerUnit
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  date: string;        // YYYY-MM-DD
  items: PurchaseItem[];
  totalCost: number;
  supplier?: string;
  notes?: string;
  createdAt: string;
}

export type PromoDiscountType = 'percentage' | 'fixed' | 'free_delivery';
export type PromoCategory = 'seasonal' | 'newcomer' | 'general';

export interface Promotion {
  id: string;
  code: string;
  title: string;
  description: string;
  category: PromoCategory;
  discountType: PromoDiscountType;
  discountValue: number;      // percent, LKR amount, or 0 for free_delivery
  minOrderAmount: number;     // 0 = no minimum
  startDate: string;          // ISO date string or ''
  endDate: string;            // ISO date string or ''
  usageLimit: number;         // 0 = unlimited
  usageCount: number;
  perUserLimit: number;       // 0 = unlimited
  active: boolean;
  badgeLabel: string;         // e.g. "SEASONAL", "NEWCOMER OFFER"
  targetType: 'all' | 'category' | 'product';
  targetCategories: string[];   // ProductCategory values when targetType === 'category'
  targetProductIds: string[];   // product IDs when targetType === 'product'
  targetProductNames: string[]; // denormalised labels for display without a product lookup
}
