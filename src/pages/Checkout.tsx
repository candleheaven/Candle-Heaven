import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  Divider,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Avatar,
  Tabs,
  Tab,
  Autocomplete,
  CircularProgress,
  Switch,
  FormControlLabel,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { placeOrder, getMyOrders } from '../services/orders';
import { getStates, getCitiesByState } from '../services/cities';
import type { CurfoxState, CurfoxCity } from '../services/cities';
import { getDeliverySettings, calculateDeliveryFee } from '../services/delivery';
import { saveContactInfo, loadContactInfo } from '../services/contact';
import { getPoints, calcPointsEarned, applyPointsTransaction } from '../services/loyalty';
import { validatePromoCode, calcPromoDiscount, recordPromoUsage } from '../services/promotions';
import type { CustomerInfo, Promotion } from '../types';
import AuthModal from '../components/auth/AuthModal';

const STEPS = ['Your Details', 'Review Order', 'Confirmation'];

export default function Checkout() {
  const navigate = useNavigate();
  const { items, subtotal, clearCart } = useCart();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [authTab, setAuthTab] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [pointsBalance, setPointsBalance] = useState(0);
  const [applyPoints, setApplyPoints] = useState(false);

  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<Promotion | null>(null);
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  const [districts, setDistricts] = useState<CurfoxState[]>([]);
  const [districtsLoading, setDistrictsLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<CurfoxState | null>(null);

  const [cities, setCities] = useState<CurfoxCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CurfoxCity | null>(null);

  const [form, setForm] = useState<CustomerInfo>({
    name: user?.displayName ?? '',
    email: user?.email ?? '',
    phone: '',
    secondaryPhone: '',
    address: '',
    district: '',
    city: '',
    notes: '',
  });

  useEffect(() => {
    // Load districts and any previously saved contact info in parallel
    const saved = loadContactInfo();

    if (saved?.form) {
      setForm(f => ({
        ...saved.form,
        // Always prefer the live auth name/email over the saved ones
        name: user?.displayName || saved.form.name || f.name,
        email: user?.email || saved.form.email || f.email,
      }));
    }

    if (saved?.district) {
      setSelectedDistrict(saved.district);
      // Pre-load the cities for the saved district so the dropdown is immediately ready
      setCitiesLoading(true);
      getCitiesByState(saved.district.id)
        .then(cs => {
          setCities(cs);
          if (saved.city) setSelectedCity(saved.city);
        })
        .catch(() => setCities([]))
        .finally(() => setCitiesLoading(false));
    }

    getStates()
      .then(setDistricts)
      .catch(() => { /* district dropdown hides itself on error */ })
      .finally(() => setDistrictsLoading(false));

    if (user?.uid) {
      getPoints(user.uid).then(setPointsBalance).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDistrictChange(district: CurfoxState | null) {
    setSelectedDistrict(district);
    setSelectedCity(null);
    setCities([]);
    setForm(f => ({ ...f, district: district?.name ?? '', city: '' }));
    if (!district) return;
    setCitiesLoading(true);
    getCitiesByState(district.id)
      .then(setCities)
      .catch(() => setCities([]))
      .finally(() => setCitiesLoading(false));
  }

  const deliverySettings = getDeliverySettings();
  const totalWeightKg = items.reduce((s, i) => s + (i.weightGrams ?? 0), 0) / 1000;
  const rawDeliveryFee = selectedCity?.zone_id != null
    ? calculateDeliveryFee(totalWeightKg, selectedCity.zone_id, deliverySettings)
    : null;
  const promoDiscount = appliedPromo
    ? calcPromoDiscount(appliedPromo, items, subtotal, rawDeliveryFee ?? 0)
    : 0;
  const deliveryFee = appliedPromo?.discountType === 'free_delivery' ? 0 : rawDeliveryFee;
  const baseTotal = subtotal + (deliveryFee ?? 0) - promoDiscount;
  const pointsDiscount = applyPoints && user ? Math.min(pointsBalance, Math.max(0, baseTotal)) : 0;
  const orderTotal = Math.max(0, baseTotal - pointsDiscount);
  const pointsEarned = calcPointsEarned(subtotal);

  const set = (field: keyof CustomerInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  async function handleApplyPromo() {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    try {
      let orderCount: number | undefined;
      if (user?.uid) {
        const orders = await getMyOrders(user.uid);
        orderCount = orders.length;
      }
      const result = validatePromoCode(promoInput, subtotal, { userId: user?.uid, orderCount, items });
      if (result.valid && result.promo) {
        setAppliedPromo(result.promo);
        setPromoInput('');
      } else {
        setPromoError(result.error ?? 'Invalid code.');
        setAppliedPromo(null);
      }
    } finally {
      setPromoLoading(false);
    }
  }

  const handleNext = () => {
    if (step === 0) {
      if (!form.name || !form.phone || !form.address || !form.district || !form.city) {
        setError('Please fill in all required fields');
        return;
      }
      setError('');
      saveContactInfo(form, selectedDistrict, selectedCity);
    }
    setStep(s => s + 1);
  };

  const handlePlace = async () => {
    setSubmitting(true);
    setError('');
    try {
      const orderNum = await placeOrder({
        customer: form,
        items,
        subtotal,
        deliveryFee: deliveryFee ?? 0,
        total: orderTotal,
        status: 'pending',
        userId: user?.uid,
        zoneId: selectedCity?.zone_id,
        pointsEarned,
        pointsRedeemed: pointsDiscount,
        promoCode: appliedPromo?.code,
        promoDiscount: promoDiscount > 0 ? promoDiscount : undefined,
      });

      if (appliedPromo) {
        await recordPromoUsage(appliedPromo.id, user?.uid);
      }

      let newBalance = pointsBalance;
      if (user?.uid) {
        newBalance = await applyPointsTransaction(user.uid, pointsEarned, pointsDiscount);
      }

      clearCart();
      navigate('/order-confirmation', {
        state: { orderNumber: orderNum, customer: form, pointsEarned, newBalance },
      });
    } catch {
      setError('Failed to place order. Please try again or contact us via WhatsApp.');
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>Your cart is empty</Typography>
        <Button variant="contained" onClick={() => navigate('/products')} sx={{ mt: 2 }}>
          Browse Products
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 4 }}>Checkout</Typography>

      <Stepper activeStep={step} sx={{ mb: 5 }}>
        {STEPS.map(label => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 7 }}>
          {step === 0 && (
            <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
              {!user && (
                <>
                  <Tabs value={authTab} onChange={(_, v) => setAuthTab(v)} sx={{ mb: 3 }}>
                    <Tab label="Continue as Guest" sx={{ textTransform: 'none' }} />
                    <Tab label="Sign in to my account" sx={{ textTransform: 'none' }} />
                  </Tabs>
                  {authTab === 1 && (
                    <Box sx={{ textAlign: 'center', py: 3 }}>
                      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                        Sign in to auto-fill your details and track orders
                      </Typography>
                      <Button variant="outlined" onClick={() => setAuthOpen(true)}>
                        Sign in / Create Account
                      </Button>
                    </Box>
                  )}
                </>
              )}

              {(authTab === 0 || user) && (
                <>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>Delivery Details</Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12 }}>
                      <TextField label="Full Name *" fullWidth value={form.name} onChange={set('name')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField label="Email (optional)" type="email" fullWidth value={form.email ?? ''} onChange={set('email')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField label="Phone *" fullWidth value={form.phone} onChange={set('phone')} placeholder="07X XXX XXXX" />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField label="Secondary Phone (optional)" fullWidth value={form.secondaryPhone ?? ''} onChange={set('secondaryPhone')} placeholder="07X XXX XXXX" />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField label="Address *" fullWidth value={form.address} onChange={set('address')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Autocomplete
                        options={districts}
                        loading={districtsLoading}
                        value={selectedDistrict}
                        getOptionLabel={(d) => d.name}
                        isOptionEqualToValue={(opt, val) => opt.id === val.id}
                        onChange={(_, d) => handleDistrictChange(d)}
                        renderInput={(params) => (
                          <TextField
                            id={params.id}
                            disabled={params.disabled}
                            fullWidth={params.fullWidth}
                            size={params.size}
                            label="District *"
                            slotProps={{
                              ...params.slotProps,
                              input: {
                                ...params.slotProps.input,
                                endAdornment: (
                                  <>
                                    {districtsLoading && <CircularProgress color="inherit" size={18} />}
                                    {params.slotProps.input.endAdornment}
                                  </>
                                ),
                              },
                            }}
                          />
                        )}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Autocomplete
                        options={cities}
                        loading={citiesLoading}
                        disabled={!selectedDistrict}
                        value={selectedCity}
                        getOptionLabel={(c) => c.name}
                        isOptionEqualToValue={(opt, val) => opt.id === val.id}
                        onChange={(_, c) => {
                          setSelectedCity(c);
                          setForm(f => ({ ...f, city: c?.name ?? '' }));
                        }}
                        renderInput={(params) => (
                          <TextField
                            id={params.id}
                            disabled={params.disabled}
                            fullWidth={params.fullWidth}
                            size={params.size}
                            label="City *"
                            slotProps={{
                              ...params.slotProps,
                              input: {
                                ...params.slotProps.input,
                                endAdornment: (
                                  <>
                                    {citiesLoading && <CircularProgress color="inherit" size={18} />}
                                    {params.slotProps.input.endAdornment}
                                  </>
                                ),
                              },
                            }}
                          />
                        )}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Order Notes (optional)"
                        fullWidth
                        multiline
                        rows={2}
                        value={form.notes}
                        onChange={set('notes')}
                        placeholder="Any specific requirements?"
                      />
                    </Grid>
                  </Grid>
                  {/* Promo code */}
                  <Box sx={{ mt: 3 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Promo Code</Typography>
                    {appliedPromo ? (
                      <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'success.main', borderRadius: 2, bgcolor: 'success.50' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'success.main', flex: 1 }}>
                            {appliedPromo.code}
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                            {appliedPromo.discountType === 'free_delivery' ? 'Free Delivery' : `–LKR ${promoDiscount.toLocaleString()}`}
                          </Typography>
                          <Button size="small" color="inherit" onClick={() => setAppliedPromo(null)} sx={{ minWidth: 0, px: 1, color: 'text.secondary' }}>
                            ✕
                          </Button>
                        </Box>
                        {appliedPromo.targetType === 'category' && appliedPromo.targetCategories.length > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Applies to: {appliedPromo.targetCategories.join(', ')} products
                          </Typography>
                        )}
                        {appliedPromo.targetType === 'product' && appliedPromo.targetProductNames.length > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Applies to: {appliedPromo.targetProductNames.join(', ')}
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          size="small"
                          placeholder="Enter code"
                          value={promoInput}
                          onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoError(''); }}
                          onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
                          error={Boolean(promoError)}
                          helperText={promoError}
                          sx={{ flex: 1, '& input': { fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 } }}
                        />
                        <Button
                          variant="outlined"
                          onClick={handleApplyPromo}
                          disabled={promoLoading || !promoInput.trim()}
                          sx={{ flexShrink: 0 }}
                        >
                          {promoLoading ? <CircularProgress size={18} /> : 'Apply'}
                        </Button>
                      </Box>
                    )}
                  </Box>

                  <Button variant="contained" size="large" fullWidth sx={{ mt: 3, py: 1.5 }} onClick={handleNext}>
                    Continue to Review
                  </Button>
                </>
              )}
            </Paper>
          )}

          {step === 1 && (
            <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Delivery To</Typography>
              <Typography>{form.name}</Typography>
              <Typography color="text.secondary">{form.address}, {form.city}, {form.district}</Typography>
              <Typography color="text.secondary">
                {form.phone}
                {form.secondaryPhone && ` · ${form.secondaryPhone}`}
                {form.email && ` · ${form.email}`}
              </Typography>
              {form.notes && <Typography color="text.secondary" sx={{ mt: 1 }}>Note: {form.notes}</Typography>}

              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Order Items</Typography>
              {items.map(item => (
                <Box key={item.productId} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Avatar src={item.image} variant="rounded" sx={{ width: 44, height: 44 }}>{item.name[0]}</Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.name}</Typography>
                      <Typography variant="caption" color="text.secondary">×{item.quantity} {item.unit}</Typography>
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>LKR {(item.price * item.quantity).toLocaleString()}</Typography>
                </Box>
              ))}

              <Divider sx={{ my: 2 }} />
              {(appliedPromo || pointsDiscount > 0) && (
                <Box sx={{ mb: 2 }}>
                  {appliedPromo && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">Promo ({appliedPromo.code})</Typography>
                      <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                        {appliedPromo.discountType === 'free_delivery' ? 'Free Delivery' : `–LKR ${promoDiscount.toLocaleString()}`}
                      </Typography>
                    </Box>
                  )}
                  {pointsDiscount > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Points discount</Typography>
                      <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>–LKR {pointsDiscount.toLocaleString()}</Typography>
                    </Box>
                  )}
                </Box>
              )}
              <Alert severity="info" icon={<LockOutlinedIcon />} sx={{ mb: 3 }}>
                <Typography variant="body2">
                  Your order will be confirmed via WhatsApp. Payment details will be shared after confirmation.
                </Typography>
              </Alert>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button variant="outlined" size="large" onClick={() => setStep(0)} sx={{ flex: 1 }}>Back</Button>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handlePlace}
                  disabled={submitting}
                  sx={{ flex: 2, py: 1.5 }}
                >
                  {submitting ? 'Placing Order…' : 'Place Order'}
                </Button>
              </Box>
            </Paper>
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3, position: 'sticky', top: 90 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Order Summary</Typography>
            {items.map(item => (
              <Box key={item.productId} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {item.name} ×{item.quantity}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  LKR {(item.price * item.quantity).toLocaleString()}
                </Typography>
              </Box>
            ))}
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography color="text.secondary">Subtotal</Typography>
              <Typography sx={{ fontWeight: 600 }}>LKR {subtotal.toLocaleString()}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color="text.secondary">Delivery</Typography>
              {appliedPromo?.discountType === 'free_delivery' ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {rawDeliveryFee != null && (
                    <Typography variant="body2" sx={{ textDecoration: 'line-through', color: 'text.disabled' }}>
                      LKR {rawDeliveryFee.toLocaleString()}
                    </Typography>
                  )}
                  <Typography sx={{ fontWeight: 600, color: 'success.main' }}>Free</Typography>
                </Box>
              ) : deliveryFee !== null ? (
                <Typography sx={{ fontWeight: 600 }}>LKR {deliveryFee.toLocaleString()}</Typography>
              ) : (
                <Typography color="text.secondary" variant="body2">Select a city</Typography>
              )}
            </Box>
            {totalWeightKg > 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'right' }}>
                Est. weight: {totalWeightKg < 1 ? `${Math.round(totalWeightKg * 1000)} g` : `${totalWeightKg.toFixed(2)} kg`}
              </Typography>
            )}

            {/* Promo discount */}
            {appliedPromo && promoDiscount > 0 && appliedPromo.discountType !== 'free_delivery' && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography color="text.secondary">
                  Promo <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}>({appliedPromo.code})</Typography>
                </Typography>
                <Typography sx={{ fontWeight: 600, color: 'success.main' }}>–LKR {promoDiscount.toLocaleString()}</Typography>
              </Box>
            )}

            {/* Reward Points */}
            {user && pointsBalance > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ bgcolor: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: 2, p: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                    <StarBorderIcon sx={{ fontSize: 16, color: '#C9A96E' }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#C9A96E', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Reward Points
                    </Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={applyPoints}
                        onChange={e => setApplyPoints(e.target.checked)}
                        sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#C9A96E' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#C9A96E' } }}
                      />
                    }
                    label={
                      <Typography variant="body2">
                        Apply {pointsBalance} pts <Typography component="span" variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>–LKR {Math.min(pointsBalance, baseTotal).toLocaleString()}</Typography>
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </Box>
                {applyPoints && pointsDiscount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                    <Typography color="text.secondary">Points discount</Typography>
                    <Typography sx={{ fontWeight: 600, color: 'success.main' }}>–LKR {pointsDiscount.toLocaleString()}</Typography>
                  </Box>
                )}
              </>
            )}

            {user && (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
                This order earns +{pointsEarned} pts
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Total</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }} color="primary.main">LKR {orderTotal.toLocaleString()}</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </Container>
  );
}
