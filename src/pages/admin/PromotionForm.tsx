import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Grid, TextField, Switch,
  FormControlLabel, Alert, CircularProgress, Divider,
  ToggleButtonGroup, ToggleButton, InputAdornment, Checkbox,
  FormGroup, FormLabel, Autocomplete,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { getPromotions, savePromotion } from '../../services/promotions';
import { getAllProducts } from '../../services/products';
import type { PromoCategory, PromoDiscountType, Product } from '../../types';

const PRODUCT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'wax', label: 'Waxes' },
  { value: 'fragrance', label: 'Fragrances' },
  { value: 'wicks', label: 'Wicks' },
  { value: 'dye', label: 'Colours' },
  { value: 'molds', label: 'Molds' },
  { value: 'tools', label: 'Tools' },
  { value: 'kits', label: 'Kits' },
];

interface FormState {
  code: string;
  title: string;
  description: string;
  category: PromoCategory;
  discountType: PromoDiscountType;
  discountValue: string;
  minOrderAmount: string;
  startDate: string;
  endDate: string;
  usageLimit: string;
  perUserLimit: string;
  badgeLabel: string;
  active: boolean;
  targetType: 'all' | 'category' | 'product';
  targetCategories: string[];
  targetProductIds: string[];
  targetProductNames: string[];
}

const EMPTY: FormState = {
  code: '',
  title: '',
  description: '',
  category: 'general',
  discountType: 'percentage',
  discountValue: '',
  minOrderAmount: '',
  startDate: '',
  endDate: '',
  usageLimit: '',
  perUserLimit: '',
  badgeLabel: '',
  active: true,
  targetType: 'all',
  targetCategories: [],
  targetProductIds: [],
  targetProductNames: [],
};

const CATEGORY_OPTIONS: { value: PromoCategory; label: string; hint: string }[] = [
  { value: 'general', label: 'General', hint: 'Available to all customers.' },
  { value: 'seasonal', label: 'Seasonal', hint: 'Tied to a specific date range.' },
  { value: 'newcomer', label: 'Newcomer', hint: 'First-time customers only.' },
];

const DISCOUNT_LABELS: Record<PromoDiscountType, string> = {
  percentage: 'Percentage off',
  fixed: 'Fixed LKR off',
  free_delivery: 'Free delivery',
};

export default function PromotionForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);

  useEffect(() => {
    getAllProducts().then(setAllProducts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    getPromotions().then(all => {
      const p = all.find(x => x.id === id);
      if (!p) { navigate('/admin/promotions'); return; }
      setForm({
        code: p.code,
        title: p.title,
        description: p.description,
        category: p.category,
        discountType: p.discountType,
        discountValue: p.discountValue > 0 ? String(p.discountValue) : '',
        minOrderAmount: p.minOrderAmount > 0 ? String(p.minOrderAmount) : '',
        startDate: p.startDate,
        endDate: p.endDate,
        usageLimit: p.usageLimit > 0 ? String(p.usageLimit) : '',
        perUserLimit: p.perUserLimit > 0 ? String(p.perUserLimit) : '',
        badgeLabel: p.badgeLabel,
        active: p.active,
        targetType: p.targetType ?? 'all',
        targetCategories: p.targetCategories ?? [],
        targetProductIds: p.targetProductIds ?? [],
        targetProductNames: p.targetProductNames ?? [],
      });
    }).finally(() => setLoading(false));
  }, [id, isEdit, navigate]);

  // Sync selectedProducts once allProducts loads (for edit mode)
  useEffect(() => {
    if (allProducts.length > 0 && form.targetProductIds.length > 0) {
      setSelectedProducts(allProducts.filter(p => form.targetProductIds.includes(p.id)));
    }
  }, [allProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));

  function toggleCategory(cat: string) {
    setForm(f => ({
      ...f,
      targetCategories: f.targetCategories.includes(cat)
        ? f.targetCategories.filter(c => c !== cat)
        : [...f.targetCategories, cat],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code || !form.title) { setError('Code and title are required.'); return; }
    if (form.discountType !== 'free_delivery' && !form.discountValue) {
      setError('Discount value is required.'); return;
    }
    if (form.targetType === 'category' && form.targetCategories.length === 0) {
      setError('Select at least one category.'); return;
    }
    if (form.targetType === 'product' && selectedProducts.length === 0) {
      setError('Select at least one product.'); return;
    }
    setError('');
    setSaving(true);

    const productIds = selectedProducts.map(p => p.id);
    const productNames = selectedProducts.map(p => p.name);

    try {
      await savePromotion({
        ...(isEdit ? { id } : {}),
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        discountType: form.discountType,
        discountValue: form.discountType !== 'free_delivery' ? parseFloat(form.discountValue) : 0,
        minOrderAmount: form.minOrderAmount ? parseFloat(form.minOrderAmount) : 0,
        startDate: form.startDate,
        endDate: form.endDate,
        usageLimit: form.usageLimit ? parseInt(form.usageLimit) : 0,
        perUserLimit: form.perUserLimit ? parseInt(form.perUserLimit) : 0,
        badgeLabel: form.badgeLabel.trim() || form.category.toUpperCase(),
        active: form.active,
        targetType: form.targetType,
        targetCategories: form.targetType === 'category' ? form.targetCategories : [],
        targetProductIds: form.targetType === 'product' ? productIds : [],
        targetProductNames: form.targetType === 'product' ? productNames : [],
      });
      navigate('/admin/promotions');
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin/promotions')} variant="text">
          Back
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {isEdit ? 'Edit Promotion' : 'New Promotion'}
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Left: core details */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Promotion Details</Typography>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 5 }}>
                <TextField
                  label="Promo Code *"
                  fullWidth
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. WAX20"
                  slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 } } }}
                  helperText="Customers enter this at checkout"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 7 }}>
                <TextField
                  label="Badge Label"
                  fullWidth
                  value={form.badgeLabel}
                  onChange={set('badgeLabel')}
                  placeholder="e.g. SEASONAL, WAX DEAL"
                  helperText="Shown on the promo card"
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField label="Title *" fullWidth value={form.title} onChange={set('title')} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Description"
                  fullWidth
                  multiline
                  rows={2}
                  value={form.description}
                  onChange={set('description')}
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>Promo Category</Typography>
            <Grid container spacing={1.5} sx={{ mb: 0 }}>
              {CATEGORY_OPTIONS.map(opt => (
                <Grid size={{ xs: 12, sm: 4 }} key={opt.value}>
                  <Paper
                    elevation={0}
                    onClick={() => setForm(f => ({ ...f, category: opt.value }))}
                    sx={{
                      p: 1.5, border: '2px solid',
                      borderColor: form.category === opt.value ? 'primary.main' : 'divider',
                      borderRadius: 2, cursor: 'pointer',
                      bgcolor: form.category === opt.value ? 'primary.50' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{opt.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{opt.hint}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>

          {/* Discount */}
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3, mt: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Discount</Typography>

            <ToggleButtonGroup
              value={form.discountType}
              exclusive
              onChange={(_, v) => v && setForm(f => ({ ...f, discountType: v as PromoDiscountType }))}
              sx={{ mb: 2 }}
            >
              {(Object.keys(DISCOUNT_LABELS) as PromoDiscountType[]).map(dt => (
                <ToggleButton key={dt} value={dt} sx={{ textTransform: 'none', px: 2 }}>
                  {DISCOUNT_LABELS[dt]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {form.discountType !== 'free_delivery' && (
                <TextField
                  label={form.discountType === 'percentage' ? 'Percentage *' : 'Amount (LKR) *'}
                  type="number"
                  value={form.discountValue}
                  onChange={set('discountValue')}
                  slotProps={{
                    input: {
                      endAdornment: <InputAdornment position="end">{form.discountType === 'percentage' ? '%' : 'LKR'}</InputAdornment>,
                    },
                  }}
                  sx={{ width: 200 }}
                  helperText={form.discountType === 'percentage' ? 'Applied to eligible subtotal' : 'Capped at eligible subtotal'}
                />
              )}
              <TextField
                label="Minimum Order"
                type="number"
                value={form.minOrderAmount}
                onChange={set('minOrderAmount')}
                placeholder="0 = no minimum"
                slotProps={{ input: { startAdornment: <InputAdornment position="start">LKR</InputAdornment> } }}
                sx={{ width: 200 }}
                helperText="Min. subtotal (all items)"
              />
            </Box>
          </Paper>

          {/* Applies To */}
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3, mt: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Applies To</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Restrict the discount to specific categories or products. The discount is calculated only on eligible items in the cart.
            </Typography>

            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              {([
                { value: 'all', label: 'All Products', hint: 'No restriction — discount applies to the full subtotal.' },
                { value: 'category', label: 'By Category', hint: 'Discount applies only to items in selected categories.' },
                { value: 'product', label: 'By Product', hint: 'Discount applies only to specific products.' },
              ] as const).map(opt => (
                <Grid size={{ xs: 12, sm: 4 }} key={opt.value}>
                  <Paper
                    elevation={0}
                    onClick={() => setForm(f => ({ ...f, targetType: opt.value }))}
                    sx={{
                      p: 1.5, border: '2px solid',
                      borderColor: form.targetType === opt.value ? 'primary.main' : 'divider',
                      borderRadius: 2, cursor: 'pointer',
                      bgcolor: form.targetType === opt.value ? 'primary.50' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{opt.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{opt.hint}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {form.targetType === 'category' && (
              <Box sx={{ pl: 1 }}>
                <FormLabel component="legend" sx={{ mb: 1, fontSize: 13, fontWeight: 600 }}>Select categories</FormLabel>
                <FormGroup row>
                  {PRODUCT_CATEGORIES.map(cat => (
                    <FormControlLabel
                      key={cat.value}
                      control={
                        <Checkbox
                          size="small"
                          checked={form.targetCategories.includes(cat.value)}
                          onChange={() => toggleCategory(cat.value)}
                        />
                      }
                      label={<Typography variant="body2">{cat.label}</Typography>}
                      sx={{ minWidth: 150 }}
                    />
                  ))}
                </FormGroup>
              </Box>
            )}

            {form.targetType === 'product' && (
              <Autocomplete
                multiple
                options={allProducts}
                value={selectedProducts}
                onChange={(_, v) => setSelectedProducts(v)}
                getOptionLabel={p => p.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                groupBy={p => p.category}
                renderInput={params => (
                  <TextField
                    {...params}
                    label="Select products"
                    placeholder="Search by name…"
                    helperText="Discount applies only to these products in the cart"
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Box>
                      <Typography variant="body2">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{option.category} · LKR {option.price.toLocaleString()}</Typography>
                    </Box>
                  </Box>
                )}
              />
            )}
          </Paper>
        </Grid>

        {/* Right: limits & scheduling */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Scheduling</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Start Date"
                  type="date"
                  fullWidth
                  value={form.startDate}
                  onChange={set('startDate')}
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText="Leave blank to start immediately"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="End Date"
                  type="date"
                  fullWidth
                  value={form.endDate}
                  onChange={set('endDate')}
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText="Leave blank for no expiry"
                />
              </Grid>
            </Grid>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3, mt: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Usage Limits</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Total Usage Limit"
                  type="number"
                  fullWidth
                  value={form.usageLimit}
                  onChange={set('usageLimit')}
                  placeholder="0 = unlimited"
                  helperText="Max uses across all customers"
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Per-Customer Limit"
                  type="number"
                  fullWidth
                  value={form.perUserLimit}
                  onChange={set('perUserLimit')}
                  placeholder="0 = unlimited"
                  helperText="Max times one customer can use this"
                />
              </Grid>
            </Grid>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3, mt: 3 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Active</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {form.active ? 'Live and visible to customers' : 'Hidden, cannot be used'}
                  </Typography>
                </Box>
              }
            />
          </Paper>

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            startIcon={<SaveIcon />}
            disabled={saving}
            sx={{ mt: 3, py: 1.5 }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Promotion'}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
}
