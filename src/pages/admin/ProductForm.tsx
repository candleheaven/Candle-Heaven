import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Grid, TextField, Button, Typography,
  FormControlLabel, Switch, MenuItem, Alert, CircularProgress,
  Breadcrumbs, Link, Divider, IconButton, ToggleButton, ToggleButtonGroup,
  Tooltip, Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import { DeleteOutlined as DeleteOutlineIcon } from '@mui/icons-material';
import { HelpOutlined as HelpOutlineIcon } from '@mui/icons-material';
import { adminGetAllProducts, adminAddProduct, adminUpdateProduct } from '../../services/admin';
import type { Product, PriceTier } from '../../types';

const NAVY = '#132040';

const CATEGORIES = [
  { value: 'wax', label: 'Wax' },
  { value: 'fragrance', label: 'Fragrance Oils' },
  { value: 'wicks', label: 'Wicks' },
  { value: 'dye', label: 'Colours' },
  { value: 'molds', label: 'Molds' },
  { value: 'tools', label: 'Tools' },
  { value: 'kits', label: 'Kits' },
  { value: 'packaging', label: 'Packaging / Internal' },
];

const UNITS = ['g', 'kg', 'ml', 'L', 'piece', 'pack', 'set'];

interface FormState {
  name: string;
  description: string;
  category: string;
  price: string;
  unit: string;
  stock: string;
  minOrder: string;
  weightGrams: string;
  featured: boolean;
  isPackaging: boolean;
  imageUrls: string[];
  pricingMode: 'simple' | 'tiered';
  stockUnit: string;   // for tiered products: the base unit stock is stored/displayed in
  priceTiers: PriceTier[];
  allowDecimal: boolean;
  lowStockThreshold: string;
  costPrice: string;  // buying cost in display unit (LKR/kg, LKR/piece, etc.)
}

const EMPTY_TIER: PriceTier = { label: '', qty: 1, inputUnit: 'g', price: 0, isBulk: false };

const EMPTY: FormState = {
  name: '', description: '', category: 'wax',
  price: '', unit: 'g', stock: '', minOrder: '1',
  weightGrams: '',
  featured: false, isPackaging: false, imageUrls: [''],
  pricingMode: 'simple',
  stockUnit: 'g',
  priceTiers: [],
  allowDecimal: false,
  lowStockThreshold: '',
  costPrice: '',
};

export default function ProductForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    adminGetAllProducts().then(products => {
      const p = products.find(x => x.id === id);
      if (p) {
        setForm({
          name: p.name,
          description: p.description,
          category: p.category,
          price: p.price.toString(),
          unit: p.unit,
          // For tiered products, convert stored base-unit stock back to display unit for the field
          stock: (() => {
            if (!p.priceTiers?.length) return p.stock.toString();
            const u = UNITS.includes(p.unit) ? p.unit : 'g';
            const m = (u === 'kg' || u === 'L') ? 1000 : 1;
            return (p.stock / m).toString();
          })(),
          minOrder: p.minOrder.toString(),
          featured: p.featured,
          isPackaging: p.isPackaging ?? false,
          imageUrls: p.images.length ? p.images : [''],
          weightGrams: p.weightGrams?.toString() ?? '',
          pricingMode: p.priceTiers?.length ? 'tiered' : 'simple',
          // If product.unit is a standard unit it was set explicitly; otherwise infer from tiers
          stockUnit: UNITS.includes(p.unit) ? p.unit : (p.priceTiers?.[0]?.inputUnit ?? 'g'),
          priceTiers: p.priceTiers ? [...p.priceTiers] : [],
          allowDecimal: p.allowDecimal ?? false,
          lowStockThreshold: p.lowStockThreshold !== undefined ? p.lowStockThreshold.toString() : '',
          costPrice: (() => {
            if (p.averageCost === undefined) return '';
            const u = UNITS.includes(p.unit) ? p.unit : (p.priceTiers?.[0]?.inputUnit ?? 'g');
            const m = (u === 'kg' || u === 'L') ? 1000 : 1;
            return parseFloat((p.averageCost * m).toFixed(4)).toString();
          })(),
        });
      }
      setLoading(false);
    });
  }, [id]);

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }

  // Tier management
  function addTier() {
    setForm(f => ({ ...f, priceTiers: [...f.priceTiers, { ...EMPTY_TIER }] }));
  }

  function removeTier(i: number) {
    setForm(f => ({ ...f, priceTiers: f.priceTiers.filter((_, idx) => idx !== i) }));
  }

  function setTierField(i: number, field: keyof PriceTier, value: string | number | boolean) {
    setForm(f => ({
      ...f,
      priceTiers: f.priceTiers.map((t, idx) => idx === i ? { ...t, [field]: value } : t),
    }));
  }

  function validate(): string {
    if (!form.name.trim()) return 'Product name is required.';
    if (!form.description.trim()) return 'Description is required.';
    if (!form.category) return 'Category is required.';
    const stock = parseInt(form.stock, 10);
    if (isNaN(stock) || stock < 0) return 'Enter a valid stock quantity.';
    const minOrder = parseInt(form.minOrder, 10);
    if (isNaN(minOrder) || minOrder < 1) return 'Min order must be at least 1.';

    if (form.pricingMode === 'simple') {
      const price = parseFloat(form.price);
      if (isNaN(price) || price <= 0) return 'Enter a valid price.';
      if (!form.unit.trim()) return 'Unit is required (e.g. 500g, piece).';
    } else {
      if (form.priceTiers.length === 0) return 'Add at least one price tier.';
      for (const [i, t] of form.priceTiers.entries()) {
        if (!t.label.trim()) return `Tier ${i + 1}: label is required.`;
        if (!t.inputUnit.trim()) return `Tier ${i + 1}: unit is required.`;
        if (t.price <= 0) return `Tier ${i + 1}: enter a valid price.`;
        if (t.qty <= 0) return `Tier ${i + 1}: enter a valid quantity.`;
      }
    }
    return '';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSaving(true);

    const isTiered = form.pricingMode === 'tiered';
    // For tiered products, set the base price to the minimum tier price for display
    const basePrice = isTiered
      ? Math.min(...form.priceTiers.map(t => t.price))
      : parseFloat(form.price);
    const baseUnit = isTiered ? form.stockUnit : form.unit.trim();

    const product: Omit<Product, 'id'> = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      price: basePrice,
      unit: baseUnit,
      stock: isTiered
        ? Math.round(parseFloat(form.stock) * ((form.stockUnit === 'kg' || form.stockUnit === 'L') ? 1000 : 1))
        : parseInt(form.stock, 10),
      minOrder: parseInt(form.minOrder, 10),
      featured: form.isPackaging ? false : form.featured,
      isPackaging: form.isPackaging || undefined,
      images: form.imageUrls.map(u => u.trim()).filter(Boolean),
      priceTiers: isTiered ? form.priceTiers : undefined,
      allowDecimal: form.allowDecimal,
      weightGrams: form.weightGrams ? parseFloat(form.weightGrams) : undefined,
      lowStockThreshold: form.lowStockThreshold ? parseFloat(form.lowStockThreshold) : undefined,
      averageCost: (() => {
        if (!form.costPrice) return undefined;
        const displayUnit = isTiered ? form.stockUnit : form.unit.trim();
        const m = (displayUnit === 'kg' || displayUnit === 'L') ? 1000 : 1;
        return parseFloat((parseFloat(form.costPrice) / m).toFixed(6));
      })(),
    };

    try {
      if (isEditing && id) {
        await adminUpdateProduct(id, product);
      } else {
        await adminAddProduct(product);
      }
      navigate('/admin/products');
    } catch (err) {
      console.error('Product save error:', err);
      setError('Failed to save product. Please try again.');
      setSaving(false);
    }
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Breadcrumbs sx={{ mb: 1 }}>
          <Link component="button" variant="body2" onClick={() => navigate('/admin/products')}
            sx={{ cursor: 'pointer', color: 'text.secondary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
            Products
          </Link>
          <Typography variant="body2" color="text.primary">
            {isEditing ? 'Edit Product' : 'New Product'}
          </Typography>
        </Breadcrumbs>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin/products')} sx={{ color: 'text.secondary' }}>
            Back
          </Button>
          <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY }}>
            {isEditing ? 'Edit Product' : 'Add New Product'}
          </Typography>
        </Box>
      </Box>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', maxWidth: 860 }}>
        <CardContent sx={{ p: 3 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <Grid container spacing={2.5}>
              {/* Basic info */}
              <Grid size={{ xs: 12 }}>
                <TextField label="Product Name" value={form.name} onChange={set('name')} fullWidth required />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField label="Description" value={form.description} onChange={set('description')}
                  fullWidth required multiline rows={3} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select label="Category" value={form.category} onChange={set('category')} fullWidth required>
                  {CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField label="Stock" value={form.stock} onChange={set('stock')} fullWidth required
                  type="number" slotProps={{ htmlInput: { min: 0, step: 0.001 } }}
                  helperText={form.pricingMode === 'tiered' ? `in ${form.stockUnit}` : undefined} />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="Low stock alert"
                  value={form.lowStockThreshold}
                  onChange={set('lowStockThreshold')}
                  fullWidth
                  type="number"
                  slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                  helperText={`in ${form.pricingMode === 'tiered' ? form.stockUnit : form.unit || 'units'} (optional)`}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="Buying cost"
                  value={form.costPrice}
                  onChange={set('costPrice')}
                  fullWidth
                  type="number"
                  slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                  helperText={`LKR per ${form.pricingMode === 'tiered' ? form.stockUnit : form.unit || 'unit'}`}
                />
              </Grid>
              {form.pricingMode === 'simple' && (
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField label="Min Order" value={form.minOrder} onChange={set('minOrder')} fullWidth required
                    type="number" slotProps={{ htmlInput: { min: 1, step: 1 } }} helperText="Units per order" />
                </Grid>
              )}

              {/* Estimated weight */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label={form.pricingMode === 'tiered' ? 'Weight factor (g per base unit)' : 'Estimated weight per unit (g)'}
                  value={form.weightGrams}
                  onChange={set('weightGrams')}
                  fullWidth
                  type="number"
                  slotProps={{ htmlInput: { min: 0, step: form.pricingMode === 'tiered' ? 0.01 : 1 } }}
                  helperText={
                    form.pricingMode === 'tiered'
                      ? 'Grams per g/ml. Default 1.0 (solids). Use ~0.9 for liquid fragrance oils.'
                      : 'Total weight per unit including packaging, used for delivery calculation.'
                  }
                />
              </Grid>

              {/* Pricing mode */}
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ mb: 1 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Pricing</Typography>
                  <ToggleButtonGroup
                    exclusive
                    value={form.pricingMode}
                    onChange={(_, v) => v && setForm(f => ({ ...f, pricingMode: v }))}
                    size="small"
                  >
                    <ToggleButton value="simple">Simple price</ToggleButton>
                    <ToggleButton value="tiered">Tiered (size/quantity breaks)</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {form.pricingMode === 'simple' ? (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6, sm: 4 }}>
                      <TextField label="Price (LKR)" value={form.price} onChange={set('price')} fullWidth required
                        type="number" slotProps={{ htmlInput: { min: 0, step: 'any' } }} />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                      <TextField label="Unit" value={form.unit} onChange={set('unit')} fullWidth required
                        placeholder="e.g. 500g, piece, pack/50" />
                    </Grid>
                  </Grid>
                ) : (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        Price tiers — customers select a size or enter a custom bulk amount.
                      </Typography>
                      <Tooltip title="Fixed tier: customer buys N packs at the set price. Bulk tier: customer enters any amount ≥ the minimum; price is charged per unit (e.g. per kg).">
                        <HelpOutlineIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                      </Tooltip>
                    </Box>

                    {form.priceTiers.length > 0 && (
                      <Table size="small" sx={{ mb: 1.5 }}>
                        <TableHead>
                          <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' } }}>
                            <TableCell>Label</TableCell>
                            <TableCell>Qty</TableCell>
                            <TableCell>Unit</TableCell>
                            <TableCell>Price (LKR)</TableCell>
                            <TableCell align="center" sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                              <Tooltip title="Bulk = open-ended; customer enters any amount ≥ qty at price-per-unit. Off = fixed pack (customer buys exactly this qty at the flat price).">
                                <span>Bulk?</span>
                              </Tooltip>
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {form.priceTiers.map((tier, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <TextField
                                  size="small" value={tier.label}
                                  onChange={e => setTierField(i, 'label', e.target.value)}
                                  placeholder="250g" sx={{ width: 90 }}
                                />
                              </TableCell>
                              <TableCell>
                                <TextField
                                  size="small" type="number" value={tier.qty}
                                  onChange={e => setTierField(i, 'qty', parseFloat(e.target.value) || 0)}
                                  slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                                  sx={{ width: 80 }}
                                  helperText={tier.isBulk ? 'Min qty' : ''}
                                />
                              </TableCell>
                              <TableCell>
                                <TextField
                                  select size="small" value={tier.inputUnit}
                                  onChange={e => setTierField(i, 'inputUnit', e.target.value)}
                                  sx={{ width: 80 }}
                                >
                                  {UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                                </TextField>
                              </TableCell>
                              <TableCell>
                                <TextField
                                  size="small" type="number" value={tier.price}
                                  onChange={e => setTierField(i, 'price', parseFloat(e.target.value) || 0)}
                                  slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                                  sx={{ width: 100 }}
                                  helperText={tier.isBulk ? 'Per unit' : 'Per pack'}
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                  <Switch
                                    checked={tier.isBulk}
                                    onChange={e => setTierField(i, 'isBulk', e.target.checked)}
                                    size="small"
                                  />
                                  <Typography variant="caption" sx={{ fontSize: 9, color: tier.isBulk ? 'primary.main' : 'text.disabled', fontWeight: 600 }}>
                                    {tier.isBulk ? 'BULK' : 'FIXED'}
                                  </Typography>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <IconButton size="small" color="error" onClick={() => removeTier(i)}>
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}

                    <Button size="small" startIcon={<AddIcon />} onClick={addTier} variant="outlined" sx={{ mb: 1 }}>
                      Add Tier
                    </Button>

                    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <TextField
                        select label="Stock / display unit" size="small"
                        value={form.stockUnit}
                        onChange={e => setForm(f => ({ ...f, stockUnit: e.target.value }))}
                        sx={{ width: 180 }}
                        helperText="Unit used for stock display and purchase recording"
                      >
                        {UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                      </TextField>
                    </Box>
                  </Box>
                )}
              </Grid>

              {/* Allow decimal */}
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={
                    <Switch checked={form.allowDecimal}
                      onChange={e => setForm(f => ({ ...f, allowDecimal: e.target.checked }))}
                      size="small" />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">Allow decimal quantities</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Enable for wax/liquids (e.g. 1.5 kg). Disable for molds, containers, kits (whole units only).
                      </Typography>
                    </Box>
                  }
                />
              </Grid>

              {/* Image + Featured */}
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ mb: 1 }} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Images</Typography>
                {form.imageUrls.map((url, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}>
                    <TextField
                      label={i === 0 ? 'Primary image' : `Image ${i + 1}`}
                      value={url}
                      onChange={e => setForm(f => { const u = [...f.imageUrls]; u[i] = e.target.value; return { ...f, imageUrls: u }; })}
                      fullWidth
                      size="small"
                      placeholder="/products/softsoywax.jpg"
                      helperText={i === 0 ? 'Path relative to public folder or a full URL' : undefined}
                    />
                    {url && (
                      <Box component="img" src={url} alt=""
                        sx={{ height: 48, width: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    {form.imageUrls.length > 1 && (
                      <IconButton size="small" color="error" onClick={() => setForm(f => ({ ...f, imageUrls: f.imageUrls.filter((_, idx) => idx !== i) }))}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
                <Button size="small" startIcon={<AddIcon />} onClick={() => setForm(f => ({ ...f, imageUrls: [...f.imageUrls, ''] }))} sx={{ mt: 0.5 }}>
                  Add image
                </Button>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Switch checked={form.isPackaging} onChange={e => setForm(f => ({ ...f, isPackaging: e.target.checked, featured: e.target.checked ? false : f.featured }))} />}
                  label={<Box><Typography variant="body2">Packaging / internal item</Typography><Typography variant="caption" color="text.secondary">Hidden from customer shop — used for order cost and stock tracking only</Typography></Box>}
                />
              </Grid>
              {!form.isPackaging && (
                <Grid size={{ xs: 12 }}>
                  <FormControlLabel
                    control={<Switch checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} color="primary" />}
                    label="Featured product (shown on homepage)"
                  />
                </Grid>
              )}

              {/* Actions */}
              <Grid size={{ xs: 12 }}>
                <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', pt: 1 }}>
                  <Button onClick={() => navigate('/admin/products')} disabled={saving}>Cancel</Button>
                  <Button type="submit" variant="contained" color="secondary" disabled={saving} sx={{ minWidth: 120 }}>
                    {saving ? <CircularProgress size={20} color="inherit" /> : isEditing ? 'Save Changes' : 'Add Product'}
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
