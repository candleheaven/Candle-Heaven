import { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Grid, Paper, Chip, Table, TableHead, TableBody,
  TableRow, TableCell, CircularProgress, Alert, Tooltip, ToggleButton,
  ToggleButtonGroup, Divider,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InventoryIcon from '@mui/icons-material/Inventory2';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, LineChart, Line, ComposedChart, Area,
} from 'recharts';
import { getProductAnalytics, getMonthlyStats, SEASONAL_MULTIPLIERS, MONTH_NAMES } from '../../services/admin';
import type { ProductMonthlyStats, MonthlyStats } from '../../services/admin';

const NAVY = '#132040';
const GOLD = '#C9A96E';
const COLORS = ['#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646', '#2E75B6'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtQty(qty: number, displayUnit: string): string {
  const n = (v: number, d = 1) => (v % 1 === 0 ? v.toLocaleString() : v.toFixed(d));
  if (displayUnit === 'kg') return qty >= 1000 ? `${n(qty / 1000)} kg` : `${Math.round(qty)} g`;
  if (displayUnit === 'L')  return qty >= 1000 ? `${n(qty / 1000)} L`  : `${Math.round(qty)} ml`;
  if (displayUnit === 'ml') return qty >= 1000 ? `${n(qty / 1000, 2)} L` : `${Math.round(qty)} ml`;
  return `${n(qty)} ${displayUnit}`;
}

const STATUS_META = {
  sufficient:  { label: 'Sufficient',   color: 'success' as const },
  'order-soon': { label: 'Order Soon',  color: 'warning' as const },
  critical:    { label: 'Critical',     color: 'error'   as const },
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon, color = NAVY }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; color?: string;
}) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 3, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color, mt: 0.5 }}>{value}</Typography>
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
        <Box sx={{ color, opacity: 0.7, mt: 0.5 }}>{icon}</Box>
      </Box>
    </Paper>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function fmt(n: number) { return `LKR ${n.toLocaleString()}`; }

export default function Analytics() {
  const [data, setData] = useState<ProductMonthlyStats[]>([]);
  const [monthly, setMonthly] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lookback, setLookback] = useState(6);
  const [chartMetric, setChartMetric] = useState<'revenue' | 'qty'>('revenue');

  useEffect(() => {
    setLoading(true);
    Promise.all([getProductAnalytics(lookback), getMonthlyStats(lookback)])
      .then(([d, m]) => { setData(d); setMonthly(m); })
      .catch(() => setError('Failed to load analytics data.'))
      .finally(() => setLoading(false));
  }, [lookback]);

  // Next month seasonal outlook
  const now = new Date();
  const nextMonthIdx = (now.getMonth() + 1) % 12;
  const nextMonthName = MONTH_NAMES[nextMonthIdx];
  const seasonalFactor = SEASONAL_MULTIPLIERS[nextMonthIdx];
  const seasonalLabel = seasonalFactor >= 1.25 ? 'Peak Season 🔥' : seasonalFactor >= 1.05 ? 'Above Average' : seasonalFactor >= 0.95 ? 'Normal' : 'Below Average';

  // Summary stats
  const totalRevenue = useMemo(() => data.reduce((s, p) => s + p.totalRevenue, 0), [data]);
  const criticalCount = useMemo(() => data.filter(p => p.stockStatus === 'critical').length, [data]);
  const orderSoonCount = useMemo(() => data.filter(p => p.stockStatus === 'order-soon').length, [data]);
  const topProduct = data[0];

  // Monthly trend chart — top 5 products
  const TOP_N = 5;
  const topProducts = data.slice(0, TOP_N);
  const chartData = useMemo(() => {
    if (!data.length) return [];
    return data[0].monthlyData.map((_, idx) => {
      const entry: Record<string, number | string> = { month: data[0].monthlyData[idx].label };
      topProducts.forEach(p => {
        entry[p.name] = chartMetric === 'revenue' ? Math.round(p.monthlyData[idx].revenue) : Math.round(p.monthlyData[idx].qty);
      });
      return entry;
    });
  }, [data, chartMetric, topProducts]);

  // Seasonal chart data — next 12 months multipliers
  const seasonalChartData = MONTH_NAMES.map((name, i) => ({
    month: name,
    factor: SEASONAL_MULTIPLIERS[i],
    highlight: i === nextMonthIdx,
  }));

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TrendingUpIcon sx={{ color: GOLD, fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Product Analytics</Typography>
        </Box>
        <ToggleButtonGroup
          exclusive size="small"
          value={lookback}
          onChange={(_, v) => v && setLookback(v)}
        >
          <ToggleButton value={3}>3 months</ToggleButton>
          <ToggleButton value={6}>6 months</ToggleButton>
          <ToggleButton value={12}>12 months</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Revenue"
            value={`LKR ${totalRevenue.toLocaleString()}`}
            sub={`Last ${lookback} months (excl. cancelled)`}
            icon={<TrendingUpIcon />}
            color={NAVY}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Top Seller"
            value={topProduct?.name ?? '—'}
            sub={topProduct ? `LKR ${topProduct.totalRevenue.toLocaleString()} revenue` : ''}
            icon={<InventoryIcon />}
            color={GOLD}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Stock Alerts"
            value={`${criticalCount} critical · ${orderSoonCount} soon`}
            sub="Products needing reorder"
            icon={<WarningAmberIcon />}
            color={criticalCount > 0 ? '#d32f2f' : '#ed6c02'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title={`${nextMonthName} Outlook`}
            value={seasonalLabel}
            sub={`Demand factor: ×${seasonalFactor.toFixed(2)}`}
            icon={<InfoOutlinedIcon />}
            color={seasonalFactor >= 1.2 ? '#d32f2f' : seasonalFactor >= 1.05 ? '#ed6c02' : NAVY}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Monthly trend chart */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Monthly Sales — Top 5 Products</Typography>
              <ToggleButtonGroup exclusive size="small" value={chartMetric} onChange={(_, v) => v && setChartMetric(v)}>
                <ToggleButton value="revenue">Revenue</ToggleButton>
                <ToggleButton value="qty">Quantity</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => chartMetric === 'revenue' ? `${Math.round(v / 1000)}k` : String(v)} />
                  <RTooltip
                    formatter={(v: number, name: string) => [
                      chartMetric === 'revenue' ? `LKR ${v.toLocaleString()}` : v,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {topProducts.map((p, i) => (
                    <Line
                      key={p.productId}
                      type="monotone"
                      dataKey={p.name}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.disabled">No sales data in this period</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Seasonal index chart */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Seasonal Demand Index</Typography>
              <Tooltip title="Multipliers relative to an average month. Used by the stock prediction algorithm. Edit in src/services/admin.ts.">
                <InfoOutlinedIcon fontSize="small" sx={{ color: 'text.disabled', cursor: 'help' }} />
              </Tooltip>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Highlighted bar = {nextMonthName} (next month)
            </Typography>
            <ResponsiveContainer width="100%" height={248}>
              <BarChart data={seasonalChartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis domain={[0.5, 1.6]} tick={{ fontSize: 10 }} tickFormatter={v => `×${v}`} />
                <RTooltip formatter={(v: number) => [`×${v.toFixed(2)}`, 'Demand factor']} />
                <Bar dataKey="factor" radius={[3, 3, 0, 0]}
                  fill={GOLD}
                  // @ts-expect-error recharts cell coloring via shape prop fallback
                  shape={(props: { x: number; y: number; width: number; height: number; month: string }) => {
                    const highlighted = props.month === nextMonthName;
                    return (
                      <rect
                        x={props.x} y={props.y} width={props.width} height={props.height}
                        fill={highlighted ? '#d32f2f' : GOLD}
                        opacity={highlighted ? 1 : 0.65}
                        rx={3}
                      />
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* ── Monthly Performance ──────────────────────────────────────────────── */}
      {monthly.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden', mb: 3 }}>
          <Box sx={{ p: 3, pb: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Monthly Performance</Typography>
            <Divider />
          </Box>

          {/* Revenue / COGS / Profit chart */}
          <Box sx={{ p: 3 }}>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={monthly} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="revGradA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GOLD} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <RTooltip formatter={(v: number, name: string) => [fmt(v), name.charAt(0).toUpperCase() + name.slice(1)]} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => v.charAt(0).toUpperCase() + v.slice(1)} />
                <Area type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2} fill="url(#revGradA)" />
                <Bar dataKey="cogs" fill="#FF572250" stroke="#FF5722" strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="profit" stroke="#4CAF50" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>

          {/* Monthly table */}
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#F8F9FA' }}>
                  {['Month', 'Orders', 'Revenue', 'COGS', 'Gross Profit', 'Margin', 'Purchase Spend'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[...monthly].reverse().map(m => (
                  <TableRow key={m.month} sx={{ '&:hover': { bgcolor: 'action.hover' }, '&:last-child td': { border: 0 } }}>
                    <TableCell sx={{ fontWeight: 600 }}>{m.label}</TableCell>
                    <TableCell>
                      <Chip label={m.orders} size="small" variant="outlined" sx={{ fontWeight: 700, minWidth: 32 }} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 500 }}>{m.revenue > 0 ? fmt(m.revenue) : '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{m.cogs > 0 ? fmt(m.cogs) : '—'}</TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, fontFamily: 'monospace', color: m.profit > 0 ? 'success.main' : m.profit < 0 ? 'error.main' : 'text.disabled' }}
                      >
                        {m.profit !== 0 ? fmt(m.profit) : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {m.revenue > 0 ? (
                        <Chip
                          label={`${m.profitMargin.toFixed(1)}%`}
                          size="small"
                          color={m.profitMargin >= 25 ? 'success' : m.profitMargin >= 10 ? 'warning' : 'error'}
                          sx={{ fontWeight: 700, fontSize: 11 }}
                        />
                      ) : <Typography variant="body2" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{m.purchaseCost > 0 ? fmt(m.purchaseCost) : '—'}</TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow sx={{ bgcolor: '#F8F9FA' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                  <TableCell><Chip label={monthly.reduce((s, m) => s + m.orders, 0)} size="small" sx={{ fontWeight: 700 }} /></TableCell>
                  <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{fmt(monthly.reduce((s, m) => s + m.revenue, 0))}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{fmt(monthly.reduce((s, m) => s + m.cogs, 0))}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', color: 'success.main' }}>
                      {fmt(monthly.reduce((s, m) => s + m.profit, 0))}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const totalRev = monthly.reduce((s, m) => s + m.revenue, 0);
                      const totalProfit = monthly.reduce((s, m) => s + m.profit, 0);
                      const margin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
                      return <Chip label={`${margin.toFixed(1)}%`} size="small" color={margin >= 25 ? 'success' : margin >= 10 ? 'warning' : 'error'} sx={{ fontWeight: 700, fontSize: 11 }} />;
                    })()}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{fmt(monthly.reduce((s, m) => s + m.purchaseCost, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}

      {/* Stock Forecast Table */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ p: 3, pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Stock Forecast — {data[0]?.nextMonthLabel ?? 'Next Month'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Prediction = weighted 3-month average × seasonal factor (×{seasonalFactor.toFixed(2)} for {nextMonthName}).
                Products with &lt;1 month of stock are marked critical.
              </Typography>
            </Box>
          </Box>
          <Divider />
        </Box>

        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#F8F9FA' }}>
                {['Product', 'Category', 'Current Stock', 'Avg/Month', `${nextMonthName} Forecast`, 'Months Left', 'Status'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map(p => {
                const meta = STATUS_META[p.stockStatus];
                const coverageDisplay = p.stockCoverage >= 99 ? '—' : `${p.stockCoverage.toFixed(1)} mo`;
                return (
                  <TableRow
                    key={p.productId}
                    sx={{
                      '&:hover': { bgcolor: 'action.hover' },
                      bgcolor: p.stockStatus === 'critical' ? 'rgba(211,47,47,0.04)' : p.stockStatus === 'order-soon' ? 'rgba(237,108,2,0.04)' : 'transparent',
                    }}
                  >
                    <TableCell sx={{ fontWeight: 600, maxWidth: 200 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{p.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={p.category} size="small" variant="outlined" sx={{ fontSize: 11, textTransform: 'capitalize' }} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>
                      {fmtQty(p.currentStock, p.displayUnit)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                      {fmtQty(p.avgMonthlySales, p.displayUnit)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {fmtQty(p.predictedNextMonth, p.displayUnit)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: p.stockStatus === 'critical' ? 'error.main' : p.stockStatus === 'order-soon' ? 'warning.main' : 'success.main' }}
                      >
                        {coverageDisplay}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={meta.label} color={meta.color} size="small" />
                    </TableCell>
                  </TableRow>
                );
              })}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    No product sales data in the selected period
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>
    </Box>
  );
}
