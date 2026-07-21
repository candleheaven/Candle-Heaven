import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Card, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Typography, Chip, TextField, CircularProgress,
  MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Divider, InputAdornment, Stack, Alert, Snackbar,
  Tooltip, Autocomplete, IconButton, Collapse, useMediaQuery, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SendIcon from '@mui/icons-material/Send';
import SaveIcon from '@mui/icons-material/Save';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { adminGetAllOrders, adminGetAllProducts, adminUpdateOrderStatus, adminUpdateOrderField, adminUpdateOrderItems, getOrderProfitBreakdown, adminRecordPayment, adminMarkOrderUnpaid, adminSetPaymentStatus, adminGetOpenCourierInvoices, adminAssignOrderToInvoice, adminUnassignOrderFromInvoice, type AdminOrder, type OrderProfitBreakdown } from '../../services/admin';
import type { PaymentMethod, PaymentInfo, Settlement, FulfillmentType } from '../../types';
import { trackShipment, createCourierOrder } from '../../services/courier';
import type { TrackingInfo, CourierOrderInput } from '../../services/courier';
import type { OrderStatus, CartItem, Product, PriceTier } from '../../types';

// ── Tier helpers (mirrored from CreateOrder) ─────────────────────────────────
function toBase(qty: number, unit: string): number {
  if (unit === 'kg' || unit === 'L') return Math.round(qty * 1000);
  return Math.round(qty);
}
function fromBase(qty: number, unit: string): number {
  if (unit === 'kg' || unit === 'L') return qty / 1000;
  return qty;
}
interface BestTierOption { tier: PriceTier; tierBase: number; units: number; total: number; }
function getBestTierOption(baseQty: number, tiers: PriceTier[]): BestTierOption | null {
  let best: PriceTier | null = null; let bestBase = -1;
  for (const t of tiers) { const tb = toBase(t.qty, t.inputUnit); if (baseQty >= tb && tb > bestBase) { best = t; bestBase = tb; } }
  if (!best) return null;
  return { tier: best, tierBase: bestBase, units: baseQty / bestBase, total: (baseQty / bestBase) * best.price };
}

const NAVY = '#132040';

function formatWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('94')) return digits;
  if (digits.startsWith('0')) return '94' + digits.slice(1);
  return '94' + digits;
}

function buildConfirmationMessage(order: AdminOrder): string {
  const date = new Date(order.createdAt as string).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const items = order.items
    .map(i => `• ${i.name}${i.unit ? ` ${i.unit}` : ''} × ${i.quantity} — LKR ${(i.price * i.quantity).toLocaleString()}`)
    .join('\n');
  const subtotal = (order.subtotal ?? order.items.reduce((s, i) => s + i.price * i.quantity, 0));
  const deliveryLine = order.deliveryFee ? `\n*Delivery:* LKR ${order.deliveryFee.toLocaleString()}` : '';
  const discountLine = order.promoDiscount ? `\n*Discount:* −LKR ${order.promoDiscount.toLocaleString()}` : '';

  return (
    `Hi ${order.customer.name}! 🕯️\n\n` +
    `Thank you for your order from Candle Heaven!\n\n` +
    `*Order No:* ${order.orderNumber}\n` +
    `*Date:* ${date}\n\n` +
    `*Items:*\n${items}\n\n` +
    `*Subtotal:* LKR ${subtotal.toLocaleString()}${discountLine}${deliveryLine}\n` +
    `*Total:* LKR ${order.total.toLocaleString()}\n\n` +
    `We'll let you know once your order is on its way! 🚚`
  );
}

function buildShippedMessage(order: AdminOrder): string {
  return (
    `Hi ${order.customer.name}! 📦\n\n` +
    `Your Candle Heaven order is on its way!\n\n` +
    `*Order No:* ${order.orderNumber}\n` +
    `*Tracking No:* ${order.waybillNumber ?? 'N/A'}\n` +
    `*Amount Due:* LKR ${order.total.toLocaleString()}\n\n` +
    `Track your order here:\n` +
    `${window.location.origin}/track/${order.orderNumber}\n\n` +
    `Expected delivery in 1–3 business days.\n\n` +
    `Thank you for shopping with Candle Heaven! 🕯️`
  );
}

function openWhatsApp(phone: string, message: string) {
  const number = formatWhatsAppNumber(phone);
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank');
}

const ALL_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled'];

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: 'warning' | 'info' | 'secondary' | 'primary' | 'success' | 'error' }> = {
  pending:   { label: 'Pending',   color: 'warning'   },
  confirmed: { label: 'Confirmed', color: 'info'      },
  shipped:   { label: 'Shipped',   color: 'primary'   },
  delivered: { label: 'Delivered', color: 'success'   },
  returned:  { label: 'Returned',  color: 'secondary' },
  cancelled: { label: 'Cancelled', color: 'error'     },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatCurrency(n: number) {
  return `LKR ${n.toLocaleString()}`;
}

// ─── Tracking Timeline ───────────────────────────────────────────────────────

function TrackingTimeline({ info, loading, error }: { info: TrackingInfo | null; loading: boolean; error: string }) {
  if (loading) return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}><CircularProgress size={16} /><Typography variant="body2">Fetching tracking info…</Typography></Box>;
  if (error) return <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>;
  if (!info) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      {/* Order summary row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          label={info.currentStatus}
          size="small"
          sx={{ fontWeight: 700, bgcolor: info.currentColor, color: '#fff' }}
        />
        {info.recipientName && (
          <Typography variant="caption" color="text.secondary">→ {info.recipientName}</Typography>
        )}
        {info.weight != null && (
          <Typography variant="caption" color="text.secondary">· {info.weight} kg</Typography>
        )}
      </Box>

      {info.events.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No tracking events yet.</Typography>
      ) : (
        <Box sx={{ position: 'relative', pl: 3 }}>
          <Box sx={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, bgcolor: 'divider' }} />
          {info.events.map((ev, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 2, position: 'relative' }}>
              {/* Coloured dot */}
              <Box sx={{
                position: 'absolute', left: -24, top: 2,
                width: i === 0 ? 16 : 12, height: i === 0 ? 16 : 12,
                borderRadius: '50%',
                bgcolor: ev.color,
                border: '2px solid white',
                boxShadow: i === 0 ? `0 0 0 2px ${ev.color}40` : 'none',
                mt: i === 0 ? 0 : '2px',
              }} />
              <Box sx={{ ml: i === 0 ? 0.25 : 0 }}>
                <Typography variant="body2" sx={{ fontWeight: i === 0 ? 700 : 500 }}>{ev.description}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {ev.dateFormatted}{ev.dateTimeAgo ? ` (${ev.dateTimeAgo})` : ''}
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

function calcWeight(order: AdminOrder): number {
  const totalGrams = order.items.reduce((sum, item) => sum + (item.weightGrams ?? 0), 0);
  return totalGrams > 0 ? Math.max(0.1, parseFloat((totalGrams / 1000).toFixed(2))) : 0.5;
}

function buildDescription(order: AdminOrder): string {
  const parts = order.items.map(item => `${item.name} x${item.quantity}`);
  const summary = parts.join(', ');
  return summary.length > 200 ? summary.slice(0, 197) + '…' : summary;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function OrderList() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'partially_paid' | 'unpaid'>('all');
  const [detailOrder, setDetailOrder] = useState<AdminOrder | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState(
    location.state?.created ? `Order ${location.state.created} created successfully` : ''
  );

  // Courier state
  const [waybillInput, setWaybillInput] = useState('');
  const [savingWaybill, setSavingWaybill] = useState(false);
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [trackingVisible, setTrackingVisible] = useState(false);

  // Return damage dialog state
  const [returnTarget, setReturnTarget] = useState<AdminOrder | null>(null);
  const [damageInputs, setDamageInputs] = useState<Record<string, number>>({});
  const [processingReturn, setProcessingReturn] = useState(false);

  // Edit items state
  const [editingItems, setEditingItems] = useState(false);
  const [editItems, setEditItems] = useState<CartItem[]>([]);
  const [editPackagingItems, setEditPackagingItems] = useState<CartItem[]>([]);
  const [savingItems, setSavingItems] = useState(false);
  const [editProducts, setEditProducts] = useState<Product[]>([]);
  const [editPkgProducts, setEditPkgProducts] = useState<Product[]>([]);
  const [addItemProduct, setAddItemProduct] = useState<Product | null>(null);
  const [addItemInputValue, setAddItemInputValue] = useState('');
  const [addItemSimpleQty, setAddItemSimpleQty] = useState(1);
  const [addPkgProduct, setAddPkgProduct] = useState<Product | null>(null);
  const [addPkgQty, setAddPkgQty] = useState(1);

  // Courier order dialog state
  const [courierOrderOpen, setCourierOrderOpen] = useState(false);
  const [courierOrderForm, setCourierOrderForm] = useState<CourierOrderInput & { orderNo: string }>({
    orderNo: '', customerName: '', customerAddress: '', customerPhone: '',
    customerSecondaryPhone: '', destinationCityName: '', destinationStateName: '',
    cod: 0, description: '', weight: 0.5, remark: '',
  });
  const [creatingCourierOrder, setCreatingCourierOrder] = useState(false);
  const [courierOrderError, setCourierOrderError] = useState('');
  const [courierOrderResult, setCourierOrderResult] = useState('');

  // Per-order profit
  const [profitBreakdown, setProfitBreakdown] = useState<OrderProfitBreakdown | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitVisible, setProfitVisible] = useState(false);

  // Payment recording
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<{ method: PaymentMethod; reference: string; amount: number; date: string; notes: string }>({
    method: 'cash', reference: '', amount: 0, date: '', notes: '',
  });
  const [savingPayment, setSavingPayment] = useState(false);

  // Courier invoice assignment
  const [invoiceAssignOpen, setInvoiceAssignOpen] = useState(false);
  const [openInvoices, setOpenInvoices] = useState<Settlement[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [assignForm, setAssignForm] = useState({ invoiceId: '', invoiceNumber: '', actualShippingFee: '' });
  const [savingAssign, setSavingAssign] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminGetAllOrders().then(o => { setOrders(o); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sync waybill input and reset tracking when dialog opens/order changes
  useEffect(() => {
    if (detailOrder) {
      setWaybillInput(detailOrder.waybillNumber ?? '');
      setTrackingInfo(null);
      setTrackingError('');
      setTrackingVisible(false);
      setPaymentFormOpen(false);
      setPaymentForm({ method: 'cash', reference: '', amount: detailOrder.total, date: new Date().toISOString().slice(0, 10), notes: '' });
    }
  }, [detailOrder?.orderNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(order: AdminOrder, newStatus: OrderStatus) {
    if (newStatus === 'returned') {
      setReturnTarget(order);
      setDamageInputs({});
      return;
    }
    setUpdatingStatus(order.id);
    await adminUpdateOrderStatus(order.id, newStatus);
    setOrders(os => os.map(o => o.id === order.id ? { ...o, status: newStatus } : o));
    if (detailOrder?.id === order.id) setDetailOrder(d => d ? { ...d, status: newStatus } : d);
    setUpdatingStatus(null);
  }

  async function handleConfirmReturn() {
    if (!returnTarget) return;
    setProcessingReturn(true);
    await adminUpdateOrderStatus(returnTarget.id, 'returned', damageInputs);
    const updated = { ...returnTarget, status: 'returned' as OrderStatus };
    setOrders(os => os.map(o => o.id === returnTarget.id ? updated : o));
    if (detailOrder?.id === returnTarget.id) setDetailOrder(updated);
    setReturnTarget(null);
    setProcessingReturn(false);
    setSuccessMsg(`Order ${returnTarget.orderNumber} marked as returned`);
  }

  async function handleSaveWaybill() {
    if (!detailOrder || !waybillInput.trim()) return;
    setSavingWaybill(true);
    const num = waybillInput.trim().toUpperCase();
    await adminUpdateOrderField(detailOrder.id, { waybillNumber: num });
    const updated = { ...detailOrder, waybillNumber: num };
    setDetailOrder(updated);
    setOrders(os => os.map(o => o.id === detailOrder.id ? updated : o));
    setSavingWaybill(false);
    setSuccessMsg(`Waybill ${num} saved for ${detailOrder.orderNumber}`);
  }

  async function handleRecordPayment() {
    if (!detailOrder) return;
    setSavingPayment(true);
    const info: PaymentInfo = {
      method: paymentForm.method,
      reference: paymentForm.reference.trim(),
      amount: paymentForm.amount,
      date: paymentForm.date,
      ...(paymentForm.notes.trim() && { notes: paymentForm.notes.trim() }),
    };
    await adminRecordPayment(detailOrder.id, info);
    const updated = { ...detailOrder, paymentStatus: 'paid' as const, paymentInfo: info };
    setDetailOrder(updated);
    setOrders(os => os.map(o => o.id === detailOrder.id ? updated : o));
    setPaymentFormOpen(false);
    setSavingPayment(false);
    setSuccessMsg(`Payment recorded for ${detailOrder.orderNumber}`);
  }

  async function handleMarkUnpaid() {
    if (!detailOrder) return;
    await adminMarkOrderUnpaid(detailOrder.id);
    const { paymentStatus: _ps, paymentInfo: _pi, ...rest } = detailOrder;
    const updated = rest as AdminOrder;
    setDetailOrder(updated);
    setOrders(os => os.map(o => o.id === detailOrder.id ? updated : o));
    setPaymentForm(f => ({ ...f, amount: detailOrder.total }));
  }

  async function handleOpenInvoiceAssign() {
    setInvoiceAssignOpen(true);
    if (openInvoices.length === 0) {
      setLoadingInvoices(true);
      const inv = await adminGetOpenCourierInvoices();
      setOpenInvoices(inv);
      setLoadingInvoices(false);
    }
    // Pre-fill from current assignment
    if (detailOrder?.courierInvoice) {
      setAssignForm({
        invoiceId: detailOrder.courierInvoice.invoiceId,
        invoiceNumber: detailOrder.courierInvoice.invoiceNumber,
        actualShippingFee: String(detailOrder.courierInvoice.actualShippingFee),
      });
    } else {
      setAssignForm({ invoiceId: '', invoiceNumber: '', actualShippingFee: String(detailOrder?.deliveryFee ?? 0) });
    }
  }

  async function handleSaveAssignment() {
    if (!detailOrder || !assignForm.invoiceId) return;
    setSavingAssign(true);
    const assignment = {
      invoiceId: assignForm.invoiceId,
      invoiceNumber: assignForm.invoiceNumber,
      actualShippingFee: parseFloat(assignForm.actualShippingFee) || 0,
    };
    await adminAssignOrderToInvoice(detailOrder.id, assignment);
    const updated = { ...detailOrder, courierInvoice: assignment };
    setDetailOrder(updated);
    setOrders(os => os.map(o => o.id === detailOrder.id ? updated : o));
    setInvoiceAssignOpen(false);
    setSavingAssign(false);
    setSuccessMsg(`Order ${detailOrder.orderNumber} linked to invoice ${assignForm.invoiceNumber}`);
  }

  async function handleFulfillmentChange(type: FulfillmentType) {
    if (!detailOrder) return;
    await adminUpdateOrderField(detailOrder.id, { fulfillmentType: type });
    const updated = { ...detailOrder, fulfillmentType: type };
    setDetailOrder(updated);
    setOrders(os => os.map(o => o.id === detailOrder.id ? updated : o));
  }

  async function handleUnassignInvoice() {
    if (!detailOrder) return;
    await adminUnassignOrderFromInvoice(detailOrder.id);
    const { courierInvoice: _ci, ...rest } = detailOrder;
    const updated = rest as AdminOrder;
    setDetailOrder(updated);
    setOrders(os => os.map(o => o.id === detailOrder.id ? updated : o));
    setSuccessMsg(`Order ${detailOrder.orderNumber} removed from invoice`);
  }

  async function handleTrack() {
    if (!detailOrder?.waybillNumber) return;
    setTrackingLoading(true);
    setTrackingError('');
    setTrackingVisible(true);
    try {
      const info = await trackShipment(detailOrder.waybillNumber);
      setTrackingInfo(info);
    } catch (err) {
      setTrackingError(err instanceof Error ? err.message : 'Tracking failed.');
    } finally {
      setTrackingLoading(false);
    }
  }

  function openCourierOrderDialog(order: AdminOrder) {
    setCourierOrderForm({
      orderNo: order.orderNumber,
      waybillNumber: waybillInput.trim() || order.waybillNumber,
      customerName: order.customer.name,
      customerAddress: order.customer.address,
      customerPhone: order.customer.phone,
      customerSecondaryPhone: order.customer.secondaryPhone ?? '',
      destinationCityName: order.customer.city,
      destinationStateName: order.customer.district ?? '',
      cod: order.total,
      description: buildDescription(order),
      weight: calcWeight(order),
      remark: order.customer.notes ?? '',
    });
    setCourierOrderError('');
    setCourierOrderResult('');
    setCourierOrderOpen(true);
  }

  async function handleCreateCourierOrder() {
    if (!detailOrder) return;
    setCreatingCourierOrder(true);
    setCourierOrderError('');
    try {
      const result = await createCourierOrder(courierOrderForm);
      const waybill = result.waybillNumber;
      if (waybill) {
        await adminUpdateOrderField(detailOrder.id, { waybillNumber: waybill });
        const updated = { ...detailOrder, waybillNumber: waybill };
        setDetailOrder(updated);
        setOrders(os => os.map(o => o.id === detailOrder.id ? updated : o));
        setWaybillInput(waybill);
      }
      setCourierOrderResult(
        waybill
          ? `Order created in Royal Express. Waybill: ${waybill}`
          : result.message || 'Courier order created.',
      );
    } catch (err) {
      setCourierOrderError(err instanceof Error ? err.message : 'Failed to create courier order.');
    } finally {
      setCreatingCourierOrder(false);
    }
  }

  // ── Edit items handlers ────────────────────────────────────────────────────

  async function startEditItems() {
    if (!detailOrder) return;
    setEditItems([...detailOrder.items]);
    setEditPackagingItems([...(detailOrder.packagingItems ?? [])]);
    setAddItemProduct(null); setAddItemInputValue(''); setAddItemSimpleQty(1);
    setAddPkgProduct(null); setAddPkgQty(1);
    if (editProducts.length === 0) {
      const all = await adminGetAllProducts();
      setEditProducts(all.filter(p => !p.isPackaging));
      setEditPkgProducts(all.filter(p => !!p.isPackaging));
    }
    setEditingItems(true);
  }

  function cancelEditItems() {
    setEditingItems(false);
  }

  async function saveEditItems() {
    if (!detailOrder) return;
    setSavingItems(true);
    const newSubtotal = editItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const deliveryFee = detailOrder.deliveryFee ?? 0;
    const promoDiscount = detailOrder.promoDiscount ?? 0;
    const newTotal = Math.max(0, newSubtotal + deliveryFee - promoDiscount);
    await adminUpdateOrderItems(detailOrder.id, editItems, editPackagingItems, newSubtotal, newTotal);
    const updated: AdminOrder = {
      ...detailOrder,
      items: editItems,
      packagingItems: editPackagingItems.length > 0 ? editPackagingItems : undefined,
      subtotal: newSubtotal,
      total: newTotal,
    };
    setDetailOrder(updated);
    setOrders(os => os.map(o => o.id === detailOrder.id ? updated : o));
    setEditingItems(false);
    setSavingItems(false);
    setSuccessMsg(`Items updated for ${detailOrder.orderNumber}`);
  }

  function changeEditItemQty(cartKey: string, qty: number, isPkg: boolean) {
    const setter = isPkg ? setEditPackagingItems : setEditItems;
    setter(items => items.map(i => i.cartKey === cartKey ? { ...i, quantity: Math.max(1, qty) } : i));
  }

  function changeEditItemPrice(cartKey: string, price: number, isPkg: boolean) {
    const setter = isPkg ? setEditPackagingItems : setEditItems;
    setter(items => items.map(i => i.cartKey === cartKey ? { ...i, price } : i));
  }

  function removeEditItem(cartKey: string, isPkg: boolean) {
    const setter = isPkg ? setEditPackagingItems : setEditItems;
    setter(items => items.filter(i => i.cartKey !== cartKey));
  }

  function addItemToEdit() {
    if (!addItemProduct) return;
    const tiers = addItemProduct.priceTiers ?? [];
    const hasTiers = tiers.length > 0;
    if (hasTiers) {
      const bulkTier = tiers.find(t => t.isBulk);
      const displayUnit = bulkTier?.inputUnit ?? tiers[0]?.inputUnit ?? addItemProduct.unit;
      const inputNum = parseFloat(addItemInputValue);
      if (isNaN(inputNum) || inputNum <= 0) return;
      const baseQty = toBase(inputNum, displayUnit);
      const best = getBestTierOption(baseQty, tiers);
      if (!best) return;
      const cartKey = `${addItemProduct.id}-${best.tier.label}`;
      setEditItems(items => {
        const existing = items.find(i => i.cartKey === cartKey);
        if (existing) return items.map(i => i.cartKey === cartKey ? { ...i, quantity: i.quantity + best.units } : i);
        return [...items, {
          productId: addItemProduct.id, cartKey,
          name: addItemProduct.name, price: best.tier.price,
          quantity: best.units, unit: best.tier.label,
          image: addItemProduct.images?.[0], tierBase: best.tierBase,
        }];
      });
    } else {
      setEditItems(items => {
        const existing = items.find(i => i.cartKey === addItemProduct.id);
        if (existing) return items.map(i => i.cartKey === addItemProduct.id ? { ...i, quantity: i.quantity + addItemSimpleQty } : i);
        return [...items, {
          productId: addItemProduct.id, cartKey: addItemProduct.id,
          name: addItemProduct.name, price: addItemProduct.price,
          quantity: addItemSimpleQty, unit: addItemProduct.unit, image: addItemProduct.images?.[0],
        }];
      });
    }
    setAddItemProduct(null); setAddItemInputValue(''); setAddItemSimpleQty(1);
  }

  function addPkgToEdit() {
    if (!addPkgProduct) return;
    setEditPackagingItems(items => {
      const existing = items.find(i => i.cartKey === addPkgProduct.id);
      if (existing) return items.map(i => i.cartKey === addPkgProduct.id ? { ...i, quantity: i.quantity + addPkgQty } : i);
      return [...items, {
        productId: addPkgProduct.id, cartKey: addPkgProduct.id,
        name: addPkgProduct.name, price: addPkgProduct.price,
        quantity: addPkgQty, unit: addPkgProduct.unit, image: addPkgProduct.images[0],
      }];
    });
    setAddPkgProduct(null); setAddPkgQty(1);
  }

  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchPayment = paymentFilter === 'all' ||
      (paymentFilter === 'paid' ? o.paymentStatus === 'paid' :
       paymentFilter === 'partially_paid' ? o.paymentStatus === 'partially_paid' :
       paymentFilter === 'unpaid' ? (!o.paymentStatus || o.paymentStatus === 'unpaid') : true);
    const q = search.toLowerCase();
    const matchSearch = !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      o.customer.name.toLowerCase().includes(q) ||
      (o.customer.email ?? '').toLowerCase().includes(q) ||
      o.customer.city.toLowerCase().includes(q) ||
      (o.waybillNumber ?? '').toLowerCase().includes(q);
    return matchStatus && matchPayment && matchSearch;
  });

  const countByStatus = (s: OrderStatus) => orders.filter(o => o.status === s).length;
  const canAssignWaybill = (o: AdminOrder) => ['pending', 'confirmed', 'shipped'].includes(o.status);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY }}>
          Orders ({orders.length})
        </Typography>
        <Button variant="contained" color="secondary" startIcon={<AddIcon />} onClick={() => navigate('/admin/orders/new')}>
          Create Order
        </Button>
      </Box>

      <Snackbar open={Boolean(successMsg)} autoHideDuration={5000} onClose={() => setSuccessMsg('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSuccessMsg('')} sx={{ width: '100%' }}>{successMsg}</Alert>
      </Snackbar>

      {/* Status filter chips */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <Chip label={`All (${orders.length})`} onClick={() => setStatusFilter('all')} variant={statusFilter === 'all' ? 'filled' : 'outlined'} color={statusFilter === 'all' ? 'secondary' : 'default'} sx={{ fontWeight: statusFilter === 'all' ? 700 : 400 }} />
        {ALL_STATUSES.map(s => (
          <Chip key={s} label={`${STATUS_CONFIG[s].label} (${countByStatus(s)})`} onClick={() => setStatusFilter(s)} variant={statusFilter === s ? 'filled' : 'outlined'} color={statusFilter === s ? STATUS_CONFIG[s].color : 'default'} sx={{ fontWeight: statusFilter === s ? 700 : 400, textTransform: 'capitalize' }} />
        ))}
      </Box>

      {/* Payment filter chips */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Chip label="Any payment" size="small" onClick={() => setPaymentFilter('all')} variant={paymentFilter === 'all' ? 'filled' : 'outlined'} sx={{ fontWeight: paymentFilter === 'all' ? 700 : 400 }} />
        <Chip label="Paid" size="small" onClick={() => setPaymentFilter('paid')} variant={paymentFilter === 'paid' ? 'filled' : 'outlined'} color={paymentFilter === 'paid' ? 'success' : 'default'} sx={{ fontWeight: paymentFilter === 'paid' ? 700 : 400 }} />
        <Chip label="Partially Paid" size="small" onClick={() => setPaymentFilter('partially_paid')} variant={paymentFilter === 'partially_paid' ? 'filled' : 'outlined'} color={paymentFilter === 'partially_paid' ? 'warning' : 'default'} sx={{ fontWeight: paymentFilter === 'partially_paid' ? 700 : 400 }} />
        <Chip label="Unpaid" size="small" onClick={() => setPaymentFilter('unpaid')} variant={paymentFilter === 'unpaid' ? 'filled' : 'outlined'} color={paymentFilter === 'unpaid' ? 'error' : 'default'} sx={{ fontWeight: paymentFilter === 'unpaid' ? 700 : 400 }} />
      </Box>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField
            placeholder="Search by order #, customer, city, waybill…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            size="small"
            fullWidth
            sx={{ maxWidth: { sm: 380 } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#FAFAFA', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', whiteSpace: 'nowrap' } }}>
                  <TableCell>Order #</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Date</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Items</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="center" sx={{ display: { xs: 'none', md: 'table-cell' } }}>Waybill</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Update Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: 'text.secondary' }}>No orders found</TableCell></TableRow>
                )}
                {filtered.map(order => (
                  <TableRow key={order.id} hover sx={{ cursor: 'pointer', '&:last-child td': { border: 0 } }} onClick={() => setDetailOrder(order)}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>{order.orderNumber}</Typography>
                      {order.seqNumber != null && (
                        <Typography variant="caption" color="text.secondary">#{order.seqNumber}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Typography variant="body2" color="text.secondary">{formatDate(order.createdAt)}</Typography></TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{order.customer.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{order.customer.city}</Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Typography variant="body2">{order.items.length}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(order.total)}</Typography></TableCell>
                    <TableCell align="center" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {order.waybillNumber ? (
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: NAVY }}>{order.waybillNumber}</Typography>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={STATUS_CONFIG[order.status]?.label ?? order.status} size="small" color={STATUS_CONFIG[order.status]?.color ?? 'default'} sx={{ textTransform: 'capitalize', fontWeight: 600, fontSize: 11 }} />
                    </TableCell>
                    <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }} onClick={e => e.stopPropagation()}>
                      <TextField select value={order.status} onChange={e => handleStatusChange(order, e.target.value as OrderStatus)} size="small" disabled={updatingStatus === order.id} sx={{ minWidth: 130 }}>
                        {ALL_STATUSES.map(s => (<MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{STATUS_CONFIG[s].label}</MenuItem>))}
                      </TextField>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Card>

      {/* ── Order Detail Dialog ─────────────────────────────────────────────── */}
      <Dialog open={Boolean(detailOrder)} onClose={() => { setDetailOrder(null); setEditingItems(false); setEditItems([]); setEditPackagingItems([]); setProfitBreakdown(null); setProfitVisible(false); setPaymentFormOpen(false); }} maxWidth="sm" fullWidth fullScreen={isMobile} slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 3 } } }}>
        {detailOrder && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography variant="h6" component="span" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{detailOrder.orderNumber}</Typography>
                {detailOrder.seqNumber != null && (
                  <Typography variant="body2" component="span" color="text.secondary">#{detailOrder.seqNumber}</Typography>
                )}
              </Box>
              <Typography variant="body2" component="span" color="text.secondary" sx={{ display: 'block' }}>{formatDate(detailOrder.createdAt)}</Typography>
            </DialogTitle>

            <DialogContent>
              {/* Customer */}
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, mt: 0.5 }}>Customer</Typography>
              <Stack spacing={0.5} sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon fontSize="small" color="action" />
                  <Typography variant="body2">{detailOrder.customer.name}</Typography>
                  {detailOrder.customer.email && <Typography variant="body2" color="text.secondary">— {detailOrder.customer.email}</Typography>}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PhoneIcon fontSize="small" color="action" />
                  <Typography variant="body2">{detailOrder.customer.phone}</Typography>
                  {detailOrder.customer.secondaryPhone && <Typography variant="body2" color="text.secondary">/ {detailOrder.customer.secondaryPhone}</Typography>}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationOnIcon fontSize="small" color="action" />
                  <Typography variant="body2">{detailOrder.customer.address}, {detailOrder.customer.city}</Typography>
                </Box>
                {detailOrder.customer.notes && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 3.5 }}>Note: {detailOrder.customer.notes}</Typography>
                )}
              </Stack>

              <Divider sx={{ mb: 2 }} />

              {/* Items */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Order Items</Typography>
                {['pending', 'confirmed'].includes(detailOrder.status) && !editingItems && (
                  <Button size="small" startIcon={<EditIcon sx={{ fontSize: 14 }} />} onClick={startEditItems} sx={{ textTransform: 'none', fontSize: 12 }}>
                    Edit Items
                  </Button>
                )}
                {editingItems && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" onClick={cancelEditItems} disabled={savingItems}>Cancel</Button>
                    <Button size="small" variant="contained" color="secondary" onClick={saveEditItems}
                      disabled={savingItems || editItems.length === 0}
                      startIcon={savingItems ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                    >
                      {savingItems ? 'Saving…' : 'Save'}
                    </Button>
                  </Box>
                )}
              </Box>

              {/* Read-only items table */}
              {!editingItems && (
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12, color: 'text.secondary' } }}>
                      <TableCell>Product</TableCell>
                      <TableCell align="center">Qty</TableCell>
                      <TableCell align="right">Unit Price</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailOrder.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Typography variant="body2">{item.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                        </TableCell>
                        <TableCell align="center">{item.quantity}</TableCell>
                        <TableCell align="right">{formatCurrency(item.price)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(item.price * item.quantity)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} align="right" sx={{ fontWeight: 700, border: 0, pt: 1.5 }}>Total</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: NAVY, border: 0, pt: 1.5 }}>{formatCurrency(detailOrder.total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}

              {/* Editable items table */}
              {editingItems && (
                <>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12, color: 'text.secondary' } }}>
                        <TableCell>Product</TableCell>
                        <TableCell align="center">Qty</TableCell>
                        <TableCell align="right">Unit Price</TableCell>
                        <TableCell align="right">Subtotal</TableCell>
                        <TableCell width={36} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {editItems.map(item => (
                        <TableRow key={item.cartKey}>
                          <TableCell>
                            <Typography variant="body2">{item.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                              <IconButton size="small" onClick={() => changeEditItemQty(item.cartKey, item.quantity - 1, false)} disabled={item.quantity <= (item.minQty ?? 1)}>
                                <RemoveIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                              <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>{item.quantity}</Typography>
                              <IconButton size="small" onClick={() => changeEditItemQty(item.cartKey, item.quantity + 1, false)}>
                                <AddIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              type="number"
                              value={item.price}
                              onChange={e => changeEditItemPrice(item.cartKey, parseFloat(e.target.value) || 0, false)}
                              sx={{ width: 110 }}
                              slotProps={{ input: { startAdornment: <InputAdornment position="start">LKR</InputAdornment> }, htmlInput: { min: 0, style: { padding: '4px 4px', width: 44 } } }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(item.price * item.quantity)}</Typography>
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" color="error" onClick={() => removeEditItem(item.cartKey, false)}>
                              <CloseIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={3} align="right" sx={{ fontWeight: 700, border: 0, pt: 1 }}>Subtotal</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: NAVY, border: 0, pt: 1 }}>
                          {formatCurrency(editItems.reduce((s, i) => s + i.price * i.quantity, 0))}
                        </TableCell>
                        <TableCell sx={{ border: 0 }} />
                      </TableRow>
                    </TableBody>
                  </Table>
                  <Box sx={{ mt: 1.5 }}>
                    <Autocomplete
                      options={editProducts}
                      getOptionLabel={p => p.name}
                      value={addItemProduct}
                      onChange={(_, v) => { setAddItemProduct(v); setAddItemInputValue(''); setAddItemSimpleQty(1); }}
                      renderInput={params => <TextField {...params} label="Add product" size="small" />}
                      isOptionEqualToValue={(o, v) => o.id === v.id}
                      size="small"
                    />
                    {addItemProduct && (() => {
                      const tiers = addItemProduct.priceTiers ?? [];
                      const hasTiers = tiers.length > 0;
                      const bulkTier = tiers.find(t => t.isBulk);
                      const displayUnit = bulkTier?.inputUnit ?? tiers[0]?.inputUnit ?? addItemProduct.unit;
                      const fixedTiers = tiers.filter(t => !t.isBulk);
                      const minBase = fixedTiers.length > 0 ? toBase(fixedTiers[0].qty, fixedTiers[0].inputUnit) : 1;
                      const minDisplay = parseFloat(fromBase(minBase, displayUnit).toFixed(6));
                      const inputNum = parseFloat(addItemInputValue);
                      const baseQty = hasTiers && !isNaN(inputNum) && inputNum > 0 ? toBase(inputNum, displayUnit) : 0;
                      const best = hasTiers && baseQty > 0 ? getBestTierOption(baseQty, tiers) : null;
                      const isBelowMin = hasTiers && addItemInputValue !== '' && !isNaN(inputNum) && inputNum > 0 && baseQty < minBase;
                      const canAdd = hasTiers ? (best !== null && !isBelowMin) : addItemSimpleQty >= 1;
                      return (
                        <Box sx={{ mt: 1, p: 1.5, bgcolor: '#F8F9FA', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                          {hasTiers ? (
                            <>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
                                {tiers.map((t, i) => {
                                  const tb = toBase(t.qty, t.inputUnit);
                                  const inDisplay = parseFloat(fromBase(tb, displayUnit).toFixed(6));
                                  return (
                                    <Box key={i} onClick={() => setAddItemInputValue(inDisplay.toString())}
                                      sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, cursor: 'pointer', border: '1.5px solid', borderColor: 'divider', bgcolor: 'white', '&:hover': { borderColor: NAVY } }}>
                                      <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{t.label}</Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {t.isBulk ? `LKR ${t.price.toLocaleString()}/${t.inputUnit}` : `LKR ${t.price.toLocaleString()}`}
                                      </Typography>
                                    </Box>
                                  );
                                })}
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <TextField label="Amount" type="number" size="small" value={addItemInputValue}
                                  onChange={e => setAddItemInputValue(e.target.value)}
                                  placeholder={`e.g. ${minDisplay}`} error={isBelowMin}
                                  slotProps={{ htmlInput: { min: minDisplay, step: minDisplay } }}
                                  sx={{ width: 110 }} />
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{displayUnit}</Typography>
                              </Box>
                              {isBelowMin && <Typography variant="caption" color="error">Min: {minDisplay} {displayUnit}</Typography>}
                              {best && (
                                <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 600, color: NAVY }}>
                                  {parseFloat(best.units.toFixed(4))} × {best.tier.label} = LKR {best.total % 1 === 0 ? best.total.toLocaleString() : best.total.toFixed(2)}
                                </Typography>
                              )}
                            </>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <TextField label="Qty" type="number" size="small" value={addItemSimpleQty}
                                onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) setAddItemSimpleQty(v); }}
                                slotProps={{ htmlInput: { min: 1 } }} sx={{ width: 80 }} />
                              <Typography variant="body2" color="text.secondary">{addItemProduct.unit}</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, ml: 1 }}>= LKR {(addItemProduct.price * addItemSimpleQty).toLocaleString()}</Typography>
                            </Box>
                          )}
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                            <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={addItemToEdit} disabled={!canAdd}>
                              Add to Order
                            </Button>
                          </Box>
                        </Box>
                      );
                    })()}
                  </Box>
                </>
              )}

              {/* Packaging section */}
              {(editingItems || (detailOrder.packagingItems && detailOrder.packagingItems.length > 0)) && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Packaging</Typography>
                    <Chip label="internal" size="small" sx={{ bgcolor: '#7B1FA218', color: '#7B1FA2', fontWeight: 600, fontSize: 10 }} />
                  </Box>

                  {/* Read-only packaging */}
                  {!editingItems && detailOrder.packagingItems && (
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12, color: 'text.secondary' } }}>
                          <TableCell>Item</TableCell>
                          <TableCell align="center">Qty</TableCell>
                          <TableCell align="right">Unit Cost</TableCell>
                          <TableCell align="right">Subtotal</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detailOrder.packagingItems.map((item, i) => (
                          <TableRow key={i} sx={{ '&:last-child td': { border: 0 } }}>
                            <TableCell>
                              <Typography variant="body2">{item.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                            </TableCell>
                            <TableCell align="center">{item.quantity}</TableCell>
                            <TableCell align="right">{formatCurrency(item.price)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(item.price * item.quantity)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {/* Editable packaging */}
                  {editingItems && (
                    <>
                      {editPackagingItems.length > 0 ? (
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12, color: 'text.secondary' } }}>
                              <TableCell>Item</TableCell>
                              <TableCell align="center">Qty</TableCell>
                              <TableCell align="right">Unit Cost</TableCell>
                              <TableCell align="right">Subtotal</TableCell>
                              <TableCell width={36} />
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {editPackagingItems.map(item => (
                              <TableRow key={item.cartKey} sx={{ '&:last-child td': { border: 0 } }}>
                                <TableCell>
                                  <Typography variant="body2">{item.name}</Typography>
                                  <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                                </TableCell>
                                <TableCell align="center">
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                                    <IconButton size="small" onClick={() => changeEditItemQty(item.cartKey, item.quantity - 1, true)} disabled={item.quantity <= 1}>
                                      <RemoveIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                    <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>{item.quantity}</Typography>
                                    <IconButton size="small" onClick={() => changeEditItemQty(item.cartKey, item.quantity + 1, true)}>
                                      <AddIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={item.price}
                                    onChange={e => changeEditItemPrice(item.cartKey, parseFloat(e.target.value) || 0, true)}
                                    sx={{ width: 110 }}
                                    slotProps={{ input: { startAdornment: <InputAdornment position="start">LKR</InputAdornment> }, htmlInput: { min: 0, style: { padding: '4px 4px', width: 44 } } }}
                                  />
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(item.price * item.quantity)}</Typography>
                                </TableCell>
                                <TableCell>
                                  <IconButton size="small" color="error" onClick={() => removeEditItem(item.cartKey, true)}>
                                    <CloseIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: 'italic' }}>No packaging items added.</Typography>
                      )}
                      <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                        <Autocomplete
                          options={editPkgProducts}
                          getOptionLabel={p => `${p.name} (${p.unit})`}
                          value={addPkgProduct}
                          onChange={(_, v) => setAddPkgProduct(v)}
                          renderInput={params => <TextField {...params} label="Add packaging item" size="small" />}
                          sx={{ flex: 1 }}
                          size="small"
                          isOptionEqualToValue={(o, v) => o.id === v.id}
                        />
                        <TextField
                          label="Qty"
                          size="small"
                          type="number"
                          value={addPkgQty}
                          onChange={e => setAddPkgQty(Math.max(1, parseInt(e.target.value) || 1))}
                          sx={{ width: 72 }}
                          slotProps={{ htmlInput: { min: 1 } }}
                        />
                        <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={addPkgToEdit} disabled={!addPkgProduct}>
                          Add
                        </Button>
                      </Box>
                    </>
                  )}
                </>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Cost & Profit */}
              <Box
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', mb: profitVisible ? 1 : 0 }}
                onClick={async () => {
                  if (!profitVisible && !profitBreakdown) {
                    setProfitLoading(true);
                    const bd = await getOrderProfitBreakdown(detailOrder);
                    setProfitBreakdown(bd);
                    setProfitLoading(false);
                  }
                  setProfitVisible(v => !v);
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Cost &amp; Profit</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {profitLoading && <CircularProgress size={14} />}
                  {profitBreakdown && !profitLoading && (
                    <Chip
                      label={`${profitBreakdown.profitMargin >= 0 ? '+' : ''}${profitBreakdown.profitMargin.toFixed(1)}% margin`}
                      size="small"
                      color={profitBreakdown.profitMargin >= 25 ? 'success' : profitBreakdown.profitMargin >= 10 ? 'warning' : 'error'}
                      sx={{ fontWeight: 600, fontSize: 11 }}
                    />
                  )}
                  <Typography variant="caption" color="text.secondary">{profitVisible ? '▲' : '▼'}</Typography>
                </Box>
              </Box>

              <Collapse in={profitVisible && Boolean(profitBreakdown)}>
                {profitBreakdown && (
                  <Box sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 } }}>
                          <TableCell>Item</TableCell>
                          <TableCell align="right">Revenue</TableCell>
                          <TableCell align="right">COGS</TableCell>
                          <TableCell align="right">Profit</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {profitBreakdown.itemBreakdown.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Typography variant="body2">{item.name}</Typography>
                              <Typography variant="caption" color="text.secondary">× {item.quantity} {item.unit}</Typography>
                            </TableCell>
                            <TableCell align="right"><Typography variant="body2">{formatCurrency(item.revenue)}</Typography></TableCell>
                            <TableCell align="right"><Typography variant="body2" color="text.secondary">{formatCurrency(item.cogs)}</Typography></TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" sx={{ fontWeight: 600, color: item.profit >= 0 ? 'success.main' : 'error.main' }}>
                                {formatCurrency(item.profit)}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                        {profitBreakdown.packagingBreakdown.map((item, i) => (
                          <TableRow key={`pkg-${i}`}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Typography variant="body2">{item.name}</Typography>
                                <Chip label="pkg" size="small" sx={{ height: 16, fontSize: 10, bgcolor: '#7B1FA218', color: '#7B1FA2' }} />
                              </Box>
                              <Typography variant="caption" color="text.secondary">× {item.quantity} {item.unit}</Typography>
                            </TableCell>
                            <TableCell align="right"><Typography variant="body2" color="text.disabled">—</Typography></TableCell>
                            <TableCell align="right"><Typography variant="body2" color="text.secondary">{formatCurrency(item.cogs)}</Typography></TableCell>
                            <TableCell align="right"><Typography variant="body2" color="text.secondary">—</Typography></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#F8F9FC', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Total COGS</Typography>
                        <Typography variant="body2" color="text.secondary">{formatCurrency(profitBreakdown.totalCOGS)}</Typography>
                      </Box>
                      {profitBreakdown.deliveryFee > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">
                            Delivery Fee {profitBreakdown.actualShippingFee != null ? '(charged)' : ''}
                          </Typography>
                          <Typography variant="body2">{formatCurrency(profitBreakdown.deliveryFee)}</Typography>
                        </Box>
                      )}
                      {profitBreakdown.actualShippingFee != null && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">Actual Shipping Cost</Typography>
                          <Typography
                            variant="body2"
                            color={profitBreakdown.actualShippingFee > profitBreakdown.deliveryFee ? 'error.main' : profitBreakdown.actualShippingFee < profitBreakdown.deliveryFee ? 'success.main' : 'text.primary'}
                          >
                            {formatCurrency(profitBreakdown.actualShippingFee)}
                            {profitBreakdown.actualShippingFee !== profitBreakdown.deliveryFee && (
                              <> ({profitBreakdown.actualShippingFee > profitBreakdown.deliveryFee ? '+' : ''}{formatCurrency(profitBreakdown.actualShippingFee - profitBreakdown.deliveryFee)})</>
                            )}
                          </Typography>
                        </Box>
                      )}
                      {profitBreakdown.discount > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">Discount</Typography>
                          <Typography variant="body2" color="error.main">−{formatCurrency(profitBreakdown.discount)}</Typography>
                        </Box>
                      )}
                      <Divider sx={{ my: 0.75 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>Order Total</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(profitBreakdown.total)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: profitBreakdown.grossProfit >= 0 ? 'success.main' : 'error.main' }}>
                          Gross Profit
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: profitBreakdown.grossProfit >= 0 ? 'success.main' : 'error.main' }}>
                          {formatCurrency(profitBreakdown.grossProfit)} ({profitBreakdown.profitMargin.toFixed(1)}%)
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                )}
              </Collapse>

              <Divider sx={{ my: 2 }} />

              {/* Payment */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Payment</Typography>
                <TextField
                  select size="small" value={detailOrder.paymentStatus ?? 'unpaid'}
                  onChange={async e => {
                    const status = e.target.value as 'unpaid' | 'paid' | 'partially_paid';
                    await adminSetPaymentStatus(detailOrder.id!, status);
                    setDetailOrder(o => o ? { ...o, paymentStatus: status, ...(status === 'unpaid' ? { paymentInfo: undefined } : {}) } : o);
                    setOrders(os => os.map(o => o.id === detailOrder.id ? { ...o, paymentStatus: status, ...(status === 'unpaid' ? { paymentInfo: undefined } : {}) } : o));
                  }}
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="unpaid">Unpaid</MenuItem>
                  <MenuItem value="partially_paid">Partially Paid</MenuItem>
                  <MenuItem value="paid">Paid</MenuItem>
                </TextField>
              </Box>

              {(detailOrder.paymentStatus === 'paid' || detailOrder.paymentStatus === 'partially_paid') && detailOrder.paymentInfo ? (
                <Box sx={{ bgcolor: '#F0FDF4', border: '1px solid', borderColor: 'success.light', borderRadius: 1.5, p: 1.5, mb: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {{ cash: 'Cash', bank_transfer: 'Bank Transfer', courier_invoice: 'Courier Invoice' }[detailOrder.paymentInfo.method]}
                        {detailOrder.paymentInfo.reference ? ` · ${detailOrder.paymentInfo.reference}` : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {detailOrder.paymentInfo.date}
                        {detailOrder.paymentInfo.notes ? ` · ${detailOrder.paymentInfo.notes}` : ''}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(detailOrder.paymentInfo.amount)}</Typography>
                      <Button size="small" sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'none', minWidth: 0 }} onClick={handleMarkUnpaid}>
                        Clear
                      </Button>
                    </Box>
                  </Box>
                </Box>
              ) : (detailOrder.paymentStatus === 'paid' || detailOrder.paymentStatus === 'partially_paid') && !paymentFormOpen ? (
                <Button size="small" variant="outlined" color="success" onClick={() => setPaymentFormOpen(true)} sx={{ mb: 1.5 }}>
                  Record Payment
                </Button>
              ) : (
                <Stack spacing={1.5} sx={{ mb: 1.5 }}>
                  <TextField select label="Method" size="small" value={paymentForm.method}
                    onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}>
                    <MenuItem value="cash">Cash</MenuItem>
                    <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                    <MenuItem value="courier_invoice">Courier Invoice</MenuItem>
                  </TextField>
                  <TextField label="Reference #" size="small" value={paymentForm.reference}
                    onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))}
                    placeholder="Bank ref, cheque #, invoice #" />
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <TextField label="Amount (LKR)" size="small" type="number" value={paymentForm.amount}
                      onChange={e => setPaymentForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                      slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                      sx={{ flex: 1 }} />
                    <TextField label="Date" size="small" type="date" value={paymentForm.date}
                      onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))}
                      sx={{ flex: 1 }} />
                  </Box>
                  <TextField label="Notes (optional)" size="small" value={paymentForm.notes}
                    onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} />
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" onClick={() => setPaymentFormOpen(false)} disabled={savingPayment}>Cancel</Button>
                    <Button size="small" variant="contained" color="success" onClick={handleRecordPayment}
                      disabled={savingPayment || !paymentForm.date}
                      startIcon={savingPayment ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}>
                      {savingPayment ? 'Saving…' : 'Save Payment'}
                    </Button>
                  </Box>
                </Stack>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Status */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Status:</Typography>
                <TextField select value={detailOrder.status} onChange={e => handleStatusChange(detailOrder, e.target.value as OrderStatus)} size="small" disabled={updatingStatus === detailOrder.id} sx={{ minWidth: 150 }}>
                  {ALL_STATUSES.map(s => (<MenuItem key={s} value={s}>{STATUS_CONFIG[s].label}</MenuItem>))}
                </TextField>
              </Box>

              <Divider sx={{ mb: 2 }} />

              {/* ── Delivery ──────────────────────────────────────────────── */}
              <Box sx={{ bgcolor: '#F8F9FC', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocalShippingIcon sx={{ color: NAVY, fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: NAVY }}>Delivery</Typography>
                  </Box>
                  <TextField select size="small" value={detailOrder.fulfillmentType ?? 'royal_express'}
                    onChange={e => handleFulfillmentChange(e.target.value as FulfillmentType)}
                    sx={{ minWidth: 160 }}>
                    <MenuItem value="royal_express">Royal Express</MenuItem>
                    <MenuItem value="pickme">PickMe</MenuItem>
                    <MenuItem value="pickup">Customer Pickup</MenuItem>
                  </TextField>
                </Box>

                {(detailOrder.fulfillmentType ?? 'royal_express') !== 'royal_express' ? (
                  <Typography variant="body2" color="text.secondary">
                    {detailOrder.fulfillmentType === 'pickme' ? 'Order will be delivered via PickMe.' : 'Customer will collect this order.'}
                  </Typography>
                ) : (<>

                {/* Waybill number */}
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.75 }}>Waybill Number</Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                  <TextField
                    size="small"
                    value={waybillInput}
                    onChange={e => setWaybillInput(e.target.value.toUpperCase())}
                    placeholder="e.g. RM01699327"
                    disabled={!canAssignWaybill(detailOrder)}
                    slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 } } }}
                    sx={{ flex: 1 }}
                  />
                  <Tooltip title={canAssignWaybill(detailOrder) ? 'Save waybill' : 'Cannot edit for this status'}>
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={savingWaybill ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                        onClick={handleSaveWaybill}
                        disabled={savingWaybill || !waybillInput.trim() || !canAssignWaybill(detailOrder)}
                      >
                        Save
                      </Button>
                    </span>
                  </Tooltip>
                </Box>

                {!canAssignWaybill(detailOrder) && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
                    Waybill can be set for orders in Pending, Confirmed, Processing, or Shipped status.
                  </Typography>
                )}

                {/* Action buttons */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {detailOrder.status === 'confirmed' && (
                    <Button
                      size="small"
                      variant="contained"
                      color="secondary"
                      startIcon={<SendIcon />}
                      onClick={() => openCourierOrderDialog(detailOrder)}
                    >
                      Create Courier Order
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<TrackChangesIcon />}
                    onClick={handleTrack}
                    disabled={!detailOrder.waybillNumber || trackingLoading}
                  >
                    {trackingLoading ? 'Tracking…' : 'Track Shipment'}
                  </Button>
                </Box>

                {detailOrder.status === 'pending' && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
                    Confirm the order before creating a courier order.
                  </Typography>
                )}

                {/* Tracking panel */}
                {trackingVisible && (
                  <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                      Tracking — {detailOrder.waybillNumber}
                    </Typography>
                    <TrackingTimeline info={trackingInfo} loading={trackingLoading} error={trackingError} />
                  </Box>
                )}

                {/* Invoice assignment */}
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                      Settlement Invoice
                    </Typography>
                    {detailOrder.courierInvoice ? (
                      <Button size="small" sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'none', minWidth: 0 }} onClick={handleUnassignInvoice}>
                        Remove
                      </Button>
                    ) : (
                      <Button size="small" variant="outlined" sx={{ fontSize: 11, textTransform: 'none' }} onClick={handleOpenInvoiceAssign}>
                        Assign Invoice
                      </Button>
                    )}
                  </Box>
                  {detailOrder.courierInvoice ? (
                    <Box sx={{ bgcolor: '#FFFBEB', border: '1px solid', borderColor: 'warning.light', borderRadius: 1.5, p: 1.25 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                            {detailOrder.courierInvoice.invoiceNumber}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Actual shipping: LKR {detailOrder.courierInvoice.actualShippingFee.toLocaleString()}
                            {detailOrder.deliveryFee !== undefined && (
                              <> · Charged: LKR {detailOrder.deliveryFee.toLocaleString()}
                              {Math.abs(detailOrder.deliveryFee - detailOrder.courierInvoice.actualShippingFee) >= 1 && (
                                <> · Diff: {detailOrder.deliveryFee - detailOrder.courierInvoice.actualShippingFee > 0 ? '+' : ''}
                                LKR {(detailOrder.deliveryFee - detailOrder.courierInvoice.actualShippingFee).toLocaleString()}</>
                              )}</>
                            )}
                          </Typography>
                        </Box>
                        <Button size="small" variant="text" sx={{ fontSize: 11, textTransform: 'none' }} onClick={handleOpenInvoiceAssign}>
                          Edit
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.disabled">
                      Not linked to a courier invoice yet.
                    </Typography>
                  )}
                </Box>
                </>)}
              </Box>
            </DialogContent>

            <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 2, pb: 2 }}>
              {detailOrder.status === 'confirmed' && (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button
                    variant="outlined"
                    startIcon={<WhatsAppIcon />}
                    sx={{ color: '#25D366', borderColor: '#25D366', '&:hover': { borderColor: '#1ebe57', bgcolor: '#f0fff4' } }}
                    onClick={() => openWhatsApp(detailOrder.customer.phone, buildConfirmationMessage(detailOrder))}
                  >
                    Send Confirmation
                  </Button>
                  <Tooltip title="Copy message">
                    <IconButton
                      size="small"
                      onClick={() => { navigator.clipboard.writeText(buildConfirmationMessage(detailOrder)); setSuccessMsg('Confirmation message copied'); }}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
              {(detailOrder.status === 'shipped' || detailOrder.status === 'delivered') && (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button
                    variant="outlined"
                    startIcon={<WhatsAppIcon />}
                    sx={{ color: '#25D366', borderColor: '#25D366', '&:hover': { borderColor: '#1ebe57', bgcolor: '#f0fff4' } }}
                    onClick={() => openWhatsApp(detailOrder.customer.phone, buildShippedMessage(detailOrder))}
                  >
                    Send Shipping Info
                  </Button>
                  <Tooltip title="Copy message">
                    <IconButton
                      size="small"
                      onClick={() => { navigator.clipboard.writeText(buildShippedMessage(detailOrder)); setSuccessMsg('Shipping message copied'); }}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
              <Box sx={{ flex: 1 }} />
              <Button onClick={() => setDetailOrder(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Assign Courier Invoice Dialog ────────────────────────────────────── */}
      <Dialog open={invoiceAssignOpen} onClose={() => !savingAssign && setInvoiceAssignOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile} slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 3 } } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Assign to Courier Invoice
          {detailOrder && (
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
              {detailOrder.orderNumber} — delivery fee charged: {detailOrder.deliveryFee != null ? `LKR ${detailOrder.deliveryFee.toLocaleString()}` : 'none'}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {loadingInvoices && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={16} /><Typography variant="body2">Loading invoices…</Typography></Box>}
            {!loadingInvoices && openInvoices.length === 0 && (
              <Alert severity="info">No open courier invoices. Create one from the Settlements page first.</Alert>
            )}
            {!loadingInvoices && openInvoices.length > 0 && (
              <TextField select label="Courier Invoice" size="small" value={assignForm.invoiceId}
                onChange={e => {
                  const inv = openInvoices.find(i => i.id === e.target.value);
                  setAssignForm(f => ({ ...f, invoiceId: e.target.value, invoiceNumber: inv?.reference ?? '' }));
                }}>
                {openInvoices.map(inv => (
                  <MenuItem key={inv.id} value={inv.id}>
                    {inv.reference} — {inv.date}
                    {inv.courierName ? ` (${inv.courierName})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="Actual Shipping Fee (LKR)" type="number" size="small"
              value={assignForm.actualShippingFee}
              onChange={e => setAssignForm(f => ({ ...f, actualShippingFee: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, step: 'any' } }}
              helperText="Actual fee charged by courier — may differ from amount billed to customer"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceAssignOpen(false)} disabled={savingAssign}>Cancel</Button>
          <Button variant="contained" color="secondary" onClick={handleSaveAssignment}
            disabled={savingAssign || !assignForm.invoiceId}
            startIcon={savingAssign ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}>
            {savingAssign ? 'Saving…' : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Return / Damage Dialog ──────────────────────────────────────────── */}
      <Dialog open={Boolean(returnTarget)} onClose={() => !processingReturn && setReturnTarget(null)} maxWidth="sm" fullWidth fullScreen={isMobile} slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 3 } } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Process Return
          {returnTarget && (
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
              {returnTarget.orderNumber} — mark any damaged items before restocking
            </Typography>
          )}
        </DialogTitle>
        {returnTarget && (
          <>
            <DialogContent>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' } }}>
                    <TableCell>Item</TableCell>
                    <TableCell align="center">Ordered</TableCell>
                    <TableCell align="center">Damaged</TableCell>
                    <TableCell align="center">To Restock</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[
                    ...returnTarget.items,
                    ...(returnTarget.packagingItems ?? []).map(i => ({ ...i, _isPkg: true })),
                  ].map((item, i) => {
                    const isPkg = '_isPkg' in item;
                    const damaged = Math.min(damageInputs[item.cartKey] ?? 0, item.quantity);
                    const restock = Math.max(0, item.quantity - damaged);
                    const step = item.decimalQty ? 0.5 : 1;
                    return (
                      <TableRow key={item.cartKey ?? i} sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography>
                            {isPkg && <Chip label="pkg" size="small" sx={{ height: 16, fontSize: 10, bgcolor: '#7B1FA218', color: '#7B1FA2' }} />}
                          </Box>
                          <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2">{item.quantity}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <TextField
                            type="number"
                            size="small"
                            value={damageInputs[item.cartKey] ?? 0}
                            onChange={e => {
                              const v = parseFloat(e.target.value) || 0;
                              setDamageInputs(prev => ({
                                ...prev,
                                [item.cartKey]: Math.min(Math.max(0, v), item.quantity),
                              }));
                            }}
                            sx={{ width: 80 }}
                            slotProps={{
                              htmlInput: { min: 0, max: item.quantity, step, style: { textAlign: 'center', padding: '4px' } },
                            }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: restock === 0 ? 'error.main' : restock < item.quantity ? 'warning.main' : 'success.main' }}
                          >
                            {restock > 0 ? restock : '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Alert severity="info" sx={{ mt: 2 }} icon={false}>
                <Typography variant="body2">
                  Damaged items are written off — only the <strong>To Restock</strong> quantity returns to inventory.
                  Leave damaged as 0 to restock everything.
                </Typography>
              </Alert>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setReturnTarget(null)} disabled={processingReturn}>Cancel</Button>
              <Button
                variant="contained"
                color="warning"
                onClick={handleConfirmReturn}
                disabled={processingReturn}
                startIcon={processingReturn ? <CircularProgress size={14} color="inherit" /> : undefined}
              >
                {processingReturn ? 'Processing…' : 'Confirm Return'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Courier Order Dialog ─────────────────────────────────────────────── */}
      <Dialog open={courierOrderOpen} onClose={() => setCourierOrderOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile} slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 3 } } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Create Courier Order
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
            Royal Express · {courierOrderForm.orderNo}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {courierOrderResult ? (
            <Alert severity="success" sx={{ mt: 1 }}>{courierOrderResult}</Alert>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {courierOrderError && <Alert severity="error">{courierOrderError}</Alert>}

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                  label="Customer Name"
                  size="small"
                  sx={{ flex: 1, minWidth: 160 }}
                  value={courierOrderForm.customerName}
                  onChange={e => setCourierOrderForm(f => ({ ...f, customerName: e.target.value }))}
                />
                <TextField
                  label="Phone"
                  size="small"
                  sx={{ flex: 1, minWidth: 140 }}
                  value={courierOrderForm.customerPhone}
                  onChange={e => setCourierOrderForm(f => ({ ...f, customerPhone: e.target.value }))}
                />
              </Box>

              <TextField
                label="Secondary Phone"
                size="small"
                fullWidth
                value={courierOrderForm.customerSecondaryPhone}
                onChange={e => setCourierOrderForm(f => ({ ...f, customerSecondaryPhone: e.target.value }))}
              />

              <TextField
                label="Delivery Address"
                size="small"
                fullWidth
                value={courierOrderForm.customerAddress}
                onChange={e => setCourierOrderForm(f => ({ ...f, customerAddress: e.target.value }))}
              />

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                  label="City"
                  size="small"
                  sx={{ flex: 1, minWidth: 130 }}
                  value={courierOrderForm.destinationCityName}
                  onChange={e => setCourierOrderForm(f => ({ ...f, destinationCityName: e.target.value }))}
                />
                <TextField
                  label="District / State"
                  size="small"
                  sx={{ flex: 1, minWidth: 130 }}
                  value={courierOrderForm.destinationStateName}
                  onChange={e => setCourierOrderForm(f => ({ ...f, destinationStateName: e.target.value }))}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                  label="COD Amount (LKR)"
                  size="small"
                  type="number"
                  sx={{ flex: 1, minWidth: 140 }}
                  value={courierOrderForm.cod}
                  onChange={e => setCourierOrderForm(f => ({ ...f, cod: parseFloat(e.target.value) || 0 }))}
                />
                <TextField
                  label="Weight (kg)"
                  size="small"
                  type="number"
                  sx={{ flex: 1, minWidth: 120 }}
                  value={courierOrderForm.weight}
                  onChange={e => setCourierOrderForm(f => ({ ...f, weight: parseFloat(e.target.value) || 0 }))}
                  slotProps={{ htmlInput: { step: 0.1, min: 0.1 } }}
                />
              </Box>

              <TextField
                label="Description"
                size="small"
                fullWidth
                multiline
                rows={2}
                value={courierOrderForm.description}
                onChange={e => setCourierOrderForm(f => ({ ...f, description: e.target.value }))}
              />

              <TextField
                label="Remark (optional)"
                size="small"
                fullWidth
                value={courierOrderForm.remark}
                onChange={e => setCourierOrderForm(f => ({ ...f, remark: e.target.value }))}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCourierOrderOpen(false)}>{courierOrderResult ? 'Done' : 'Cancel'}</Button>
          {!courierOrderResult && (
            <Button
              variant="contained"
              color="secondary"
              onClick={handleCreateCourierOrder}
              disabled={creatingCourierOrder || !courierOrderForm.customerName.trim() || !courierOrderForm.destinationCityName.trim()}
              startIcon={creatingCourierOrder ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
            >
              {creatingCourierOrder ? 'Creating…' : 'Create Courier Order'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
