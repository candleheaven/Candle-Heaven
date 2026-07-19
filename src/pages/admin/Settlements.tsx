import { useEffect, useState, useCallback } from 'react';
import {
  Box, Card, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Typography, Button, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Snackbar, Alert, Collapse, IconButton, Divider, Tooltip,
  Tabs, Tab, useMediaQuery, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import {
  adminGetAllSettlements, adminGetAllOrders, adminGetOrdersByInvoiceId,
  adminCreateCourierInvoice, adminMarkInvoiceCompleted, adminUpdateInvoiceAmount,
  type AdminOrder,
} from '../../services/admin';
import type { Settlement, PaymentMethod } from '../../types';

const NAVY = '#132040';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  courier_invoice: 'Courier Invoice',
};
const METHOD_COLOR: Record<PaymentMethod, 'success' | 'info' | 'warning'> = {
  cash: 'success',
  bank_transfer: 'info',
  courier_invoice: 'warning',
};

function formatCurrency(n: number) {
  return `LKR ${n.toLocaleString()}`;
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Balance indicator ─────────────────────────────────────────────────────────

function BalanceChip({ balance }: { balance: number }) {
  const abs = Math.abs(balance);
  if (abs < 1) return <Chip label="Balanced" color="success" size="small" sx={{ fontWeight: 700, fontSize: 11 }} />;
  const label = balance > 0 ? `+${formatCurrency(abs)} excess` : `${formatCurrency(abs)} short`;
  return <Chip label={label} color={balance > 0 ? 'info' : 'error'} size="small" sx={{ fontWeight: 700, fontSize: 11 }} />;
}

// ── Courier Invoice Row ───────────────────────────────────────────────────────

function CourierInvoiceRow({
  settlement, onToggleComplete, onAmountEdit,
}: {
  settlement: Settlement;
  onToggleComplete: () => void;
  onAmountEdit: (id: string, current: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);

  async function handleExpand() {
    const next = !open;
    setOpen(next);
    if (next && orders === null) {
      setLoadingOrders(true);
      // New-style: load by invoiceId link on orders
      const linked = await adminGetOrdersByInvoiceId(settlement.id);
      // Old-style fallback: show order numbers from settlement doc
      setOrders(linked);
      setLoadingOrders(false);
    }
  }

  // Balance = received - (sum COD - sum actualShippingFee)
  const hasOrders = orders && orders.length > 0;
  const totalCOD = orders ? orders.reduce((s, o) => s + o.total, 0) : 0;
  const totalActualShipping = orders
    ? orders.reduce((s, o) => s + (o.courierInvoice?.actualShippingFee ?? 0), 0)
    : 0;
  const netExpected = totalCOD - totalActualShipping;
  const balance = settlement.totalAmount - netExpected;

  // Legacy orders (old-style settlement with orderIds but no courierInvoice link)
  const hasLegacyOrderNumbers = !hasOrders && (settlement.orderNumbers?.length ?? 0) > 0;

  return (
    <>
      <TableRow hover sx={{ '& td': { borderBottom: open ? 0 : undefined } }}>
        <TableCell>
          <Typography variant="body2" color="text.secondary">{formatDate(settlement.date)}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{settlement.reference}</Typography>
          {settlement.notes && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{settlement.notes}</Typography>}
        </TableCell>
        <TableCell>
          <Typography variant="body2" color="text.secondary">{settlement.courierName ?? '—'}</Typography>
          {settlement.isCompleted && (
            <Chip label="Done" size="small" color="success" variant="outlined" sx={{ fontSize: 10, mt: 0.25 }} />
          )}
        </TableCell>
        <TableCell align="center">
          <Typography variant="body2" color="text.secondary">
            {orders !== null
              ? `${orders.length} order${orders.length !== 1 ? 's' : ''}`
              : (settlement.orderNumbers?.length ?? '—')}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(settlement.totalAmount)}</Typography>
            <Tooltip title="Edit received amount">
              <IconButton size="small" onClick={() => onAmountEdit(settlement.id, settlement.totalAmount)}>
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
          {hasOrders && <BalanceChip balance={balance} />}
        </TableCell>
        <TableCell align="center">
          <Tooltip title={settlement.isCompleted ? 'Mark as open' : 'Mark as completed'}>
            <IconButton size="small" onClick={onToggleComplete} color={settlement.isCompleted ? 'success' : 'default'}>
              {settlement.isCompleted
                ? <CheckCircleOutlinedIcon fontSize="small" />
                : <RadioButtonUncheckedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </TableCell>
        <TableCell align="center">
          <IconButton size="small" onClick={handleExpand}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, bgcolor: '#FAFAFA' }}>
          <Collapse in={open}>
            <Box sx={{ py: 1.5, px: 2 }}>
              {loadingOrders && <CircularProgress size={16} />}

              {/* Legacy: show order numbers from settlement doc */}
              {!loadingOrders && hasLegacyOrderNumbers && (
                <Typography variant="caption" color="text.secondary">
                  Migrated orders: {settlement.orderNumbers!.join(', ')}
                  <br />
                  <em>Assign orders via order detail to enable balance tracking.</em>
                </Typography>
              )}

              {/* New-style: orders linked via courierInvoice field */}
              {!loadingOrders && orders !== null && orders.length === 0 && !hasLegacyOrderNumbers && (
                <Typography variant="caption" color="text.secondary">
                  No orders assigned yet. Assign orders via the order detail page.
                </Typography>
              )}

              {!loadingOrders && hasOrders && (
                <>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 } }}>
                        <TableCell>Order #</TableCell>
                        <TableCell>Customer</TableCell>
                        <TableCell align="right">COD</TableCell>
                        <TableCell align="right">Charged shipping</TableCell>
                        <TableCell align="right">Actual shipping</TableCell>
                        <TableCell align="right">Diff</TableCell>
                        <TableCell align="right">Net</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {orders!.map(o => {
                        const chargedShipping = o.deliveryFee ?? 0;
                        const actualShipping = o.courierInvoice?.actualShippingFee ?? 0;
                        const diff = chargedShipping - actualShipping;
                        const net = o.total - actualShipping;
                        return (
                          <TableRow key={o.id} sx={{ '&:last-child td': { border: 0 } }}>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{o.orderNumber}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{o.customer.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{o.customer.city}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">{formatCurrency(o.total)}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" color="text.secondary">{formatCurrency(chargedShipping)}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">{formatCurrency(actualShipping)}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" sx={{ color: Math.abs(diff) < 1 ? 'text.secondary' : diff > 0 ? 'success.main' : 'error.main', fontWeight: Math.abs(diff) >= 1 ? 600 : 400 }}>
                                {Math.abs(diff) < 1 ? '—' : (diff > 0 ? '+' : '') + formatCurrency(diff)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(net)}</Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Balance summary */}
                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#F0F4FF', borderRadius: 1.5, border: '1px solid', borderColor: 'primary.light' }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Total COD</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(totalCOD)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Actual courier fees</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>−{formatCurrency(totalActualShipping)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Net expected</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(netExpected)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Received</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: NAVY }}>{formatCurrency(settlement.totalAmount)}</Typography>
                      </Box>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Balance:</Typography>
                      <BalanceChip balance={balance} />
                    </Box>
                  </Box>
                </>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ── Cash / Bank Settlement Row ────────────────────────────────────────────────

function CashBankRow({ settlement, allOrders }: { settlement: Settlement; allOrders: AdminOrder[] }) {
  const [open, setOpen] = useState(false);
  const linkedOrders = allOrders.filter(o => settlement.orderIds?.includes(o.id));

  return (
    <>
      <TableRow hover sx={{ '& td': { borderBottom: open ? 0 : undefined } }}>
        <TableCell>
          <Typography variant="body2" color="text.secondary">{formatDate(settlement.date)}</Typography>
        </TableCell>
        <TableCell>
          <Chip label={METHOD_LABEL[settlement.type]} size="small" color={METHOD_COLOR[settlement.type]} sx={{ fontWeight: 600, fontSize: 11 }} />
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{settlement.reference || '—'}</Typography>
          {settlement.notes && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{settlement.notes}</Typography>}
        </TableCell>
        <TableCell align="center">
          <Typography variant="body2" color="text.secondary">{settlement.orderIds?.length ?? 0}</Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(settlement.totalAmount)}</Typography>
        </TableCell>
        <TableCell />
        <TableCell align="center">
          {(settlement.orderIds?.length ?? 0) > 0 && (
            <IconButton size="small" onClick={() => setOpen(v => !v)}>
              {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, bgcolor: '#FAFAFA' }}>
          <Collapse in={open}>
            <Box sx={{ py: 1.5, px: 2 }}>
              {linkedOrders.length === 0 ? (
                <Typography variant="caption" color="text.secondary">{settlement.orderNumbers?.join(', ')}</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 } }}>
                      <TableCell>Order #</TableCell>
                      <TableCell>Customer</TableCell>
                      <TableCell>City</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {linkedOrders.map(o => (
                      <TableRow key={o.id} sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{o.orderNumber}</Typography></TableCell>
                        <TableCell><Typography variant="body2">{o.customer.name}</Typography></TableCell>
                        <TableCell><Typography variant="body2" color="text.secondary">{o.customer.city}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(o.total)}</Typography></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Settlements() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [cashBankOrders, setCashBankOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  // New courier invoice dialog
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    reference: '', date: todayStr(), receivedAmount: '', courierName: 'Royal Express', notes: '',
  });
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');

  // Edit received amount dialog
  const [editAmountId, setEditAmountId] = useState<string | null>(null);
  const [editAmountValue, setEditAmountValue] = useState('');
  const [savingAmount, setSavingAmount] = useState(false);

  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [s, o] = await Promise.all([adminGetAllSettlements(), adminGetAllOrders()]);
      setSettlements(s);
      setCashBankOrders(o);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load settlements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreateInvoice() {
    if (!invoiceForm.reference.trim()) return;
    const amount = parseFloat(invoiceForm.receivedAmount);
    if (isNaN(amount) || amount < 0) { setInvoiceError('Enter a valid received amount'); return; }
    setSavingInvoice(true);
    setInvoiceError('');
    try {
      const id = await adminCreateCourierInvoice(
        invoiceForm.reference.trim(),
        invoiceForm.date,
        amount,
        invoiceForm.courierName.trim() || undefined,
        invoiceForm.notes.trim() || undefined,
      );
      await load();
      setInvoiceOpen(false);
      setInvoiceForm({ reference: '', date: todayStr(), receivedAmount: '', courierName: 'Royal Express', notes: '' });
      setSuccessMsg(`Invoice ${invoiceForm.reference} created (${id.slice(0, 8)}…)`);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : 'Failed to save invoice');
    } finally {
      setSavingInvoice(false);
    }
  }

  async function handleToggleComplete(settlement: Settlement) {
    await adminMarkInvoiceCompleted(settlement.id, !settlement.isCompleted);
    setSettlements(ss => ss.map(s => s.id === settlement.id ? { ...s, isCompleted: !s.isCompleted } : s));
    setSuccessMsg(settlement.isCompleted ? `Invoice ${settlement.reference} reopened` : `Invoice ${settlement.reference} marked as completed`);
  }

  function openEditAmount(id: string, current: number) {
    setEditAmountId(id);
    setEditAmountValue(String(current));
  }

  async function handleSaveAmount() {
    if (!editAmountId) return;
    const amount = parseFloat(editAmountValue);
    if (isNaN(amount)) return;
    setSavingAmount(true);
    await adminUpdateInvoiceAmount(editAmountId, amount);
    setSettlements(ss => ss.map(s => s.id === editAmountId ? { ...s, totalAmount: amount } : s));
    setEditAmountId(null);
    setSavingAmount(false);
  }

  const [tab, setTab] = useState<0 | 1>(0);

  const courierInvoices = settlements.filter(s => s.type === 'courier_invoice');
  const cashBankSettlements = settlements.filter(s => s.type !== 'courier_invoice');

  const totalCourier = courierInvoices.reduce((s, x) => s + x.totalAmount, 0);
  const totalCash = cashBankSettlements.filter(s => s.type === 'cash').reduce((s, x) => s + x.totalAmount, 0);
  const totalBank = cashBankSettlements.filter(s => s.type === 'bank_transfer').reduce((s, x) => s + x.totalAmount, 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY }}>Settlements</Typography>
        {tab === 0 && (
          <Button variant="contained" color="secondary" startIcon={<AddIcon />} onClick={() => setInvoiceOpen(true)}>
            New Courier Invoice
          </Button>
        )}
      </Box>

      <Snackbar open={Boolean(successMsg)} autoHideDuration={5000} onClose={() => setSuccessMsg('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>
      </Snackbar>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        {/* Tabs */}
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 44 }}>
            <Tab
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Courier Invoices
                  {courierInvoices.length > 0 && (
                    <Chip label={courierInvoices.length} size="small" color="warning" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                  )}
                </Box>
              }
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
            />
            <Tab
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Cash &amp; Bank
                  {cashBankSettlements.length > 0 && (
                    <Chip label={cashBankSettlements.length} size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                  )}
                </Box>
              }
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
            />
          </Tabs>
          {/* Summary totals for active tab */}
          {!loading && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {tab === 0 && totalCourier > 0 && (
                <Chip label={`Total: ${formatCurrency(totalCourier)}`} color="warning" size="small" variant="outlined" />
              )}
              {tab === 1 && totalCash > 0 && (
                <Chip label={`Cash: ${formatCurrency(totalCash)}`} color="success" size="small" variant="outlined" />
              )}
              {tab === 1 && totalBank > 0 && (
                <Chip label={`Bank: ${formatCurrency(totalBank)}`} color="info" size="small" variant="outlined" />
              )}
            </Box>
          )}
        </Box>

        <TableContainer>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : loadError ? (
            <Box sx={{ p: 3 }}>
              <Alert severity="error" action={<Button size="small" onClick={load}>Retry</Button>}>
                {loadError}
              </Alert>
            </Box>
          ) : tab === 0 ? (
            courierInvoices.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">No courier invoices yet.</Typography>
                <Typography variant="caption">Click "New Courier Invoice" to create one.</Typography>
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#FAFAFA', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' } }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Invoice #</TableCell>
                    <TableCell>Courier</TableCell>
                    <TableCell align="center">Orders</TableCell>
                    <TableCell align="right">Received</TableCell>
                    <TableCell align="center" width={48}>Done</TableCell>
                    <TableCell align="center" width={48} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {courierInvoices.map(s => (
                    <CourierInvoiceRow
                      key={s.id}
                      settlement={s}
                      onToggleComplete={() => handleToggleComplete(s)}
                      onAmountEdit={openEditAmount}
                    />
                  ))}
                </TableBody>
              </Table>
            )
          ) : (
            cashBankSettlements.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">No cash or bank settlements yet.</Typography>
                <Typography variant="caption">Record payments via the order detail page.</Typography>
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#FAFAFA', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' } }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell align="center">Orders</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="center" width={48} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cashBankSettlements.map(s => (
                    <CashBankRow key={s.id} settlement={s} allOrders={cashBankOrders} />
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </TableContainer>
      </Card>

      {/* New courier invoice dialog */}
      <Dialog open={invoiceOpen} onClose={() => !savingInvoice && setInvoiceOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile} slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 3 } } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          New Courier Invoice
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
            Orders are assigned to this invoice from each order's detail page.
          </Typography>
        </DialogTitle>
        <DialogContent>
          {invoiceError && <Alert severity="error" sx={{ mb: 2 }}>{invoiceError}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <TextField label="Invoice / Reference #" value={invoiceForm.reference}
                onChange={e => setInvoiceForm(f => ({ ...f, reference: e.target.value }))}
                size="small" sx={{ flex: 1, minWidth: 160 }} required placeholder="e.g. CFX-25-11-172805" />
              <TextField label="Date" type="date" value={invoiceForm.date}
                onChange={e => setInvoiceForm(f => ({ ...f, date: e.target.value }))}
                size="small" sx={{ flex: 1, minWidth: 140 }} />
            </Box>
            <TextField label="Received Amount (LKR)" type="number" value={invoiceForm.receivedAmount}
              onChange={e => setInvoiceForm(f => ({ ...f, receivedAmount: e.target.value }))}
              size="small" fullWidth required placeholder="0"
              slotProps={{ htmlInput: { min: 0, step: 'any' } }} />
            <TextField label="Courier Name" value={invoiceForm.courierName}
              onChange={e => setInvoiceForm(f => ({ ...f, courierName: e.target.value }))}
              size="small" fullWidth placeholder="Royal Express" />
            <TextField label="Notes (optional)" value={invoiceForm.notes}
              onChange={e => setInvoiceForm(f => ({ ...f, notes: e.target.value }))}
              size="small" fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceOpen(false)} disabled={savingInvoice}>Cancel</Button>
          <Button variant="contained" color="secondary" onClick={handleCreateInvoice}
            disabled={savingInvoice || !invoiceForm.reference.trim() || !invoiceForm.receivedAmount}
            startIcon={savingInvoice ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}>
            {savingInvoice ? 'Saving…' : 'Create Invoice'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit received amount dialog */}
      <Dialog open={Boolean(editAmountId)} onClose={() => !savingAmount && setEditAmountId(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Received Amount</DialogTitle>
        <DialogContent>
          <TextField
            label="Received Amount (LKR)" type="number" value={editAmountValue} autoFocus
            onChange={e => setEditAmountValue(e.target.value)}
            size="small" fullWidth sx={{ mt: 1 }}
            slotProps={{ htmlInput: { min: 0, step: 'any' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditAmountId(null)} disabled={savingAmount}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveAmount} disabled={savingAmount}
            startIcon={savingAmount ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}>
            {savingAmount ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
