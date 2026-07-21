import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Divider, Avatar, Tooltip, useMediaQuery, useTheme, CircularProgress,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory2';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import BarChartIcon from '@mui/icons-material/BarChart';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LogoutIcon from '@mui/icons-material/Logout';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { useAdminAuth } from '../../context/AdminAuthContext';

const DRAWER_WIDTH = 240;
const NAVY = '#132040';
const GOLD = '#C9A96E';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: <DashboardIcon />, path: 'dashboard' },
  { label: 'Products', icon: <InventoryIcon />, path: 'products' },
  { label: 'Orders', icon: <ShoppingBagIcon />, path: 'orders' },
  { label: 'Analytics', icon: <BarChartIcon />, path: 'analytics' },
  { label: 'Purchases', icon: <ReceiptLongIcon />, path: 'purchases' },
  { label: 'Settlements', icon: <AccountBalanceIcon />, path: 'settlements' },
  { label: 'Promotions', icon: <LocalOfferIcon />, path: 'promotions' },
  { label: 'Pickup Ticket', icon: <ConfirmationNumberIcon />, path: 'pickup-ticket' },
  { label: 'Delivery', icon: <LocalShippingIcon />, path: 'delivery' },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { adminLogout } = useAdminAuth();

  const isActive = (path: string) => location.pathname.includes(`/admin/${path}`);

  function handleNav(path: string) {
    navigate(`/admin/${path}`);
    onClose?.();
  }

  function handleLogout() {
    adminLogout();
    navigate('/admin/login', { replace: true });
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: NAVY, color: 'white' }}>
      {/* Brand header */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          component="img"
          src="/logo.jpg"
          alt="Candle Heaven"
          sx={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${GOLD}` }}
        />
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: GOLD, lineHeight: 1.2 }}>
            CANDLE HEAVEN
          </Typography>
          <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>
            Admin Panel
          </Typography>
        </Box>
        {onClose && (
          <IconButton onClick={onClose} sx={{ ml: 'auto', color: 'rgba(255,255,255,0.6)' }} size="small">
            <ChevronLeftIcon />
          </IconButton>
        )}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Nav */}
      <List sx={{ flex: 1, pt: 1 }}>
        {NAV_ITEMS.map(item => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              onClick={() => handleNav(item.path)}
              sx={{
                mx: 1,
                mb: 0.5,
                borderRadius: 1.5,
                borderLeft: isActive(item.path) ? `3px solid ${GOLD}` : '3px solid transparent',
                bgcolor: isActive(item.path) ? 'rgba(201,169,110,0.12)' : 'transparent',
                color: isActive(item.path) ? GOLD : 'rgba(255,255,255,0.75)',
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.07)',
                  color: 'white',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} sx={{ '& .MuiListItemText-primary': { fontWeight: isActive(item.path) ? 600 : 400 } }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Logout */}
      <List>
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              mx: 1, my: 0.5, borderRadius: 1.5,
              color: 'rgba(255,255,255,0.6)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.07)', color: 'white' },
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );
}

export default function AdminLayout() {
  const { isAdminAuthenticated, initializing } = useAdminAuth();

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) link.href = '/admin-manifest.json';
    return () => { if (link) link.href = '/manifest.json'; };
  }, []);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  if (initializing) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#F4F6F9' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAdminAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  const currentPage = NAV_ITEMS.find(n => location.pathname.includes(`/admin/${n.path}`))?.label ?? 'Admin';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#F4F6F9' }}>
      {/* Permanent sidebar on desktop */}
      {!isMobile && (
        <Box sx={{ width: DRAWER_WIDTH, flexShrink: 0 }}>
          <Box sx={{ position: 'fixed', width: DRAWER_WIDTH, height: '100vh', overflow: 'auto' }}>
            <SidebarContent />
          </Box>
        </Box>
      )}

      {/* Temporary drawer on mobile */}
      {isMobile && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          slotProps={{ paper: { sx: { width: DRAWER_WIDTH, border: 'none' } } }}
        >
          <SidebarContent onClose={() => setDrawerOpen(false)} />
        </Drawer>
      )}

      {/* Main area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top AppBar */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{ bgcolor: 'white', borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Toolbar>
            {isMobile && (
              <IconButton edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 1, color: NAVY }}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="h6" sx={{ fontWeight: 600, color: NAVY, flex: 1 }}>
              {currentPage}
            </Typography>
            <Tooltip title="Candle Heaven Admin">
              <Avatar sx={{ width: 34, height: 34, bgcolor: NAVY, fontSize: 14, fontWeight: 700 }}>
                A
              </Avatar>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Page content */}
        <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, overflow: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
