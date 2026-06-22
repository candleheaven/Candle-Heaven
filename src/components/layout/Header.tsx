import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Badge,
  Box,
  Button,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  useMediaQuery,
  useTheme,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Typography,
} from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import MenuIcon from '@mui/icons-material/Menu';
import StarIcon from '@mui/icons-material/Star';
import { PersonOutlined as PersonOutlineIcon } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/auth';
import { getPoints } from '../../services/loyalty';
import AuthModal from '../auth/AuthModal';

const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Products', path: '/products' },
];

export default function Header() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItems, openCart } = useCart();
  const { user } = useAuth();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);

  useEffect(() => {
    if (user?.uid) {
      getPoints(user.uid).then(setPointsBalance).catch(() => {});
    } else {
      setPointsBalance(null);
    }
  }, [user?.uid]);

  const handleUserMenu = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);
  const handleLogout = async () => {
    handleMenuClose();
    await logout();
  };

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'secondary.main',
          borderBottom: '1px solid rgba(201,169,110,0.2)',
        }}
      >
        <Toolbar sx={{ px: { xs: 2, md: 4 }, minHeight: { xs: 64, md: 72 } }}>
          {isMobile && (
            <IconButton onClick={() => setDrawerOpen(true)} sx={{ mr: 1, color: 'rgba(255,255,255,0.8)' }}>
              <MenuIcon />
            </IconButton>
          )}

          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', flexGrow: isMobile ? 1 : 0 }}
            onClick={() => navigate('/')}
          >
            <Box
              component="img"
              src="/logo.jpg"
              alt="Candle Heaven"
              sx={{ height: 48, width: 48, objectFit: 'cover', borderRadius: '50%', border: '1.5px solid rgba(201,169,110,0.5)' }}
            />
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography
                variant="subtitle1"
                sx={{
                  color: '#C9A96E',
                  letterSpacing: '0.12em',
                  fontWeight: 700,
                  lineHeight: 1.1,
                  textTransform: 'uppercase',
                  fontSize: '0.95rem',
                }}
              >
                Candle Heaven
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'rgba(201,169,110,0.6)', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '0.6rem' }}
              >
                Premium Candle Ingredients
              </Typography>
            </Box>
          </Box>

          {!isMobile && (
            <Box sx={{ display: 'flex', ml: 5, gap: 0.5, flexGrow: 1 }}>
              {NAV_LINKS.map(link => (
                <Button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  sx={{
                    color: location.pathname === link.path ? '#C9A96E' : 'rgba(255,255,255,0.7)',
                    fontWeight: location.pathname === link.path ? 700 : 400,
                    borderBottom: location.pathname === link.path ? '2px solid #C9A96E' : '2px solid transparent',
                    borderRadius: 0,
                    pb: 0.25,
                    '&:hover': { color: '#C9A96E', bgcolor: 'transparent' },
                  }}
                >
                  {link.label}
                </Button>
              ))}
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
            {user ? (
              <>
                <IconButton onClick={handleUserMenu} size="small">
                  <Avatar sx={{ width: 32, height: 32, bgcolor: '#C9A96E', color: '#132040', fontSize: 13, fontWeight: 700 }}>
                    {user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase()}
                  </Avatar>
                </IconButton>
                <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
                  <MenuItem disabled>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {user.displayName ?? user.email}
                      </Typography>
                      {pointsBalance != null && pointsBalance > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                          <StarIcon sx={{ fontSize: 12, color: '#C9A96E' }} />
                          <Typography variant="caption" sx={{ color: '#C9A96E', fontWeight: 600 }}>
                            {pointsBalance} pts
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </MenuItem>
                  <Divider />
                  <MenuItem onClick={() => { handleMenuClose(); navigate('/my-orders'); }}>
                    My Orders
                  </MenuItem>
                  <MenuItem onClick={handleLogout}>Sign out</MenuItem>
                </Menu>
              </>
            ) : (
              <Button
                startIcon={<PersonOutlineIcon />}
                onClick={() => setAuthOpen(true)}
                sx={{ color: 'rgba(255,255,255,0.75)', display: { xs: 'none', md: 'flex' }, '&:hover': { color: '#C9A96E' } }}
              >
                Sign in
              </Button>
            )}

            <IconButton onClick={openCart} sx={{ color: 'rgba(255,255,255,0.85)', '&:hover': { color: '#C9A96E' } }}>
              <Badge badgeContent={totalItems} color="primary">
                <ShoppingCartIcon />
              </Badge>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { bgcolor: 'secondary.main', color: 'white' } } }}
      >
        <Box sx={{ width: 260, pt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, mb: 3 }}>
            <Box component="img" src="/logo.jpg" alt="Candle Heaven"
              sx={{ height: 40, width: 40, objectFit: 'cover', borderRadius: '50%' }}
            />
            <Box>
              <Typography sx={{ fontWeight: 700, color: '#C9A96E', letterSpacing: '0.1em', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                Candle Heaven
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(201,169,110,0.6)', letterSpacing: '0.15em', fontSize: '0.55rem', textTransform: 'uppercase' }}>
                Premium Candle Ingredients
              </Typography>
            </Box>
          </Box>
          <Divider sx={{ borderColor: 'rgba(201,169,110,0.2)' }} />
          <List>
            {NAV_LINKS.map(link => (
              <ListItem key={link.path} disablePadding>
                <ListItemButton
                  selected={location.pathname === link.path}
                  onClick={() => { navigate(link.path); setDrawerOpen(false); }}
                  sx={{
                    '&.Mui-selected': { bgcolor: 'rgba(201,169,110,0.1)', color: '#C9A96E' },
                    color: 'rgba(255,255,255,0.8)',
                    '&:hover': { bgcolor: 'rgba(201,169,110,0.08)', color: '#C9A96E' },
                  }}
                >
                  <ListItemText primary={link.label} />
                </ListItemButton>
              </ListItem>
            ))}
            <Divider sx={{ my: 1, borderColor: 'rgba(201,169,110,0.2)' }} />
            {!user && (
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => { setAuthOpen(true); setDrawerOpen(false); }}
                  sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: '#C9A96E' } }}
                >
                  <ListItemText primary="Sign in" />
                </ListItemButton>
              </ListItem>
            )}
            {user && (
              <>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => { navigate('/my-orders'); setDrawerOpen(false); }}
                    sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: '#C9A96E' } }}
                  >
                    <ListItemText primary="My Orders" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => { handleLogout(); setDrawerOpen(false); }}
                    sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: '#C9A96E' } }}
                  >
                    <ListItemText primary="Sign out" />
                  </ListItemButton>
                </ListItem>
              </>
            )}
          </List>
        </Box>
      </Drawer>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
