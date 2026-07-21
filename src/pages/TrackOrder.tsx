import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, Button, Paper, CircularProgress,
  Chip, Divider, Alert, IconButton, Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ReplayIcon from '@mui/icons-material/Replay';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { getOrderByNumber, getOrderByWaybill } from '../services/orders';
import { trackShipment } from '../services/courier';
import type { UserOrder } from '../services/orders';
import type { TrackingInfo } from '../services/courier';
import type { OrderStatus } from '../types';

const NAVY = '#132040';
const GOLD = '#C9A96E';

const STATUS_ORDER: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered'];

const STEP_LABELS: Record<string, string> = {
  pending:   'Order Placed',
  confirmed: 'Order Confirmed',
  shipped:   'Shipped',
  delivered: 'Delivered',
};

function getStepTimestamp(step: OrderStatus, order: UserOrder): string | null {
  if (step === 'pending') return order.createdAt ?? null;
  return order.statusHistory?.find(h => h.status === step)?.at ?? null;
}

function formatTs(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-LK', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function activeStepIndex(status: OrderStatus): number {
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

function StatusChip({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; color: string; bg: string }> = {
    pending:   { label: 'Pending',   color: '#7A5C00', bg: '#FFF3CD' },
    confirmed: { label: 'Confirmed', color: '#0A4D73', bg: '#D1ECF1' },
    shipped:   { label: 'Shipped',   color: '#495057', bg: '#E2E3E5' },
    delivered: { label: 'Delivered', color: '#155724', bg: '#D4EDDA' },
    returned:  { label: 'Returned',  color: '#721C24', bg: '#F8D7DA' },
    cancelled: { label: 'Cancelled', color: '#721C24', bg: '#F8D7DA' },
  };
  const s = map[status] ?? map.pending;
  return (
    <Chip label={s.label} size="small" sx={{ fontWeight: 700, color: s.color, bgcolor: s.bg, borderRadius: 1 }} />
  );
}

// ── Courier timeline component ────────────────────────────────────────────────

function CourierTimeline({ info, loading, error }: { info: TrackingInfo | null; loading: boolean; error: string }) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">Fetching courier updates…</Typography>
      </Box>
    );
  }
  if (error) return <Alert severity="warning" sx={{ borderRadius: 2 }}>{error}</Alert>;
  if (!info) return null;

  return (
    <Box>
      {/* Current courier status badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          label={info.currentStatus}
          size="small"
          sx={{ fontWeight: 700, bgcolor: info.currentColor, color: '#fff', borderRadius: 1 }}
        />
        {info.recipientName && (
          <Typography variant="caption" color="text.secondary">→ {info.recipientName}</Typography>
        )}
        {info.weight != null && (
          <Typography variant="caption" color="text.secondary">· {info.weight} kg</Typography>
        )}
      </Box>

      {info.events.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No courier events yet.</Typography>
      ) : (
        <Box sx={{ position: 'relative', pl: 3.5 }}>
          {/* Vertical line */}
          <Box sx={{ position: 'absolute', left: 9, top: 10, bottom: 10, width: 2, bgcolor: 'divider' }} />

          {info.events.map((ev, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: i < info.events.length - 1 ? 2.5 : 0, position: 'relative' }}>
              {/* Coloured dot */}
              <Box sx={{
                position: 'absolute',
                left: -27,
                top: i === 0 ? 0 : 2,
                width: i === 0 ? 18 : 12,
                height: i === 0 ? 18 : 12,
                borderRadius: '50%',
                bgcolor: ev.color,
                border: '2px solid white',
                boxShadow: i === 0 ? `0 0 0 3px ${ev.color}30` : 'none',
                flexShrink: 0,
              }} />

              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: i === 0 ? 700 : 500, lineHeight: 1.4 }}>
                  {ev.description}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {ev.dateFormatted}
                  {ev.dateTimeAgo ? ` · ${ev.dateTimeAgo}` : ''}
                </Typography>
                {ev.extraInfo && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {ev.extraInfo}
                  </Typography>
                )}
                {ev.performedBy && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                    by {ev.performedBy}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Internal progress steps (pre-shipment) ────────────────────────────────────

function InternalTimeline({ order }: { order: UserOrder }) {
  const isTerminal = order.status === 'cancelled' || order.status === 'returned';
  const currentIdx = activeStepIndex(order.status);

  if (isTerminal) return null;

  return (
    <Box sx={{ position: 'relative', pl: 3.5 }}>
      <Box sx={{ position: 'absolute', left: 9, top: 10, bottom: 10, width: 2, bgcolor: 'divider' }} />

      {STATUS_ORDER.map((step, i) => {
        const isDone = i <= currentIdx;
        const isActive = i === currentIdx;
        const ts = getStepTimestamp(step, order);

        return (
          <Box key={step} sx={{ display: 'flex', gap: 1.5, mb: i < STATUS_ORDER.length - 1 ? 2.5 : 0, position: 'relative' }}>
            <Box sx={{ position: 'absolute', left: -27, top: 2 }}>
              {isDone ? (
                <CheckCircleIcon sx={{ fontSize: 20, color: isActive ? NAVY : 'success.main' }} />
              ) : (
                <RadioButtonUncheckedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
              )}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{
                fontWeight: isActive ? 700 : isDone ? 500 : 400,
                color: isActive ? NAVY : isDone ? 'text.primary' : 'text.disabled',
              }}>
                {STEP_LABELS[step]}
              </Typography>
              {ts && (
                <Typography variant="caption" sx={{ color: isActive ? NAVY : 'text.secondary', opacity: 0.85 }}>
                  {formatTs(ts)}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrackOrder() {
  const { orderNumber: urlOrderNumber } = useParams<{ orderNumber?: string }>();
  const navigate = useNavigate();

  const [orderInput, setOrderInput] = useState(urlOrderNumber ?? '');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<UserOrder | null>(null);
  const [courierInfo, setCourierInfo] = useState<TrackingInfo | null>(null);
  const [courierLoading, setCourierLoading] = useState(false);
  const [courierError, setCourierError] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleTrack() {
    const trimmed = orderInput.trim();
    const last4 = phone.trim().replace(/\D/g, '').slice(-4);

    if (!trimmed) { setError('Please enter your order or tracking number.'); return; }
    if (last4.length < 4) { setError('Please enter the last 4 digits of your phone number.'); return; }

    setLoading(true);
    setError('');
    setOrder(null);
    setCourierInfo(null);
    setCourierError('');

    try {
      const isOrderNumber = trimmed.toUpperCase().startsWith('CH-');
      let found = isOrderNumber
        ? await getOrderByNumber(trimmed.toUpperCase())
        : await getOrderByWaybill(trimmed);

      if (!found) {
        found = isOrderNumber
          ? await getOrderByWaybill(trimmed)
          : await getOrderByNumber(trimmed.toUpperCase());
      }

      if (!found) {
        setError('Order not found. Please check your order or tracking number and mobile number digits and try again.');
        setLoading(false);
        return;
      }

      const orderLast4 = found.customer.phone.replace(/\D/g, '').slice(-4);
      if (orderLast4 !== last4) {
        setError('Order not found. Please check your order or tracking number and mobile number digits and try again.');
        setLoading(false);
        return;
      }

      setOrder(found);
      if (found.orderNumber && found.orderNumber !== urlOrderNumber) {
        navigate(`/track/${found.orderNumber}`, { replace: true });
      }

      // Auto-fetch courier timeline if waybill exists
      if (found.waybillNumber) {
        setCourierLoading(true);
        trackShipment(found.waybillNumber)
          .then(setCourierInfo)
          .catch(err => setCourierError(err instanceof Error ? err.message : 'Courier tracking unavailable.'))
          .finally(() => setCourierLoading(false));
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!order?.waybillNumber) return;
    navigator.clipboard.writeText(order.waybillNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isTerminal = order && (order.status === 'cancelled' || order.status === 'returned');
  const hasShipped = order && (order.status === 'shipped' || order.status === 'delivered');

  return (
    <Box sx={{ minHeight: '60vh', py: { xs: 4, sm: 6 }, px: 2, bgcolor: '#F9F7F4' }}>
      <Box sx={{ maxWidth: 540, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <LocalShippingIcon sx={{ fontSize: 40, color: GOLD, mb: 1 }} />
          <Typography variant="h5" sx={{ fontWeight: 700, color: NAVY }}>
            Track Your Order
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Enter your order number or tracking number, and the last 4 digits of your phone.
          </Typography>
        </Box>

        {/* Search form */}
        {!order && (
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', mb: 3 }}>
            <TextField
              label="Order Number or Tracking Number"
              placeholder="e.g. CH-26-XXXX or waybill number"
              fullWidth
              value={orderInput}
              onChange={e => setOrderInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTrack()}
              sx={{ mb: 2 }}
              slotProps={{ htmlInput: { style: { letterSpacing: 0.5 } } }}
            />
            <TextField
              label="Last 4 digits of your phone"
              placeholder="e.g. 4567"
              fullWidth
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => e.key === 'Enter' && handleTrack()}
              slotProps={{ htmlInput: { maxLength: 4, inputMode: 'numeric' } }}
              sx={{ mb: 2.5 }}
            />
            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
            <Button
              variant="contained"
              fullWidth
              size="large"
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
              disabled={loading}
              onClick={handleTrack}
              sx={{ bgcolor: NAVY, color: 'white', '&:hover': { bgcolor: '#1a2d55' }, borderRadius: 2, py: 1.4 }}
            >
              {loading ? 'Searching…' : 'Track Order'}
            </Button>
          </Paper>
        )}

        {/* Result */}
        {order && (
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>

            {/* Order header */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, gap: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Order Number</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY, lineHeight: 1.2 }}>
                  {order.orderNumber}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Placed {formatTs(order.createdAt)}
                </Typography>
              </Box>
              <StatusChip status={order.status} />
            </Box>

            {/* Waybill */}
            {order.waybillNumber && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5, p: 1.5, bgcolor: '#F4F6F9', borderRadius: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Tracking Number{courierInfo ? ` · ${courierInfo.courierName}` : ''}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, fontFamily: 'monospace', letterSpacing: 0.5 }}>
                    {order.waybillNumber}
                  </Typography>
                </Box>
                <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                  <IconButton size="small" onClick={handleCopy} sx={{ color: copied ? 'success.main' : 'text.secondary' }}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}

            {/* Terminal state banners */}
            {order.status === 'cancelled' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, bgcolor: '#FFF5F5', borderRadius: 2, mb: 2 }}>
                <CancelIcon sx={{ color: 'error.main' }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>Order Cancelled</Typography>
                  <Typography variant="caption" color="text.secondary">Contact us via WhatsApp if you have questions.</Typography>
                </Box>
              </Box>
            )}
            {order.status === 'returned' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, bgcolor: '#FFF5F5', borderRadius: 2, mb: 2 }}>
                <CancelIcon sx={{ color: 'error.main' }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>Order Returned</Typography>
                  <Typography variant="caption" color="text.secondary">Contact us via WhatsApp for assistance.</Typography>
                </Box>
              </Box>
            )}
            {order.status === 'delivered' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, bgcolor: '#F0FAF4', borderRadius: 2, mb: 2 }}>
                <CheckCircleIcon sx={{ color: 'success.main' }} />
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                  Delivered — thank you for shopping with Candle Heaven! 🕯️
                </Typography>
              </Box>
            )}

            <Divider sx={{ mb: 2 }} />

            {/* Courier timeline (when shipped) */}
            {hasShipped && (
              <>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', mb: 1.5 }}>
                  {courierInfo ? `${courierInfo.courierName} Updates` : 'Courier Updates'}
                </Typography>
                <CourierTimeline info={courierInfo} loading={courierLoading} error={courierError} />
                <Divider sx={{ my: 2 }} />
              </>
            )}

            {/* Internal order progress (always shown for pre-shipment, or as order history after) */}
            {!isTerminal && (
              <>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', mb: 1.5 }}>
                  {hasShipped ? 'Order History' : 'Order Progress'}
                </Typography>
                <InternalTimeline order={order} />
                <Divider sx={{ my: 2 }} />
              </>
            )}

            {/* Order summary */}
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', mb: 1.5 }}>
              Order Summary
            </Typography>

            {/* Item rows */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
              {order.items.map((item, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    p: 1.25, bgcolor: '#F4F6F9', borderRadius: 2,
                  }}
                >
                  {/* Qty badge */}
                  <Box sx={{
                    minWidth: 32, height: 32, borderRadius: 1.5,
                    bgcolor: NAVY, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>
                      ×{item.quantity}
                    </Typography>
                  </Box>

                  {/* Name + unit */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {item.name}
                    </Typography>
                    {item.unit && item.unit !== 'piece' && (
                      <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                    )}
                  </Box>

                  {/* Line total */}
                  <Typography variant="body2" sx={{ fontWeight: 600, color: NAVY, flexShrink: 0 }}>
                    LKR {(item.price * item.quantity).toLocaleString()}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Totals block */}
            <Box sx={{ bgcolor: '#F4F6F9', borderRadius: 2, p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {order.deliveryFee != null && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Delivery fee</Typography>
                  <Typography variant="body2">LKR {order.deliveryFee.toLocaleString()}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: order.deliveryFee != null ? 0.75 : 0, borderTop: order.deliveryFee != null ? '1px solid' : 'none', borderColor: 'divider' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>Total</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: NAVY }}>
                  LKR {order.total.toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Delivery to</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {[order.customer.city, order.customer.district].filter(Boolean).join(', ')}
                </Typography>
              </Box>
            </Box>

            {order.paymentStatus && order.paymentStatus !== 'paid' && (
              <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#FFF8EC', border: '1px solid #F5DFA0', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ fontWeight: 500, color: '#7A5C00' }}>
                  {order.paymentStatus === 'partially_paid' ? 'Partially Paid — Balance Due' : 'Payment Due on Delivery'}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#7A5C00' }}>
                  LKR {order.total.toLocaleString()}
                </Typography>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Button
              variant="text"
              size="small"
              startIcon={<ReplayIcon />}
              onClick={() => { setOrder(null); setPhone(''); setOrderInput(''); navigate('/track', { replace: true }); }}
              sx={{ color: NAVY }}
            >
              Track another order
            </Button>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
