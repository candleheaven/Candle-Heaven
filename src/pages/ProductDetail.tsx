import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Grid, Box, Typography, Button, Chip, Divider,
  TextField, Skeleton, Alert, Breadcrumbs, Link, Stack, List,
  ListItem, ListItemText,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { getProductById, getProductsByIds } from '../services/products';
import { useCart } from '../context/CartContext';
import type { Product, CartItem, PriceTier } from '../types';

const GOLD = '#C9A96E';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minPrice(product: Product): number {
  if (!product.priceTiers?.length) return product.price;
  return Math.min(...product.priceTiers.map(t => t.price));
}
function maxPrice(product: Product): number {
  if (!product.priceTiers?.length) return product.price;
  return Math.max(...product.priceTiers.map(t => t.price));
}

/** Normalise a quantity to an integer base unit (grams for weight, ml for liquid). */
function toBase(qty: number, unit: string): number {
  if (unit === 'kg') return Math.round(qty * 1000);
  if (unit === 'L')  return Math.round(qty * 1000);
  return Math.round(qty);
}

/** Convert a base integer back to the desired display unit. */
function fromBase(qty: number, unit: string): number {
  if (unit === 'kg') return qty / 1000;
  if (unit === 'L')  return qty / 1000;
  return qty;
}

// product.unit is the admin-set display unit (g, kg, ml, L, piece).
// Stock is stored in base units; product.unit controls how it's shown.
function getDisplayUnit(product: Product): string {
  return product.unit;
}

interface BestOption {
  tier: PriceTier;
  tierBase: number; // base units per reference unit (e.g. 500 for "500g" tier)
  units: number;    // how many reference units (e.g. 1.5 means 1.5 × 500g)
  total: number;
  label: string;    // e.g. "1.5 × 500g"
}

/**
 * Find the tier with the highest minimum quantity that the entered amount satisfies,
 * then apply that tier's per-unit rate to the whole amount.
 *
 * Example — 0.75 kg with tiers [250g, 500g, 1kg+]:
 *   250g tier (min 250g) ← satisfied
 *   500g tier (min 500g) ← satisfied, higher minimum → wins
 *   1 kg tier (min 1000g) ← NOT satisfied
 *   → 0.75 kg / 0.5 kg = 1.5 units × LKR 440 = LKR 660
 */
function getBestOption(baseQty: number, tiers: PriceTier[]): BestOption | null {
  let bestTier: PriceTier | null = null;
  let bestTierBase = -1;

  for (const tier of tiers) {
    const tierBase = toBase(tier.qty, tier.inputUnit);
    if (baseQty >= tierBase && tierBase > bestTierBase) {
      bestTier = tier;
      bestTierBase = tierBase;
    }
  }

  if (!bestTier) return null;

  const units = baseQty / bestTierBase;
  const total = units * bestTier.price;
  const label = `${parseFloat(units.toFixed(4))} × ${bestTier.label}`;
  return { tier: bestTier, tierBase: bestTierBase, units, total, label };
}

// ─── Simple quantity selector (no tiers) ─────────────────────────────────────

function SimpleQuantityInput({
  product,
  qty,
  onChange,
  maxQty,
}: { product: Product; qty: number; onChange: (v: number) => void; maxQty: number }) {
  const step = product.allowDecimal ? 0.5 : 1;
  const min = product.minOrder || 1;
  const isOverStock = qty > maxQty;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 70 }}>Quantity</Typography>
        <TextField
          type="number"
          size="small"
          value={qty}
          onChange={e => {
            const v = product.allowDecimal ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= min) onChange(v);
          }}
          error={isOverStock}
          slotProps={{ htmlInput: { min, step, max: maxQty, style: { width: 80, textAlign: 'center' } } }}
          sx={{ width: 100 }}
        />
        <Typography variant="caption" color="text.secondary">{product.unit}</Typography>
      </Box>
      {isOverStock && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5, ml: '86px' }}>
          Only {maxQty} remaining
        </Typography>
      )}
    </Box>
  );
}

// ─── Smart tiered selector ────────────────────────────────────────────────────
// • All-fixed tiers  → chip-picker only; no free text input
// • Any bulk tier    → amount input with auto best-price

function TieredSelector({
  product,
  onAddToCart,
}: {
  product: Product;
  onAddToCart: (item: CartItem) => void;
}) {
  const tiers = product.priceTiers!;
  const hasBulk = tiers.some(t => t.isBulk);

  // ── Fixed-only selector ──────────────────────────────────────────────────
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [fixedAdded, setFixedAdded] = useState(false);
  const { openCart, items: cartItems } = useCart();

  const cartedBaseQtyFixed = cartItems
    .filter(i => i.productId === product.id)
    .reduce((s, i) => s + (i.tierBase ? i.quantity * i.tierBase : 0), 0);

  function handleFixedAdd() {
    if (selectedIdx === null) return;
    const tier = tiers[selectedIdx];
    const tierBase = toBase(tier.qty, tier.inputUnit);
    onAddToCart({
      productId: product.id,
      cartKey: `${product.id}-${tier.label}`,
      name: product.name,
      price: tier.price,
      quantity: 1,
      unit: tier.label,
      image: product.images?.[0],
      decimalQty: false,
      minQty: 1,
      tierBase,
      maxCartQty: Math.floor(product.stock / tierBase),
      weightGrams: tierBase * (product.weightGrams ?? 1),
      category: product.category,
    });
    setFixedAdded(true);
    setTimeout(() => setFixedAdded(false), 3000);
  }

  if (!hasBulk) {
    return (
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Select size</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2.5 }}>
          {tiers.map((t, i) => {
            const tierBase = toBase(t.qty, t.inputUnit);
            const available = Math.floor((product.stock - cartedBaseQtyFixed) / tierBase);
            const outOfStock = available <= 0;
            const active = selectedIdx === i;
            return (
              <Box
                key={i}
                onClick={() => { if (!outOfStock) setSelectedIdx(i); }}
                sx={{
                  px: 2, py: 0.75, borderRadius: 2,
                  cursor: outOfStock ? 'not-allowed' : 'pointer',
                  opacity: outOfStock ? 0.45 : 1,
                  border: '1.5px solid',
                  borderColor: active ? GOLD : 'divider',
                  bgcolor: active ? `${GOLD}15` : 'transparent',
                  transition: 'all 0.15s',
                  '&:hover': outOfStock ? {} : { borderColor: GOLD, bgcolor: `${GOLD}10` },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  LKR {t.price.toLocaleString()}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {selectedIdx !== null && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, p: 1.5, borderRadius: 2, bgcolor: `${GOLD}12`, border: `1px solid ${GOLD}50` }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{tiers[selectedIdx].label}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: GOLD }}>
              LKR {tiers[selectedIdx].price.toLocaleString()}
            </Typography>
          </Box>
        )}

        {fixedAdded && (
          <Alert severity="success" sx={{ mb: 2 }} action={
            <Button size="small" onClick={openCart}>View Cart</Button>
          }>
            Added to cart!
          </Alert>
        )}

        <Button
          variant="contained"
          size="large"
          fullWidth
          startIcon={<AddShoppingCartIcon />}
          disabled={selectedIdx === null || !product.stock}
          onClick={handleFixedAdd}
          sx={{ py: 1.5 }}
        >
          {!product.stock ? 'Out of Stock' : 'Add to Cart'}
        </Button>
      </Box>
    );
  }

  // ── Bulk (or mixed) selector ─────────────────────────────────────────────
  return <BulkTieredSelector product={product} onAddToCart={onAddToCart} />;
}

function BulkTieredSelector({
  product,
  onAddToCart,
}: {
  product: Product;
  onAddToCart: (item: CartItem) => void;
}) {
  const tiers = product.priceTiers!;
  const [inputValue, setInputValue] = useState('');
  const [added, setAdded] = useState(false);
  const { openCart, items: cartItems } = useCart();

  const displayUnit = product.unit;

  const fixedTiers = tiers.filter(t => !t.isBulk).sort((a, b) => toBase(a.qty, a.inputUnit) - toBase(b.qty, b.inputUnit));
  const minBase = fixedTiers.length > 0 ? toBase(fixedTiers[0].qty, fixedTiers[0].inputUnit) : 1;
  const minDisplay = parseFloat(fromBase(minBase, displayUnit).toFixed(6));

  const inputNum = parseFloat(inputValue);
  const baseQty = !isNaN(inputNum) && inputNum > 0 ? toBase(inputNum, displayUnit) : 0;
  const bestOption = baseQty > 0 ? getBestOption(baseQty, tiers) : null;

  const hasInput = inputValue !== '' && !isNaN(inputNum) && inputNum > 0;
  const isBelowMin = hasInput && baseQty < minBase;
  const cartedBaseQty = cartItems
    .filter(i => i.productId === product.id)
    .reduce((s, i) => s + (i.tierBase ? i.quantity * i.tierBase : 0), 0);
  const isOverStock = product.stock > 0 && baseQty > 0 && (baseQty + cartedBaseQty) > product.stock;
  const stockInDisplay = parseFloat(fromBase(product.stock - cartedBaseQty, displayUnit).toFixed(3));

  function setTierAmount(tier: PriceTier) {
    const tierBase = toBase(tier.qty, tier.inputUnit);
    const inDisplay = fromBase(tierBase, displayUnit);
    setInputValue(parseFloat(inDisplay.toFixed(6)).toString());
  }

  function handleAdd() {
    if (!bestOption) return;
    onAddToCart({
      productId: product.id,
      cartKey: `${product.id}-${bestOption.tier.label}`,
      name: product.name,
      price: bestOption.tier.price,
      quantity: bestOption.units,
      unit: bestOption.tier.label,
      image: product.images?.[0],
      decimalQty: true,
      minQty: 0.5,
      tierBase: bestOption.tierBase,
      maxCartQty: product.stock / bestOption.tierBase,
      weightGrams: baseQty * (product.weightGrams ?? 1),
      category: product.category,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Quick select</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2.5 }}>
        {tiers.map((t, i) => (
          <Box
            key={i}
            onClick={() => setTierAmount(t)}
            sx={{
              px: 2, py: 0.75, borderRadius: 2, cursor: 'pointer',
              border: '1.5px solid', borderColor: 'divider',
              transition: 'all 0.15s',
              '&:hover': { borderColor: GOLD, bgcolor: `${GOLD}10` },
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.label}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t.isBulk
                ? `LKR ${t.price.toLocaleString()} / ${t.inputUnit}`
                : `LKR ${t.price.toLocaleString()}`}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 70 }}>Amount</Typography>
        <TextField
          type="number"
          size="small"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder={`e.g. ${minDisplay}`}
          error={isBelowMin || isOverStock}
          slotProps={{ htmlInput: { min: minDisplay, step: minDisplay, max: stockInDisplay } }}
          sx={{ width: 110 }}
        />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{displayUnit}</Typography>
      </Box>

      {isBelowMin && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1, ml: '86px' }}>
          Minimum order: {minDisplay} {displayUnit}
        </Typography>
      )}
      {isOverStock && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1, ml: '86px' }}>
          Only {stockInDisplay} {displayUnit} remaining
        </Typography>
      )}

      {bestOption && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1.5, mb: 2, p: 1.5, borderRadius: 2, bgcolor: `${GOLD}12`, border: `1px solid ${GOLD}50` }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Best price</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{bestOption.label}</Typography>
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: GOLD }}>
            LKR {bestOption.total % 1 === 0
              ? bestOption.total.toLocaleString()
              : bestOption.total.toFixed(2)}
          </Typography>
        </Box>
      )}

      {!hasInput && (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', mb: 2 }}>
          Enter an amount above or use a quick-select button
        </Typography>
      )}

      {added && (
        <Alert severity="success" sx={{ mb: 2 }} action={
          <Button size="small" onClick={openCart}>View Cart</Button>
        }>
          Added to cart!
        </Alert>
      )}

      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={<AddShoppingCartIcon />}
        disabled={!bestOption || isBelowMin || isOverStock || !product.stock}
        onClick={handleAdd}
        sx={{ py: 1.5 }}
      >
        {!product.stock ? 'Out of Stock' : 'Add to Cart'}
      </Button>
    </Box>
  );
}

// ─── Starter Pack selector ────────────────────────────────────────────────────

function formatQty(qty: number, unit: string): string {
  if (unit === 'g' && qty >= 1000) return `${parseFloat((qty / 1000).toFixed(3))} kg`;
  if (unit === 'ml' && qty >= 1000) return `${parseFloat((qty / 1000).toFixed(3))} L`;
  return `${qty} ${unit}`;
}

function PackSelector({ product }: { product: Product }) {
  const { addItem, openCart, items: cartItems } = useCart();
  const [componentProducts, setComponentProducts] = useState<Product[]>([]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const components = product.packComponents ?? [];

  useEffect(() => {
    const ids = components.map(c => c.productId);
    if (ids.length) getProductsByIds(ids).then(setComponentProducts);
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxPackQty = components.length === 0 ? 0 : Math.min(
    ...components.map(comp => {
      const cp = componentProducts.find(p => p.id === comp.productId);
      return cp ? Math.floor(cp.stock / comp.quantity) : 0;
    })
  );

  const cartedQty = cartItems.filter(i => i.productId === product.id).reduce((s, i) => s + i.quantity, 0);
  const available = Math.max(0, maxPackQty - cartedQty);
  const isAvailable = available > 0;

  const retailSum = components.reduce((s, c) => s + c.retailPrice, 0);
  const savings = retailSum > product.price ? retailSum - product.price : 0;

  function handleAdd() {
    addItem({
      productId: product.id,
      cartKey: product.id,
      name: product.name,
      price: product.price,
      quantity: qty,
      unit: 'pack',
      image: product.images?.[0],
      decimalQty: false,
      minQty: 1,
      maxCartQty: available,
      category: product.category,
      packComponents: components.map(c => ({ productId: c.productId, quantity: c.quantity })),
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  }

  return (
    <Box>
      {/* What's included */}
      {components.length > 0 && (
        <Box sx={{ mb: 3, p: 2, bgcolor: '#F9F7F4', borderRadius: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'text.secondary', display: 'block', mb: 1 }}>
            What's Included
          </Typography>
          <List dense disablePadding>
            {components.map((comp, i) => (
              <ListItem key={i} disablePadding sx={{ py: 0.25 }}>
                <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: 'success.main', mr: 1, flexShrink: 0 }} />
                <ListItemText
                  primary={<Typography variant="body2">{comp.name}</Typography>}
                  secondary={formatQty(comp.quantity, comp.unit)}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Savings */}
      {savings > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Chip label={`You save LKR ${savings.toLocaleString()}`} size="small"
            sx={{ fontWeight: 700, bgcolor: '#D4EDDA', color: '#155724' }} />
          <Typography variant="caption" color="text.secondary">
            vs. buying items individually
          </Typography>
        </Box>
      )}

      {/* Qty + add */}
      {isAvailable ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 70 }}>Quantity</Typography>
            <TextField
              type="number"
              size="small"
              value={qty}
              onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1 && v <= available) setQty(v); }}
              slotProps={{ htmlInput: { min: 1, max: available, style: { width: 60, textAlign: 'center' } } }}
              sx={{ width: 90 }}
            />
            <Typography variant="caption" color="text.secondary">{available} available</Typography>
          </Box>
          {added && (
            <Alert severity="success" sx={{ mb: 2 }} action={<Button size="small" onClick={openCart}>View Cart</Button>}>
              Added to cart!
            </Alert>
          )}
          <Button variant="contained" size="large" fullWidth startIcon={<AddShoppingCartIcon />}
            onClick={handleAdd} sx={{ py: 1.5 }}>
            Add to Cart — LKR {(product.price * qty).toLocaleString()}
          </Button>
        </>
      ) : (
        <Button variant="contained" size="large" fullWidth disabled sx={{ py: 1.5 }}>
          Out of Stock
        </Button>
      )}
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem, openCart, items: cartItems } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [selectedImg, setSelectedImg] = useState(0);
  const [simpleAdded, setSimpleAdded] = useState(false);

  useEffect(() => {
    if (!id) return;
    getProductById(id)
      .then(p => { setProduct(p); setQty(p?.minOrder ?? 1); })
      .finally(() => setLoading(false));
  }, [id]);

  function handleSimpleAdd() {
    if (!product) return;
    const cartedQty = cartItems
      .filter(i => i.productId === product.id)
      .reduce((s, i) => s + i.quantity, 0);
    if (qty + cartedQty > product.stock) return;
    addItem({
      productId: product.id,
      cartKey: product.id,
      name: product.name,
      price: product.price,
      quantity: qty,
      unit: product.unit,
      image: product.images?.[0],
      decimalQty: product.allowDecimal,
      minQty: product.minOrder || 1,
      maxCartQty: product.stock,
      weightGrams: (product.weightGrams ?? 0) * qty,
      category: product.category,
    });
    setSimpleAdded(true);
    setTimeout(() => setSimpleAdded(false), 3000);
  }

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton variant="rectangular" height={420} sx={{ borderRadius: 3 }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Skeleton height={40} sx={{ mb: 1 }} />
            <Skeleton height={24} width="60%" sx={{ mb: 2 }} />
            <Skeleton height={80} />
          </Grid>
        </Grid>
      </Container>
    );
  }

  if (!product) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>Product not found</Typography>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Container>
    );
  }

  const isPack = Boolean(product.isStarterPack);
  const inStock = product.stock > 0;
  const imgs = product.images?.length ? product.images : ['/placeholder-product.jpg'];
  const hasTiers = Boolean(product.priceTiers?.length);
  const tierDisplayUnit = hasTiers ? getDisplayUnit(product) : product.unit;
  const stockLabel = inStock
    ? hasTiers
      ? `In Stock (${parseFloat(fromBase(product.stock, tierDisplayUnit).toFixed(3))} ${tierDisplayUnit})`
      : `In Stock (${product.stock} ${product.unit})`
    : 'Out of Stock';
  const simpleCartedQty = !hasTiers
    ? cartItems.filter(i => i.productId === product.id).reduce((s, i) => s + i.quantity, 0)
    : 0;
  const simpleOverStock = !hasTiers && (qty + simpleCartedQty) > product.stock;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link underline="hover" sx={{ cursor: 'pointer', color: 'text.secondary' }} onClick={() => navigate('/')}>Home</Link>
        <Link underline="hover" sx={{ cursor: 'pointer', color: 'text.secondary' }} onClick={() => navigate('/products')}>Products</Link>
        {product.category && (
          <Link underline="hover" sx={{ cursor: 'pointer', color: 'text.secondary', textTransform: 'capitalize' }} onClick={() => navigate(`/products?category=${product.category}`)}>
            {product.category === 'dye' ? 'Colours' : product.category}
          </Link>
        )}
        <Typography color="text.primary">{product.name}</Typography>
      </Breadcrumbs>

      <Grid container spacing={{ xs: 3, md: 6 }}>
        {/* Images */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Box
            component="img"
            src={imgs[selectedImg]}
            alt={product.name}
            sx={{ width: '100%', height: 420, objectFit: 'cover', borderRadius: 3, display: 'block', bgcolor: 'grey.100' }}
          />
          {imgs.length > 1 && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              {imgs.map((img, i) => (
                <Box key={i} component="img" src={img} alt="" onClick={() => setSelectedImg(i)}
                  sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 2, cursor: 'pointer', border: '2px solid', borderColor: selectedImg === i ? 'primary.main' : 'transparent', opacity: selectedImg === i ? 1 : 0.6, transition: 'all 0.15s' }}
                />
              ))}
            </Stack>
          )}
        </Grid>

        {/* Details */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Chip label={product.category} size="small"
            sx={{ bgcolor: 'primary.50', color: 'primary.dark', fontWeight: 600, textTransform: 'capitalize', mb: 1.5 }}
          />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>{product.name}</Typography>

          {hasTiers ? (
            <Box sx={{ mb: 0.5 }}>
              <Typography variant="h4" sx={{ fontWeight: 800 }} color="primary.main">
                LKR {minPrice(product).toLocaleString()}
                {maxPrice(product) !== minPrice(product) && (
                  <Typography component="span" variant="h5" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                    {' – '}{maxPrice(product).toLocaleString()}
                  </Typography>
                )}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
              <Typography variant="h4" sx={{ fontWeight: 800 }} color="primary.main">
                LKR {product.price.toLocaleString()}
              </Typography>
              <Typography variant="body1" color="text.secondary">/ {product.unit}</Typography>
            </Box>
          )}

          {isPack
            ? <Chip label="Starter Pack" size="small" sx={{ bgcolor: '#C9A96E', color: '#132040', fontWeight: 700, mb: 1.5 }} />
            : <Chip label={stockLabel} color={inStock ? 'success' : 'error'} size="small" sx={{ mb: 3 }} />
          }

          <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
            {product.description}
          </Typography>

          <Divider sx={{ mb: 3 }} />

          {isPack ? (
            <PackSelector product={product} />
          ) : inStock ? (
            hasTiers ? (
              <TieredSelector product={product} onAddToCart={addItem} />
            ) : (
              <>
                <SimpleQuantityInput product={product} qty={qty} onChange={setQty} maxQty={product.stock - simpleCartedQty} />
                {simpleAdded && (
                  <Alert severity="success" sx={{ mt: 2, mb: 1 }} action={
                    <Button size="small" onClick={openCart}>View Cart</Button>
                  }>
                    Added to cart!
                  </Alert>
                )}
                <Button variant="contained" size="large" fullWidth startIcon={<AddShoppingCartIcon />}
                  disabled={simpleOverStock}
                  onClick={handleSimpleAdd} sx={{ py: 1.5, mt: 2 }}>
                  Add to Cart
                </Button>
              </>
            )
          ) : (
            <Button variant="contained" size="large" fullWidth disabled sx={{ py: 1.5 }}>
              Out of Stock
            </Button>
          )}

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'text.secondary', mt: 2 }}>
            <LocalShippingOutlinedIcon fontSize="small" />
            <Typography variant="body2">Island-wide delivery available</Typography>
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
}
