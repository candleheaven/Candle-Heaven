import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import theme from './theme/theme';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import CartDrawer from './components/cart/CartDrawer';
import WhatsAppButton from './components/WhatsAppButton';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import MyOrders from './pages/MyOrders';
import TrackOrder from './pages/TrackOrder';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import ProductList from './pages/admin/ProductList';
import ProductForm from './pages/admin/ProductForm';
import OrderList from './pages/admin/OrderList';
import CreateOrder from './pages/admin/CreateOrder';
import DeliverySettings from './pages/admin/DeliverySettings';
import Analytics from './pages/admin/Analytics';
import PromotionList from './pages/admin/PromotionList';
import PromotionForm from './pages/admin/PromotionForm';
import PickupTicket from './pages/admin/PickupTicket';
import Purchases from './pages/admin/Purchases';
import Settlements from './pages/admin/Settlements';

function CustomerLayout() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <Box component="main" sx={{ flex: 1 }}>
        <Outlet />
      </Box>
      <Footer />
      <CartDrawer />
      <WhatsAppButton />
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AdminAuthProvider>
          <CartProvider>
            <BrowserRouter>
              <Routes>
                {/* Admin routes — completely separate layout */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="products" element={<ProductList />} />
                  <Route path="products/new" element={<ProductForm />} />
                  <Route path="products/:id/edit" element={<ProductForm />} />
                  <Route path="orders" element={<OrderList />} />
                  <Route path="orders/new" element={<CreateOrder />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="promotions" element={<PromotionList />} />
                  <Route path="promotions/new" element={<PromotionForm />} />
                  <Route path="promotions/:id/edit" element={<PromotionForm />} />
                  <Route path="purchases" element={<Purchases />} />
                  <Route path="settlements" element={<Settlements />} />
                  <Route path="pickup-ticket" element={<PickupTicket />} />
                  <Route path="delivery" element={<DeliverySettings />} />
                </Route>

                {/* Customer routes */}
                <Route element={<CustomerLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/products/:id" element={<ProductDetail />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/order-confirmation" element={<OrderConfirmation />} />
                  <Route path="/my-orders" element={<MyOrders />} />
                  <Route path="/track" element={<TrackOrder />} />
                  <Route path="/track/:orderNumber" element={<TrackOrder />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
