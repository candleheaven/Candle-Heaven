import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Grid, TextField, Button, Typography,
  MenuItem, Alert, CircularProgress, Breadcrumbs, Link,
  Autocomplete, IconButton, Divider, Chip, Table, TableHead,
  TableBody, TableRow, TableCell, Avatar, ToggleButton, ToggleButtonGroup,
  InputAdornment,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import { DeleteOutlined as DeleteOutlineIcon } from '@mui/icons-material';
import { adminGetAllProducts, adminGetAllOrders, adminPlaceOrder } from '../../services/admin';
import { getStates, getCitiesByState } from '../../services/cities';
import type { CurfoxState, CurfoxCity } from '../../services/cities';
import { getDeliverySettings, calculateDeliveryFee } from '../../services/delivery';
import type { Product, OrderStatus, CartItem, CustomerInfo, PriceTier } from '../../types';

const NAVY = '#132040';
const GOLD = '#C9A96E';

// ─── Tiered pricing helpers ───────────────────────────────────────────────────

function toBase(qty: number, unit: string): number {
  if (unit === 'kg') return Math.round(qty * 1000);
  if (unit === 'L')  return Math.round(qty * 1000);
  return Math.round(qty);
}

function fromBase(qty: number, unit: string): number {
  if (unit === 'kg') return qty / 1000;
  if (unit === 'L')  return qty / 1000;
  return qty;
}

interface BestOption { tier: PriceTier; tierBase: number; units: number; total: number; }

function getBestOption(baseQty: number, tiers: PriceTier[]): BestOption | null {
  let bestTier: PriceTier | null = null;
  let bestTierBase = -1;
  for (const tier of tiers) {
    const tb = toBase(tier.qty, tier.inputUnit);
    if (baseQty >= tb && tb > bestTierBase) { bestTier = tier; bestTierBase = tb; }
  }
  if (!bestTier) return null;
  const units = baseQty / bestTierBase;
  return { tier: bestTier, tierBase: bestTierBase, units, total: units * bestTier.price };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  product: Product;
  quantity: number;
  cartKey: string;
  unit: string;
  price: number;
  decimalQty: boolean;
  tierBase?: number;
}

interface SavedCustomer {
  label: string;
  info: CustomerInfo;
}

const ALL_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'pending',   label: 'Pending'   },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'shipped',   label: 'Shipped'   },
  { value: 'delivered', label: 'Delivered' },
];

const EMPTY_CUSTOMER: CustomerInfo = {
  name: '', email: '', phone: '', secondaryPhone: '', address: '', district: '', city: '', notes: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateOrder() {
  const navigate = useNavigate();

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [packagingProducts, setPackagingProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [simpleQty, setSimpleQty] = useState(1);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // Packaging items
  const [selectedPkg, setSelectedPkg] = useState<Product | null>(null);
  const [pkgQty, setPkgQty] = useState(1);
  const [packagingItems, setPackagingItems] = useState<OrderItem[]>([]);

  // Customer
  const [customer, setCustomer] = useState<CustomerInfo>(EMPTY_CUSTOMER);
  const [savedCustomers, setSavedCustomers] = useState<SavedCustomer[]>([]);

  // District / City
  const [districts, setDistricts] = useState<CurfoxState[]>([]);
  const [districtsLoading, setDistrictsLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<CurfoxState | null>(null);
  const [cities, setCities] = useState<CurfoxCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CurfoxCity | null>(null);

  // Order settings
  const [status, setStatus] = useState<OrderStatus>('confirmed');
  const [fulfillmentType, setFulfillmentType] = useState<'royal_express' | 'pickme' | 'pickup'>('royal_express');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load products, districts, and past customer list in parallel
    adminGetAllProducts().then(ps => {
      setProducts(ps.filter(p => !p.isPackaging && p.stock > 0));
      setPackagingProducts(ps.filter(p => p.isPackaging && p.stock > 0));
    });

    getStates()
      .then(setDistricts)
      .catch(() => {})
      .finally(() => setDistrictsLoading(false));

    adminGetAllOrders().then(orders => {
      const seen = new Set<string>();
      const list: SavedCustomer[] = [];
      for (const order of orders) {
        const key = order.customer.phone?.trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          list.push({
            label: `${order.customer.name} · ${order.customer.phone}`,
            info: order.customer,
          });
        }
      }
      setSavedCustomers(list.sort((a, b) => a.info.name.localeCompare(b.info.name)));
    });
  }, []);

  // ── District / City handlers ────────────────────────────────────────────────

  function handleDistrictChange(district: CurfoxState | null) {
    setSelectedDistrict(district);
    setSelectedCity(null);
    setCities([]);
    setCustomer(c => ({ ...c, district: district?.name ?? '', city: '' }));
    if (!district) return;
    setCitiesLoading(true);
    getCitiesByState(district.id)
      .then(setCities)
      .catch(() => setCities([]))
      .finally(() => setCitiesLoading(false));
  }

  function handleCityChange(city: CurfoxCity | null) {
    setSelectedCity(city);
    setCustomer(c => ({ ...c, city: city?.name ?? '' }));
    if (city?.zone_id != null) {
      const weightKg = orderItems.reduce((s, item) => {
        const grams = item.tierBase
          ? item.quantity * item.tierBase
          : item.quantity * (item.product.weightGrams ?? 0);
        return s + grams;
      }, 0) / 1000;
      const fee = calculateDeliveryFee(weightKg, city.zone_id, getDeliverySettings());
      setDeliveryFee(fee);
    }
  }

  // ── Customer auto-fill ──────────────────────────────────────────────────────

  async function handleCustomerSelect(saved: SavedCustomer | null) {
    if (!saved) return;
    setCustomer(saved.info);

    // Try to match district and city from the saved strings
    const districtName = saved.info.district?.trim().toLowerCase();
    const cityName = saved.info.city?.trim().toLowerCase();
    if (!districtName) return;

    const loaded = districts.length > 0 ? districts : await getStates().catch(() => []);
    if (districts.length === 0 && loaded.length > 0) setDistricts(loaded);

    const matchDistrict = loaded.find(d => d.name.toLowerCase() === districtName);
    if (!matchDistrict) return;

    setSelectedDistrict(matchDistrict);
    setCitiesLoading(true);
    const loadedCities = await getCitiesByState(matchDistrict.id).catch(() => []);
    setCities(loadedCities);
    setCitiesLoading(false);

    if (cityName) {
      const matchCity = loadedCities.find(c => c.name.toLowerCase() === cityName);
      if (matchCity) {
        setSelectedCity(matchCity);
        const weightKg = orderItems.reduce((s, item) => {
          const grams = item.tierBase
            ? item.quantity * item.tierBase
            : item.quantity * (item.product.weightGrams ?? 0);
          return s + grams;
        }, 0) / 1000;
        const fee = calculateDeliveryFee(weightKg, matchCity.zone_id, getDeliverySettings());
        setDeliveryFee(fee);
      }
    }
  }

  // ── Tiered picker computed values ───────────────────────────────────────────

  const hasTiers = Boolean(selectedProduct?.priceTiers?.length);
  const tiers = selectedProduct?.priceTiers ?? [];
  const bulkTier = tiers.find(t => t.isBulk);
  const displayUnit = bulkTier?.inputUnit ?? tiers[0]?.inputUnit ?? selectedProduct?.unit ?? '';
  const fixedTiers = tiers.filter(t => !t.isBulk);
  const minBase = fixedTiers.length > 0 ? toBase(fixedTiers[0].qty, fixedTiers[0].inputUnit) : 1;
  const minDisplay = parseFloat(fromBase(minBase, displayUnit).toFixed(6));
  const inputNum = parseFloat(inputValue);
  const baseQty = hasTiers && !isNaN(inputNum) && inputNum > 0 ? toBase(inputNum, displayUnit) : 0;
  const bestOption = hasTiers && baseQty > 0 ? getBestOption(baseQty, tiers) : null;
  const isBelowMin = hasTiers && inputValue !== '' && !isNaN(inputNum) && inputNum > 0 && baseQty < minBase;
  const canAdd = hasTiers ? (bestOption !== null && !isBelowMin) : simpleQty >= 1;

  // ── Order totals ────────────────────────────────────────────────────────────

  const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmount = discountType === 'fixed'
    ? Math.min(discountValue, subtotal)
    : Math.round(subtotal * discountValue / 100);
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);

  // ── Item handlers ───────────────────────────────────────────────────────────

  function setCustomerField(field: keyof CustomerInfo) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCustomer(c => ({ ...c, [field]: e.target.value }));
  }

  function clearCustomer() {
    setCustomer(EMPTY_CUSTOMER);
    setSelectedDistrict(null);
    setSelectedCity(null);
    setCities([]);
  }

  function addProduct() {
    if (!selectedProduct) return;
    if (hasTiers) {
      if (!bestOption) return;
      const cartKey = `${selectedProduct.id}-${bestOption.tier.label}`;
      const existing = orderItems.find(i => i.cartKey === cartKey);
      if (existing) {
        setOrderItems(prev => prev.map(i =>
          i.cartKey === cartKey ? { ...i, quantity: i.quantity + bestOption.units } : i
        ));
      } else {
        setOrderItems(prev => [...prev, {
          product: selectedProduct, quantity: bestOption.units, cartKey,
          unit: bestOption.tier.label, price: bestOption.tier.price,
          decimalQty: true, tierBase: bestOption.tierBase,
        }]);
      }
    } else {
      const cartKey = selectedProduct.id;
      const existing = orderItems.find(i => i.cartKey === cartKey);
      if (existing) {
        setOrderItems(prev => prev.map(i =>
          i.cartKey === cartKey ? { ...i, quantity: i.quantity + simpleQty } : i
        ));
      } else {
        setOrderItems(prev => [...prev, {
          product: selectedProduct, quantity: simpleQty, cartKey,
          unit: selectedProduct.unit, price: selectedProduct.price,
          decimalQty: selectedProduct.allowDecimal ?? false,
        }]);
      }
    }
    setSelectedProduct(null);
    setInputValue('');
    setSimpleQty(1);
  }

  function changeQty(cartKey: string, delta: number) {
    setOrderItems(prev =>
      prev.map(i => i.cartKey === cartKey ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
        .filter(i => i.quantity > 0)
    );
  }

  function setQty(cartKey: string, qty: number) {
    if (qty <= 0) setOrderItems(prev => prev.filter(i => i.cartKey !== cartKey));
    else setOrderItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, quantity: qty } : i));
  }

  function setItemPrice(cartKey: string, price: number) {
    setOrderItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, price } : i));
  }

  function removeItem(cartKey: string) {
    setOrderItems(prev => prev.filter(i => i.cartKey !== cartKey));
  }

  function addPackaging() {
    if (!selectedPkg || pkgQty < 1) return;
    const cartKey = `pkg-${selectedPkg.id}`;
    const existing = packagingItems.find(i => i.cartKey === cartKey);
    if (existing) {
      setPackagingItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, quantity: i.quantity + pkgQty } : i));
    } else {
      setPackagingItems(prev => [...prev, {
        product: selectedPkg, quantity: pkgQty, cartKey,
        unit: selectedPkg.unit, price: selectedPkg.price, decimalQty: false,
      }]);
    }
    setSelectedPkg(null);
    setPkgQty(1);
  }

  function setPackagingItemQty(cartKey: string, qty: number) {
    if (qty <= 0) setPackagingItems(prev => prev.filter(i => i.cartKey !== cartKey));
    else setPackagingItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, quantity: qty } : i));
  }

  function setPackagingItemPrice(cartKey: string, price: number) {
    setPackagingItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, price } : i));
  }

  function removePackagingItem(cartKey: string) {
    setPackagingItems(prev => prev.filter(i => i.cartKey !== cartKey));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customer.name.trim()) { setError('Customer name is required.'); return; }
    if (!customer.phone.trim()) { setError('Customer phone is required.'); return; }
    if (orderItems.length === 0) { setError('Add at least one product.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const items: CartItem[] = orderItems.map(i => ({
        productId: i.product.id, cartKey: i.cartKey, name: i.product.name,
        price: i.price, quantity: i.quantity, unit: i.unit,
        image: i.product.images[0], decimalQty: i.decimalQty,
        tierBase: i.tierBase, category: i.product.category,
      }));
      const pkgCartItems: CartItem[] = packagingItems.map(i => ({
        productId: i.product.id, cartKey: i.cartKey, name: i.product.name,
        price: i.price, quantity: i.quantity, unit: i.unit,
        image: i.product.images[0], decimalQty: false,
      }));
      const orderPayload: Parameters<typeof adminPlaceOrder>[0] = {
        customer, items, subtotal,
        packagingItems: pkgCartItems.length > 0 ? pkgCartItems : undefined,
        deliveryFee: deliveryFee || undefined,
        total, status, fulfillmentType,
        ...(discountAmount > 0 ? { promoCode: 'Admin Discount', promoDiscount: discountAmount } : {}),
      };
      const orderNumber = await adminPlaceOrder(orderPayload, status);
      navigate('/admin/orders', { state: { created: orderNumber } });
    } catch {
      setError('Failed to create order. Please try again.');
      setSubmitting(false);
    }
  }

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Breadcrumbs sx={{ mb: 1 }}>
          <Link component="button" variant="body2" onClick={() => navigate('/admin/orders')}
            sx={{ cursor: 'pointer', color: 'text.secondary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
            Orders
          </Link>
          <Typography variant="body2" color="text.primary">Create Order</Typography>
        </Breadcrumbs>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin/orders')} sx={{ color: 'text.secondary' }}>
            Back
          </Button>
          <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY }}>Create Manual Order</Typography>
          <Chip label="WhatsApp / Walk-in / Phone" size="small" sx={{ bgcolor: '#25D36618', color: '#128C7E', fontWeight: 600 }} />
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box component="form" onSubmit={handleSubmit}>
        <Grid container spacing={3} sx={{ alignItems: 'flex-start' }}>

          {/* ── Left: Customer & Settings ─────────────────────────────────── */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: NAVY }}>
                    Customer Details
                  </Typography>
                  <Button size="small" color="inherit" onClick={clearCustomer}
                    sx={{ color: 'text.secondary', fontSize: 12, textTransform: 'none', minWidth: 0, px: 1 }}>
                    Clear
                  </Button>
                </Box>

                {/* Customer search */}
                <Autocomplete
                  options={savedCustomers}
                  getOptionLabel={c => c.label}
                  onChange={(_, v) => handleCustomerSelect(v)}
                  filterOptions={(opts, { inputValue: q }) => {
                    const lq = q.toLowerCase();
                    return opts.filter(o =>
                      o.info.name.toLowerCase().includes(lq) ||
                      o.info.phone.includes(lq)
                    );
                  }}
                  renderOption={(props, option) => (
                    <Box component="li" {...props}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <PersonSearchIcon fontSize="small" color="action" />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{option.info.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {option.info.phone}{option.info.city ? ` · ${option.info.city}` : ''}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}
                  renderInput={params => (
                    <TextField
                      {...params}
                      label="Search existing customer"
                      size="small"
                      placeholder="Name or phone number…"
                      slotProps={{
                        ...params.slotProps,
                        input: {
                          ...params.slotProps?.input,
                          startAdornment: (
                            <>
                              <PersonSearchIcon fontSize="small" color="action" sx={{ mr: 0.5, ml: 0.5 }} />
                              {params.slotProps?.input?.endAdornment}
                            </>
                          ),
                        },
                      }}
                    />
                  )}
                  noOptionsText="No matching customers"
                  sx={{ mb: 2.5 }}
                />

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <TextField label="Full Name" value={customer.name}
                      onChange={setCustomerField('name')} fullWidth required />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField label="Phone" value={customer.phone}
                      onChange={setCustomerField('phone')} fullWidth required placeholder="07X XXX XXXX" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField label="Secondary Phone" value={customer.secondaryPhone ?? ''}
                      onChange={setCustomerField('secondaryPhone')} fullWidth placeholder="Optional" />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField label="Email" value={customer.email ?? ''}
                      onChange={setCustomerField('email')} fullWidth type="email" />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField label="Address" value={customer.address}
                      onChange={setCustomerField('address')} fullWidth />
                  </Grid>

                  {/* District */}
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Autocomplete
                      options={districts}
                      loading={districtsLoading}
                      value={selectedDistrict}
                      getOptionLabel={d => d.name}
                      isOptionEqualToValue={(opt, val) => opt.id === val.id}
                      onChange={(_, d) => handleDistrictChange(d)}
                      renderInput={params => (
                        <TextField
                          id={params.id}
                          disabled={params.disabled}
                          fullWidth={params.fullWidth}
                          size={params.size}
                          label="District"
                          slotProps={{
                            ...params.slotProps,
                            input: {
                              ...params.slotProps?.input,
                              endAdornment: (
                                <>
                                  {districtsLoading && <CircularProgress color="inherit" size={16} />}
                                  {params.slotProps?.input?.endAdornment}
                                </>
                              ),
                            },
                          }}
                        />
                      )}
                    />
                  </Grid>

                  {/* City */}
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Autocomplete
                      options={cities}
                      loading={citiesLoading}
                      disabled={!selectedDistrict}
                      value={selectedCity}
                      getOptionLabel={c => c.name}
                      isOptionEqualToValue={(opt, val) => opt.id === val.id}
                      onChange={(_, c) => handleCityChange(c)}
                      renderInput={params => (
                        <TextField
                          id={params.id}
                          disabled={params.disabled}
                          fullWidth={params.fullWidth}
                          size={params.size}
                          label="City"
                          slotProps={{
                            ...params.slotProps,
                            input: {
                              ...params.slotProps?.input,
                              endAdornment: (
                                <>
                                  {citiesLoading && <CircularProgress color="inherit" size={16} />}
                                  {params.slotProps?.input?.endAdornment}
                                </>
                              ),
                            },
                          }}
                        />
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <TextField label="Notes (optional)" value={customer.notes ?? ''}
                      onChange={setCustomerField('notes')} fullWidth multiline rows={2}
                      placeholder="Special instructions, delivery notes…" />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2.5 }} />

                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Order Settings</Typography>
                <TextField select label="Delivery Method" value={fulfillmentType}
                  onChange={e => setFulfillmentType(e.target.value as typeof fulfillmentType)} fullWidth size="small" sx={{ mb: 1.5 }}>
                  <MenuItem value="royal_express">Royal Express</MenuItem>
                  <MenuItem value="pickme">PickMe</MenuItem>
                  <MenuItem value="pickup">Customer Pickup</MenuItem>
                </TextField>
                <TextField select label="Initial Status" value={status}
                  onChange={e => setStatus(e.target.value as OrderStatus)} fullWidth size="small"
                  helperText="Set to 'Confirmed' for orders already agreed upon">
                  {ALL_STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                </TextField>
              </CardContent>
            </Card>
          </Grid>

          {/* ── Right: Products & Summary ────────────────────────────────── */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: NAVY, mb: 2 }}>
                  Order Items
                </Typography>

                {/* Product search */}
                <Autocomplete
                  options={products}
                  getOptionLabel={p => p.name}
                  value={selectedProduct}
                  onChange={(_, v) => { setSelectedProduct(v); setInputValue(''); setSimpleQty(1); }}
                  renderInput={params => (
                    <TextField {...params} label="Search product" size="small" placeholder="Type to search…" />
                  )}
                  renderOption={(props, option) => (
                    <Box component="li" {...props} sx={{ gap: 1.5 }}>
                      <Avatar src={option.images[0]} variant="rounded" sx={{ width: 32, height: 32, flexShrink: 0 }} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{option.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.priceTiers?.length
                            ? `From LKR ${Math.min(...option.priceTiers.map(t => t.price)).toLocaleString()}`
                            : `LKR ${option.price.toLocaleString()} / ${option.unit}`
                          } · Stock: {option.stock}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                  noOptionsText="No products found"
                  sx={{ mb: 1.5 }}
                />

                {/* Product picker panel */}
                {selectedProduct && (
                  <Box sx={{ mb: 2, p: 2, bgcolor: '#F8F9FA', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                    {hasTiers ? (
                      <>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                          Quick select
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
                          {tiers.map((t, i) => {
                            const tb = toBase(t.qty, t.inputUnit);
                            const inDisplay = parseFloat(fromBase(tb, displayUnit).toFixed(6));
                            return (
                              <Box key={i} onClick={() => setInputValue(inDisplay.toString())}
                                sx={{ px: 1.5, py: 0.5, borderRadius: 1.5, cursor: 'pointer', border: '1.5px solid', borderColor: 'divider', bgcolor: 'white', '&:hover': { borderColor: GOLD, bgcolor: `${GOLD}10` } }}>
                                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{t.label}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {t.isBulk ? `LKR ${t.price.toLocaleString()} / ${t.inputUnit}` : `LKR ${t.price.toLocaleString()}`}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                          <TextField label="Amount" type="number" size="small" value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            placeholder={`e.g. ${minDisplay}`} error={isBelowMin}
                            slotProps={{ htmlInput: { min: minDisplay, step: minDisplay } }}
                            sx={{ width: 120 }} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{displayUnit}</Typography>
                        </Box>
                        {isBelowMin && (
                          <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5 }}>
                            Minimum: {minDisplay} {displayUnit}
                          </Typography>
                        )}
                        {bestOption && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1.5, p: 1.5, borderRadius: 1.5, bgcolor: `${GOLD}12`, border: `1px solid ${GOLD}50` }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="caption" color="text.secondary">Best price</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {parseFloat(bestOption.units.toFixed(4))} × {bestOption.tier.label}
                              </Typography>
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 800, color: GOLD }}>
                              LKR {bestOption.total % 1 === 0 ? bestOption.total.toLocaleString() : bestOption.total.toFixed(2)}
                            </Typography>
                          </Box>
                        )}
                      </>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="body2" color="text.secondary">Qty</Typography>
                        <TextField type="number" size="small" value={simpleQty}
                          onChange={e => {
                            const v = selectedProduct.allowDecimal ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
                            if (!isNaN(v) && v > 0) setSimpleQty(v);
                          }}
                          slotProps={{ htmlInput: { min: 1, step: selectedProduct.allowDecimal ? 0.5 : 1 } }}
                          sx={{ width: 90 }} />
                        <Typography variant="body2" color="text.secondary">{selectedProduct.unit}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: NAVY, ml: 1 }}>
                          = LKR {(selectedProduct.price * simpleQty).toLocaleString()}
                        </Typography>
                      </Box>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
                      <Button variant="contained" color="secondary" startIcon={<AddIcon />}
                        onClick={addProduct} disabled={!canAdd}>
                        Add to Order
                      </Button>
                    </Box>
                  </Box>
                )}

                {/* Items table */}
                {orderItems.length === 0 ? (
                  <Box sx={{ border: '2px dashed', borderColor: 'divider', borderRadius: 2, p: 4, textAlign: 'center', color: 'text.secondary' }}>
                    <Typography variant="body2">Search and add products above</Typography>
                  </Box>
                ) : (
                  <>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' } }}>
                          <TableCell>Product</TableCell>
                          <TableCell align="center">Qty</TableCell>
                          <TableCell align="right">Unit Price</TableCell>
                          <TableCell align="right">Total</TableCell>
                          <TableCell padding="checkbox" />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {orderItems.map(item => {
                          const step = item.decimalQty ? 0.5 : 1;
                          const lineTotal = item.price * item.quantity;
                          return (
                            <TableRow key={item.cartKey} sx={{ '&:last-child td': { border: 0 } }}>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Avatar src={item.product.images[0]} variant="rounded" sx={{ width: 28, height: 28, flexShrink: 0 }} />
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>{item.product.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell align="center">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                                  {!item.decimalQty && (
                                    <IconButton size="small" onClick={() => changeQty(item.cartKey, -step)}>
                                      <RemoveIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  )}
                                  <TextField type="number" value={item.quantity}
                                    onChange={e => {
                                      const v = item.decimalQty ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
                                      setQty(item.cartKey, isNaN(v) ? 0 : v);
                                    }}
                                    size="small" sx={{ width: item.decimalQty ? 72 : 48 }}
                                    slotProps={{ htmlInput: { style: { textAlign: 'center', padding: '4px' }, min: step, step } }}
                                  />
                                  {!item.decimalQty && (
                                    <IconButton size="small" onClick={() => changeQty(item.cartKey, step)}>
                                      <AddIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  )}
                                  {item.decimalQty && (
                                    <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell align="right">
                                <TextField type="number" value={item.price}
                                  onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v) && v >= 0) setItemPrice(item.cartKey, v);
                                  }}
                                  size="small" sx={{ width: 110 }}
                                  slotProps={{
                                    input: { startAdornment: <InputAdornment position="start"><Typography variant="caption" color="text.secondary">LKR</Typography></InputAdornment> },
                                    htmlInput: { min: 0, step: 'any', style: { textAlign: 'right', padding: '4px 6px', fontWeight: 600 } },
                                  }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontSize: 13 }}>
                                {lineTotal % 1 === 0 ? lineTotal.toLocaleString() : lineTotal.toFixed(2)}
                              </TableCell>
                              <TableCell padding="checkbox">
                                <IconButton size="small" color="error" onClick={() => removeItem(item.cartKey)}>
                                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>

                    {/* Packaging section */}
                    <Box sx={{ mt: 3 }}>
                      <Divider sx={{ mb: 2 }}>
                        <Chip label="Packaging — internal" size="small" sx={{ bgcolor: '#7B1FA218', color: '#7B1FA2', fontWeight: 600, fontSize: 11 }} />
                      </Divider>

                      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                        <Autocomplete
                          options={packagingProducts}
                          getOptionLabel={p => p.name}
                          value={selectedPkg}
                          onChange={(_, v) => { setSelectedPkg(v); setPkgQty(1); }}
                          renderOption={(props, option) => (
                            <Box component="li" {...props} sx={{ gap: 1.5 }}>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>{option.name}</Typography>
                                <Typography variant="caption" color="text.secondary">LKR {option.price} / {option.unit} · Stock: {option.stock}</Typography>
                              </Box>
                            </Box>
                          )}
                          renderInput={params => <TextField {...params} label="Add packaging item" size="small" />}
                          noOptionsText="No packaging items"
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          type="number"
                          label="Qty"
                          size="small"
                          value={pkgQty}
                          onChange={e => setPkgQty(Math.max(1, parseInt(e.target.value) || 1))}
                          disabled={!selectedPkg}
                          sx={{ width: 72 }}
                          slotProps={{ htmlInput: { min: 1, step: 1 } }}
                        />
                        <Button variant="outlined" size="small" startIcon={<AddIcon />}
                          onClick={addPackaging} disabled={!selectedPkg} sx={{ flexShrink: 0 }}>
                          Add
                        </Button>
                      </Box>

                      {packagingItems.length > 0 && (
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ '& th': { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' } }}>
                              <TableCell>Item</TableCell>
                              <TableCell align="center">Qty</TableCell>
                              <TableCell align="right">Unit Cost</TableCell>
                              <TableCell align="right">Total</TableCell>
                              <TableCell padding="checkbox" />
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {packagingItems.map(item => (
                              <TableRow key={item.cartKey} sx={{ '&:last-child td': { border: 0 } }}>
                                <TableCell>
                                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.product.name}</Typography>
                                  <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                                </TableCell>
                                <TableCell align="center">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                                    <IconButton size="small" onClick={() => setPackagingItemQty(item.cartKey, item.quantity - 1)}>
                                      <RemoveIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                    <TextField type="number" value={item.quantity}
                                      onChange={e => setPackagingItemQty(item.cartKey, parseInt(e.target.value) || 0)}
                                      size="small" sx={{ width: 48 }}
                                      slotProps={{ htmlInput: { style: { textAlign: 'center', padding: '4px' }, min: 1 } }}
                                    />
                                    <IconButton size="small" onClick={() => setPackagingItemQty(item.cartKey, item.quantity + 1)}>
                                      <AddIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  <TextField type="number" value={item.price}
                                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setPackagingItemPrice(item.cartKey, v); }}
                                    size="small" sx={{ width: 100 }}
                                    slotProps={{
                                      input: { startAdornment: <InputAdornment position="start"><Typography variant="caption" color="text.secondary">LKR</Typography></InputAdornment> },
                                      htmlInput: { min: 0, step: 'any', style: { textAlign: 'right', padding: '4px 6px', fontWeight: 600 } },
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                                  {(item.price * item.quantity).toLocaleString()}
                                </TableCell>
                                <TableCell padding="checkbox">
                                  <IconButton size="small" color="error" onClick={() => removePackagingItem(item.cartKey)}>
                                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </Box>

                    {/* Order Summary */}
                    <Box sx={{ mt: 2.5, p: 2, bgcolor: '#F8F9FC', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                        <Typography variant="body2">LKR {subtotal.toLocaleString()}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          Delivery Fee{selectedCity ? ` · ${selectedCity.name}` : ''}
                        </Typography>
                        <TextField type="number" size="small" value={deliveryFee || ''}
                          onChange={e => setDeliveryFee(Math.max(0, parseFloat(e.target.value) || 0))}
                          placeholder="0" sx={{ width: 130 }}
                          slotProps={{
                            input: { startAdornment: <InputAdornment position="start"><Typography variant="caption" color="text.secondary">LKR</Typography></InputAdornment> },
                            htmlInput: { min: 0, step: 50, style: { textAlign: 'right', padding: '4px 6px' } },
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Discount</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <ToggleButtonGroup value={discountType} exclusive
                            onChange={(_, v) => v && setDiscountType(v)} size="small">
                            <ToggleButton value="fixed" sx={{ px: 1.25, py: 0.25, fontSize: 11, lineHeight: 1.8 }}>LKR</ToggleButton>
                            <ToggleButton value="percentage" sx={{ px: 1.25, py: 0.25, fontSize: 11, lineHeight: 1.8 }}>%</ToggleButton>
                          </ToggleButtonGroup>
                          <TextField type="number" size="small" value={discountValue || ''}
                            onChange={e => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                            placeholder="0" sx={{ width: 90 }}
                            slotProps={{ htmlInput: { min: 0, max: discountType === 'percentage' ? 100 : undefined, step: discountType === 'percentage' ? 5 : 100, style: { textAlign: 'right', padding: '4px 6px' } } }}
                          />
                        </Box>
                      </Box>
                      {discountAmount > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                            –LKR {discountAmount.toLocaleString()}
                          </Typography>
                        </Box>
                      )}
                      <Divider sx={{ my: 1.5 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Total</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY }}>
                          LKR {total.toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3 }}>
          <Button onClick={() => navigate('/admin/orders')} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting || orderItems.length === 0}
            sx={{ bgcolor: GOLD, color: NAVY, fontWeight: 700, minWidth: 160, '&:hover': { bgcolor: '#A8864E' } }}>
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'Create Order'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
