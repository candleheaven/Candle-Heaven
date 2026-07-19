import { useEffect, useState, useCallback } from 'react';
import {
  Box, Card, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Typography, Button, CircularProgress, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, Divider,
  Stack, Alert, Snackbar, Chip, Autocomplete, InputAdornment,
  IconButton, Collapse, Tooltip, createFilterOptions, useMediaQuery, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import PeopleIcon from '@mui/icons-material/People';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import {
  adminGetAllPurchases, adminRecordPurchase, adminUpdatePurchase, adminDeletePurchase,
  adminGetAllProducts, adminGetAllSuppliers, adminSaveSupplier, adminDeleteSupplier,
} from '../../services/admin';
import type { Purchase, PurchaseItem, Product, Supplier } from '../../types';

const NAVY = '#132040';

function fmt(n: number) { return `LKR ${n.toLocaleString()}`; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
// product.unit is the admin-set display unit (g, kg, ml, L, piece).
function purchaseDisplayUnit(product: Product): string {
  return product.unit;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function costHint(product: Product): number {
  // If we already know the average cost per base unit, convert to per display unit
  const unit = purchaseDisplayUnit(product);
  const multiplier = (unit === 'kg' || unit === 'L') ? 1000 : 1;
  if (product.averageCost !== undefined) {
    return parseFloat((product.averageCost * multiplier).toFixed(2));
  }
  // Estimate 40% of selling price in the display unit
  const bulk = product.priceTiers?.find(t => t.isBulk);
  if (bulk) return parseFloat((bulk.price * 0.40).toFixed(2));
  if (product.priceTiers?.length) {
    const t = product.priceTiers[0];
    return parseFloat(((t.price / t.qty) * 0.40).toFixed(2));
  }
  return parseFloat((product.price * 0.40).toFixed(2));
}

interface FormItem {
  productId: string; name: string; quantity: number; unit: string; costPerUnit: number; totalCost: number;
}

// ── Supplier option type (freeSolo) ──────────────────────────────────────────

interface SupplierOption extends Supplier { inputValue?: string; }
const supplierFilter = createFilterOptions<SupplierOption>();

// ── Purchase row with expand / edit / delete ──────────────────────────────────

function PurchaseRow({
  purchase, onEdit, onDelete,
}: { purchase: Purchase; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow hover sx={{ cursor: 'pointer', '& td': open ? { borderBottom: 0 } : {} }} onClick={() => setOpen(o => !o)}>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>
            {purchase.purchaseNumber}
          </Typography>
        </TableCell>
        <TableCell><Typography variant="body2">{formatDate(purchase.date)}</Typography></TableCell>
        <TableCell><Typography variant="body2">{purchase.supplier ?? '—'}</Typography></TableCell>
        <TableCell align="center"><Chip label={purchase.items.length} size="small" sx={{ fontWeight: 700 }} /></TableCell>
        <TableCell align="right">
          <Typography variant="body2" sx={{ fontWeight: 700, color: NAVY }}>{fmt(purchase.totalCost)}</Typography>
        </TableCell>
        <TableCell align="center" onClick={e => e.stopPropagation()}>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
            <Tooltip title="Edit purchase">
              <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="Delete purchase">
              <IconButton size="small" color="error" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
            </Tooltip>
            {open ? <ExpandLessIcon fontSize="small" color="action" sx={{ mt: 0.5 }} /> : <ExpandMoreIcon fontSize="small" color="action" sx={{ mt: 0.5 }} />}
          </Box>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ p: 0, border: open ? undefined : 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ px: 3, py: 1.5, bgcolor: '#FAFAFA', borderBottom: '1px solid', borderColor: 'divider' }}>
              {purchase.notes && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: 'italic' }}>{purchase.notes}</Typography>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 } }}>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell align="right">Cost / Unit</TableCell>
                    <TableCell align="right">Total Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {purchase.items.map((item, i) => (
                    <TableRow key={i} sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell><Typography variant="body2">{item.name}</Typography></TableCell>
                      <TableCell align="right"><Typography variant="body2">{item.quantity.toLocaleString()} {item.unit}</Typography></TableCell>
                      <TableCell align="right"><Typography variant="body2">LKR {item.costPerUnit.toFixed(2)} / {item.unit}</Typography></TableCell>
                      <TableCell align="right"><Typography variant="body2" sx={{ fontWeight: 600 }}>{fmt(item.totalCost)}</Typography></TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} align="right" sx={{ fontWeight: 700, border: 0, pt: 1 }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: NAVY, border: 0, pt: 1 }}>{fmt(purchase.totalCost)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ── Supplier management dialog ────────────────────────────────────────────────

function SuppliersDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // null = add new
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  useEffect(() => {
    if (open) adminGetAllSuppliers().then(setSuppliers);
  }, [open]);

  function startAdd() { setEditingId(null); setForm({ name: '', phone: '', email: '', notes: '' }); }
  function startEdit(s: Supplier) { setEditingId(s.id); setForm({ name: s.name, phone: s.phone ?? '', email: s.email ?? '', notes: s.notes ?? '' }); }
  function cancelForm() { setEditingId(undefined as unknown as null); setForm({ name: '', phone: '', email: '', notes: '' }); }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const sup = await adminSaveSupplier({ ...(editingId ? { id: editingId } : {}), name: form.name.trim(), phone: form.phone.trim() || undefined, email: form.email.trim() || undefined, notes: form.notes.trim() || undefined });
    setSuppliers(list => editingId ? list.map(s => s.id === editingId ? sup : s) : [...list, sup]);
    cancelForm();
    setSaving(false);
    onChanged();
  }

  async function handleDelete(s: Supplier) {
    await adminDeleteSupplier(s.id);
    setSuppliers(list => list.filter(x => x.id !== s.id));
    setDeleteTarget(null);
    onChanged();
  }

  const formVisible = editingId !== undefined;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Manage Suppliers
        <Button size="small" startIcon={<AddIcon />} onClick={startAdd} disabled={formVisible}>Add Supplier</Button>
      </DialogTitle>
      <DialogContent>
        {/* Add / edit form */}
        {formVisible && (
          <Box sx={{ bgcolor: '#F8F9FC', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>{editingId ? 'Edit Supplier' : 'New Supplier'}</Typography>
            <Stack spacing={1.5}>
              <TextField label="Name *" size="small" fullWidth value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField label="Phone" size="small" fullWidth value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                <TextField label="Email" size="small" fullWidth value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </Box>
              <TextField label="Notes" size="small" fullWidth value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={cancelForm} disabled={saving}>Cancel</Button>
                <Button size="small" variant="contained" color="secondary" onClick={save} disabled={saving || !form.name.trim()} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </Box>
            </Stack>
          </Box>
        )}

        {/* Supplier list */}
        {suppliers.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>No suppliers yet</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12, color: 'text.secondary' } }}>
                <TableCell>Name</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell width={80} />
              </TableRow>
            </TableHead>
            <TableBody>
              {suppliers.map(s => (
                <TableRow key={s.id} sx={{ '&:last-child td': { border: 0 } }}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{s.name}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{s.phone ?? '—'}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{s.notes ?? '—'}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => startEdit(s)}><EditIcon sx={{ fontSize: 15 }} /></IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(s)}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Delete confirm */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Supplier</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteTarget?.name}</strong>? Existing purchases that reference this supplier are not affected.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteTarget && handleDelete(deleteTarget)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Purchases() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  // Purchase form dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState(todayStr());
  const [formSupplier, setFormSupplier] = useState<SupplierOption | string | null>(null);
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [addProduct, setAddProduct] = useState<Product | null>(null);
  const [addQty, setAddQty] = useState<number | ''>('');
  const [addCostPerUnit, setAddCostPerUnit] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete purchase confirm
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminGetAllPurchases().then(ps => { setPurchases(ps); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadResources() {
    const [all, sups] = await Promise.all([adminGetAllProducts(), adminGetAllSuppliers()]);
    setAllProducts(all);
    setAllSuppliers(sups);
  }

  async function openCreate() {
    await loadResources();
    setEditingPurchaseId(null);
    setFormDate(todayStr());
    setFormSupplier(null);
    setFormNotes('');
    setFormItems([]);
    setAddProduct(null); setAddQty(''); setAddCostPerUnit('');
    setFormError('');
    setDialogOpen(true);
  }

  async function openEdit(purchase: Purchase) {
    await loadResources();
    setEditingPurchaseId(purchase.id);
    setFormDate(purchase.date);
    // Match supplier to saved supplier by name
    const matched = allSuppliers.find(s => s.name === purchase.supplier) ?? null;
    setFormSupplier(matched ?? (purchase.supplier ?? null));
    setFormNotes(purchase.notes ?? '');
    setFormItems(purchase.items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unit: i.unit, costPerUnit: i.costPerUnit, totalCost: i.totalCost })));
    setAddProduct(null); setAddQty(''); setAddCostPerUnit('');
    setFormError('');
    setDialogOpen(true);
  }

  function supplierName(val: SupplierOption | string | null): string {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val.inputValue ?? val.name;
  }

  function addFormItem() {
    if (!addProduct || !addQty || !addCostPerUnit) return;
    const qty = Number(addQty), cost = Number(addCostPerUnit);
    const unit = purchaseDisplayUnit(addProduct);
    setFormItems(items => {
      const idx = items.findIndex(i => i.productId === addProduct.id);
      if (idx !== -1) {
        return items.map((i, j) => j === idx ? { ...i, quantity: i.quantity + qty, totalCost: parseFloat(((i.quantity + qty) * i.costPerUnit).toFixed(2)) } : i);
      }
      return [...items, { productId: addProduct.id, name: addProduct.name, quantity: qty, unit, costPerUnit: cost, totalCost: parseFloat((qty * cost).toFixed(2)) }];
    });
    setAddProduct(null); setAddQty(''); setAddCostPerUnit('');
  }

  function removeFormItem(idx: number) { setFormItems(items => items.filter((_, i) => i !== idx)); }

  function updateFormItem(idx: number, field: 'quantity' | 'costPerUnit', value: number) {
    setFormItems(items => items.map((item, i) => {
      if (i !== idx) return item;
      const qty = field === 'quantity' ? value : item.quantity;
      const cost = field === 'costPerUnit' ? value : item.costPerUnit;
      return { ...item, [field]: value, totalCost: parseFloat((qty * cost).toFixed(2)) };
    }));
  }

  async function handleSubmit() {
    if (formItems.length === 0) { setFormError('Add at least one item.'); return; }
    setSubmitting(true); setFormError('');

    const supName = supplierName(formSupplier);

    // If user typed a new supplier name (freeSolo) that doesn't exist, offer to save it — for now just use the string
    const purchaseItems: PurchaseItem[] = formItems.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unit: i.unit, costPerUnit: i.costPerUnit, totalCost: i.totalCost }));
    const payload = {
      date: formDate,
      items: purchaseItems,
      totalCost: parseFloat(purchaseItems.reduce((s, i) => s + i.totalCost, 0).toFixed(2)),
      ...(supName ? { supplier: supName } : {}),
      ...(formNotes.trim() ? { notes: formNotes.trim() } : {}),
    };

    let num: string;
    if (editingPurchaseId) {
      await adminUpdatePurchase(editingPurchaseId, payload);
      num = purchases.find(p => p.id === editingPurchaseId)?.purchaseNumber ?? editingPurchaseId;
    } else {
      num = await adminRecordPurchase(payload);
    }

    // If supplier is new (freeSolo string), optionally persist it
    if (supName && !allSuppliers.find(s => s.name === supName)) {
      const newSup = await adminSaveSupplier({ name: supName });
      setAllSuppliers(list => [...list, newSup]);
    }

    setDialogOpen(false);
    setSubmitting(false);
    setSuccessMsg(editingPurchaseId ? `Purchase ${num} updated` : `Purchase ${num} recorded — stock updated`);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await adminDeletePurchase(deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
    setSuccessMsg(`Purchase ${deleteTarget.purchaseNumber} deleted — stock reversed`);
    load();
  }

  const formTotal = formItems.reduce((s, i) => s + i.totalCost, 0);
  const canAdd = Boolean(addProduct && addQty && Number(addQty) > 0 && addCostPerUnit && Number(addCostPerUnit) > 0);
  const totalSpend = purchases.reduce((s, p) => s + p.totalCost, 0);
  const supplierOptions: SupplierOption[] = allSuppliers.map(s => ({ ...s }));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY }}>Purchases ({purchases.length})</Typography>
          {totalSpend > 0 && <Typography variant="body2" color="text.secondary">Total spend: {fmt(Math.round(totalSpend))}</Typography>}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<PeopleIcon />} onClick={() => setSuppliersOpen(true)}>Suppliers</Button>
          <Button variant="contained" color="secondary" startIcon={<AddIcon />} onClick={openCreate}>Record Purchase</Button>
        </Box>
      </Box>

      <Snackbar open={Boolean(successMsg)} autoHideDuration={5000} onClose={() => setSuccessMsg('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSuccessMsg('')} sx={{ width: '100%' }}>{successMsg}</Alert>
      </Snackbar>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#FAFAFA', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' } }}>
                  <TableCell>Purchase #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Supplier</TableCell>
                  <TableCell align="center">Items</TableCell>
                  <TableCell align="right">Total Cost</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {purchases.length === 0 && (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>No purchases recorded yet</TableCell></TableRow>
                )}
                {purchases.map(p => (
                  <PurchaseRow key={p.id} purchase={p} onEdit={() => openEdit(p)} onDelete={() => setDeleteTarget(p)} />
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Card>

      {/* ── Suppliers dialog ──────────────────────────────────────────────────── */}
      <SuppliersDialog
        open={suppliersOpen}
        onClose={() => setSuppliersOpen(false)}
        onChanged={() => adminGetAllSuppliers().then(setAllSuppliers)}
      />

      {/* ── Purchase form dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile} slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 3 } } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingPurchaseId ? 'Edit Purchase' : 'Record Purchase'}
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
            {editingPurchaseId ? 'Stock is adjusted by the difference between old and new quantities.' : 'Stock is updated and weighted average cost recalculated on save.'}
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Header fields */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <TextField
                label="Date"
                type="date"
                size="small"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                sx={{ width: 160 }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <Autocomplete<SupplierOption, false, false, true>
                freeSolo
                selectOnFocus
                clearOnBlur
                handleHomeEndKeys
                options={supplierOptions}
                getOptionLabel={opt => typeof opt === 'string' ? opt : (opt.inputValue ?? opt.name)}
                filterOptions={(options, params) => {
                  const filtered = supplierFilter(options, params);
                  const { inputValue } = params;
                  const exists = options.some(o => o.name === inputValue);
                  if (inputValue !== '' && !exists) {
                    filtered.push({ id: '', name: `Add "${inputValue}"`, inputValue });
                  }
                  return filtered;
                }}
                value={formSupplier as SupplierOption | null}
                onChange={(_, val) => setFormSupplier(val)}
                renderInput={params => <TextField {...params} label="Supplier" size="small" />}
                sx={{ flex: 1, minWidth: 180 }}
                size="small"
                isOptionEqualToValue={(o, v) => typeof v === 'string' ? o.name === v : o.id === v.id}
              />
              <TextField
                label="Notes (optional)"
                size="small"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                sx={{ flex: 1, minWidth: 180 }}
              />
            </Box>

            <Divider />

            {/* Add item row */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Autocomplete
                options={allProducts}
                getOptionLabel={p => `${p.name}${p.isPackaging ? ' [pkg]' : ''}`}
                groupBy={p => p.isPackaging ? 'Packaging' : (p.category.charAt(0).toUpperCase() + p.category.slice(1))}
                value={addProduct}
                onChange={(_, v) => { setAddProduct(v); if (v) setAddCostPerUnit(costHint(v)); }}
                renderInput={params => <TextField {...params} label="Product" size="small" />}
                sx={{ flex: 1, minWidth: 220 }}
                size="small"
                isOptionEqualToValue={(o, v) => o.id === v.id}
              />
              <TextField
                label={`Qty${addProduct ? ` (${purchaseDisplayUnit(addProduct)})` : ''}`}
                size="small"
                type="number"
                value={addQty}
                onChange={e => setAddQty(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                sx={{ width: 120 }}
                slotProps={{ htmlInput: { min: 0 } }}
              />
              <TextField
                label={`Cost / ${addProduct ? purchaseDisplayUnit(addProduct) : 'unit'} (LKR)`}
                size="small"
                type="number"
                value={addCostPerUnit}
                onChange={e => setAddCostPerUnit(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                sx={{ width: 170 }}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
              />
              {addQty && addCostPerUnit ? (
                <Typography variant="body2" color="text.secondary" sx={{ pb: 0.5, whiteSpace: 'nowrap' }}>
                  = LKR {(Number(addQty) * Number(addCostPerUnit)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </Typography>
              ) : null}
              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={addFormItem} disabled={!canAdd}>Add</Button>
            </Box>

            {/* Items table */}
            {formItems.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12, color: 'text.secondary' } }}>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Cost / Unit (LKR)</TableCell>
                    <TableCell align="right">Total Cost</TableCell>
                    <TableCell width={36} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {formItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Typography variant="body2">{item.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.unit}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small" type="number" value={item.quantity}
                          onChange={e => updateFormItem(idx, 'quantity', Math.max(0, parseFloat(e.target.value) || 0))}
                          sx={{ width: 90 }}
                          slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right', padding: '4px 6px' } } }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small" type="number" value={item.costPerUnit}
                          onChange={e => updateFormItem(idx, 'costPerUnit', Math.max(0, parseFloat(e.target.value) || 0))}
                          sx={{ width: 110 }}
                          slotProps={{ input: { startAdornment: <InputAdornment position="start">LKR</InputAdornment> }, htmlInput: { min: 0, step: 'any', style: { padding: '4px 4px', width: 52 } } }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{fmt(item.totalCost)}</Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => removeFormItem(idx)}>
                          <CloseIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} align="right" sx={{ fontWeight: 700, border: 0, pt: 1 }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: NAVY, border: 0, pt: 1 }}>
                      {fmt(parseFloat(formTotal.toFixed(2)))}
                    </TableCell>
                    <TableCell sx={{ border: 0 }} />
                  </TableRow>
                </TableBody>
              </Table>
            )}

            {formError && <Alert severity="error">{formError}</Alert>}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained" color="secondary" onClick={handleSubmit}
            disabled={submitting || formItems.length === 0}
            startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {submitting ? 'Saving…' : editingPurchaseId
              ? 'Save Changes'
              : `Record Purchase${formItems.length > 0 ? ` (${fmt(parseFloat(formTotal.toFixed(2)))})` : ''}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete confirm ────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Purchase</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleteTarget?.purchaseNumber}</strong>?<br />
            Stock quantities for the purchased items will be reversed. Weighted average cost is not recalculated.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : undefined}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
