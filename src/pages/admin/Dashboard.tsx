import { useEffect, useState } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, CircularProgress,
  Chip, useTheme, Divider,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  BarChart, Bar, Line, ComposedChart,
} from 'recharts';
import InventoryIcon from '@mui/icons-material/Inventory2';
import { getAnalytics, adminGetAllProducts, getProfitAnalytics, type AnalyticsData, type ProfitAnalytics, type StockValueEntry } from '../../services/admin';

const GOLD = '#C9A96E';
const NAVY = '#132040';

const STATUS_COLORS: Record<string, string> = {
  pending:   '#FF9800',
  confirmed: '#2196F3',
  shipped:   '#00BCD4',
  delivered: '#4CAF50',
  returned:  '#9C27B0',
  cancelled: '#F44336',
};

const CATEGORY_LABELS: Record<string, string> = {
  wax: 'Wax', fragrance: 'Fragrance', wicks: 'Wicks',
  dye: 'Colours', molds: 'Molds', tools: 'Tools', kits: 'Kits',
  packaging: 'Packaging',
};

function fmt(n: number) {
  return `LKR ${n.toLocaleString()}`;
}

function fmtDate(d: string) {
  const [, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(day)}`;
}

function StatCard({
  label, value, icon, color, note,
}: { label: string; value: string | number; icon: React.ReactNode; color: string; note?: string }) {
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {label}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: NAVY }}>
              {value}
            </Typography>
            {note && (
              <Typography variant="caption" color="text.secondary">
                {note}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 44, height: 44, borderRadius: 2,
              bgcolor: `${color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [profitData, setProfitData] = useState<ProfitAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();

  useEffect(() => {
    Promise.all([getAnalytics(), getProfitAnalytics()]).then(([d, p]) => {
      setData(d);
      setProfitData(p);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) return null;

  const chartHeight = 280;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, color: NAVY, mb: 3 }}>
        Overview
      </Typography>

      {/* Stat Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Total Revenue"
            value={fmt(data.totalRevenue)}
            icon={<TrendingUpIcon />}
            color={GOLD}
            note="All non-cancelled orders"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Total Orders"
            value={data.totalOrders}
            icon={<ShoppingCartIcon />}
            color="#2196F3"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Pending Orders"
            value={data.pendingOrders}
            icon={<PendingActionsIcon />}
            color="#FF9800"
            note={data.pendingOrders > 0 ? 'Need attention' : 'All clear'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Low Stock"
            value={data.lowStockCount}
            icon={<WarningAmberIcon />}
            color={data.lowStockCount > 0 ? '#F44336' : '#4CAF50'}
            note="Products with stock < 20"
          />
        </Grid>
      </Grid>

      {/* Charts row 1 */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* Revenue over time */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Revenue — Last 30 Days
              </Typography>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <AreaChart data={data.revenueByDay} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={GOLD} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 11 }}
                    interval={4}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <ReTooltip
                    formatter={(v: number) => [fmt(v), 'Revenue']}
                    labelFormatter={fmtDate}
                    contentStyle={{ borderRadius: 8, border: `1px solid ${theme.palette.divider}`, fontSize: 13 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Orders by status */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Orders by Status
              </Typography>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart>
                  <Pie
                    data={data.ordersByStatus}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="45%"
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {data.ordersByStatus.map(entry => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#999'} />
                    ))}
                  </Pie>
                  <Legend
                    formatter={(value) => (
                      <span style={{ textTransform: 'capitalize', fontSize: 12 }}>{value}</span>
                    )}
                  />
                  <ReTooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts row 2 */}
      <Grid container spacing={2}>
        {/* Top products */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Top Products by Revenue
              </Typography>
              {data.topProducts.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No sales data yet</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.topProducts.map(p => ({ ...p, name: p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name }))}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0F0F0" />
                    <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={130} />
                    <ReTooltip
                      formatter={(v: number) => [fmt(v), 'Revenue']}
                      contentStyle={{ borderRadius: 8, fontSize: 13 }}
                    />
                    <Bar dataKey="revenue" fill={GOLD} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Revenue by category */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Revenue by Category
              </Typography>
              {data.revenueByCategory.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No sales data yet</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.revenueByCategory.map(c => ({ ...c, label: CATEGORY_LABELS[c.category] ?? c.category }))}
                    margin={{ left: 8, right: 16, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                    <ReTooltip
                      formatter={(v: number) => [fmt(v), 'Revenue']}
                      contentStyle={{ borderRadius: 8, fontSize: 13 }}
                    />
                    <Bar dataKey="revenue" fill={NAVY} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Profitability ─────────────────────────────────────────────────── */}
      {profitData && (
        <>
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY, mb: 2 }}>
            Profitability
          </Typography>

          {/* Profit KPI cards */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard
                label="Total Purchase Spend"
                value={fmt(profitData.totalPurchaseCost)}
                icon={<ReceiptLongIcon />}
                color="#607D8B"
                note="All recorded purchases"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard
                label="Total COGS"
                value={fmt(profitData.totalCOGS)}
                icon={<ShoppingCartIcon />}
                color="#FF5722"
                note="Cost of goods sold"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard
                label="Gross Profit"
                value={fmt(profitData.totalProfit)}
                icon={<AccountBalanceWalletIcon />}
                color={profitData.totalProfit >= 0 ? '#4CAF50' : '#F44336'}
                note={`Revenue LKR ${profitData.totalRevenue.toLocaleString()}`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatCard
                label="Profit Margin"
                value={`${profitData.profitMargin.toFixed(1)}%`}
                icon={<ShowChartIcon />}
                color={profitData.profitMargin >= 30 ? '#4CAF50' : profitData.profitMargin >= 15 ? '#FF9800' : '#F44336'}
                note={profitData.profitMargin >= 30 ? 'Healthy margin' : profitData.profitMargin >= 15 ? 'Moderate margin' : 'Low margin'}
              />
            </Grid>
          </Grid>

          {/* Revenue vs COGS vs Profit chart + Profit by category */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                    Revenue · COGS · Profit — Last 30 Days
                  </Typography>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <ComposedChart data={profitData.profitByDay} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={GOLD} stopOpacity={0.15} />
                          <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4CAF50" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#4CAF50" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                      <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} interval={4} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                      <ReTooltip
                        formatter={(v: number, name: string) => [fmt(v), name.charAt(0).toUpperCase() + name.slice(1)]}
                        labelFormatter={fmtDate}
                        contentStyle={{ borderRadius: 8, border: `1px solid ${theme.palette.divider}`, fontSize: 13 }}
                      />
                      <Legend formatter={v => v.charAt(0).toUpperCase() + v.slice(1)} wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2} fill="url(#revenueGrad)" />
                      <Line type="monotone" dataKey="cogs" stroke="#FF5722" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="profit" stroke="#4CAF50" strokeWidth={2} fill="url(#profitGrad)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                    Profit by Category
                  </Typography>
                  {profitData.profitByCategory.length === 0 ? (
                    <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No data yet</Typography>
                  ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <BarChart
                        data={profitData.profitByCategory.map(c => ({ ...c, label: c.category.charAt(0).toUpperCase() + c.category.slice(1) }))}
                        layout="vertical"
                        margin={{ left: 8, right: 16 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0F0F0" />
                        <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                        <ReTooltip
                          formatter={(v: number, name: string) => [fmt(v), name.charAt(0).toUpperCase() + name.slice(1)]}
                          contentStyle={{ borderRadius: 8, fontSize: 13 }}
                        />
                        <Bar dataKey="revenue" name="revenue" fill={`${GOLD}80`} radius={[0, 2, 2, 0]} stackId="a" />
                        <Bar dataKey="profit" name="profit" fill="#4CAF50" radius={[0, 4, 4, 0]} stackId="b" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Purchase spending chart */}
          {profitData.purchasesByDay.some(d => d.cost > 0) && (
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Purchase Spending — Last 30 Days
                </Typography>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={profitData.purchasesByDay} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <defs>
                      <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#607D8B" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#607D8B" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} interval={4} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                    <ReTooltip
                      formatter={(v: number) => [fmt(v), 'Purchase Spend']}
                      labelFormatter={fmtDate}
                      contentStyle={{ borderRadius: 8, border: `1px solid ${theme.palette.divider}`, fontSize: 13 }}
                    />
                    <Area type="monotone" dataKey="cost" stroke="#607D8B" strokeWidth={2} fill="url(#purchaseGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Stock Value */}
      <Divider sx={{ my: 3 }} />
      <StockValueWidget
        total={data.stockValue}
        byCategory={data.stockValueByCategory}
        missingCost={data.stockValueMissingCost}
      />

      {/* Low stock alerts */}
      {data.lowStockCount > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ color: '#F44336', mb: 1 }}>
            ⚠ Low Stock Alert
          </Typography>
          <LowStockList />
        </Box>
      )}
    </Box>
  );
}

function StockValueWidget({ total, byCategory, missingCost }: { total: number; byCategory: StockValueEntry[]; missingCost: number }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: NAVY, mb: 2 }}>
        Stock Value
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Total Stock Value</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: NAVY }}>{fmt(total)}</Typography>
                  {missingCost > 0 && (
                    <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                      {missingCost} product{missingCost > 1 ? 's' : ''} missing cost data
                    </Typography>
                  )}
                </Box>
                <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: '#607D8B18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#607D8B' }}>
                  <InventoryIcon />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 8, md: 9 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>By Category</Typography>
              {byCategory.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No cost data recorded yet. Set buying cost on products to see stock value.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  {byCategory.map(({ category, value }) => {
                    const pct = total > 0 ? (value / total) * 100 : 0;
                    return (
                      <Box key={category}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {CATEGORY_LABELS[category] ?? category}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline' }}>
                            <Typography variant="caption" color="text.secondary">{pct.toFixed(1)}%</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 110, textAlign: 'right' }}>{fmt(Math.round(value))}</Typography>
                          </Box>
                        </Box>
                        <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'grey.100', overflow: 'hidden' }}>
                          <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: NAVY, borderRadius: 3, transition: 'width 0.6s ease' }} />
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function LowStockList() {
  const [products, setProducts] = useState<Array<{ id: string; name: string; stock: number; category: string }>>([]);

  useEffect(() => {
    adminGetAllProducts().then(ps =>
      setProducts(ps.filter(p => p.stock < 20).sort((a, b) => a.stock - b.stock))
    );
  }, []);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {products.map(p => (
        <Chip
          key={p.id}
          label={`${p.name} — ${p.stock} left`}
          color={p.stock === 0 ? 'error' : 'warning'}
          size="small"
          variant="outlined"
        />
      ))}
    </Box>
  );
}
