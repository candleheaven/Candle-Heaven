import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Typography, Box, Chip, CircularProgress, Button,
  Divider, Avatar, Collapse, IconButton, Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { useAuth } from '../context/AuthContext';
import { getMyOrders } from '../services/orders';
import { trackShipment } from '../services/courier';
import type { TrackingInfo } from '../services/courier';
import type { UserOrder } from '../services/orders';
import type { OrderStatus } from '../types';

const GOLD = '#C9A96E';

const STATUS: Record<OrderStatus, { label: string; color: 'default' | 'info' | 'warning' | 'primary' | 'success' | 'error' }> = {
  pending:   { label: 'Pending',   color: 'default' },
  confirmed: { label: 'Confirmed', color: 'info'    },
  shipped:   { label: 'Shipped',   color: 'primary' },
  delivered: { label: 'Delivered', color: 'success' },
  returned:  { label: 'Returned',  color: 'warning' },
  cancelled: { label: 'Cancelled', color: 'error'   },
};

function OrderCard({ order }: { order: UserOrder }) {
  const [open, setOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const status = STATUS[order.status] ?? STATUS.pending;

  async function handleTrack() {
    if (!order.waybillNumber) return;
    if (trackingOpen) { setTrackingOpen(false); return; }
    setTrackingOpen(true);
    if (trackingInfo) return; // already loaded, just re-show
    setTrackingLoading(true);
    setTrackingError('');
    try {
      const info = await trackShipment(order.waybillNumber);
      setTrackingInfo(info);
    } catch (err) {
      setTrackingError(err instanceof Error ? err.message : 'Tracking unavailable.');
    } finally {
      setTrackingLoading(false);
    }
  }

  const date = new Date(order.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        overflow: 'hidden',
        transition: 'box-shadow 0.15s',
        '&:hover': { boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
      }}
    >
      {/* Order header — always visible */}
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 2, bgcolor: 'background.default', flexWrap: 'wrap', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: GOLD, letterSpacing: 0.5 }}>
            {order.orderNumber}
          </Typography>
          <Typography variant="caption" color="text.secondary">{date}</Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Chip label={status.label} color={status.color} size="small" />
          {order.waybillNumber && (
            <Chip
              icon={<LocalShippingIcon sx={{ fontSize: 14 }} />}
              label={order.waybillNumber}
              size="small"
              variant="outlined"
              sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11 }}
            />
          )}
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            LKR {order.total.toLocaleString()}
          </Typography>
          <IconButton
            size="small"
            sx={{
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'none',
              color: 'text.secondary',
            }}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Expandable details */}
      <Collapse in={open}>
        <Divider />
        <Box sx={{ px: 3, py: 2 }}>
          {/* Items */}
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'block', mb: 1.5 }}>
            Items
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
            {order.items.map((item, i) => (
              <Box key={item.cartKey ?? i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar
                  src={item.image}
                  variant="rounded"
                  sx={{ width: 48, height: 48, bgcolor: 'grey.100', flexShrink: 0 }}
                >
                  {item.name[0]}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{item.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.decimalQty
                      ? `${item.quantity} × ${item.unit}`
                      : `Qty ${item.quantity} × ${item.unit}`}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
                  LKR {(item.price * item.quantity).toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Delivery address + totals */}
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Delivery Address
              </Typography>
              <Typography variant="body2">{order.customer.name}</Typography>
              <Typography variant="body2" color="text.secondary">{order.customer.address}</Typography>
              <Typography variant="body2" color="text.secondary">
                {order.customer.city}{order.customer.district ? `, ${order.customer.district}` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">{order.customer.phone}</Typography>
            </Box>

            <Box sx={{ minWidth: 160, textAlign: 'right' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                <Typography variant="body2">LKR {order.subtotal.toLocaleString()}</Typography>
              </Box>
              {order.deliveryFee != null && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">Delivery</Typography>
                  <Typography variant="body2">LKR {order.deliveryFee.toLocaleString()}</Typography>
                </Box>
              )}
              {order.promoCode && order.promoDiscount != null && order.promoDiscount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Promo <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>({order.promoCode})</Typography>
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'success.main' }}>–LKR {order.promoDiscount.toLocaleString()}</Typography>
                </Box>
              )}
              {order.pointsRedeemed != null && order.pointsRedeemed > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">Points discount</Typography>
                  <Typography variant="body2" sx={{ color: 'success.main' }}>–LKR {order.pointsRedeemed.toLocaleString()}</Typography>
                </Box>
              )}
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>Total</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: GOLD }}>
                  LKR {order.total.toLocaleString()}
                </Typography>
              </Box>
              {order.pointsEarned != null && order.pointsEarned > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                  <StarBorderIcon sx={{ fontSize: 14, color: GOLD }} />
                  <Typography variant="caption" sx={{ color: GOLD }}>+{order.pointsEarned} points earned</Typography>
                </Box>
              )}
            </Box>
          </Box>
          {/* Track Shipment button + panel */}
          {order.waybillNumber && (
            <>
              <Divider sx={{ mt: 2, mb: 0 }} />
              <Box sx={{ px: 0, pt: 2, pb: trackingOpen ? 0 : 0 }}>
                <Button
                  variant={trackingOpen ? 'contained' : 'outlined'}
                  size="small"
                  startIcon={trackingLoading ? <CircularProgress size={14} color="inherit" /> : <LocalShippingIcon />}
                  onClick={handleTrack}
                  fullWidth
                  sx={{
                    py: 1,
                    fontWeight: 600,
                    ...(trackingOpen ? {} : { borderColor: GOLD, color: GOLD, '&:hover': { borderColor: GOLD, bgcolor: `${GOLD}10` } }),
                  }}
                >
                  {trackingLoading ? 'Fetching tracking…' : trackingOpen ? 'Hide Tracking' : 'Track Shipment'}
                </Button>
              </Box>
            </>
          )}
          {order.waybillNumber && trackingOpen && (
            <Box sx={{ pt: 2, pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <LocalShippingIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                  Shipment Tracking — {order.waybillNumber}
                </Typography>
              </Box>
              {trackingLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={14} />
                  <Typography variant="caption">Fetching tracking info…</Typography>
                </Box>
              )}
              {trackingError && <Alert severity="error" sx={{ mt: 0 }}>{trackingError}</Alert>}
              {trackingInfo && !trackingLoading && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                    <Chip
                      label={trackingInfo.currentStatus}
                      size="small"
                      sx={{ fontWeight: 700, bgcolor: trackingInfo.currentColor, color: '#fff' }}
                    />
                    {trackingInfo.recipientName && (
                      <Typography variant="caption" color="text.secondary">→ {trackingInfo.recipientName}</Typography>
                    )}
                  </Box>
                  {trackingInfo.events.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No tracking events yet.</Typography>
                  ) : (
                    <Box sx={{ position: 'relative', pl: 3 }}>
                      <Box sx={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, bgcolor: 'divider' }} />
                      {trackingInfo.events.map((ev, i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1.5, position: 'relative' }}>
                          <Box sx={{
                            position: 'absolute', left: -24, top: 2,
                            width: i === 0 ? 14 : 10, height: i === 0 ? 14 : 10,
                            borderRadius: '50%',
                            bgcolor: ev.color,
                            border: '2px solid white',
                            boxShadow: i === 0 ? `0 0 0 2px ${ev.color}40` : 'none',
                            mt: i === 0 ? 0 : '2px',
                          }} />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: i === 0 ? 700 : 400 }}>{ev.description}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {ev.dateFormatted}{ev.dateTimeAgo ? ` (${ev.dateTimeAgo})` : ''}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function MyOrders() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/'); return; }
    getMyOrders(user.uid)
      .then(setOrders)
      .catch(() => setError('Could not load your orders. Please try again.'))
      .finally(() => setLoading(false));
  }, [user, authLoading, navigate]);

  if (authLoading || loading) {
    return (
      <Container maxWidth="md" sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>My Orders</Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {orders.length > 0 ? `${orders.length} order${orders.length > 1 ? 's' : ''} placed` : ''}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {orders.length === 0 && !error ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <ShoppingBagOutlinedIcon sx={{ fontSize: 72, color: 'grey.300', mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No orders yet</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Your order history will appear here once you place your first order.
          </Typography>
          <Button variant="contained" size="large" onClick={() => navigate('/products')}>
            Shop Now
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {orders.map(order => (
            <OrderCard key={order.orderNumber} order={order} />
          ))}
        </Box>
      )}
    </Container>
  );
}
