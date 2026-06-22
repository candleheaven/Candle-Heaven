import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { CartItem } from '../types';

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }          // cartKey
  | { type: 'UPDATE_QTY'; payload: { cartKey: string; quantity: number } }
  | { type: 'CLEAR' }
  | { type: 'OPEN' }
  | { type: 'CLOSE' };

function key(item: CartItem) {
  return item.cartKey ?? item.productId;
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const k = key(action.payload);
      const existing = state.items.find(i => key(i) === k);
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            key(i) === k ? { ...i, quantity: i.quantity + action.payload.quantity } : i
          ),
        };
      }
      return { ...state, items: [...state.items, action.payload] };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => key(i) !== action.payload) };
    case 'UPDATE_QTY':
      return {
        ...state,
        items: state.items.map(i =>
          key(i) === action.payload.cartKey ? { ...i, quantity: action.payload.quantity } : i
        ),
      };
    case 'CLEAR':
      return { ...state, items: [] };
    case 'OPEN':
      return { ...state, isOpen: true };
    case 'CLOSE':
      return { ...state, isOpen: false };
    default:
      return state;
  }
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  totalItems: number;
  subtotal: number;
  addItem: (item: CartItem) => void;
  removeItem: (cartKey: string) => void;
  updateQty: (cartKey: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextType | null>(null);
const STORAGE_KEY = 'candle_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const saved = localStorage.getItem(STORAGE_KEY);
  const initial: CartState = {
    items: saved ? JSON.parse(saved) : [],
    isOpen: false,
  };

  const [state, dispatch] = useReducer(cartReducer, initial);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  }, [state.items]);

  // Count line items for badge; round up fractional bulk quantities
  const totalItems = state.items.reduce((s, i) => s + Math.ceil(i.quantity), 0);
  const subtotal = state.items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        isOpen: state.isOpen,
        totalItems,
        subtotal,
        addItem: item => dispatch({ type: 'ADD_ITEM', payload: item }),
        removeItem: k => dispatch({ type: 'REMOVE_ITEM', payload: k }),
        updateQty: (k, qty) => dispatch({ type: 'UPDATE_QTY', payload: { cartKey: k, quantity: qty } }),
        clearCart: () => dispatch({ type: 'CLEAR' }),
        openCart: () => dispatch({ type: 'OPEN' }),
        closeCart: () => dispatch({ type: 'CLOSE' }),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
